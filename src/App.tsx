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
  const [dark, setDark] = React.useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  React.useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [dark]);

  const [activeTab, setActiveTab] = React.useState('attendance');
  const [isOnline, setIsOnline] = React.useState(window.navigator.onLine);
  const [isNotHttps, setIsNotHttps] = React.useState(false);
  const [firestoreStatus, setFirestoreStatus] = React.useState<'checking' | 'connected' | 'disconnected'>('checking');
  
  // Authentication state for restricted tabs
  const [isAdminAuthenticated, setIsAdminAuthenticated] = React.useState(false);
  const [pin, setPin] = React.useState('');
  const [systemPin, setSystemPin] = React.useState<string | null>(null);
  const [isPinSetupLoading, setIsPinSetupLoading] = React.useState(true);
  const [newPin, setNewPin] = React.useState('');
  const [confirmPin, setConfirmPin] = React.useState('');

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === systemPin) {
      setIsAdminAuthenticated(true);
      toast.success('Access Granted');
    } else {
      toast.error('Incorrect PIN');
      setPin('');
    }
  };

  const handleCreatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.length < 4) {
      toast.error('PIN should be at least 4 digits');
      return;
    }
    if (newPin !== confirmPin) {
      toast.error('PINs do not match');
      return;
    }

    try {
      await setDoc(doc(db, 'settings', 'admin'), {
        pin: newPin,
        setupAt: new Date().toISOString()
      });
      setSystemPin(newPin);
      setIsAdminAuthenticated(true);
      toast.success('Admin PIN Setup Complete');
    } catch (error: any) {
      toast.error('Failed to save PIN: ' + error.message);
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
        if (docSnap.exists()) {
          setSystemPin(docSnap.data().pin);
        } else {
          setSystemPin(null);
        }
      } catch (error) {
        console.error("Error fetching PIN setup:", error);
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

      <header className="bg-white/80 backdrop-blur-md border-b border-black/[0.05] sticky top-0 z-50 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
        <div className="max-w-7xl mx-auto px-4 md:px-10 h-16 md:h-20 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-9 h-9 md:w-11 md:h-11 bg-gradient-to-br from-natural-primary to-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-xl md:text-2xl shadow-lg ring-2 md:ring-4 ring-white">
              H
            </div>
            <div>
              <h1 className="text-base md:text-xl font-bold text-natural-primary uppercase tracking-tight">Happy Days School</h1>
              <div className="flex items-center gap-2">
                <p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] text-natural-primary/40 leading-none">Smart Attendance</p>
                <div className="hidden md:block w-1 h-1 bg-natural-primary/20 rounded-full" />
                <p className="hidden md:block text-[10px] font-black uppercase tracking-[0.1em] text-natural-accent italic">Dev: Atul Sharma</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4 md:gap-6">
            {/* Dark Mode Toggle Button */}
            <button
              onClick={() => setDark(!dark)}
              className="p-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800/80 dark:hover:bg-neutral-800 text-natural-primary flex items-center justify-center cursor-pointer shadow-sm border border-black/[0.04] dark:border-white/[0.08] transition-all"
              title={dark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {dark ? (
                <Sun size={18} className="text-amber-400 animate-[spin_10s_linear_infinite]" />
              ) : (
                <Moon size={18} className="text-indigo-600" />
              )}
            </button>

            <div className="hidden md:flex flex-col text-right">
              <p className="text-2xl font-light text-natural-primary">
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="text-[12px] opacity-70">
                {new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-10 py-6 md:py-8">
        <Tabs defaultValue="attendance" onValueChange={setActiveTab} className="space-y-6 md:space-y-10">
          <div className="flex justify-center relative z-10">
            <TabsList className="bg-white/70 backdrop-blur-md p-1.5 md:p-2 h-14 md:h-20 rounded-2xl md:rounded-[28px] border border-black/[0.08] shadow-2xl w-full max-w-lg">
              <TabsTrigger 
                value="attendance" 
                className="flex-1 rounded-xl md:rounded-[22px] data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-natural-bg/50 transition-all h-full gap-2 md:gap-3 font-black cursor-pointer text-natural-primary/50 text-xs md:text-base uppercase tracking-tight"
              >
                <UserCheck size={18} className="md:w-5 md:h-5" /> Attendance
              </TabsTrigger>
              <TabsTrigger 
                value="admin" 
                className="flex-1 rounded-xl md:rounded-[22px] data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-rose-600 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-natural-bg/50 transition-all h-full gap-2 md:gap-3 font-black cursor-pointer text-natural-primary/50 text-xs md:text-base uppercase tracking-tight"
              >
                <Settings size={18} className="md:w-5 md:h-5" /> Register
              </TabsTrigger>
              <TabsTrigger 
                value="report" 
                className="flex-1 rounded-xl md:rounded-[22px] data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-natural-bg/50 transition-all h-full gap-2 md:gap-3 font-black cursor-pointer text-natural-primary/50 text-xs md:text-base uppercase tracking-tight"
              >
                <BarChart3 size={18} className="md:w-5 md:h-5" /> Reports
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="attendance" className="outline-none">
            {activeTab === 'attendance' && <AttendanceKiosk />}
          </TabsContent>
          
          <TabsContent value="admin" className="outline-none">
            {activeTab === 'admin' && (
              isPinSetupLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="animate-spin text-natural-primary" size={32} />
                </div>
              ) : systemPin === null ? (
                // First-time setup UI
                <div className="flex items-center justify-center py-20 px-4">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full max-w-sm bg-white p-8 rounded-[32px] border-2 border-orange-500/20 shadow-2xl relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-500 to-rose-600" />
                    <div className="flex flex-col items-center gap-6 text-center">
                      <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center text-orange-600 ring-4 ring-orange-100 shadow-inner">
                        <KeyRound size={32} />
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-xl font-black uppercase tracking-tight text-natural-primary">Initial App Setup</h2>
                        <p className="text-[10px] uppercase font-bold text-natural-primary/40 tracking-wider">Create a unique Administrative PIN to secure your data</p>
                      </div>
                      <form onSubmit={handleCreatePin} className="w-full space-y-4">
                        <div className="space-y-4">
                          <input 
                            type="password" 
                            value={newPin}
                            onChange={(e) => setNewPin(e.target.value)}
                            placeholder="NEW 4-DIGIT PIN"
                            maxLength={8}
                            className="w-full h-14 bg-natural-bg/50 border-2 border-black/5 rounded-2xl px-6 text-center text-lg font-black tracking-[0.2em] outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all"
                            autoFocus
                          />
                          <input 
                            type="password" 
                            value={confirmPin}
                            onChange={(e) => setConfirmPin(e.target.value)}
                            placeholder="CONFIRM PIN"
                            maxLength={8}
                            className="w-full h-14 bg-natural-bg/50 border-2 border-black/5 rounded-2xl px-6 text-center text-lg font-black tracking-[0.2em] outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all"
                          />
                        </div>
                        <button 
                          type="submit"
                          className="w-full h-14 bg-orange-600 text-white font-black uppercase tracking-widest rounded-2xl shadow-lg hover:shadow-orange-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 group"
                        >
                          Save & Continue <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                      </form>
                    </div>
                  </motion.div>
                </div>
              ) : !isAdminAuthenticated ? (
                <div className="flex items-center justify-center py-20 px-4">
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-sm bg-white p-8 rounded-[32px] border border-black/5 shadow-2xl relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-orange-500 to-rose-600" />
                    <div className="flex flex-col items-center gap-6 text-center">
                      <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center text-orange-600">
                        <Lock size={32} />
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-xl font-black uppercase tracking-tight text-natural-primary">Admin Access Only</h2>
                        <p className="text-[10px] uppercase font-bold text-natural-primary/40 tracking-wider">Please enter the security PIN to continue</p>
                      </div>
                      <form onSubmit={handlePinSubmit} className="w-full space-y-4">
                        <div className="relative">
                          <input 
                            type="password" 
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            placeholder="ENTER PIN"
                            className="w-full h-14 bg-natural-bg/50 border-2 border-black/5 rounded-2xl px-6 text-center text-xl font-black tracking-[0.3em] outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all placeholder:text-natural-primary/10"
                            autoFocus
                          />
                        </div>
                        <button 
                          type="submit"
                          className="w-full h-14 bg-natural-primary text-white font-black uppercase tracking-widest rounded-2xl shadow-lg hover:shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 group"
                        >
                          Unlock Section <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                      </form>
                      <button 
                         onClick={() => setActiveTab('attendance')}
                         className="text-[10px] font-black uppercase text-natural-primary/30 hover:text-natural-primary/60 transition-colors"
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
                  <Loader2 className="animate-spin text-natural-primary" size={32} />
                </div>
              ) : systemPin === null ? (
                // Setup required
                <div className="flex items-center justify-center py-20 px-4">
                   <p className="text-sm font-black uppercase text-orange-600 bg-orange-100 px-6 py-3 rounded-2xl border border-orange-200">Please setup Admin PIN in "Register" tab first</p>
                </div>
              ) : !isAdminAuthenticated ? (
                <div className="flex items-center justify-center py-20 px-4">
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-sm bg-white p-8 rounded-[32px] border border-black/5 shadow-2xl relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-500 to-teal-600" />
                    <div className="flex flex-col items-center gap-6 text-center">
                      <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
                        <BarChart3 size={32} />
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-xl font-black uppercase tracking-tight text-natural-primary">Restricted Reports</h2>
                        <p className="text-[10px] uppercase font-bold text-natural-primary/40 tracking-wider">Authentication required for data access</p>
                      </div>
                      <form onSubmit={handlePinSubmit} className="w-full space-y-4">
                        <div className="relative">
                          <input 
                            type="password" 
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            placeholder="ENTER PIN"
                            className="w-full h-14 bg-natural-bg/50 border-2 border-black/5 rounded-2xl px-6 text-center text-xl font-black tracking-[0.3em] outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all placeholder:text-natural-primary/10"
                          />
                        </div>
                        <button 
                          type="submit"
                          className="w-full h-14 bg-natural-primary text-white font-black uppercase tracking-widest rounded-2xl shadow-lg hover:shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 group"
                        >
                          Verify PIN <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                      </form>
                      <button 
                        onClick={() => setActiveTab('attendance')}
                        className="text-[10px] font-black uppercase text-natural-primary/30 hover:text-natural-primary/60 transition-colors"
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

      <footer className="py-10 md:py-16 border-t border-black/[0.05] mt-10 bg-white/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-10 flex flex-col items-center gap-4">
          <div className="px-6 md:px-10 py-4 md:py-5 bg-natural-primary text-white rounded-2xl md:rounded-[32px] shadow-[0_20px_50px_rgba(45,35,28,0.3)] border-4 md:border-[6px] border-white transform hover:scale-105 transition-all cursor-default group relative overflow-hidden">
            <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            <p className="text-xs md:text-lg font-black uppercase tracking-[0.2em] md:tracking-[0.3em] italic relative z-10">
              App Developer Atul Sharma
            </p>
          </div>
          <p className="text-[8px] md:text-[10px] font-bold text-natural-primary/30 uppercase tracking-widest">Digital Attendance Solutions</p>
        </div>
      </footer>

      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}
