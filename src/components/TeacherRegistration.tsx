/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Camera, Upload, UserPlus, CheckCircle2, XCircle, Loader2, Users, FileText, Plus, Trash2, Edit2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, deleteDoc, doc, writeBatch, updateDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { format } from 'date-fns';
import Papa from 'papaparse';

interface TeacherEntry {
  id: string;
  name: string;
  department: string;
  photo: string | null;
  status?: string;
}

export function TeacherRegistration() {
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');
  
  // Single registration state
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  
  // Bulk registration state
  const [bulkEntries, setBulkEntries] = useState<TeacherEntry[]>([]);
  const [selectedBulkIndex, setSelectedBulkIndex] = useState<number | null>(null);

  const [isCapturing, setIsCapturing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [fetching, setFetching] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingTeacher, setEditingTeacher] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editDept, setEditDept] = useState('');
  const [editEmpId, setEditEmpId] = useState('');
  const [editPhoto, setEditPhoto] = useState<string | null>(null);
  const [isCapturingEdit, setIsCapturingEdit] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  
  const webcamRef = useRef<Webcam>(null);

  useEffect(() => {
    fetchTeachers();
  }, []);

  const fetchTeachers = async () => {
    setFetching(true);
    const path = "teachers";
    try {
      const q = query(collection(db, path), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const list = querySnapshot.docs.map(doc => ({ dbId: doc.id, ...doc.data() }));
      setTeachers(list);
      
      // Auto-generate next ID if field is empty (only for single registration)
      if (activeTab === 'single' && !employeeId) {
        if (list.length === 0) {
          setEmployeeId('EMP-001');
        } else {
          let maxId = 0;
          list.forEach(t => {
            const match = (t as any).id?.match(/EMP-(\d+)/);
            if (match) {
              const num = parseInt(match[1]);
              if (num > maxId) maxId = num;
            }
          });
          setEmployeeId(`EMP-${String(maxId + 1).padStart(3, '0')}`);
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
      if (activeTab === 'single') {
        setPhoto(imageSrc);
      } else if (selectedBulkIndex !== null) {
        const newEntries = [...bulkEntries];
        newEntries[selectedBulkIndex].photo = imageSrc;
        setBulkEntries(newEntries);
      }
      setIsCapturing(false);
    }
  }, [webcamRef, activeTab, selectedBulkIndex, bulkEntries]);

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
        await addDoc(collection(db, path), {
          id: employeeId,
          name,
          department,
          photoUrl: photo,
          status: 'active',
          createdAt: serverTimestamp()
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
        const batch = writeBatch(db);
        validEntries.forEach(entry => {
          const docRef = doc(collection(db, path));
          batch.set(docRef, {
            id: entry.id,
            name: entry.name,
            department: entry.department,
            photoUrl: entry.photo,
            status: 'active',
            createdAt: serverTimestamp()
          });
        });
        await batch.commit();
        toast.success(`Registered ${validEntries.length} teachers successfully!`);
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

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
          toast.success(`Imported ${entries.length} entries. Please add photos!`);
        } else {
          toast.error("No valid data found in CSV. Use headers: name, id, department");
        }
      },
      error: (err) => {
        toast.error("Failed to parse CSV: " + err.message);
      }
    });
    // Reset input
    e.target.value = '';
  };

  return (
    <>
      <div className="max-w-xl mx-auto mb-8 flex gap-2 p-1 bg-natural-bg/50 rounded-2xl border border-black/[0.03]">
        <Button 
          variant={activeTab === 'single' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('single')}
          className={`flex-1 h-12 rounded-xl font-bold transition-all ${activeTab === 'single' ? 'bg-natural-primary shadow-lg' : 'text-natural-primary/60'}`}
        >
          <UserPlus size={18} className="mr-2" /> Single
        </Button>
        <Button 
          variant={activeTab === 'bulk' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('bulk')}
          className={`flex-1 h-12 rounded-xl font-bold transition-all ${activeTab === 'bulk' ? 'bg-natural-primary shadow-lg' : 'text-natural-primary/60'}`}
        >
          <Users size={18} className="mr-2" /> Bulk Upload
        </Button>
      </div>

      <Card className="max-w-xl mx-auto natural-card border-none overflow-hidden shadow-2xl">
      <CardHeader className="bg-natural-bg/50 p-6 border-b border-black/[0.03]">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-natural-primary to-indigo-600 rounded-2xl text-white shadow-lg">
            {activeTab === 'single' ? <UserPlus size={24} /> : <Users size={24} />}
          </div>
          <div>
            <CardTitle className="text-xl font-black text-natural-primary italic tracking-tight">
              {activeTab === 'single' ? 'NEW FACULTY' : 'BULK REGISTRATION'}
            </CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-natural-primary/40">
              {activeTab === 'single' ? 'Secure Registration' : 'Import Multiple Staff'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-8 space-y-8">
        {activeTab === 'single' ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-[10px] font-black text-indigo-500 uppercase tracking-widest ml-1">Full Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Teacher Full Name" className="h-14 rounded-2xl bg-natural-bg/50 border-2 border-transparent focus:border-indigo-500/20 transition-all shadow-sm font-bold" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="id" className="text-[10px] font-black text-blue-500 uppercase tracking-widest ml-1">Staff ID</Label>
                <Input id="id" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="EMP-000" className="h-14 rounded-2xl bg-natural-bg/50 border-2 border-transparent focus:border-blue-500/20 transition-all shadow-sm font-bold" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dept" className="text-[10px] font-black text-rose-500 uppercase tracking-widest ml-1">Department</Label>
                <Input id="dept" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Maths" className="h-14 rounded-2xl bg-natural-bg/50 border-2 border-transparent focus:border-rose-500/20 transition-all shadow-sm font-bold" />
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
                  <p className="text-sm font-bold text-natural-primary">Upload CSV File</p>
                  <p className="text-[10px] font-medium text-natural-primary/40 mt-1 uppercase tracking-widest">Headers: name, id, department</p>
                </div>
                <div className="relative">
                  <input 
                    type="file" 
                    id="csv-upload" 
                    accept=".csv" 
                    className="hidden" 
                    onChange={handleCsvUpload} 
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
                <div className="relative w-full h-full">
                  <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    videoConstraints={{ facingMode }}
                    className="w-full h-full object-cover"
                    mirrored={facingMode === 'user'}
                    onUserMedia={() => {}}
                    onUserMediaError={() => {}}
                    onResize={() => {}}
                    imageSmoothing={true}
                    forceScreenshotSourceSize={false}
                    disablePictureInPicture={true}
                    screenshotQuality={0.9}
                  />
                  
                  <div className="absolute top-4 right-4 flex flex-col gap-2">
                    <Button 
                      onClick={toggleCamera}
                      variant="secondary"
                      className="rounded-full w-10 h-10 p-0 bg-white/20 backdrop-blur-md border-none text-white hover:bg-white/40"
                    >
                      <Upload size={18} />
                    </Button>
                  </div>

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
                            reader.onloadend = () => {
                              if (activeTab === 'single') setPhoto(reader.result as string);
                              else {
                                const newEntries = [...bulkEntries];
                                newEntries[selectedBulkIndex!].photo = reader.result as string;
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
      </CardFooter>
    </Card>

    <div className="max-w-xl mx-auto mt-12 space-y-6">
      <div className="flex items-center justify-between px-2">
        <div className="space-y-1">
          <h2 className="text-[12px] font-black text-natural-accent uppercase tracking-[0.2em]">Registered Staff</h2>
          <p className="text-natural-primary/40 text-[10px] font-bold uppercase tracking-tight">Active Faculty Directory</p>
        </div>
        <div className="bg-natural-card px-4 py-1.5 rounded-full border border-black/5 shadow-sm">
           <span className="text-[10px] font-black text-natural-primary">{teachers.length} PROFILES</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {editingTeacher && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <Card className="w-full max-w-md natural-card border-none overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
              <CardHeader className="bg-natural-bg/80 p-6 border-b border-black/[0.03]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500 rounded-xl text-white">
                      <Edit2 size={18} />
                    </div>
                    <CardTitle className="text-lg font-black text-natural-primary italic">EDIT PROFILE</CardTitle>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setEditingTeacher(null)} className="rounded-full">
                    <X size={20} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="flex flex-col items-center gap-4 mb-6">
                  <div className="relative group">
                    <div className="w-32 h-32 rounded-2xl overflow-hidden shadow-lg border-4 border-white">
                      {isCapturingEdit ? (
                        <Webcam
                          audio={false}
                          ref={webcamRef}
                          screenshotFormat="image/jpeg"
                          videoConstraints={{ facingMode }}
                          className="w-full h-full object-cover"
                          mirrored={facingMode === 'user'}
                        />
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
                              setEditPhoto(imageSrc);
                              setIsCapturingEdit(false);
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
                                  reader.onloadend = () => {
                                    setEditPhoto(reader.result as string);
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
                      <Label className="text-[10px] font-black text-blue-500 uppercase tracking-widest ml-1">Staff ID</Label>
                      <Input value={editEmpId} onChange={(e) => setEditEmpId(e.target.value)} className="h-12 rounded-xl bg-natural-bg/50 font-bold" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black text-rose-500 uppercase tracking-widest ml-1">Department</Label>
                      <Input value={editDept} onChange={(e) => setEditDept(e.target.value)} className="h-12 rounded-xl bg-natural-bg/50 font-bold" />
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="p-6 flex gap-3">
                <Button variant="outline" className="flex-1 h-12 rounded-xl font-bold" onClick={() => setEditingTeacher(null)}>
                  Cancel
                </Button>
                <Button className="flex-1 h-12 rounded-xl font-bold bg-natural-primary hover:bg-natural-primary/90" onClick={handleUpdate} disabled={updating}>
                  {updating ? <Loader2 size={18} className="animate-spin mr-2" /> : <Save size={18} className="mr-2" />}
                  Save Changes
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
            <div key={teacher.dbId} className="bg-white p-4 rounded-[28px] border border-black/5 shadow-sm flex items-center gap-4 group hover:border-natural-accent/20 transition-all">
              <div className="h-16 w-16 rounded-2xl overflow-hidden shadow-md border-2 border-white flex-shrink-0">
                <img src={teacher.photoUrl} className="h-full w-full object-cover" alt={teacher.name} />
              </div>
              <div className="flex-1 min-w-0 pr-2">
                <h3 className="font-bold text-natural-primary text-sm sm:text-base leading-tight">{teacher.name}</h3>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                  <span className="text-[9px] bg-natural-bg/50 px-2 py-0.5 rounded-full text-natural-primary/60 font-black uppercase tracking-widest border border-black/5">{teacher.id}</span>
                  <span className="text-[9px] font-black text-natural-accent uppercase tracking-wider">{teacher.department}</span>
                </div>
              </div>
              <div className="hidden sm:block text-[10px] font-bold text-natural-primary/20 mr-2 whitespace-nowrap">
                {teacher.createdAt?.toDate ? format(teacher.createdAt.toDate(), 'MMM d, yyyy') : ''}
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="icon"
                  className="h-11 w-11 rounded-2xl flex-shrink-0 shadow-sm transition-all active:scale-95 border-2 border-black/5 hover:border-indigo-500/30 hover:bg-indigo-50"
                  onClick={() => startEdit(teacher)}
                >
                  <Edit2 size={18} className="text-indigo-600" />
                </Button>
                <Button 
                  variant="destructive" 
                  size="icon"
                  className="h-11 w-11 rounded-2xl flex-shrink-0 shadow-lg transition-all active:scale-95 bg-red-500 hover:bg-red-600 border-2 border-white"
                  disabled={deletingId === teacher.dbId}
                  onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!teacher.dbId) return;
                  
                  if (window.confirm(`Permanently remove ${teacher.name} from directory?`)) {
                    setDeletingId(teacher.dbId);
                    try {
                      await deleteDoc(doc(db, "teachers", teacher.dbId));
                      setTeachers(prev => prev.filter(t => t.dbId !== teacher.dbId));
                      toast.success(`${teacher.name} deleted`);
                    } catch (error) {
                      handleFirestoreError(error, OperationType.DELETE, "teachers");
                    } finally {
                      setDeletingId(null);
                    }
                  }
                }}
              >
                {deletingId === teacher.dbId ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Trash2 size={18} />
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

