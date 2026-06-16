/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeacherRegistration } from './components/TeacherRegistration';
import { AttendanceKiosk } from './components/AttendanceKiosk';
import { AttendanceReport } from './components/AttendanceReport';
import { Toaster } from "@/components/ui/sonner";
import { UserCheck, Settings, BarChart3, School, WifiOff, Globe, AlertCircle, RefreshCw, KeyRound, Lock, ArrowRight, Loader2, ShieldAlert, Sun, Moon } from 'lucide-react';
import { db } from './lib/firebase';
import { doc, getDoc, setDoc, getDocFromServer } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

export default function App() {
  const [dark, setDark] = React.useState(true);
  const [time, setTime] = React.useState(new Date());

  React.useEffect(() => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  }, []);

  React.useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [dark]);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const [activeTab, setActiveTab] = React.useState('attendance');
  const [isOnline, setIsOnline] = React.useState(window.navigator.onLine);
  const [isNotHttps, setIsNotHttps] = React.useState(false);
  const [firestoreStatus, setFirestoreStatus] = React.useState<'checking' | 'connected' | 'disconnected'>('checking');
  
  // Authentication state for restricted tabs
  const [isAdminAuthenticated, setIsAdminAuthenticated] = React.useState(false);
  const [pin, setPin] = React.useState('');
  const [systemPin, setSystemPin] = React.useState<string | null>('1234');
  const [isPinSetupLoading, setIsPinSetupLoading] = React.useState(true);
  
  // Reset PIN admin override states
  const [showResetModal, setShowResetModal] = React.useState(false);
  const [adminEmail, setAdminEmail] = React.useState('');
  const [adminPassword, setAdminPassword] = React.useState('');
  const [resetStep, setResetStep] = React.useState<'credentials' | 'new_pin'>('credentials');
  const [resetNewPin, setResetNewPin] = React.useState('');
  const [resetConfirmPin, setResetConfirmPin] = React.useState('');

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === systemPin) {
      setIsAdminAuthenticated(true);
      toast.success('Access Granted / प्रवेश स्वीकृत');
    } else {
      toast.error('Incorrect Password or PIN / गलत पासवर्ड या पिन');
      setPin('');
    }
  };

  const handleAdminAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminEmail.trim().toLowerCase() === 'atul.iitm@gmail.com' && adminPassword === '67811') {
      setResetStep('new_pin');
      toast.success('Admin Verified / एडमिन सत्यापित');
    } else {
      toast.error('Incorrect Admin ID or Password / गलत एडमिन आईडी या पासवर्ड');
    }
  };

  const handleResetPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetNewPin.length < 4) {
      toast.error('PIN / Password should be at least 4 characters / पासवर्ड कम से कम 4 अक्षरों का होना चाहिए');
      return;
    }
    if (resetNewPin !== resetConfirmPin) {
      toast.error('PINs / Passwords do not match / पासवर्ड मेल नहीं खाते');
      return;
    }

    try {
      await setDoc(doc(db, 'settings', 'admin'), {
        pin: resetNewPin,
        setupAt: new Date().toISOString()
      });
      setSystemPin(resetNewPin);
      setShowResetModal(false);
      setAdminEmail('');
      setAdminPassword('');
      setResetNewPin('');
      setResetConfirmPin('');
      setResetStep('credentials');
      toast.success('Default Password Reset Securely! / नया पासवर्ड सुरक्षित रूप से सहेज लिया गया है!');
    } catch (error: any) {
      toast.error('Database save error / डेटाबेस सहेजने में त्रुटि: ' + error.message);
    }
  };

  React.useEffect(() => {
    // Auto upgrade http: to https: for safe media devices access (camera)
    if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
      try {
        window.location.replace('https://' + window.location.host + window.location.pathname + window.location.search + window.location.hash);
      } catch (err) {
        console.error("HTTPS upgrade failed:", err);
      }
    }

    // Check for HTTPS (necessary for camera)
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      setIsNotHttps(true);
    }
    
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const checkFirestore = async () => {
      try {
        // Try a fast server fetch to verify reachability
        await getDocFromServer(doc(db, '_health_check', 'connection'));
        setFirestoreStatus('connected');
      } catch (error: any) {
        console.warn("Firestore reachability check failed:", error.message);
        setFirestoreStatus('disconnected');
      }
    };

    const fetchSystemPin = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'admin'));
        if (docSnap.exists() && docSnap.data().pin) {
          setSystemPin(docSnap.data().pin);
        } else {
          setSystemPin('1234');
        }
      } catch (error) {
        console.error("Error fetching PIN setup, using default 1234:", error);
        setSystemPin('1234');
      } finally {
        setIsPinSetupLoading(false);
      }
    };

    checkFirestore();
    fetchSystemPin();
    const interval = setInterval(checkFirestore, 60000); // Check every minute

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-natural-bg font-sans text-natural-text selection:bg-natural-accent/10 selection:text-natural-primary relative overflow-hidden">
      {/* Connection Status Banners */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-red-600 text-white text-[10px] md:text-sm font-black uppercase tracking-[0.2em] py-2 px-4 flex items-center justify-center gap-3 sticky top-0 z-[60] shadow-lg"
          >
            <WifiOff size={16} className="animate-bounce" />
            No Internet Connection. The app is running in offline mode.
          </motion.div>
        )}
        {isOnline && firestoreStatus === 'disconnected' && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-amber-500 text-white text-[10px] md:text-xs font-black uppercase tracking-[0.1em] py-2 px-4 flex items-center justify-center gap-3 sticky top-0 z-[60] shadow-lg text-center"
          >
            <AlertCircle size={14} className="flex-shrink-0" />
            <span>Database unreachable. Attendance records will be synced when connection is restored.</span>
            <button 
              onClick={() => window.location.reload()}
              className="ml-2 bg-white/20 hover:bg-white/40 px-2 py-1 rounded border border-white/30 transition-all flex items-center gap-1"
            >
              <RefreshCw size={10} /> Retry
            </button>
          </motion.div>
        )}
        {isNotHttps && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="bg-red-950 text-white text-[10px] md:text-xs font-black uppercase tracking-[0.1em] py-2 px-4 flex items-center justify-center gap-3 sticky top-0 z-[60] shadow-lg text-center"
          >
            <ShieldAlert size={14} className="text-red-500" />
            <span>CRITICAL: CAMERA REQUIRES HTTPS. Your connection is NOT secure.</span>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Decorative colorful blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-natural-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-natural-accent/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[20%] right-[-5%] w-[30%] h-[30%] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />

      <header className="bg-neutral-950/90 dark:bg-black/80 backdrop-blur-md border-b border-white/[0.05] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-10 h-16 md:h-20 flex items-center justify-between relative z-10">
          <div className="flex flex-col">
            <span className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.22em] text-[#38bdf8] leading-none">
              HAPPY DAYS SCHOOL
            </span>
            <div className="flex items-center gap-2 mt-1">
              <h1 className="text-xl md:text-3xl font-extrabold text-white tracking-tight">Kiosk System</h1>
              <div className="bg-[#10b981]/10 border border-[#10b981]/30 rounded-full px-2 py-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-[#10b981] rounded-full animate-pulse" />
                <span className="text-[8px] md:text-[10px] font-bold text-[#10b981] uppercase tracking-wider">LIVE</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
            {/* Settings button for admins */}
            <button
              onClick={() => {
                setActiveTab('admin');
              }}
              className="p-2.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 text-white flex items-center justify-center cursor-pointer border border-white/[0.08] transition-all"
              title="Kiosk Configuration"
            >
              <Settings size={18} />
            </button>

            {/* Dark Mode Toggle */}
            <button
              onClick={() => setDark(!dark)}
              className="p-2.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 text-white flex items-center justify-center cursor-pointer border border-white/[0.08] transition-all"
              title={dark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {dark ? (
                <Sun size={18} className="text-amber-400 animate-[spin_10s_linear_infinite]" />
              ) : (
                <Moon size={18} className="text-[#3b82f6]" />
              )}
            </button>

            {/* Admin Avatar Circle */}
            <div className="w-9 h-9 rounded-full ring-2 ring-white/15 overflow-hidden shadow-md flex-shrink-0">
              <img 
                src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=150&auto=format&fit=crop" 
                alt="Admin Profile" 
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-10 py-5 md:py-8 space-y-5 md:space-y-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5 md:space-y-8">
          <div className="flex justify-center relative z-10 w-full">
            <TabsList className="bg-[#131927] p-1 h-12 md:h-14 rounded-2xl border border-white/[0.05] shadow-2xl w-full max-w-lg flex">
              <TabsTrigger 
                value="attendance" 
                className="flex-1 rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0b0e17] data-[state=active]:shadow-xl hover:text-white/80 transition-all h-full gap-2 font-black cursor-pointer text-white/45 text-[11px] md:text-sm uppercase tracking-tight"
              >
                <UserCheck size={16} /> ATTENDANCE
              </TabsTrigger>
              <TabsTrigger 
                value="admin" 
                className="flex-1 rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0b0e17] data-[state=active]:shadow-xl hover:text-white/80 transition-all h-full gap-2 font-black cursor-pointer text-white/45 text-[11px] md:text-sm uppercase tracking-tight"
              >
                <Settings size={16} /> REGISTER
              </TabsTrigger>
              <TabsTrigger 
                value="report" 
                className="flex-1 rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0b0e17] data-[state=active]:shadow-xl hover:text-white/80 transition-all h-full gap-2 font-black cursor-pointer text-white/45 text-[11px] md:text-sm uppercase tracking-tight"
              >
                <BarChart3 size={16} /> REPORTS
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Real-Time Golden/Yellow Clock Card (matching the screenshot) */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg mx-auto bg-[#131927] border border-white/[0.04] py-6 px-4 rounded-[28px] flex flex-col items-center justify-center text-center shadow-xl relative overflow-hidden"
          >
            <p className="text-4xl md:text-5xl font-black tracking-wider text-[#ffd700] drop-shadow-[0_2px_12px_rgba(250,204,21,0.25)] font-mono leading-none">
              {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </p>
            <p className="text-[11px] md:text-xs text-[#ffd700]/90 font-bold uppercase tracking-widest mt-2">
              {time.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </motion.div>

          <TabsContent value="attendance" className="outline-none">
            {activeTab === 'attendance' && <AttendanceKiosk />}
          </TabsContent>
          
          <TabsContent value="admin" className="outline-none">
            {activeTab === 'admin' && (
              isPinSetupLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="animate-spin text-white/40" size={32} />
                </div>
              ) : !isAdminAuthenticated ? (
                <div className="flex items-center justify-center py-10 px-4">
                  <motion.div 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-sm bg-[#131927] p-8 rounded-[32px] border border-white/[0.06] shadow-2xl relative overflow-hidden text-center flex flex-col items-center gap-6"
                  >
                    <div className="absolute top-0 left-0 w-full h-1 bg-[#ffd700]" />
                    <div className="w-16 h-16 bg-[#ffd700]/10 border border-[#ffd700]/25 rounded-full flex items-center justify-center text-[#ffd700]">
                      <Lock size={28} />
                    </div>
                    <div className="space-y-1.5">
                      <h2 className="text-xl font-black text-white italic tracking-tight uppercase">Register Locked</h2>
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-relaxed">
                        ENTER CURRENT PIN TO UNLOCK REGISTER SECTION
                      </p>
                    </div>

                    <form onSubmit={handlePinSubmit} className="w-full space-y-4">
                      <input 
                        type="password" 
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        placeholder="ENTER PASSWORD / PIN"
                        className="w-full h-14 bg-black/40 border border-white/[0.08] focus:border-[#ffd700]/40 text-white rounded-2xl px-6 text-center text-xl font-mono font-black tracking-[0.22em] outline-none transition-all placeholder:text-white/25 placeholder:text-xs placeholder:tracking-widest"
                        autoFocus
                      />
                      <button 
                        type="submit"
                        className="w-full h-14 bg-[#ffd700] hover:bg-[#ffe047] text-black font-black uppercase tracking-widest rounded-2xl shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 group cursor-pointer border-none font-sans"
                      >
                        Unlock / अनलॉक करें <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                      </button>
                    </form>

                    <div className="flex flex-col gap-2.5 w-full border-t border-white/[0.05] pt-4">
                      <button 
                        onClick={() => {
                          setResetStep('credentials');
                          setShowResetModal(true);
                        }}
                        className="text-[10px] font-black uppercase text-[#ffd700]/85 hover:text-[#ffd700] bg-transparent border-none transition-colors flex items-center justify-center gap-1.5 self-center cursor-pointer font-sans"
                      >
                        <KeyRound size={12} /> Reset Password (Admin only) / पिन रीसेट करें
                      </button>
                      <button 
                        onClick={() => setActiveTab('attendance')}
                        className="text-[9.5px] font-black uppercase text-white/35 hover:text-white/65 bg-transparent border-none transition-colors cursor-pointer font-sans"
                      >
                        Cancel & Return Home
                      </button>
                    </div>
                  </motion.div>
                </div>
              ) : (
                <TeacherRegistration />
              )
            )}
          </TabsContent>

          <TabsContent value="report" className="outline-none">
            {activeTab === 'report' && (
              isPinSetupLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="animate-spin text-white/40" size={32} />
                </div>
              ) : !isAdminAuthenticated ? (
                <div className="flex items-center justify-center py-10 px-4">
                  <motion.div 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-sm bg-[#131927] p-8 rounded-[32px] border border-white/[0.06] shadow-2xl relative overflow-hidden text-center flex flex-col items-center gap-6"
                  >
                    <div className="absolute top-0 left-0 w-full h-1 bg-[#38bdf8]" />
                    <div className="w-16 h-16 bg-[#38bdf8]/10 border border-[#38bdf8]/25 rounded-full flex items-center justify-center text-[#38bdf8]">
                      <BarChart3 size={28} />
                    </div>
                    <div className="space-y-1.5">
                      <h2 className="text-xl font-black text-white italic tracking-tight uppercase">Reports Locked</h2>
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-relaxed">
                        ENTER CURRENT PIN TO UNLOCK REPORTS SECTION
                      </p>
                    </div>

                    <form onSubmit={handlePinSubmit} className="w-full space-y-4">
                      <input 
                        type="password" 
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        placeholder="ENTER PASSWORD / PIN"
                        className="w-full h-14 bg-black/40 border border-white/[0.08] focus:border-[#38bdf8]/40 text-white rounded-2xl px-6 text-center text-xl font-mono font-black tracking-[0.22em] outline-none transition-all placeholder:text-white/25 placeholder:text-xs placeholder:tracking-widest"
                        autoFocus
                      />
                      <button 
                        type="submit"
                        className="w-full h-14 bg-[#38bdf8] hover:bg-[#7dd3fc] text-black font-black uppercase tracking-widest rounded-2xl shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 group cursor-pointer border-none font-sans"
                      >
                        Unlock / अनलॉक करें <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                      </button>
                    </form>

                    <div className="flex flex-col gap-2.5 w-full border-t border-white/[0.05] pt-4">
                      <button 
                        onClick={() => {
                          setResetStep('credentials');
                          setShowResetModal(true);
                        }}
                        className="text-[10px] font-black uppercase text-[#ffd700]/85 hover:text-[#ffd700] bg-transparent border-none transition-colors flex items-center justify-center gap-1.5 self-center cursor-pointer font-sans"
                      >
                        <KeyRound size={12} /> Reset Password (Admin only) / पिन रीसेट करें
                      </button>
                      <button 
                        onClick={() => setActiveTab('attendance')}
                        className="text-[9.5px] font-black uppercase text-white/35 hover:text-white/65 bg-transparent border-none transition-colors cursor-pointer font-sans"
                      >
                        Cancel & Return Home
                      </button>
                    </div>
                  </motion.div>
                </div>
              ) : (
                <AttendanceReport />
              )
            )}
          </TabsContent>
        </Tabs>
      </main>

      <footer className="py-8 border-t border-white/[0.05] mt-10 bg-transparent text-center">
        <div className="max-w-7xl mx-auto px-4 flex flex-col items-center gap-2">
          <p className="text-[8.5px] md:text-[10px] font-black text-white/20 uppercase tracking-[0.2em] font-sans">
            Smart Biometric Attendance Terminal
          </p>
          <p className="text-[7.5px] md:text-[8px] font-bold text-white/15 uppercase tracking-[0.15em] font-mono">
            Digital Attendance Solutions
          </p>
        </div>
      </footer>

      <Toaster position="top-right" richColors closeButton />

      <AnimatePresence>
        {showResetModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[120] flex items-center justify-center p-4 font-sans"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-[#131927] border border-white/[0.08] rounded-[28px] w-full max-w-sm overflow-hidden shadow-2xl p-6 md:p-8 relative"
            >
              {resetStep === 'credentials' ? (
                <form onSubmit={handleAdminAuthSubmit} className="flex flex-col items-center text-center gap-5">
                  <div className="w-16 h-16 bg-[#ffd700]/10 border border-[#ffd700]/25 rounded-full flex items-center justify-center text-[#ffd700]">
                    <ShieldAlert size={28} />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-lg font-black text-white italic tracking-tight uppercase">ADMIN OVERRIDE</h2>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-relaxed">
                      ENTER ADMIN EMAIL & SECRET PASS
                    </p>
                  </div>
                  
                  <div className="w-full space-y-3.5">
                    <div className="space-y-1 text-left">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#ffd700]/80 ml-1">Admin Email ID</label>
                      <input 
                        type="email" 
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        placeholder="e.g. atul.iitm@gmail.com" 
                        className="w-full h-12 px-4 rounded-xl bg-black/40 border border-white/[0.08] focus:border-[#ffd700]/40 text-white transition-all font-bold tracking-normal text-sm outline-none font-sans"
                        required
                      />
                    </div>

                    <div className="space-y-1 text-left">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#ffd700]/80 ml-1">Secret Password</label>
                      <input 
                        type="password" 
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="•••••" 
                        className="w-full h-12 px-4 rounded-xl bg-black/40 border border-white/[0.08] focus:border-[#ffd700]/40 text-white transition-all font-mono tracking-widest text-sm outline-none"
                        required
                      />
                    </div>
                    
                    <div className="flex gap-3 pt-3">
                      <button 
                        type="button"
                        className="flex-1 h-12 rounded-xl font-bold bg-transparent text-white/60 hover:text-white border border-white/[0.08] cursor-pointer font-sans"
                        onClick={() => {
                          setShowResetModal(false);
                          setAdminEmail('');
                          setAdminPassword('');
                        }}
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit"
                        className="flex-1 h-12 rounded-xl font-black bg-[#ffd700] hover:bg-[#ffe047] text-black border-none cursor-pointer font-sans"
                      >
                        Verify / सत्यापित करें
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleResetPinSubmit} className="flex flex-col items-center text-center gap-5">
                  <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/25 rounded-full flex items-center justify-center text-emerald-400">
                    <KeyRound size={28} />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-lg font-black text-white italic tracking-tight uppercase">SET NEW PASSWORD</h2>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-relaxed">
                      ENTER UNION PASS FOR ALL ADMIN SECTIONS
                    </p>
                  </div>
                  
                  <div className="w-full space-y-3.5">
                    <div className="space-y-1 text-left">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 ml-1">New PIN / Password</label>
                      <input 
                        type="password" 
                        value={resetNewPin}
                        onChange={(e) => setResetNewPin(e.target.value)}
                        placeholder="e.g. 1234" 
                        className="w-full h-12 px-4 rounded-xl bg-black/40 border border-white/[0.08] focus:border-emerald-500/40 text-white transition-all font-mono tracking-widest text-center text-sm outline-none"
                        required
                      />
                    </div>

                    <div className="space-y-1 text-left">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 ml-1">Confirm New Password</label>
                      <input 
                        type="password" 
                        value={resetConfirmPin}
                        onChange={(e) => setResetConfirmPin(e.target.value)}
                        placeholder="e.g. 1234" 
                        className="w-full h-12 px-4 rounded-xl bg-black/40 border border-white/[0.08] focus:border-emerald-500/40 text-white transition-all font-mono tracking-widest text-center text-sm outline-none"
                        required
                      />
                    </div>
                    
                    <div className="flex gap-3 pt-3">
                      <button 
                        type="button"
                        className="flex-1 h-12 rounded-xl font-bold bg-transparent text-white/60 hover:text-white border border-white/[0.08] cursor-pointer font-sans"
                        onClick={() => {
                          setResetStep('credentials');
                          setResetNewPin('');
                          setResetConfirmPin('');
                        }}
                      >
                        Back
                      </button>
                      <button 
                        type="submit"
                        className="flex-1 h-12 rounded-xl font-black bg-emerald-400 hover:bg-emerald-300 text-black border-none cursor-pointer font-sans"
                      >
                        Save PIN / पासवर्ड सेव करें
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
