/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { collection, query, orderBy, limit, getDocs, where, deleteDoc, doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar, User, Clock, ShieldCheck, Share2, Send, Trash2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export function AttendanceReport() {
  const [logs, setLogs] = useState<any[]>([]);
  const [allTeachers, setAllTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const today = new Date().toLocaleDateString('en-CA');
  const [selectedDate, setSelectedDate] = useState(today);
  const [activeView, setActiveView] = useState<'present' | 'absent'>('present');

  useEffect(() => {
    if (selectedDate > today) {
      setSelectedDate(today);
      toast.warning("Future date selection is not allowed");
      return;
    }
    fetchLogs();
  }, [selectedDate]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      // Clear logs if date is invalid just in case
      if (selectedDate > today) {
        setLogs([]);
        return;
      }
      // 1. Fetch all teachers to calculate absent list
      const teachersPath = "teachers";
      const teachersSnap = await getDocs(collection(db, teachersPath));
      const teachersList = teachersSnap.docs.map(doc => ({ dbId: doc.id, ...doc.data() as any }));
      setAllTeachers(teachersList);

      // 2. Fetch attendance logs for selected date
      const path = "attendance";
      const q = query(
        collection(db, path), 
        where("date", "==", selectedDate),
        orderBy("timestamp", "desc")
      );
      const querySnapshot = await getDocs(q);
      const list = querySnapshot.docs.map(doc => ({ dbId: doc.id, ...doc.data() as any }));
      setLogs(list);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, "attendance");
    } finally {
      setLoading(false);
    }
  };

  const getAbsentTeachers = () => {
    // No absent teachers for future dates
    if (selectedDate > today) return [];

    const presentTeacherIds = new Set(
      logs.map(log => String(log.teacherId || '').trim().toUpperCase())
    );
    
    // We only want to count teachers who were already registered by this date
    // and are active.
    const selDateEnd = new Date(selectedDate);
    selDateEnd.setHours(23, 59, 59, 999);

    return allTeachers.filter(teacher => {
      const teacherId = String(teacher.id || '').trim().toUpperCase();
      const status = teacher.status || 'active';
      
      // Determine registration date
      let regDate = new Date(0);
      if (teacher.createdAt?.toDate) {
        regDate = teacher.createdAt.toDate();
      } else if (teacher.createdAt && typeof teacher.createdAt === 'string') {
        regDate = new Date(teacher.createdAt);
      }

      return (
        teacherId && 
        status === 'active' && 
        regDate <= selDateEnd && 
        !presentTeacherIds.has(teacherId)
      );
    });
  };

  const handleDeleteRecord = async (recordId: string, teacherName: string) => {
    if (confirm(`Delete attendance record for ${teacherName}?`)) {
      setDeletingRecordId(recordId);
      try {
        await deleteDoc(doc(db, "attendance", recordId));
        setLogs(prev => prev.filter(log => log.dbId !== recordId));
        toast.success("Attendance record deleted");
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, "attendance");
      } finally {
        setDeletingRecordId(null);
      }
    }
  };
  const handleShare = () => {
    if (activeView === 'present') {
      if (logs.length === 0) {
        toast.info("No present teachers to share");
        return;
      }
      
      let message = `*HAPPY DAYS SCHOOL - PRESENT STAFF REPORT*\n`;
      message += `📅 *Date:* ${format(new Date(selectedDate), 'EEEE, do MMMM yyyy')}\n`;
      message += `👥 *Total Present:* ${logs.length}\n\n`;
      message += `*PRESENT STAFF LIST:*\n`;
      
      logs.forEach((log, index) => {
        const name = String(log.teacherName || 'Unknown').toUpperCase();
        const time = log.timestamp?.toDate ? format(log.timestamp.toDate(), 'HH:mm a') : 'N/A';
        message += `${index + 1}. *${name}* - (${log.teacherId || 'N/A'}) - Time: ${time}\n`;
      });

      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    } else {
      const absent = getAbsentTeachers();
      if (absent.length === 0) {
        toast.info("No absent teachers to share");
        return;
      }
      
      let message = `*HAPPY DAYS SCHOOL - ABSENT STAFF REPORT*\n`;
      message += `📅 *Date:* ${format(new Date(selectedDate), 'EEEE, do MMMM yyyy')}\n`;
      message += `❌ *Total Absent:* ${absent.length}\n\n`;
      message += `*ABSENT STAFF LIST:*\n`;
      
      absent.forEach((teacher, index) => {
        const name = String(teacher.name || 'Unknown').toUpperCase();
        message += `${index + 1}. *${name}* (${teacher.id || 'N/A'}) - Dept: ${teacher.department || 'N/A'}\n`;
      });

      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
        <div className="space-y-1">
          <h2 className="text-[12px] font-black text-indigo-500 uppercase tracking-[0.3em]">ATTENDANCE RECORDS</h2>
          <p className="text-natural-primary/40 text-[10px] font-black uppercase tracking-tight italic">Happy Days School Smart Portal</p>
        </div>
        
        <div className="flex items-center gap-2">
           <Input 
            type="date" 
            value={selectedDate}
            max={today}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-40 h-10 rounded-xl border-2 border-indigo-500/10 bg-white shadow-sm text-xs font-bold text-natural-primary focus:border-indigo-500/30 transition-all"
           />
           <div className="flex gap-2">
             <Button 
              variant="outline" 
              onClick={handleShare}
              className={`h-10 px-6 rounded-xl border-2 font-black transition-all gap-2 shadow-sm uppercase text-[10px] tracking-widest ${
                activeView === 'present' 
                  ? 'border-emerald-500/20 text-emerald-600 hover:bg-emerald-50' 
                  : 'border-rose-500/20 text-rose-600 hover:bg-rose-50'
              }`}
             >
              <Share2 size={16} /> 
              <span>Share {activeView === 'present' ? 'Present' : 'Absent'} List</span>
             </Button>
           </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-indigo-50 border-indigo-100 text-indigo-600 px-4 py-1.5 rounded-full text-[10px] font-black tracking-wider shadow-sm">
            {format(new Date(selectedDate), 'MMM dd, yyyy')}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setActiveView('present')}
            className={`transition-all ${activeView === 'present' ? 'scale-110' : 'opacity-40 hover:opacity-100'}`}
          >
            <Badge variant="outline" className="bg-emerald-500 text-white border-none px-4 py-1.5 rounded-full text-[10px] font-black shadow-lg shadow-emerald-500/20 cursor-pointer">
              {logs.length} PRESENT
            </Badge>
          </button>
          <button 
            onClick={() => setActiveView('absent')}
            className={`transition-all ${activeView === 'absent' ? 'scale-110' : 'opacity-40 hover:opacity-100'}`}
          >
            <Badge variant="outline" className="bg-rose-500 text-white border-none px-4 py-1.5 rounded-full text-[10px] font-black shadow-lg shadow-rose-500/20 cursor-pointer">
              {getAbsentTeachers().length} ABSENT
            </Badge>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="natural-card bg-indigo-50 border-indigo-100/50 shadow-sm overflow-hidden group">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-500 text-white rounded-2xl flex items-center justify-center shadow-lg transform group-hover:rotate-6 transition-transform">
                <User size={24} />
              </div>
              <div>
                <CardTitle className="text-2xl font-black text-indigo-700 italic tracking-tighter">
                  {allTeachers.length}
                </CardTitle>
                <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Total Staff</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="natural-card bg-emerald-50 border-emerald-100/50 shadow-sm overflow-hidden group">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg transform group-hover:rotate-6 transition-transform">
                <ShieldCheck size={24} />
              </div>
              <div>
                <CardTitle className="text-2xl font-black text-emerald-700 italic tracking-tighter">
                  {logs.length}
                </CardTitle>
                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Present Today</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="natural-card bg-rose-50 border-rose-100/50 shadow-sm overflow-hidden group">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-rose-500 text-white rounded-2xl flex items-center justify-center shadow-lg transform group-hover:rotate-6 transition-transform">
                <Clock size={24} />
              </div>
              <div>
                <CardTitle className="text-2xl font-black text-rose-700 italic tracking-tighter">
                  {getAbsentTeachers().length}
                </CardTitle>
                <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">Absent Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <ScrollArea className="h-[550px] rounded-[40px] bg-white border border-black/5 p-6 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
          {activeView === 'present' ? (
            logs.map((log) => (
              <div key={log.dbId} className="flex flex-col items-center group">
                <div className="relative aspect-[3/4] w-full rounded-[24px] overflow-hidden bg-natural-bg border-4 border-white shadow-md transition-all group-hover:shadow-xl group-hover:-translate-y-1">
                  <div className="absolute top-2 right-2 flex gap-1">
                    <Button 
                      variant="destructive" 
                      size="icon" 
                      className="h-10 w-10 rounded-full bg-red-600 text-white shadow-xl hover:bg-red-700 transition-all border-2 border-white z-10"
                      disabled={deletingRecordId === log.dbId}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteRecord(log.dbId, log.teacherName);
                      }}
                    >
                      {deletingRecordId === log.dbId ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Trash2 size={18} />
                      )}
                    </Button>
                  </div>
                  <img src={log.verificationPhoto} className="w-full h-full object-cover" alt={log.teacherName} />
                  <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-3">
                    <div className="bg-natural-success text-white text-[8px] font-black px-2 py-0.5 rounded-full w-fit mb-1">
                      VERIFIED
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-center space-y-0.5">
                  <h4 className="font-bold text-natural-primary text-xs truncate max-w-[120px]">{log.teacherName}</h4>
                  <p className="text-[10px] font-black text-natural-accent uppercase tracking-tighter">
                    {log.timestamp?.toDate ? format(log.timestamp.toDate(), 'do MMM • HH:mm a') : 'Just now'}
                  </p>
                  <div className="text-[8px] font-bold text-natural-primary/30 uppercase tracking-widest pt-1">
                    Matched {Math.round((log.confidence || 0) * 100)}%
                  </div>
                </div>
              </div>
            ))
          ) : (
            getAbsentTeachers().map((teacher) => (
              <div key={teacher.dbId} className="flex flex-col items-center group">
                <div className="relative aspect-[3/4] w-full rounded-[24px] overflow-hidden bg-natural-bg border-4 border-white shadow-md transition-all group-hover:shadow-xl group-hover:-translate-y-1 grayscale hover:grayscale-0 transition-all duration-500">
                  <img src={teacher.photoUrl} className="w-full h-full object-cover" alt={teacher.name} />
                  <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-rose-600/60 to-transparent flex flex-col justify-end p-3">
                    <div className="bg-rose-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full w-fit mb-1">
                      NOT PRESENT
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-center space-y-0.5">
                  <h4 className="font-bold text-natural-primary text-xs truncate max-w-[120px]">{teacher.name}</h4>
                  <p className="text-[10px] font-black text-rose-500 uppercase tracking-tighter">
                    Absent on {format(new Date(selectedDate), 'MMM dd')}
                  </p>
                  <div className="text-[8px] font-bold text-natural-primary/30 uppercase tracking-widest pt-1">
                    {teacher.department || 'Staff'}
                  </div>
                </div>
              </div>
            ))
          )}

          {((activeView === 'present' && logs.length === 0) || (activeView === 'absent' && getAbsentTeachers().length === 0)) && !loading && (
            <div className="col-span-full py-32 text-center">
              <div className="w-16 h-16 bg-natural-bg rounded-full flex items-center justify-center mx-auto mb-4 text-natural-primary/20">
                <Calendar size={32} />
              </div>
              <p className="text-natural-primary/40 font-medium italic">
                {activeView === 'present' ? 'No attendance activity recorded yet.' : 'All teachers have marked their attendance!'}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
