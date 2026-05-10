/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Camera, Search, Loader2, CheckCircle2, XCircle, UserCheck, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { identifyTeacher } from '@/src/services/geminiService';
import { compressImage } from '@/src/lib/imageUtils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

export function AttendanceKiosk() {
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<{ isMatch: boolean; matchedId: string | null; confidence: number; name: string | null; reason: string; isAlreadyMarked?: boolean } | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [step, setStep] = useState<'capture' | 'result'>('capture');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isAutoScanEnabled, setIsAutoScanEnabled] = useState(true);
  const [isAutoScanning, setIsAutoScanning] = useState(false);
  const [quotaPaused, setQuotaPaused] = useState(false);
  const [quotaCountdown, setQuotaCountdown] = useState(0);

  const webcamRef = useRef<Webcam>(null);
  const scanTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchTeachers();
  }, []);

  // Automatic scanning effect
  useEffect(() => {
    if (step === 'capture' && teachers.length > 0 && !loading && !verifying && !quotaPaused && isAutoScanEnabled) {
      scanTimerRef.current = setInterval(() => {
        handleCapture(true); // pass true for auto-scan
      }, 15000); // Increased to 15 seconds to save quota
    } else {
      if (scanTimerRef.current) clearInterval(scanTimerRef.current);
    }
    return () => {
      if (scanTimerRef.current) clearInterval(scanTimerRef.current);
    };
  }, [step, teachers, loading, verifying, quotaPaused]);

  // Reset quota pause after 2 minutes
  useEffect(() => {
    let timer: NodeJS.Timeout;
    let interval: NodeJS.Timeout;

    if (quotaPaused) {
      setQuotaCountdown(120);
      interval = setInterval(() => {
        setQuotaCountdown(prev => Math.max(0, prev - 1));
      }, 1000);
      
      timer = setTimeout(() => {
        setQuotaPaused(false);
        setQuotaCountdown(0);
      }, 120000);
    }
    
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [quotaPaused]);

  const fetchTeachers = async () => {
    setLoading(true);
    const path = "teachers";
    try {
      const q = query(collection(db, path), where("status", "==", "active"));
      const querySnapshot = await getDocs(q);
      const list = querySnapshot.docs.map(doc => ({ firebaseId: doc.id, ...doc.data() }));
      setTeachers(list);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    } finally {
      setLoading(false);
    }
  };

  const handleCapture = async (isAuto = false) => {
    if (verifying) return;
    
    const imageSrc = webcamRef.current?.getScreenshot();
    if (!imageSrc) {
      if (!isAuto) toast.error("Failed to capture photo");
      return;
    }

    if (teachers.length === 0) {
      if (!isAuto) toast.error("No teachers registered in system");
      return;
    }

    if (isAuto) setIsAutoScanning(true);
    setCapturedPhoto(imageSrc);
    setVerifying(true);
    
    const path = "attendance";
    try {
      // Automatic Identification
      const matchResult = await identifyTeacher(imageSrc, teachers);

      if (matchResult.isMatch && matchResult.matchedId) {
        // Success!
        const teacher = teachers.find(t => t.id === matchResult.matchedId);
        
        // Compress for storage
        const compressedPhoto = await compressImage(imageSrc, 400, 400, 0.6); // smaller for logs

        // Check for duplicate attendance today (Local Time)
        const today = new Date().toLocaleDateString('en-CA');
        const existingQuery = query(
          collection(db, path),
          where("teacherId", "==", matchResult.matchedId),
          where("date", "==", today)
        );
        
        const existingDocs = await getDocs(existingQuery);
        
        if (!existingDocs.empty) {
          setStep('result');
          setResult({
            ...matchResult,
            isMatch: true,
            isAlreadyMarked: true,
            reason: "Attendance already on record for today. Have a great day!"
          });
          setVerifying(false); // Done with database check
          toast.info("Attendance already marked for today");
          return;
        }

        // Log attendance
        await addDoc(collection(db, path), {
          teacherId: matchResult.matchedId,
          teacherName: matchResult.name || teacher?.name || 'Unknown',
          date: today,
          timestamp: serverTimestamp(),
          verificationPhoto: compressedPhoto,
          status: 'present',
          confidence: matchResult.confidence
        });

        setResult(matchResult);
        setStep('result');
        setVerifying(false); // Done with database write
        toast.success(`Welcome, ${matchResult.name || teacher?.name}`);
      } else {
        // Only transition to result if it was a manual click, or ignore auto-scan failures
        setVerifying(false);
        setIsAutoScanning(false);

        if (!isAuto) {
          setStep('result');
          setResult(matchResult);
          toast.error("Face not recognized");
        } else {
          // If auto scan failed, just reset local "verifying" states to continue loop
          setCapturedPhoto(null);
        }
      }
    } catch (error: any) {
      const isQuotaError = error?.message?.includes("quota") || error?.message?.includes("429");
      if (isQuotaError) {
        setQuotaPaused(true);
      }

      if (!isAuto) {
        setStep('result');
        setResult({
          isMatch: false,
          matchedId: null,
          confidence: 0,
          name: null,
          reason: isQuotaError 
            ? `API Quota exceeded. Auto-scan paused for 2 minutes to allow system to reset. Please wait ${quotaCountdown}s.`
            : (error instanceof Error ? error.message : "Identification failed")
        });
        toast.error(isQuotaError ? "Quota Exceeded" : "Identification Error");
      }
      setVerifying(false);
      setIsAutoScanning(false);
    } finally {
      // Note: if it was a match or a manual scan, verifying is handled by the result screen or the if (!isAuto) block
    }
  };

  const reset = () => {
    setStep('capture');
    setCapturedPhoto(null);
    setResult(null);
    setVerifying(false);
    setIsAutoScanning(false);
  };

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-lg mx-auto">
      {/* Kiosk Main Viewfinder */}
      <div className="natural-card bg-[#e8e4db] p-2 border-[6px] md:border-[8px] border-white overflow-hidden relative flex flex-col items-center justify-center aspect-[3/4] w-full min-h-[450px] shadow-2xl">
        {step === 'capture' && (
          <motion.div 
            key="capture"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative w-full h-full flex flex-col items-center justify-center"
          >
            {/* Scanning Line */}
            <motion.div 
              animate={{ top: ['10%', '90%', '10%'] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="absolute left-[10%] right-[10%] h-[2px] bg-natural-accent shadow-[0_0_15px_var(--color-natural-accent)] z-10 opacity-50" 
            />
            
            <div className="w-[85%] aspect-[3/4] border-4 border-white/50 rounded-[120px_120px_100px_100px] relative overflow-hidden bg-black/40 shadow-inner">
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  className="w-full h-full object-cover"
                  videoConstraints={{ 
                    facingMode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                  }}
                  mirrored={facingMode === 'user'}
                  screenshotQuality={0.92}
                  imageSmoothing={true}
                  disablePictureInPicture={true}
                  forceScreenshotSourceSize={false}
                  onUserMedia={() => {}}
                  onUserMediaError={() => {}}
                />
            </div>

            <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
              <Button 
                onClick={() => setIsAutoScanEnabled(!isAutoScanEnabled)}
                variant="secondary"
                className={`rounded-full px-4 h-10 backdrop-blur-md border-2 transition-all flex items-center gap-2 ${
                  isAutoScanEnabled 
                  ? 'bg-natural-success/20 border-natural-success/30 text-natural-success' 
                  : 'bg-white/20 border-white/20 text-white'
                }`}
              >
                <div className={`w-2.5 h-2.5 rounded-full ${isAutoScanEnabled ? 'bg-natural-success animate-pulse' : 'bg-gray-400'}`} />
                <span className="text-[9px] font-black tracking-widest uppercase">
                  Auto: {isAutoScanEnabled ? 'ON' : 'OFF'}
                </span>
              </Button>

              <div className={`px-4 py-1.5 rounded-full text-[10px] backdrop-blur-md font-black tracking-wider flex items-center gap-2 border whitespace-nowrap shadow-sm ${quotaPaused ? 'bg-orange-600 text-white border-orange-400' : 'bg-black/40 text-white border-white/10'}`}>
                {quotaPaused ? (
                  <><XCircle size={12} className="animate-pulse" /> QUOTA ({quotaCountdown}s)</>
                ) : !isAutoScanEnabled ? (
                  <><XCircle size={12} className="text-gray-400" /> DISABLED</>
                ) : isAutoScanning ? (
                  <><Loader2 size={12} className="animate-spin text-natural-accent" /> ANALYZING...</>
                ) : (
                  loading ? 'LOADING...' : <><div className="w-1.5 h-1.5 rounded-full bg-natural-success animate-pulse" /> SCANNING</>
                )}
              </div>
            </div>

            <div className="absolute top-4 right-4 flex flex-col gap-2">
              <Button 
                onClick={toggleCamera}
                variant="secondary"
                title={facingMode === 'user' ? "Switch to Back Camera" : "Switch to Front Camera"}
                className={`rounded-full w-12 h-12 p-0 backdrop-blur-md border-2 transition-all ${
                  facingMode === 'user' 
                  ? 'bg-natural-primary/20 border-white/20 text-white' 
                  : 'bg-natural-accent/40 border-natural-accent/50 text-white'
                }`}
              >
                <div className="relative">
                  <Camera size={20} />
                  <div className="absolute -top-1 -right-1 bg-white text-black text-[8px] font-black rounded-full w-4 h-4 flex items-center justify-center border border-black/10">
                    {facingMode === 'user' ? 'F' : 'B'}
                  </div>
                </div>
              </Button>
            </div>

            <div className="absolute bottom-6 left-0 right-0 px-6 flex flex-col items-center gap-4">
              <Button 
                 onClick={() => handleCapture(false)} 
                 disabled={loading || verifying}
                 className="w-full h-16 rounded-[28px] bg-gradient-to-r from-natural-accent to-orange-500 hover:from-natural-accent/90 hover:to-orange-600 text-white font-black text-xl shadow-[0_15px_30px_rgba(244,63,94,0.3)] transition-all active:scale-[0.98] border-2 border-white/30"
              >
                {verifying ? (
                  <><Loader2 size={28} className="mr-3 animate-spin" /> VERIFYING...</>
                ) : (
                  <><Camera size={28} className="mr-3" /> SCAN NOW</>
                )}
              </Button>

              <p className="text-white/80 text-[10px] font-black uppercase tracking-[0.25em] text-center max-w-[280px] drop-shadow-md">
                {quotaPaused 
                  ? "Too many requests. Wait for cooldown."
                  : isAutoScanEnabled 
                    ? "Position face inside frame"
                    : "Tap above to verify identity"
                }
              </p>
            </div>
          </motion.div>
        )}

        {step === 'result' && (
          <motion.div 
            key="result"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center p-6 h-full w-full"
          >
            {verifying ? (
              <div className="space-y-6 text-center">
                 <div className="relative">
                    <div className="absolute inset-0 bg-natural-primary/20 rounded-full blur-2xl animate-pulse" />
                    <Loader2 size={80} className="text-natural-primary animate-spin relative z-10" />
                    <Search size={30} className="absolute inset-0 m-auto text-natural-primary/50 z-20" />
                 </div>
                 <div className="space-y-1">
                    <p className="text-natural-primary text-2xl font-black italic tracking-tighter">IDENTIFYING...</p>
                    <p className="text-blue-500 text-[10px] font-black uppercase tracking-[0.3em]">Searching AI Database</p>
                 </div>
              </div>
            ) : result && (
              <div className="space-y-6 text-center w-full px-4">
                <div className={`p-8 rounded-[40px] inline-block shadow-lg ${result.isMatch ? 'bg-gradient-to-br from-natural-success/20 to-emerald-500/10 text-natural-success' : 'bg-gradient-to-br from-red-50 to-pink-50 text-red-500'}`}>
                  {result.isMatch ? <CheckCircle2 size={80} /> : <XCircle size={80} />}
                </div>
                <div className="space-y-2">
                  <h2 className={`text-5xl font-black italic tracking-tighter ${result.isMatch ? 'text-natural-success' : 'text-red-500'}`}>
                    {result.isAlreadyMarked ? 'RECORDED' : (result.isMatch ? 'SUCCESS' : 'NO MATCH')}
                  </h2>
                  <p className="text-natural-primary text-lg font-bold leading-tight">
                    {result.isMatch 
                      ? <span>Welcome, <span className="text-natural-accent">{result.name}</span> to Happy Days School. You are present today.</span> 
                      : 'Could not find teacher'}
                  </p>
                  <p className="text-[11px] text-natural-text/50 font-medium px-4">{result.reason}</p>
                </div>
                <Button onClick={reset} className="w-full h-16 rounded-[24px] text-xl font-black bg-gradient-to-r from-natural-primary to-indigo-600 hover:shadow-xl transition-all text-white">
                  CONTINUE
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Status Card */}
      <div className="natural-card bg-natural-card p-6 flex flex-col items-center text-center shadow-sm">
        {result?.isMatch ? (
           <div className="flex flex-col items-center w-full">
              <div className="relative mb-4">
                <img 
                  src={capturedPhoto || `https://ui-avatars.com/api/?name=${result.name}&background=a67c52&color=fff&size=100`} 
                  className="w-24 h-24 rounded-full border-4 border-white object-cover shadow-xl bg-slate-100" 
                  alt="Profile" 
                />
                <div className="absolute -bottom-1 -right-1 bg-natural-success text-white p-1.5 rounded-full shadow-lg border-2 border-white">
                  <CheckCircle2 size={18} />
                </div>
              </div>
              <h2 className="text-xl font-bold text-natural-primary mb-1">{result.name}</h2>
              <div className="bg-natural-success/5 text-natural-success p-4 rounded-2xl w-full">
                <h3 className="text-xs font-bold uppercase tracking-widest opacity-60">
                   {result.isAlreadyMarked ? 'ALREADY ON RECORD' : 'CHECK-IN VERIFIED'}
                </h3>
                <p className="text-[14px] font-black mt-1">
                   {format(new Date(), 'EEEE, do MMMM yyyy')}
                </p>
                <div className="mt-2 bg-natural-success text-white px-4 py-1.5 rounded-full inline-block text-lg font-black italic shadow-sm">
                   {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                </div>
              </div>
           </div>
        ) : (
          <div className="py-2 space-y-4 w-full">
             <div className="flex justify-between items-center px-4">
                <p className="text-[10px] font-black text-natural-accent uppercase tracking-[0.2em]">Kiosk Live Status</p>
                <div className="flex items-center gap-2">
                   <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                   <span className="text-[10px] font-bold text-green-600">ONLINE</span>
                </div>
             </div>
             <div className="bg-natural-bg/50 p-4 rounded-2xl">
                <div className="flex justify-between items-center text-sm mb-1">
                  <span className="text-natural-primary/60 font-medium italic">Database:</span>
                  <span className="font-bold text-natural-primary">{teachers.length} Active Profiles</span>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
