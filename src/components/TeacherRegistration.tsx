/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Upload, UserPlus, CheckCircle2, XCircle, Loader2, Users, FileText, Plus, Trash2, Edit2, Save, X, Settings, Shield, Sliders, Lock, KeyRound, WifiOff, ShieldAlert, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, deleteDoc, doc, writeBatch, updateDoc, getDoc, setDoc, runTransaction, increment } from 'firebase/firestore';
import { toast } from 'sonner';
import { format } from 'date-fns';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { compressImage } from '@/src/lib/imageUtils';

interface TeacherEntry {
  id: string;
  name: string;
  department: string;
  photo: string | null;
  status?: string;
}

export function TeacherRegistration() {
  const [activeTab, setActiveTab] = useState<'single' | 'bulk' | 'settings'>('single');
  
  // Admin Auth state
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [nextTabAfterAuth, setNextTabAfterAuth] = useState<'single' | 'bulk' | 'settings' | null>(null);
  const [adminPin, setAdminPin] = useState('1234'); // Default PIN
  
  // Single registration state
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  
  // Bulk registration state
  const [bulkEntries, setBulkEntries] = useState<TeacherEntry[]>([]);
  const [selectedBulkIndex, setSelectedBulkIndex] = useState<number | null>(null);

  // Settings state
  const [matchThreshold, setMatchThreshold] = useState(0.8);
  const [livenessSensitivity, setLivenessSensitivity] = useState(0.5);
  const [compressionQuality, setCompressionQuality] = useState(0.7);
  const [voiceAnnouncementsEnabled, setVoiceAnnouncementsEnabled] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [clientGeminiApiKey, setClientGeminiApiKey] = useState(() => {
    return localStorage.getItem("VITE_GEMINI_API_KEY") || localStorage.getItem("GEMINI_API_KEY") || "";
  });
  const [showApiKey, setShowApiKey] = useState(false);

  const [isCapturing, setIsCapturing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [fetching, setFetching] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingTeacher, setEditingTeacher] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editDept, setEditDept] = useState('');
  const [editEmpId, setEditEmpId] = useState('');
  const [editPhoto, setEditPhoto] = useState<string | null>(null);
  const [isCapturingEdit, setIsCapturingEdit] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [cameraRetryKey, setCameraRetryKey] = useState(0);
  
  const webcamRef = useRef<Webcam>(null);

  useEffect(() => {
    fetchTeachers();
    fetchSettings();

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
        if (data.matchThreshold !== undefined) setMatchThreshold(data.matchThreshold);
        if (data.livenessSensitivity !== undefined) setLivenessSensitivity(data.livenessSensitivity);
        if (data.compressionQuality !== undefined) setCompressionQuality(data.compressionQuality);
        if (data.voiceAnnouncementsEnabled !== undefined) setVoiceAnnouncementsEnabled(data.voiceAnnouncementsEnabled);
        if (data.adminPin) setAdminPin(data.adminPin);
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  };

  const handleVerifyPin = () => {
    if (pinInput === adminPin) {
      setIsAdminAuthenticated(true);
      setShowPinDialog(false);
      setPinInput('');
      if (nextTabAfterAuth) {
        setActiveTab(nextTabAfterAuth);
        setNextTabAfterAuth(null);
      }
      toast.success("Admin Access Granted");
    } else {
      toast.error("Incorrect PIN");
      setPinInput('');
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await setDoc(doc(db, "config", "ai_settings"), {
        matchThreshold,
        livenessSensitivity,
        compressionQuality,
        voiceAnnouncementsEnabled,
        adminPin,
        updatedAt: serverTimestamp()
      });
      
      if (clientGeminiApiKey.trim()) {
        localStorage.setItem("VITE_GEMINI_API_KEY", clientGeminiApiKey.trim());
        localStorage.setItem("GEMINI_API_KEY", clientGeminiApiKey.trim());
      } else {
        localStorage.removeItem("VITE_GEMINI_API_KEY");
        localStorage.removeItem("GEMINI_API_KEY");
      }

      toast.success("AI & Security Configuration saved!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "config");
    } finally {
      setSavingSettings(false);
    }
  };

  const fetchTeachers = async () => {
    setFetching(true);
    const path = "teachers";
    try {
      const q = query(collection(db, path), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const list = querySnapshot.docs.map(doc => ({ dbId: doc.id, ...doc.data() }));
      setTeachers(list);
      
      // Fetch next ID from counters
      if (activeTab === 'single' && !employeeId) {
        const counterRef = doc(db, "counters", "staff_id");
        const counterSnap = await getDoc(counterRef);
        if (counterSnap.exists()) {
          const nextVal = counterSnap.data().lastId + 1;
          setEmployeeId(`EMP-${String(nextVal).padStart(3, '0')}`);
        } else {
          setEmployeeId('EMP-001');
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    } finally {
      setFetching(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingTeacher) return;
    if (!editName || !editEmpId) {
      toast.error("Name and ID are required");
      return;
    }

    setUpdating(true);
    const path = "teachers";
    try {
      await updateDoc(doc(db, path, editingTeacher.dbId), {
        name: editName,
        department: editDept,
        id: editEmpId,
        photoUrl: editPhoto,
        updatedAt: serverTimestamp()
      });
      toast.success("Profile updated!");
      setEditingTeacher(null);
      fetchTeachers();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } finally {
      setUpdating(false);
    }
  };

  const startEdit = (teacher: any) => {
    setEditingTeacher(teacher);
    setEditName(teacher.name);
    setEditDept(teacher.department);
    setEditEmpId(teacher.id);
    setEditPhoto(teacher.photoUrl);
    setIsCapturingEdit(false);
  };

  const capture = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      compressImage(imageSrc, 800, 800, compressionQuality).then(compressed => {
        if (activeTab === 'single') {
          setPhoto(compressed);
        } else if (selectedBulkIndex !== null) {
          const newEntries = [...bulkEntries];
          newEntries[selectedBulkIndex].photo = compressed;
          setBulkEntries(newEntries);
        }
        setIsCapturing(false);
      });
    }
  }, [webcamRef, activeTab, selectedBulkIndex, bulkEntries, compressionQuality]);

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const handleRegister = async () => {
    if (activeTab === 'single') {
      if (!name || !employeeId || !photo) {
        toast.error("Please fill all fields and capture a photo");
        return;
      }

      setLoading(true);
      const path = "teachers";
      try {
        await runTransaction(db, async (transaction) => {
          const counterRef = doc(db, "counters", "staff_id");
          const counterSnap = await transaction.get(counterRef);
          
          let nextIdNum = 1;
          if (counterSnap.exists()) {
            nextIdNum = counterSnap.data().lastId + 1;
          }
          
          const finalId = `EMP-${String(nextIdNum).padStart(3, '0')}`;
          
          const newTeacherRef = doc(collection(db, path));
          transaction.set(newTeacherRef, {
            id: finalId,
            name,
            department,
            photoUrl: photo,
            status: 'active',
            createdAt: serverTimestamp()
          });
          
          transaction.set(counterRef, { lastId: nextIdNum }, { merge: true });
        });

        toast.success("Teacher registered successfully!");
        setName('');
        setDepartment('');
        setEmployeeId('');
        setPhoto(null);
        fetchTeachers();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      } finally {
        setLoading(false);
      }
    } else {
      // Bulk Register
      const validEntries = bulkEntries.filter(e => e.name && e.id && e.photo);
      if (validEntries.length === 0) {
        toast.error("No valid entries with photos to register");
        return;
      }

      setLoading(true);
      const path = "teachers";
      try {
        await runTransaction(db, async (transaction) => {
          const counterRef = doc(db, "counters", "staff_id");
          const counterSnap = await transaction.get(counterRef);
          
          let lastIdNum = 0;
          if (counterSnap.exists()) {
            lastIdNum = counterSnap.data().lastId;
          }

          validEntries.forEach((entry, index) => {
            const nextIdNum = lastIdNum + index + 1;
            const finalId = `EMP-${String(nextIdNum).padStart(3, '0')}`;
            
            const newTeacherRef = doc(collection(db, path));
            transaction.set(newTeacherRef, {
              id: finalId, // Overwrite with generated ID
              name: entry.name,
              department: entry.department,
              photoUrl: entry.photo,
              status: 'active',
              createdAt: serverTimestamp()
            });
          });
          
          transaction.set(counterRef, { lastId: lastIdNum + validEntries.length }, { merge: true });
        });

        toast.success(`Registered ${validEntries.length} teachers with auto-assigned IDs!`);
        setBulkEntries([]);
        setSelectedBulkIndex(null);
        fetchTeachers();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    
    if (fileName.endsWith('.csv')) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const entries: TeacherEntry[] = results.data.map((row: any) => ({
            name: row.name || row.Name || '',
            id: row.id || row.ID || row.employee_id || '',
            department: row.department || row.Department || row.dept || '',
            photo: null
          })).filter(e => e.name || e.id);

          if (entries.length > 0) {
            setBulkEntries([...bulkEntries, ...entries]);
            toast.success(`Imported ${entries.length} entries from CSV.`);
          } else {
            toast.error("No valid data found in CSV. Use headers: name, id, department");
          }
        },
        error: (err) => {
          toast.error("Failed to parse CSV: " + err.message);
        }
      });
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        const entries: TeacherEntry[] = data.map((row: any) => ({
          name: row.name || row.Name || '',
          id: row.id || row.ID || row.employee_id || '',
          department: row.department || row.Department || row.dept || '',
          photo: null
        })).filter(e => e.name || e.id);

        if (entries.length > 0) {
          setBulkEntries([...bulkEntries, ...entries]);
          toast.success(`Imported ${entries.length} entries from Excel.`);
        } else {
          toast.error("No valid data found in Excel. Use headers: name, id, department");
        }
      };
      reader.onerror = () => toast.error("Failed to read Excel file");
      reader.readAsBinaryString(file);
    } else {
      toast.error("Unsupported file format. Please upload CSV or Excel (.xlsx, .xls)");
    }
    
    // Reset input
    e.target.value = '';
  };

  return (
    <>
      <AnimatePresence>
        {showPinDialog && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-[110] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white natural-card w-full max-w-sm overflow-hidden shadow-2xl p-8"
            >
              <div className="flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 bg-natural-primary/10 rounded-full flex items-center justify-center text-natural-primary">
                  <Lock size={32} />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-black text-natural-primary italic tracking-tight uppercase">Admin Access Required</h2>
                  <p className="text-xs font-bold text-natural-primary/40 uppercase tracking-widest leading-relaxed">
                    Please enter the secure PIN to modify system configurations. <span className="text-indigo-600 block font-black mt-1">(Default PIN: 1234)</span>
                  </p>
                </div>
                
                <div className="w-full space-y-4">
                  <div className="relative">
                    <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-natural-primary/30" size={20} />
                    <Input 
                      type="password" 
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleVerifyPin()}
                      placeholder="ENTER PIN" 
                      className="h-14 pl-12 rounded-2xl bg-natural-bg/50 border-2 border-transparent focus:border-indigo-500/20 transition-all font-black tracking-[0.5em] text-center text-lg"
                      autoFocus
                    />
                  </div>
                  
                  <div className="flex gap-3">
                    <Button 
                      variant="outline" 
                      className="flex-1 h-12 rounded-xl font-bold"
                      onClick={() => {
                        setShowPinDialog(false);
                        setPinInput('');
                        setNextTabAfterAuth(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button 
                      className="flex-1 h-12 rounded-xl font-bold bg-natural-primary hover:bg-indigo-700"
                      onClick={handleVerifyPin}
                    >
                      Verify
                    </Button>
                  </div>
                </div>
                
                <p className="text-[10px] font-bold text-natural-primary/20 uppercase tracking-tighter">
                  Authorized Personnel Only
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full max-w-xl mx-auto mb-6 md:mb-8 flex gap-1 md:gap-2 p-1 bg-natural-bg/50 rounded-2xl border border-black/[0.03]">
        <Button 
          variant={activeTab === 'single' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('single')}
          className={`flex-1 h-10 md:h-12 rounded-xl font-bold transition-all text-xs md:text-sm ${activeTab === 'single' ? 'bg-natural-primary shadow-lg' : 'text-natural-primary/60'}`}
        >
          <UserPlus size={16} className="mr-1.5 md:mr-2" /> Register
        </Button>
        <Button 
          variant={activeTab === 'bulk' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('bulk')}
          className={`flex-1 h-10 md:h-12 rounded-xl font-bold transition-all text-xs md:text-sm ${activeTab === 'bulk' ? 'bg-natural-primary shadow-lg' : 'text-natural-primary/60'}`}
        >
          <Users size={16} className="mr-1.5 md:mr-2 md:w-[18px] md:h-[18px]" /> Bulk
        </Button>
        <Button 
          variant={activeTab === 'settings' ? 'default' : 'ghost'}
          onClick={() => {
            if (isAdminAuthenticated) {
              setActiveTab('settings');
            } else {
              setNextTabAfterAuth('settings');
              setShowPinDialog(true);
            }
          }}
          className={`flex-1 h-10 md:h-12 rounded-xl font-bold transition-all text-xs md:text-sm ${activeTab === 'settings' ? 'bg-natural-primary shadow-lg' : 'text-natural-primary/60'}`}
        >
          <Settings size={16} className="mr-1.5 md:mr-2 md:w-[18px] md:h-[18px]" /> Config
        </Button>
      </div>

      <Card className="w-full max-w-xl mx-auto natural-card border-none overflow-hidden shadow-2xl">
      <CardHeader className="bg-natural-bg/50 p-4 md:p-6 border-b border-black/[0.03]">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="p-2.5 md:p-3 bg-gradient-to-br from-natural-primary to-indigo-600 rounded-xl md:rounded-2xl text-white shadow-lg">
            {activeTab === 'single' ? <UserPlus size={20} className="md:w-6 md:h-6" /> : activeTab === 'bulk' ? <Users size={20} className="md:w-6 md:h-6" /> : <Settings size={20} className="md:w-6 md:h-6" />}
          </div>
          <div>
            <CardTitle className="text-lg md:text-xl font-black text-natural-primary italic tracking-tight">
              {activeTab === 'single' ? 'FACULTY REGISTER' : activeTab === 'bulk' ? 'BULK IMPORT' : 'AI SYSTEM SETTINGS'}
            </CardTitle>
            <CardDescription className="text-[8px] md:text-[10px] font-bold uppercase tracking-widest text-natural-primary/40">
              {activeTab === 'single' ? 'Secure Enrollment' : activeTab === 'bulk' ? 'Staff Directory Import' : 'Global Detection Tuning'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-4 md:p-8 space-y-6 md:space-y-8">
        {activeTab === 'settings' ? (
          <div className="space-y-10">
            <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-bold text-natural-primary flex items-center gap-2">
                  <Lock size={16} className="text-indigo-600" /> Admin Access Tool
                </Label>
                <p className="text-[10px] text-natural-primary/40 font-medium tracking-wide uppercase">
                  Current PIN is: <span className="font-black text-indigo-700">••••</span>
                </p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-xl border-indigo-500/20 font-bold h-9"
                onClick={() => {
                  const newPin = prompt("Enter new 4-6 digit Admin PIN:", adminPin);
                  if (newPin && newPin.length >= 4 && newPin.length <= 6 && /^\d+$/.test(newPin)) {
                    setAdminPin(newPin);
                    toast.info("PIN updated in memory. Save settings to persist.");
                  } else if (newPin) {
                    toast.error("Invalid PIN format");
                  }
                }}
              >
                Change PIN
              </Button>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-sm font-bold text-natural-primary flex items-center gap-2">
                    <Sliders size={16} className="text-indigo-500" /> Match Confidence
                  </Label>
                  <p className="text-[10px] text-natural-primary/40 font-medium tracking-wide">
                    Determines how strictly the AI matches faces. 
                    <span className={`font-bold ml-1 ${matchThreshold > 0.85 ? 'text-indigo-600' : matchThreshold > 0.6 ? 'text-indigo-500/60' : 'text-amber-500'}`}>
                      {matchThreshold > 0.85 ? 'High Security' : matchThreshold > 0.6 ? 'Balanced' : 'High Tolerance'}
                    </span>
                  </p>
                </div>
                <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">{(matchThreshold * 100).toFixed(0)}%</span>
              </div>
              <Slider 
                value={[matchThreshold]} 
                min={0.1} 
                max={0.99} 
                step={0.01} 
                onValueChange={(val) => setMatchThreshold(val[0])}
                className="py-4"
              />
              <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-natural-primary/20">
                <span>Loose</span>
                <span>Strict</span>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-sm font-bold text-natural-primary flex items-center gap-2">
                    <Shield size={16} className="text-rose-500" /> Liveness Sensitivity
                  </Label>
                  <p className="text-[10px] text-natural-primary/40 font-medium tracking-wide">
                    Strictness of anti-spoofing (screen detection). 
                    <span className={`font-bold ml-1 ${livenessSensitivity > 0.7 ? 'text-rose-600' : livenessSensitivity > 0.3 ? 'text-rose-500/60' : 'text-natural-primary/40'}`}>
                      {livenessSensitivity > 0.7 ? 'Ultra Strict' : livenessSensitivity > 0.3 ? 'Standard' : 'Disabled / Low'}
                    </span>
                  </p>
                </div>
                <span className="text-xs font-black text-rose-600 bg-rose-50 px-2 py-1 rounded-lg">{(livenessSensitivity * 100).toFixed(0)}%</span>
              </div>
              <Slider 
                value={[livenessSensitivity]} 
                min={0} 
                max={1} 
                step={0.1} 
                onValueChange={(val) => setLivenessSensitivity(val[0])}
                className="py-4"
              />
              <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-natural-primary/20">
                <span>Permissive</span>
                <span>Maximum Shield</span>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-sm font-bold text-natural-primary flex items-center gap-2">
                    <Upload size={16} className="text-emerald-500" /> Image Compression
                  </Label>
                  <p className="text-[10px] text-natural-primary/40 font-medium tracking-wide">
                    Balance between visual clarity and storage speed. 
                    <span className={`font-bold ml-1 ${compressionQuality > 0.8 ? 'text-emerald-600' : compressionQuality > 0.4 ? 'text-emerald-500/60' : 'text-amber-500'}`}>
                      {compressionQuality > 0.8 ? 'HD Quality' : compressionQuality > 0.4 ? 'Optimized' : 'Small / Low Res'}
                    </span>
                  </p>
                </div>
                <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">{(compressionQuality * 100).toFixed(0)}%</span>
              </div>
              <Slider 
                value={[compressionQuality]} 
                min={0.1} 
                max={1} 
                step={0.05} 
                onValueChange={(val) => setCompressionQuality(val[0])}
                className="py-4"
              />
              <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-natural-primary/20">
                <span>Fast Save</span>
                <span>Crystal Clear</span>
              </div>
            </div>

            <div className="p-4 bg-neutral-50/50 hover:bg-neutral-50 border border-neutral-100/80 rounded-2xl flex items-center justify-between transition-all">
              <div className="space-y-1 pr-4">
                <Label className="text-sm font-bold text-natural-primary flex items-center gap-2">
                  <Volume2 size={16} className="text-indigo-600" /> Voice Announcements
                </Label>
                <p className="text-[10px] text-natural-primary/40 font-medium tracking-wide">
                  Speak teacher's name with speech synthesis upon successful attendance check.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVoiceAnnouncementsEnabled(!voiceAnnouncementsEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 ${
                  voiceAnnouncementsEnabled ? 'bg-indigo-600' : 'bg-neutral-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    voiceAnnouncementsEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
              <p className="text-[10px] text-amber-700 font-bold leading-relaxed">
                <span className="uppercase text-[8px] tracking-widest block mb-1">Warning:</span>
                Higher sensitivity may lead to more "Spoof Alert" errors if lighting is poor. Lower match confidence increases "False Positives" (marking the wrong person).
              </p>
            </div>

            <div className="p-5 bg-gradient-to-br from-indigo-50/50 to-blue-50/50 border-2 border-indigo-100/50 rounded-3xl space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <Label className="text-sm font-black text-indigo-900 flex items-center gap-2">
                    <KeyRound size={16} className="text-indigo-600" /> Google Gemini API Key
                  </Label>
                  <p className="text-[10px] text-indigo-700/70 font-bold tracking-wide uppercase">
                    Direct Browser Local Setup
                  </p>
                </div>
                {clientGeminiApiKey.trim() && (
                  <div className="bg-emerald-600 text-[8px] font-black uppercase text-white px-2.5 py-1 rounded-full tracking-wider shadow-sm">
                    KEY ADDED
                  </div>
                )}
              </div>
              <p className="text-[10px] text-indigo-950 font-medium leading-relaxed">
                यदि आपकी वेबकैम फेस आइडेंटिफिकेशन नेटलिफाय (Netlify) जैसी साइट पर नहीं चल पा रही है, तो अपनी गूगल जेमिनी एपीआई की (Google Gemini API Key) सीधे यहाँ डाल सकते हैं। यह आपके डिवाइस के ब्राउज़र में ही सुरक्षित रहेगी।
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input 
                    type={showApiKey ? "text" : "password"}
                    value={clientGeminiApiKey}
                    onChange={(e) => setClientGeminiApiKey(e.target.value)}
                    placeholder="Paste Gemini API Key here (AIzaSy...)" 
                    className="h-11 rounded-xl bg-white border-indigo-200 focus:border-indigo-500 shadow-sm font-mono text-xs pr-12 focus-visible:ring-1 focus-visible:ring-indigo-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 font-black text-[9px] uppercase tracking-wider text-indigo-500 hover:text-indigo-800 transition-colors cursor-pointer"
                  >
                    {showApiKey ? "Hide" : "Show"}
                  </button>
                </div>
                {clientGeminiApiKey && (
                  <Button 
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl font-bold text-xs hover:bg-indigo-100 border-indigo-200"
                    onClick={() => {
                      setClientGeminiApiKey("");
                      toast.info("की (Key) साफ़ की गयी। कृपया नीचे 'Save AI System Settings' पर क्लिक करें।");
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="text-[9px] text-indigo-500 font-bold flex items-center gap-1.5">
                <span>🔐 यह सीधे Google Gemini APIs को सुरक्षित रूप से आपके ब्राउज़र से कॉल करेगी।</span>
              </div>
            </div>
          </div>
        ) : activeTab === 'single' ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-[10px] font-black text-indigo-500 uppercase tracking-widest ml-1">Full Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Teacher Full Name" className="h-14 rounded-2xl bg-natural-bg/50 border-2 border-transparent focus:border-indigo-500/20 transition-all shadow-sm font-bold" />
            </div>

            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <div className="space-y-2">
                <Label htmlFor="id" className="text-[10px] font-black text-blue-500 uppercase tracking-widest ml-1">Staff ID (Auto)</Label>
                <Input id="id" value={employeeId} readOnly placeholder="EMP-001" className="h-12 md:h-14 rounded-xl md:rounded-2xl bg-natural-bg/30 border-2 border-transparent transition-all shadow-sm font-black text-sm md:text-base text-blue-600 disabled:opacity-100" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dept" className="text-[10px] font-black text-rose-500 uppercase tracking-widest ml-1">Dept.</Label>
                <Input id="dept" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Maths" className="h-12 md:h-14 rounded-xl md:rounded-2xl bg-natural-bg/50 border-2 border-transparent focus:border-rose-500/20 transition-all shadow-sm font-bold text-sm md:text-base" />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
             <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-indigo-500/20 rounded-3xl bg-indigo-50/30 gap-4">
                <div className="p-4 bg-indigo-100 rounded-full text-indigo-600">
                  <FileText size={32} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-natural-primary">Upload CSV or Excel File</p>
                  <p className="text-[10px] font-medium text-natural-primary/40 mt-1 uppercase tracking-widest">Headers: name, id, department</p>
                </div>
                <div className="relative">
                  <input 
                    type="file" 
                    id="csv-upload" 
                    accept=".csv,.xlsx,.xls" 
                    className="hidden" 
                    onChange={handleFileUpload} 
                  />
                  <Button 
                    variant="outline" 
                    className="rounded-xl border-indigo-500/20 text-indigo-600 font-bold"
                    onClick={() => document.getElementById('csv-upload')?.click()}
                  >
                    Select File
                  </Button>
                </div>
             </div>

             {bulkEntries.length > 0 && (
               <div className="space-y-3">
                  <Label className="text-[10px] font-black text-natural-primary/40 uppercase tracking-widest ml-1">
                    Pending Entries ({bulkEntries.length})
                  </Label>
                  <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {bulkEntries.map((entry, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => setSelectedBulkIndex(idx)}
                        className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-3 ${
                          selectedBulkIndex === idx 
                          ? 'border-indigo-500 bg-indigo-50/50' 
                          : entry.photo 
                            ? 'border-emerald-500/20 bg-emerald-50/20' 
                            : 'border-black/5 bg-white'
                        }`}
                      >
                         <div className="w-10 h-10 rounded-xl bg-natural-bg overflow-hidden flex-shrink-0 border border-black/5 flex items-center justify-center">
                            {entry.photo ? (
                              <img src={entry.photo} className="w-full h-full object-cover" />
                            ) : (
                              <Camera size={16} className="text-natural-primary/20" />
                            )}
                         </div>
                         <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-natural-primary truncate">{entry.name || 'No Name'}</p>
                            <p className="text-[10px] font-bold text-natural-primary/40 uppercase tracking-widest">{entry.id || 'No ID'}</p>
                         </div>
                         {entry.photo ? (
                           <CheckCircle2 size={16} className="text-emerald-500" />
                         ) : (
                           <Plus size={16} className="text-indigo-500 animate-pulse" />
                         )}
                         <Button 
                           variant="ghost" 
                           size="icon" 
                           className="h-8 w-8 hover:bg-red-50 text-red-400"
                           onClick={(e) => {
                             e.stopPropagation();
                             setBulkEntries(bulkEntries.filter((_, i) => i !== idx));
                             if (selectedBulkIndex === idx) setSelectedBulkIndex(null);
                           }}
                         >
                           <Trash2 size={14} />
                         </Button>
                      </div>
                    ))}
                  </div>
               </div>
             )}
          </div>
        )}

        {(activeTab === 'single' || selectedBulkIndex !== null) && (
          <div className="space-y-4">
            <Label className="text-[10px] font-black text-amber-500 uppercase tracking-widest ml-1 flex items-center gap-2">
               <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> 
               {activeTab === 'single' ? 'Facial Identity Profile' : `Photo for: ${bulkEntries[selectedBulkIndex!]?.name}`}
            </Label>
            
            <div className="relative aspect-[3/4] rounded-[32px] overflow-hidden bg-[#e8e4db] border-[6px] border-white shadow-xl flex items-center justify-center">
              {isCapturing ? (
                <div className="relative w-full h-full bg-black">
                  {!cameraReady && !cameraError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40 gap-3">
                      <Loader2 className="animate-spin" size={32} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Waking Sensor...</span>
                    </div>
                  )}
                  {cameraError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-6 text-center gap-4 bg-red-950/60 backdrop-blur-xl z-20">
                      <div className="p-3 bg-red-500/20 rounded-full">
                        <ShieldAlert className="text-red-400" size={32} />
                      </div>
                      <div className="space-y-1">
                        <span className="text-sm font-black uppercase tracking-tight block">Camera Blocked</span>
                        <div className="space-y-3">
                          <p className="text-[10px] text-white/80 font-bold leading-tight max-w-[200px] mx-auto">
                            Access to your camera was denied. This is usually due to browser security settings or being inside a restricted frame.
                          </p>
                          <div className="bg-black/40 p-3 rounded-xl text-[9px] text-left border border-white/10 space-y-2">
                            <p className="font-black text-red-300 uppercase underline">Troubleshooting:</p>
                            <p>1. Tap the <span className="font-bold underline text-white">"Open in New Tab"</span> button below.</p>
                            <p>2. Check for a <span className="font-bold underline text-white">blocked camera icon</span> 📵 in the address bar.</p>
                            <p>3. Go to <span className="font-bold underline text-white">Browser Settings</span> → Site Settings → Camera and ensure it is <span className="font-bold text-green-400">Allowed</span>.</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 w-full max-w-[180px]">
                        <Button 
                          size="sm" 
                          className="bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl h-10 w-full text-[10px] uppercase font-black" 
                          onClick={() => {
                            setCameraError(null);
                            setCameraReady(false);
                            setCameraRetryKey(prev => prev + 1);
                          }}
                        >
                          🔄 Retry Camera
                        </Button>
                        <Button 
                          size="sm" 
                          className="bg-white text-red-950 hover:bg-white/90 rounded-xl h-10 w-full text-[10px] uppercase font-black" 
                          onClick={() => window.location.reload()}
                        >
                          Refresh Page
                        </Button>
                        <Button 
                          size="sm" 
                          variant="secondary"
                          className="bg-black/40 text-white border border-white/20 hover:bg-black/60 rounded-xl h-10 w-full text-[10px] uppercase font-black" 
                          onClick={() => window.open(window.location.href, '_blank')}
                        >
                          Open in New Tab ↗
                        </Button>
                        <label 
                          htmlFor="photo-upload"
                          className="bg-amber-600 hover:bg-amber-700 text-white h-10 rounded-xl flex items-center justify-center gap-1.5 text-[10px] uppercase font-black shadow-md cursor-pointer text-center select-none"
                        >
                          <Upload size={12} /> Gallery Upload
                        </label>
                      </div>
                    </div>
                  )}
                  <Webcam
                    key={cameraRetryKey}
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    videoConstraints={{ facingMode }}
                    className={`w-full h-full object-cover transition-opacity duration-500 ${cameraReady ? 'opacity-100' : 'opacity-0'}`}
                    mirrored={facingMode === 'user'}
                    onUserMedia={() => {
                      setCameraReady(true);
                      setCameraError(null);
                    }}
                    onUserMediaError={(err) => {
                      console.error("Webcam Error:", err);
                      setCameraError("Camera Access Denied or Busy");
                      setCameraReady(false);
                    }}
                    onResize={() => {}}
                    imageSmoothing={true}
                    forceScreenshotSourceSize={false}
                    disablePictureInPicture={true}
                    screenshotQuality={0.9}
                  />

                  <Button 
                    onClick={capture}
                    className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full h-16 w-16 p-0 bg-white hover:bg-slate-100 text-natural-primary shadow-2xl transition-transform active:scale-90"
                  >
                    <Camera size={32} />
                  </Button>
                </div>
              ) : (activeTab === 'single' ? photo : bulkEntries[selectedBulkIndex!]?.photo) ? (
                <div className="relative w-full h-full">
                  <img src={(activeTab === 'single' ? photo : bulkEntries[selectedBulkIndex!]?.photo) || ''} className="w-full h-full object-cover" alt="Registration Profile" />
              <div className="absolute bottom-6 left-0 right-0 px-6 flex gap-2">
                    <Button 
                      variant="secondary"
                      onClick={() => setIsCapturing(true)}
                      className="flex-1 h-12 rounded-2xl gap-2 bg-white/90 text-natural-primary font-bold shadow-xl backdrop-blur-sm"
                    >
                      <Camera size={18} /> Retake
                    </Button>
                    <Button 
                      variant="destructive"
                      onClick={() => {
                        if (activeTab === 'single') setPhoto(null);
                        else {
                          const newEntries = [...bulkEntries];
                          newEntries[selectedBulkIndex!].photo = null;
                          setBulkEntries(newEntries);
                        }
                      }}
                      className="h-12 w-12 rounded-2xl bg-red-500 text-white shadow-xl hover:bg-red-600"
                    >
                      <Trash2 size={18} />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center p-8 space-y-6">
                  <div className="w-20 h-20 bg-white/50 rounded-full flex items-center justify-center mx-auto shadow-sm">
                    <Camera size={32} className="text-natural-primary/30" />
                  </div>
                  <div className="flex flex-col gap-3">
                    <Button 
                      onClick={() => setIsCapturing(true)} 
                      className="h-12 px-8 rounded-2xl bg-natural-primary text-white font-bold gap-2"
                    >
                      <Camera size={18} /> Open Camera
                    </Button>
                    <div className="relative">
                      <input 
                        type="file" 
                        id="photo-upload" 
                        className="hidden" 
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = async () => {
                              const compressed = await compressImage(reader.result as string, 800, 800, compressionQuality);
                              if (activeTab === 'single') setPhoto(compressed);
                              else {
                                const newEntries = [...bulkEntries];
                                newEntries[selectedBulkIndex!].photo = compressed;
                                setBulkEntries(newEntries);
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                      <Button 
                        variant="outline"
                        onClick={() => document.getElementById('photo-upload')?.click()}
                        className="h-12 px-8 rounded-2xl border-natural-primary/30 text-natural-primary font-bold gap-2 w-full"
                      >
                        <Upload size={18} /> Upload Photo
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="p-6 pt-0">
        {activeTab === 'settings' ? (
          <Button 
            className="w-full h-14 text-lg font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-lg transition-all active:scale-[0.98] disabled:opacity-50" 
            onClick={handleSaveSettings}
            disabled={savingSettings}
          >
            {savingSettings ? (
              <Loader2 className="animate-spin mr-2" />
            ) : (
              <Save className="mr-2" size={20} />
            )}
            Save AI System Settings
          </Button>
        ) : (
          <Button 
            className="w-full h-14 text-lg font-bold bg-natural-accent hover:bg-natural-accent/90 text-white rounded-2xl shadow-lg transition-all active:scale-[0.98] disabled:opacity-50" 
            onClick={handleRegister}
            disabled={loading || isCapturing || (activeTab === 'bulk' && bulkEntries.length === 0)}
          >
            {loading ? (
              <Loader2 className="animate-spin mr-2" />
            ) : (
              <CheckCircle2 className="mr-2" size={20} />
            )}
            {activeTab === 'single' ? 'Complete Registration' : `Register ${bulkEntries.filter(e => e.photo).length} Profiles`}
          </Button>
        )}
      </CardFooter>
    </Card>

    <div className="w-full max-w-xl mx-auto mt-8 md:mt-12 space-y-4 md:space-y-6 px-1">
      <div className="flex items-center justify-between px-1 md:px-2">
        <div className="space-y-0.5 md:space-y-1">
          <h2 className="text-[10px] md:text-[12px] font-black text-natural-accent uppercase tracking-[0.2em]">REGISTERED STAFF</h2>
          <p className="text-natural-primary/40 text-[8px] md:text-[10px] font-bold uppercase tracking-tight italic">Profile Directory</p>
        </div>
        <div className="bg-natural-card px-3 md:px-4 py-1 md:py-1.5 rounded-full border border-black/5 shadow-sm">
           <span className="text-[9px] md:text-[10px] font-black text-natural-primary">{teachers.length} PROFILES</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:gap-4">
        {editingTeacher && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-end md:items-center justify-center p-0 md:p-4">
            <Card className="w-full md:max-w-md natural-card border-none overflow-hidden shadow-2xl animate-in slide-in-from-bottom md:zoom-in duration-300 rounded-t-[32px] md:rounded-[32px]">
              <CardHeader className="bg-natural-bg/80 p-5 md:p-6 border-b border-black/[0.03]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500 rounded-xl text-white">
                      <Edit2 size={18} />
                    </div>
                    <CardTitle className="text-lg font-black text-natural-primary italic uppercase tracking-tighter">Edit Profile</CardTitle>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setEditingTeacher(null)} className="rounded-full h-10 w-10">
                    <X size={24} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-5 md:p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="flex flex-col items-center gap-4 mb-6">
                  <div className="relative group">
                    <div className="w-32 h-32 rounded-2xl overflow-hidden shadow-lg border-4 border-white">
                      {isCapturingEdit ? (
                        <div className="relative w-full h-full bg-black">
                          {!cameraReady && !cameraError && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40">
                              <Loader2 className="animate-spin" size={20} />
                            </div>
                          )}
                          <Webcam
                            key={cameraRetryKey}
                            audio={false}
                            ref={webcamRef}
                            screenshotFormat="image/jpeg"
                            videoConstraints={{ facingMode }}
                            className={`w-full h-full object-cover transition-opacity duration-300 ${cameraReady ? 'opacity-100' : 'opacity-0'}`}
                            mirrored={facingMode === 'user'}
                            onUserMedia={() => {
                              setCameraReady(true);
                              setCameraError(null);
                            }}
                            onUserMediaError={(err) => {
                              console.error("Webcam Error:", err);
                              setCameraError("Camera Access Denied or Busy");
                              setCameraReady(false);
                              setIsCapturingEdit(false);
                              toast.error("Camera access denied");
                            }}
                            imageSmoothing={true}
                            forceScreenshotSourceSize={false}
                            disablePictureInPicture={true}
                            screenshotQuality={0.9}
                          />
                        </div>
                      ) : (
                        <img src={editPhoto || ''} className="w-full h-full object-cover" />
                      )}
                    </div>
                    {!isCapturingEdit && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-white hover:bg-white/20 rounded-full"
                          onClick={() => setIsCapturingEdit(true)}
                        >
                          <Camera size={24} />
                        </Button>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    {isCapturingEdit ? (
                      <>
                        <Button 
                          size="sm" 
                          onClick={() => {
                            const imageSrc = webcamRef.current?.getScreenshot();
                            if (imageSrc) {
                              compressImage(imageSrc, 800, 800, compressionQuality).then(compressed => {
                                setEditPhoto(compressed);
                                setIsCapturingEdit(false);
                              });
                            }
                          }}
                          className="bg-natural-success hover:bg-natural-success/90 rounded-xl"
                        >
                          <Camera size={16} className="mr-2" /> Capture
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => setIsCapturingEdit(false)}
                          className="rounded-xl"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={toggleCamera}
                          className="rounded-xl h-9 w-9 p-0"
                        >
                          <Upload size={16} className="rotate-180" />
                        </Button>
                      </>
                    ) : (
                      <div className="flex flex-col gap-2 w-full">
                        <div className="flex gap-2 justify-center">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="rounded-xl h-9" 
                            onClick={() => setIsCapturingEdit(true)}
                          >
                            <Camera size={14} className="mr-2" /> Retake
                          </Button>
                          <div className="relative">
                            <input 
                              type="file" 
                              id="edit-photo-upload" 
                              className="hidden" 
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onloadend = async () => {
                                    const compressed = await compressImage(reader.result as string, 800, 800, compressionQuality);
                                    setEditPhoto(compressed);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="rounded-xl h-9"
                              onClick={() => document.getElementById('edit-photo-upload')?.click()}
                            >
                              <Upload size={14} className="mr-2" /> Upload
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black text-indigo-500 uppercase tracking-widest ml-1">Full Name</Label>
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-12 rounded-xl bg-natural-bg/50 font-bold" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black text-blue-500 uppercase tracking-widest ml-1">Staff ID (Fixed)</Label>
                      <Input value={editEmpId} readOnly className="h-12 rounded-xl bg-natural-bg/30 border-none font-black text-blue-600 disabled:opacity-100" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black text-rose-500 uppercase tracking-widest ml-1">Department</Label>
                      <Input value={editDept} onChange={(e) => setEditDept(e.target.value)} className="h-12 rounded-xl bg-natural-bg/50 font-bold" />
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="p-6 flex flex-col gap-3">
                <div className="flex gap-3 w-full">
                  <Button variant="outline" className="flex-1 h-12 rounded-xl font-bold" onClick={() => setEditingTeacher(null)}>
                    Cancel
                  </Button>
                  <Button className="flex-1 h-12 rounded-xl font-bold bg-natural-primary hover:bg-natural-primary/90" onClick={handleUpdate} disabled={updating}>
                    {updating ? <Loader2 size={18} className="animate-spin mr-2" /> : <Save size={18} className="mr-2" />}
                    Save Changes
                  </Button>
                </div>
                <Button 
                  variant={confirmDeleteId === editingTeacher?.dbId ? "destructive" : "ghost"} 
                  className={`w-full h-10 font-bold rounded-xl gap-2 transition-all ${confirmDeleteId === editingTeacher?.dbId ? "bg-red-600 animate-pulse text-white" : "text-red-500 hover:text-red-600 hover:bg-red-50"}`}
                  disabled={updating || deletingId === editingTeacher?.dbId}
                  onClick={async () => {
                    if (!editingTeacher?.dbId) return;
                    
                    if (confirmDeleteId !== editingTeacher.dbId) {
                      setConfirmDeleteId(editingTeacher.dbId);
                      setTimeout(() => setConfirmDeleteId(null), 3000); // Reset after 3s
                      return;
                    }

                    setDeletingId(editingTeacher.dbId);
                    const teacherName = editingTeacher.name;
                    try {
                      await deleteDoc(doc(db, "teachers", editingTeacher.dbId));
                      setTeachers(prev => prev.filter(t => t.dbId !== editingTeacher.dbId));
                      toast.success(`${teacherName} deleted`);
                      setEditingTeacher(null);
                      setConfirmDeleteId(null);
                    } catch (error) {
                      handleFirestoreError(error, OperationType.DELETE, "teachers");
                    } finally {
                      setDeletingId(null);
                    }
                  }}
                >
                  {deletingId === editingTeacher?.dbId ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : confirmDeleteId === editingTeacher?.dbId ? (
                    <span className="text-white italic">Confirm Permanent Delete</span>
                  ) : (
                    <><Trash2 size={16} /> Delete Profile</>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}

        {fetching && teachers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 bg-natural-card rounded-[32px] border border-dashed border-black/10">
             <Loader2 size={32} className="text-natural-primary/20 animate-spin mb-4" />
             <p className="text-natural-primary/40 text-xs font-bold uppercase tracking-widest">Updating Directory...</p>
          </div>
        ) : teachers.length === 0 ? (
          <div className="text-center py-12 bg-natural-card rounded-[32px] border border-dashed border-black/10">
             <Users size={40} className="text-natural-primary/10 mx-auto mb-4" />
             <p className="text-natural-primary/30 text-sm font-medium">No teachers registered yet</p>
          </div>
        ) : (
          teachers.map((teacher) => (
            <div key={teacher.dbId} className="bg-white p-3 md:p-4 rounded-[22px] md:rounded-[28px] border border-black/5 shadow-sm flex items-center gap-3 md:gap-4 group hover:border-natural-accent/20 transition-all">
              <div className="h-14 w-14 md:h-16 md:w-16 rounded-xl md:rounded-2xl overflow-hidden shadow-md border-2 border-white flex-shrink-0">
                <img src={teacher.photoUrl} className="h-full w-full object-cover" alt={teacher.name} />
              </div>
              <div className="flex-1 min-w-0 pr-1 md:pr-2">
                <h3 className="font-bold text-natural-primary text-sm leading-tight truncate">{teacher.name}</h3>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 md:mt-1">
                  <span className="text-[8px] md:text-[9px] bg-natural-bg/50 px-1.5 md:px-2 py-0.5 rounded-full text-natural-primary/60 font-black uppercase tracking-widest border border-black/5">{teacher.id}</span>
                  <span className="text-[8px] md:text-[9px] font-black text-natural-accent uppercase tracking-wider italic">{teacher.department}</span>
                </div>
              </div>
              <div className="flex gap-1.5 md:gap-2">
                <Button 
                  variant="outline" 
                  size="icon"
                  className="h-10 w-10 md:h-11 md:w-11 rounded-xl md:rounded-2xl flex-shrink-0 shadow-sm transition-all active:scale-95 border border-black/5 hover:border-indigo-500/30 hover:bg-indigo-50"
                  onClick={() => startEdit(teacher)}
                >
                  <Edit2 size={18} className="text-indigo-600" />
                </Button>
                <Button 
                  variant={confirmDeleteId === teacher.dbId ? "destructive" : "destructive"} 
                  size={confirmDeleteId === teacher.dbId ? "default" : "icon"}
                  className={`h-10 md:h-11 rounded-xl md:rounded-2xl flex-shrink-0 shadow-lg transition-all active:scale-95 bg-red-500 hover:bg-red-600 border border-white ${confirmDeleteId === teacher.dbId ? "px-3 md:px-4 w-auto text-white" : "w-10 md:w-11"}`}
                  disabled={deletingId === teacher.dbId}
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!teacher.dbId) return;
                    
                    if (confirmDeleteId !== teacher.dbId) {
                      setConfirmDeleteId(teacher.dbId);
                      setTimeout(() => setConfirmDeleteId(null), 3000);
                      return;
                    }

                    setDeletingId(teacher.dbId);
                    try {
                      await deleteDoc(doc(db, "teachers", teacher.dbId));
                      setTeachers(prev => prev.filter(t => t.dbId !== teacher.dbId));
                      toast.success(`${teacher.name} deleted`);
                      setConfirmDeleteId(null);
                    } catch (error) {
                      handleFirestoreError(error, OperationType.DELETE, "teachers");
                    } finally {
                      setDeletingId(null);
                    }
                  }}
                >
                  {deletingId === teacher.dbId ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : confirmDeleteId === teacher.dbId ? (
                    <span className="text-[8px] md:text-[10px] font-black text-white italic tracking-wider">DELETE?</span>
                  ) : (
                    <Trash2 size={18} className="text-black" />
                  )}
                </Button>
            </div>
          </div>
          ))
        )}
      </div>
    </div>
  </>
  );
}

