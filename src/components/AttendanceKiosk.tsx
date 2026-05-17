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
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { identifyTeacher } from '@/src/services/geminiService';
import { compressImage } from '@/src/lib/imageUtils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

export function AttendanceKiosk() {
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [aiSettings, setAiSettings] = useState<{ matchThreshold: number, livenessSensitivity: number, compressionQuality: number }>({ matchThreshold: 0.8, livenessSensitivity: 0.5, compressionQuality: 0.7 });
  const [result, setResult] = useState<{ 
    isMatch: boolean; 
    isLivePerson: boolean;
    matchedId: string | null; 
    confidence: number; 
    name: string | null; 
    reason: string; 
    isAlreadyMarked?: boolean 
  } | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [step, setStep] = useState<'capture' | 'result'>('capture');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isAutoScanEnabled, setIsAutoScanEnabled] = useState(true);
  const [isAutoScanning, setIsAutoScanning] = useState(false);
  const [quotaPaused, setQuotaPaused] = useState(false);
  const [quotaCountdown, setQuotaCountdown] = useState(0);

  const webcamRef = useRef<Webcam>(null);
  const scanTimerRef = useRef<NodeJS.Timeout | null>(null);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchTeachers();
    fetchSettings();
  }, []);

  // Auto-reset result screen after 5 seconds if auto-scan is on
  useEffect(() => {
    if (step === 'result' && isAutoScanEnabled) {
      resetTimerRef.current = setTimeout(() => {
        reset();
      }, 5000);
    }
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [step, isAutoScanEnabled]);

  const fetchSettings = async () => {
    try {
      const configRef = doc(db, "config", "ai_settings");
      const configSnap = await getDoc(configRef);
      if (configSnap.exists()) {
        const data = configSnap.data();
        setAiSettings({
          matchThreshold: data.matchThreshold ?? 0.8,
          livenessSensitivity: data.livenessSensitivity ?? 0.5,
          compressionQuality: data.compressionQuality ?? 0.7
        });
      }
    } catch (error) {
      console.error("Error fetching AI settings:", error);
    }
  };

  // Automatic scanning effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (step === 'capture' && teachers.length > 0 && !loading && !verifying && !quotaPaused && isAutoScanEnabled) {
      interval = setInterval(() => {
        handleCapture(true); // pass true for auto-scan
      }, 5000); // Reduced to 5 seconds for more responsive CCTV monitoring
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [step, teachers, loading, verifying, quotaPaused, isAutoScanEnabled]);

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
      const matchResult = await identifyTeacher(imageSrc, teachers, aiSettings);

      if (!matchResult.isLivePerson) {
        setStep('result');
        setResult({
          ...matchResult,
          isMatch: false,
          isLivePerson: false,
          reason: "SPOOFING DETECTED: System detected a non-live verification attempt. Attendance requires a live human."
        });
        toast.error("Live Person Required");
        return;
      }

      if (matchResult.isMatch && matchResult.matchedId) {
        // Success!
        const teacher = teachers.find(t => t.id === matchResult.matchedId);
        
        const logQuality = Math.max(0.2, aiSettings.compressionQuality * 0.8);
        const compressedPhoto = await compressImage(imageSrc, 400, 400, logQuality);

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
            reason: "Attendance already on record for today."
          });
          toast.info("Already marked today");
          return;
        }

        await addDoc(collection(db, path), {
          teacherId: matchResult.matchedId,
          teacherName: matchResult.name || teacher?.name || 'Unknown',
          date: today,
          timestamp: serverTimestamp(),
          verificationPhoto: compressedPhoto,
          status: 'present',
          confidence: matchResult.confidence,
          isLiveVerified: true
        });

        setResult(matchResult);
        setStep('result');
        toast.success(`Welcome, ${matchResult.name}`);
      } else {
        if (!isAuto) {
          setStep('result');
          setResult(matchResult);
          toast.error("Face not recognized");
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
          isLivePerson: true,
          matchedId: null,
          confidence: 0,
          name: null,
          reason: isQuotaError 
            ? "API Quota exceeded. Resting for 2 minutes."
            : (error instanceof Error ? error.message : "System Error")
        });
        toast.error(isQuotaError ? "Quota Exceeded" : "Error");
      }
    } finally {
      setVerifying(false);
      setIsAutoScanning(false);
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
    <div className="flex flex-col gap-4 md:gap-6 w-full max-w-lg mx-auto px-1">
      {/* Kiosk Main Viewfinder */}
      <div className="natural-card bg-[#e8e4db] p-1 md:p-2 border-4 md:border-[8px] border-white overflow-hidden relative flex flex-col items-center justify-center aspect-[4/5] md:aspect-[3/4] w-full shadow-2xl">
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
            
            <div className="w-[90%] md:w-[85%] h-[80%] md:h-auto md:aspect-[3/4] border-4 border-white/50 rounded-[40px] md:rounded-[120px_120px_100px_100px] relative overflow-hidden bg-black/40 shadow-inner">
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

            <div className="absolute top-3 left-3 z-20 flex flex-col gap-2">
              <Button 
                onClick={() => setIsAutoScanEnabled(!isAutoScanEnabled)}
                variant="secondary"
                className={`rounded-full px-3 md:px-4 h-8 md:h-10 backdrop-blur-md border md:border-2 transition-all flex items-center gap-1.5 md:gap-2 ${
                  isAutoScanEnabled 
                  ? 'bg-natural-success/20 border-natural-success/30 text-natural-success' 
                  : 'bg-white/20 border-white/20 text-white'
                }`}
              >
                <div className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full ${isAutoScanEnabled ? 'bg-natural-success animate-pulse' : 'bg-gray-400'}`} />
                <span className="text-[8px] md:text-[9px] font-black tracking-widest uppercase">
                  {isAutoScanEnabled ? 'Auto ON' : 'Auto OFF'}
                </span>
              </Button>

              <div className={`px-3 md:px-4 py-1 md:py-1.5 rounded-full text-[8px] md:text-[10px] backdrop-blur-md font-black tracking-wider flex items-center gap-1.5 md:gap-2 border whitespace-nowrap shadow-sm ${quotaPaused ? 'bg-orange-600 text-white border-orange-400' : 'bg-black/40 text-white border-white/10'}`}>
                {quotaPaused ? (
                  <><XCircle size={10} className="animate-pulse" /> QUOTA ({quotaCountdown}s)</>
                ) : !isAutoScanEnabled ? (
                  <><XCircle size={10} className="text-gray-400" /> DISABLED</>
                ) : isAutoScanning ? (
                  <><Loader2 size={10} className="animate-spin text-natural-accent" /> CCTV: ANALYZING...</>
                ) : (
                  loading ? 'LOADING...' : <><div className="w-1 md:w-1.5 h-1 md:h-1.5 rounded-full bg-natural-success animate-pulse" /> CCTV: MONITORING</>
                )}
              </div>
            </div>

            <div className="absolute top-3 right-3 flex flex-col gap-2">
              <Button 
                onClick={toggleCamera}
                variant="secondary"
                title={facingMode === 'user' ? "Switch Camera" : "Switch Camera"}
                className={`rounded-full w-10 h-10 md:w-12 md:h-12 p-0 backdrop-blur-md border md:border-2 transition-all ${
                  facingMode === 'user' 
                  ? 'bg-natural-primary/20 border-white/20 text-white' 
                  : 'bg-natural-accent/40 border-natural-accent/50 text-white'
                }`}
              >
                <div className="relative">
                  <Camera size={20} />
                  <div className="absolute -top-1 -right-1 bg-white text-black text-[7px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center border border-black/10">
                    {facingMode === 'user' ? 'F' : 'B'}
                  </div>
                </div>
              </Button>
            </div>

            <div className="absolute bottom-4 left-0 right-0 px-4 md:px-6 flex flex-col items-center gap-3 md:gap-4">
              <Button 
                 onClick={() => handleCapture(false)} 
                 disabled={loading || verifying}
                 className="w-full h-14 md:h-16 rounded-2xl md:rounded-[28px] bg-gradient-to-r from-natural-accent to-orange-500 hover:from-natural-accent/90 hover:to-orange-600 text-white font-black text-lg md:text-xl shadow-[0_10px_20px_rgba(244,63,94,0.3)] transition-all active:scale-[0.98] border md:border-2 border-white/30"
              >
                {verifying ? (
                  <><Loader2 size={24} className="mr-2 md:mr-3 animate-spin" /> ANALYZING...</>
                ) : (
                  <><Camera size={24} className="mr-2 md:mr-3" /> SCAN NOW</>
                )}
              </Button>

              <p className="text-white/80 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] text-center max-w-[280px] drop-shadow-md">
                {quotaPaused 
                  ? "SYSTEM COOL DOWN IN PROGRESS"
                  : isAutoScanEnabled 
                    ? "POSITION FACE INSIDE FRAME"
                    : "TAP TO VERIFY IDENTITY"
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
            className="flex flex-col items-center justify-center p-4 md:p-6 h-full w-full"
          >
            {verifying ? (
              <div className="space-y-4 md:space-y-6 text-center">
                 <div className="relative">
                    <div className="absolute inset-0 bg-natural-primary/20 rounded-full blur-2xl animate-pulse" />
                    <Loader2 size={60} className="text-natural-primary animate-spin relative z-10 mx-auto w-16 h-16 md:w-20 md:h-20" />
                    <Search size={24} className="absolute inset-0 m-auto text-natural-primary/50 z-20 w-6 h-6 md:w-8 md:h-8" />
                 </div>
                 <div className="space-y-1">
                    <p className="text-natural-primary text-xl md:text-2xl font-black italic tracking-tighter">IDENTIFYING...</p>
                    <p className="text-blue-500 text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em]">Checking Database</p>
                 </div>
              </div>
            ) : result && (
              <div className="space-y-4 md:space-y-6 text-center w-full px-2 md:px-4">
                <div className={`p-6 md:p-8 rounded-3xl md:rounded-[40px] inline-block shadow-lg ${result.isMatch ? 'bg-gradient-to-br from-natural-success/20 to-emerald-500/10 text-natural-success' : 'bg-gradient-to-br from-red-50 to-pink-50 text-red-500'}`}>
                  {result.isMatch ? <CheckCircle2 size={60} className="md:w-20 md:h-20" /> : <XCircle size={60} className="md:w-20 md:h-20" />}
                </div>
                <div className="space-y-2">
                  <h2 className={`text-3xl md:text-5xl font-black italic tracking-tighter ${result.isMatch ? 'text-natural-success' : 'text-red-500'} break-words`}>
                    {!result.isLivePerson ? 'SPOOF ALERT' : (result.isAlreadyMarked ? 'RECORDED' : (result.isMatch ? 'SUCCESS' : 'NO ENTRY'))}
                  </h2>
                  <p className="text-natural-primary text-base md:text-lg font-bold leading-tight">
                    {!result.isLivePerson 
                      ? <span className="text-red-600">Verification Failed</span>
                      : (result.isMatch 
                        ? <span>Welcome, <span className="text-natural-accent">{result.name}</span></span> 
                        : 'Unknown Face')}
                  </p>
                  <p className="text-[10px] md:text-[11px] text-natural-text/50 font-medium px-2">{result.reason}</p>
                </div>
                <Button onClick={reset} className="w-full h-14 md:h-16 rounded-xl md:rounded-[24px] text-lg md:text-xl font-black bg-gradient-to-r from-natural-primary to-indigo-600 hover:shadow-xl transition-all text-white">
                  DONE
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Status Card */}
      <div className="natural-card bg-natural-card p-4 md:p-6 flex flex-col items-center text-center shadow-sm">
        {result?.isMatch ? (
           <div className="flex flex-col items-center w-full">
              <div className="relative mb-3 md:mb-4">
                <img 
                  src={capturedPhoto || `https://ui-avatars.com/api/?name=${result.name}&background=a67c52&color=fff&size=100`} 
                  className="w-20 h-20 md:w-24 md:h-24 rounded-full border-2 md:border-4 border-white object-cover shadow-xl bg-slate-100" 
                  alt="Profile" 
                />
                <div className="absolute -bottom-1 -right-1 bg-natural-success text-white p-1 md:p-1.5 rounded-full shadow-lg border-2 border-white">
                  <CheckCircle2 size={16} />
                </div>
              </div>
              <h2 className="text-lg md:text-xl font-bold text-natural-primary mb-1">{result.name}</h2>
              <div className="bg-natural-success/5 text-natural-success p-3 rounded-xl md:rounded-2xl w-full">
                <h3 className="text-[8px] md:text-xs font-bold uppercase tracking-widest opacity-60">
                   {result.isAlreadyMarked ? 'ALREADY ON RECORD' : 'CHECK-IN VERIFIED'}
                </h3>
                <p className="text-xs md:text-[14px] font-black mt-0.5">
                   {format(new Date(), 'EEEE, MMMM dd')}
                </p>
                <div className="mt-2 bg-natural-success text-white px-3 md:px-4 py-1 rounded-full inline-block text-base md:text-lg font-black italic shadow-sm">
                   {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
           </div>
        ) : (
          <div className="py-1 space-y-3 w-full">
             <div className="flex justify-between items-center px-2">
                <p className="text-[8px] md:text-[10px] font-black text-natural-accent uppercase tracking-[0.2em]">Kiosk System Status</p>
                <div className="flex items-center gap-1.5">
                   <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                   <span className="text-[8px] md:text-[10px] font-bold text-green-600">LIVE</span>
                </div>
             </div>
             <div className="bg-natural-bg/50 p-3 md:p-4 rounded-xl">
                <div className="flex justify-between items-center text-xs md:text-sm">
                  <span className="text-natural-primary/60 font-medium italic">Active Profiles:</span>
                  <span className="font-bold text-natural-primary">{teachers.length} Professionals</span>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
