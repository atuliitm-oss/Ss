/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import Webcam from 'react-webcam';
import { Camera, Search, Loader2, CheckCircle2, XCircle, UserCheck, Upload, SwitchCamera, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { identifyTeacher } from '@/src/services/geminiService';
import { compressImage } from '@/src/lib/imageUtils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { WifiOff, ShieldAlert } from 'lucide-react';

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
  const [quotaPaused, setQuotaPaused] = useState(false);
  const [quotaCountdown, setQuotaCountdown] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // New Camera-oriented state variables
  const [inputMode, setInputMode] = useState<'live' | 'file'>('live');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isAutoScanEnabled, setIsAutoScanEnabled] = useState(false);
  const [isNotHttps, setIsNotHttps] = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionState | null>(null);

  const webcamRef = useRef<Webcam>(null);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchTeachers();
    fetchSettings();

    // Check for HTTPS
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      setIsNotHttps(true);
    }

    // Check camera permission state if API is available
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'camera' as any })
        .then((result) => {
          setPermissionState(result.state);
          result.onchange = () => setPermissionState(result.state);
        })
        .catch(err => console.warn("Permission query failed:", err));
    }

    // Monitor online/offline status
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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

  // Auto-reset result screen after 7 seconds so scanner remains fully automatic for other users
  useEffect(() => {
    if (step === 'result' && isAutoScanEnabled) {
      resetTimerRef.current = setTimeout(() => {
        reset();
      }, 7000);
    }
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [step, isAutoScanEnabled]);

  // Clean, continuous automatic scanning cycle (CCTV Mode)
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (step === 'capture' && teachers.length > 0 && !loading && !verifying && !quotaPaused && isAutoScanEnabled && cameraReady && inputMode === 'live') {
      interval = setInterval(() => {
        handleCapture(true); // pass true for silent auto-scan
      }, 7000); // scan every 7 seconds when active
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [step, teachers, loading, verifying, quotaPaused, isAutoScanEnabled, cameraReady, inputMode]);

  // Reset quota countdown if paused
  useEffect(() => {
    let timer: NodeJS.Timeout;
    let interval: NodeJS.Timeout;
    const cooldownPeriod = 300; // 5 minutes

    if (quotaPaused) {
      setQuotaCountdown(cooldownPeriod);
      interval = setInterval(() => {
        setQuotaCountdown(prev => Math.max(0, prev - 1));
      }, 1000);
      
      timer = setTimeout(() => {
        setQuotaPaused(false);
        setQuotaCountdown(0);
      }, cooldownPeriod * 1000);
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

  const processImageAndVerify = async (imageSrc: string) => {
    if (teachers.length === 0) {
      toast.error("No teachers registered in system");
      return;
    }

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
        setStep('result');
        setResult(matchResult);
        toast.error("Face not recognized");
      }
    } catch (error: any) {
      const isQuotaError = error?.message?.includes("quota") || error?.message?.includes("429");
      if (isQuotaError) {
        setQuotaPaused(true);
      }

      setStep('result');
      setResult({
        isMatch: false,
        isLivePerson: true,
        matchedId: null,
        confidence: 0,
        name: null,
        reason: isQuotaError 
          ? "Free AI Daily limit reached. You can try again manually or wait for the system to resume."
          : (error instanceof Error ? error.message : "System Error")
      });
      toast.error(isQuotaError ? "Quota Exceeded" : "Error");
    } finally {
      setVerifying(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error("Please select a valid image file");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Image = reader.result as string;
      if (base64Image) {
        await processImageAndVerify(base64Image);
      }
    };
    reader.onerror = () => {
      toast.error("Failed to read image file");
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const reset = () => {
    setStep('capture');
    setCapturedPhoto(null);
    setResult(null);
    setVerifying(false);
    setCameraReady(true);
  };

  const handleCapture = async (isAuto = false) => {
    if (verifying || step !== 'capture' || quotaPaused) return;
    
    if (!webcamRef.current) {
      if (!isAuto) toast.error("Camera system not initialized");
      return;
    }

    if (!cameraReady && !isAuto) {
      toast.error("Please wait for camera to initialize");
      return;
    }

    let imageSrc = webcamRef.current.getScreenshot();
    
    // Fallback: If react-webcam screenshot fails, try drawing the active video stream directly onto a canvas
    if (!imageSrc || imageSrc === 'data:,' || imageSrc.length < 100) {
      try {
        const videoEl = webcamRef.current.video;
        if (videoEl && videoEl.readyState >= 2) {
          const canvas = document.createElement('canvas');
          canvas.width = videoEl.videoWidth || 640;
          canvas.height = videoEl.videoHeight || 480;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // Apply horizontal reflection if front camera is used (matching mirror setting)
            if (facingMode === 'user') {
              ctx.translate(canvas.width, 0);
              ctx.scale(-1, 1);
            }
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            imageSrc = canvas.toDataURL('image/jpeg', 0.92);
          }
        }
      } catch (err) {
        console.error("Direct HTML video canvas fallback failed:", err);
      }
    }

    // Secondary delay & retry if still null (common during camera startup transient state)
    if (!imageSrc || imageSrc === 'data:,' || imageSrc.length < 100) {
      await new Promise(resolve => setTimeout(resolve, 400));
      imageSrc = webcamRef.current.getScreenshot();
    }
    
    // Ultimate fallback attempt via direct canvas drawing
    if (!imageSrc || imageSrc === 'data:,' || imageSrc.length < 100) {
      try {
        const videoEl = webcamRef.current.video;
        if (videoEl && videoEl.readyState >= 2) {
          const canvas = document.createElement('canvas');
          canvas.width = videoEl.videoWidth || 640;
          canvas.height = videoEl.videoHeight || 480;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            if (facingMode === 'user') {
              ctx.translate(canvas.width, 0);
              ctx.scale(-1, 1);
            }
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            imageSrc = canvas.toDataURL('image/jpeg', 0.92);
          }
        }
      } catch (err) {
        console.error("Secondary canvas fallback failed:", err);
      }
    }

    if (!imageSrc || imageSrc === 'data:,' || imageSrc.length < 100) {
      if (!isAuto) {
        toast.error("Failed to capture a clear photo. Please ensure camera permission is granted and visible.");
      }
      return;
    }

    let finalImage = imageSrc;
    try {
      finalImage = await compressImage(imageSrc, 400, 400, 0.72);
    } catch (compressErr) {
      console.warn("Capture compression failed, using raw:", compressErr);
    }

    await processImageAndVerify(finalImage);
  };

  const toggleCamera = () => {
    setCameraReady(false);
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
            <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden">
              {/* Laser scan line sweep */}
              {cameraReady && !cameraError && (
                <motion.div 
                  animate={{ top: ['15%', '85%', '15%'] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                  className="absolute left-[10%] right-[10%] h-[2px] bg-natural-accent shadow-[0_0_15px_rgba(244,63,94,0.8)] z-20 opacity-60 pointer-events-none" 
                />
              )}

              {/* Main camera viewport */}
              <div className="w-[90%] md:w-[85%] h-[80%] md:h-auto md:aspect-[3/4] border-4 border-white rounded-[40px] md:rounded-[120px_120px_100px_100px] relative overflow-hidden bg-black shadow-inner">
                {quotaPaused && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-6 text-center gap-4 bg-amber-950/95 z-40 overflow-y-auto">
                    <div className="p-3 bg-amber-500/20 rounded-full animate-pulse">
                      <WifiOff className="text-amber-400" size={32} />
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs font-black uppercase tracking-tight block text-amber-300">
                        एआई कोटा सीमा (Daily Quota Reached)
                      </span>
                      <p className="text-[10px] text-white/95 font-bold leading-normal max-w-[210px] mx-auto">
                        मुफ़्त जेमिनी एआई लिमिट समाप्त। सिस्टम {Math.floor(quotaCountdown / 60)}m {quotaCountdown % 60}s में फिर से शुरू होगा।
                      </p>
                    </div>

                    <div className="flex flex-col gap-1.5 w-full max-w-[215px] bg-black/40 p-3 rounded-2xl border border-white/10 text-left text-[9px] text-white/70">
                      <p className="font-extrabold text-amber-300 uppercase">💡 त्वरित समाधान (Solution):</p>
                      <p>1. <b>Register &gt; Config</b> टैब में जाएं</p>
                      <p>2. वहां अपनी <b>Google Gemini API Key</b> सेव करें</p>
                      <p>3. उसके बाद असीमित उपस्थिति तुरंत शुरू करें!</p>
                    </div>

                    <Button 
                      size="sm" 
                      onClick={() => setQuotaPaused(false)}
                      className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl h-9 w-full max-w-[210px] text-[10px] uppercase font-black"
                    >
                      बाईपास करें ({quotaCountdown}s)
                    </Button>
                  </div>
                )}

                {!cameraReady && !cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40 gap-3 z-10 bg-neutral-900">
                    <Loader2 className="animate-spin text-natural-accent" size={32} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-300">कैमरा लोड हो रहा है...</span>
                  </div>
                )}

                {cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-4 text-center gap-3 bg-red-950/95 z-30 overflow-y-auto w-full h-full">
                    <div className="p-2.5 bg-red-500/20 rounded-full shrink-0">
                      <ShieldAlert className="text-red-400" size={32} />
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs font-black uppercase tracking-tight block text-red-200">
                        कैमरा एक्सेस ब्लॉक है (Camera Blocked)
                      </span>
                      <p className="text-[10px] text-white/85 font-bold leading-normal max-w-[210px] mx-auto">
                        सुरक्षा कारणों से आईफ्रेम (iframe) में कैमरा चालू नहीं हो रहा है। उपस्थिति दर्ज करने के लिए नीचे दिए गए विकल्प चुनें:
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 w-full max-w-[210px] shrink-0">
                      <Button 
                        size="sm" 
                        onClick={() => window.open(window.location.href, '_blank')}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 w-full text-[10px] uppercase font-black shadow-md flex items-center justify-center gap-1.5"
                      >
                        <RefreshCw size={12} className="animate-spin" style={{ animationDuration: '3s' }} /> ⚡ नए टैब में खोलें (Instant fix) ↗
                      </Button>
                      <label 
                        htmlFor="native-gallery-upload"
                        className="bg-amber-600 hover:bg-amber-700 text-white h-10 rounded-xl flex items-center justify-center gap-1.5 text-[10px] uppercase font-black shadow-md cursor-pointer text-center select-none animate-bounce"
                      >
                        <Upload size={12} /> 📸 मोबाईल गैलरी से अपलोड करें
                      </label>
                    </div>
                  </div>
                )}

                {/* HTML Webcam Element */}
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  className={`w-full h-full object-cover transition-opacity duration-300 ${cameraReady ? 'opacity-100' : 'opacity-0'}`}
                  videoConstraints={{ facingMode }}
                  mirrored={facingMode === 'user'}
                  screenshotQuality={0.92}
                  imageSmoothing={true}
                  disablePictureInPicture={true}
                  forceScreenshotSourceSize={false}
                  onUserMedia={() => {
                    setCameraReady(true);
                    setCameraError(null);
                  }}
                  onUserMediaError={(err) => {
                    console.error("Webcam Error:", err);
                    setCameraError("Camera permission blocked.");
                    setCameraReady(false);
                  }}
                />

                {/* Dynamic Face align contour overlay */}
                {cameraReady && !cameraError && (
                  <div className="absolute inset-8 border border-white/20 rounded-[80px_80px_60px_60px] pointer-events-none flex flex-col items-center justify-center">
                    <div className="w-16 h-16 rounded-full border border-white/10 mt-6" />
                    <span className="text-[7px] text-white/35 uppercase font-black tracking-[0.2em] mt-auto mb-16">
                      यहाँ चेहरा संरेखित करें
                    </span>
                  </div>
                )}
              </div>

              {/* Bottom Triggers & Upload Controls */}
              <div className="absolute bottom-3 left-0 right-0 px-4 md:px-6 flex flex-col items-center gap-2.5 z-20 w-full">
                {cameraReady && !cameraError && (
                  <Button 
                    onClick={() => handleCapture(false)} 
                    disabled={verifying}
                    className="w-[90%] md:w-[85%] h-12 rounded-xl bg-gradient-to-r from-natural-accent to-orange-500 hover:from-natural-accent/90 hover:to-orange-600 text-white font-black text-xs uppercase shadow-md transition-all active:scale-[0.98] border border-white/20 disabled:opacity-50"
                  >
                    {verifying ? (
                      <><Loader2 size={16} className="mr-2 animate-spin" /> पहचान की जा रही है...</>
                    ) : (
                      <><Camera size={16} className="mr-2 animate-bounce" /> 👉 कैमरा से फोटो खींचें (Scan Now) :</>
                    )}
                  </Button>
                )}

                <label 
                  htmlFor="native-gallery-upload"
                  className="w-[90%] md:w-[85%] h-11 rounded-xl bg-white text-natural-primary border border-natural-primary/20 hover:bg-neutral-50 cursor-pointer flex items-center justify-center gap-2 font-black text-xs uppercase shadow-sm active:scale-95 transition-all text-center select-none"
                >
                  <Upload size={14} className="text-natural-accent animate-pulse" /> 📸 मोबाइल गैलरी से फोटो अपलोड करें (Gallery)
                </label>
                <input 
                  type="file" 
                  id="native-gallery-upload" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleFileUpload} 
                />
              </div>
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
