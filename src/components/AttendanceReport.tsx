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
import { CalendarDays, User, Clock, ShieldCheck, Share2, Send, Trash2, Loader2, Table as TableIcon, LayoutGrid, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addDays, subDays, addMonths, subMonths, isWithinInterval } from 'date-fns';
import { toast } from 'sonner';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export function AttendanceReport() {
  const [logs, setLogs] = useState<any[]>([]);
  const [allTeachers, setAllTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const today = new Date().toLocaleDateString('en-CA');
  const [selectedDate, setSelectedDate] = useState(today);
  const [activeView, setActiveView] = useState<'present' | 'absent'>('present');
  const [reportType, setReportType] = useState<'gallery' | 'register'>('gallery');
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');

  useEffect(() => {
    if (selectedDate > today && reportType === 'gallery') {
      setSelectedDate(today);
      toast.warning("Future date selection is not allowed");
      return;
    }
    fetchData();
  }, [selectedDate, period, reportType]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch all teachers
      const teachersPath = "teachers";
      const teachersSnap = await getDocs(collection(db, teachersPath));
      const teachersList = teachersSnap.docs.map(doc => ({ dbId: doc.id, ...doc.data() as any }));
      setAllTeachers(teachersList);

      // 2. Determine range for logs
      let startDateStr = selectedDate;
      let endDateStr = selectedDate;

      if (reportType === 'register') {
        if (period === 'weekly') {
          startDateStr = format(startOfWeek(new Date(selectedDate), { weekStartsOn: 1 }), 'yyyy-MM-dd');
          endDateStr = format(endOfWeek(new Date(selectedDate), { weekStartsOn: 1 }), 'yyyy-MM-dd');
        } else if (period === 'monthly') {
          startDateStr = format(startOfMonth(new Date(selectedDate)), 'yyyy-MM-dd');
          endDateStr = format(endOfMonth(new Date(selectedDate)), 'yyyy-MM-dd');
        }
      }

      // 3. Fetch attendance logs
      const path = "attendance";
      let q;
      if (startDateStr === endDateStr) {
        q = query(
          collection(db, path), 
          where("date", "==", startDateStr),
          orderBy("timestamp", "desc")
        );
      } else {
        q = query(
          collection(db, path), 
          where("date", ">=", startDateStr),
          where("date", "<=", endDateStr),
          orderBy("date", "asc")
        );
      }
      
      const querySnapshot = await getDocs(q);
      const list = querySnapshot.docs.map(doc => ({ dbId: doc.id, ...doc.data() as any }));
      setLogs(list);
    } catch (error) {
      console.error(error);
      handleFirestoreError(error, OperationType.LIST, "attendance");
    } finally {
      setLoading(false);
    }
  };

  const getRangeDates = () => {
    const start = period === 'weekly' ? startOfWeek(new Date(selectedDate), { weekStartsOn: 1 }) : startOfMonth(new Date(selectedDate));
    const end = period === 'weekly' ? endOfWeek(new Date(selectedDate), { weekStartsOn: 1 }) : endOfMonth(new Date(selectedDate));
    return eachDayOfInterval({ start, end });
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
      message += `🗓️ *Date:* ${format(new Date(selectedDate), 'EEEE, do MMMM yyyy')}\n`;
      message += `👥 *Total Present:* ${logs.length}\n\n`;
      message += `*PRESENT STAFF LIST:*\n`;
      
      const teacherIdsOnSelectedDay = logs.filter(l => l.date === selectedDate);
      teacherIdsOnSelectedDay.forEach((log, index) => {
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
      message += `🗓️ *Date:* ${format(new Date(selectedDate), 'EEEE, do MMMM yyyy')}\n`;
      message += `❌ *Total Absent:* ${absent.length}\n\n`;
      message += `*ABSENT STAFF LIST:*\n`;
      
      absent.forEach((teacher, index) => {
        const name = String(teacher.name || 'Unknown').toUpperCase();
        message += `${index + 1}. *${name}* (${teacher.id || 'N/A'}) - Dept: ${teacher.department || 'N/A'}\n`;
      });

      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    }
  };

  const handleExportExcel = async () => {
    if (loading || allTeachers.length === 0) return;
    
    try {
      const dates = getRangeDates();
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Attendance');

      // 1. Setup Columns with styling
      const columns = [
        { header: 'Employee ID', key: 'id', width: 18 },
        { header: 'Staff Name', key: 'name', width: 30 },
        ...dates.map((d, i) => ({
          header: format(d, 'MMM dd (EEE)'),
          key: `date_${i}`,
          width: 15
        }))
      ];
      
      worksheet.columns = columns;

      // 2. Style the header row
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4F46E5' } // Indigo-600
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // 3. Add data rows
      allTeachers.forEach((teacher, teacherIdx) => {
        const teacherId = String(teacher.id || '').trim().toUpperCase();
        const teacherLogs = logs.filter(l => String(l.teacherId || '').trim().toUpperCase() === teacherId);
        
        const rowData: any = {
          id: teacherId,
          name: teacher.name.toUpperCase()
        };

        dates.forEach((d, i) => {
          const dateStr = format(d, 'yyyy-MM-dd');
          const isPresent = teacherLogs.some(l => l.date === dateStr);
          const isFuture = d > new Date();
          rowData[`date_${i}`] = isFuture ? '-' : (isPresent ? 'P' : 'A');
        });

        const row = worksheet.addRow(rowData);
        
        // 4. Style the data row
        row.alignment = { vertical: 'middle' };
        
        // Alternating colors for every row for better readability and colorful look
        const rowColor = (teacherIdx % 2 === 0) 
          ? 'FFEFF6FF' // Light Blue (Blue-50) for even indices
          : 'FFF9FAFB'; // Light Gray (Gray-50) for odd indices
          
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: rowColor }
          };
        });

        // Individual cell styling for P and A
        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
          };

          // Col 1 & 2 are ID and Name
          if (colNumber > 2) {
            cell.alignment = { horizontal: 'center' };
            const value = cell.value?.toString();
            if (value === 'P') {
              cell.font = { bold: true, color: { argb: 'FF059669' } }; // Emerald-600
            } else if (value === 'A') {
              cell.font = { bold: true, color: { argb: 'FFE11D48' } }; // Rose-600
            } else if (value === '-') {
              cell.font = { color: { argb: 'FF9CA3AF' } }; // Gray-400
            }
          } else {
            cell.font = { bold: colNumber === 1 };
          }
        });
      });

      // 5. Generate and download file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Attendance_Report_${period}_${selectedDate}.xlsx`);
      
      toast.success("Colorful report downloaded!");
    } catch (error) {
      console.error("Excel Export Error:", error);
      toast.error("Failed to generate styled Excel report");
    }
  };

  const navigateDate = (direction: 'next' | 'prev') => {
    const date = new Date(selectedDate);
    if (period === 'daily') {
      setSelectedDate(format(direction === 'next' ? addDays(date, 1) : subDays(date, 1), 'yyyy-MM-dd'));
    } else if (period === 'weekly') {
      setSelectedDate(format(direction === 'next' ? addDays(date, 7) : subDays(date, 7), 'yyyy-MM-dd'));
    } else {
      setSelectedDate(format(direction === 'next' ? addMonths(date, 1) : subMonths(date, 1), 'yyyy-MM-dd'));
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4 md:space-y-6 px-1 md:px-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between px-1">
          <div className="space-y-0.5 md:space-y-1">
            <h2 className="text-[10px] md:text-[12px] font-black text-indigo-500 uppercase tracking-[0.3em]">ATTENDANCE REGISTRY</h2>
            <p className="text-natural-primary/40 text-[8px] md:text-[10px] font-black uppercase tracking-tight italic">Staff Portal</p>
          </div>
          <Button 
             variant="outline" 
             size="sm"
             onClick={reportType === 'gallery' ? handleShare : handleExportExcel}
             className="h-9 md:h-10 px-3 md:px-5 rounded-xl border-2 border-indigo-500/10 font-black text-indigo-600 hover:bg-indigo-50 transition-all gap-1.5 md:gap-2 shadow-sm text-[9px] md:text-[10px] tracking-widest uppercase"
          >
            {reportType === 'gallery' ? <Share2 size={14} className="md:w-4 md:h-4" /> : <FileText size={14} className="md:w-4 md:h-4" />}
            <span className="hidden xs:inline">{reportType === 'gallery' ? 'Share' : 'Export'}</span>
          </Button>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 justify-center md:justify-end">
           <div className="flex bg-natural-bg/50 p-1 rounded-xl border border-black/5 w-full xs:w-auto">
             <Button 
                variant={reportType === 'gallery' ? 'default' : 'ghost'} 
                size="sm"
                onClick={() => setReportType('gallery')}
                className={`flex-1 xs:flex-none h-8 md:h-9 rounded-lg text-[9px] font-black tracking-widest uppercase transition-all ${reportType === 'gallery' ? 'bg-indigo-500 shadow-sm text-white' : 'text-natural-primary/40'}`}
             >
               <LayoutGrid size={14} className="mr-1.5" /> Gallery
             </Button>
             <Button 
                variant={reportType === 'register' ? 'default' : 'ghost'} 
                size="sm"
                onClick={() => {
                  setReportType('register');
                  if (period === 'daily') setPeriod('weekly');
                }}
                className={`flex-1 xs:flex-none h-8 md:h-9 rounded-lg text-[9px] font-black tracking-widest uppercase transition-all ${reportType === 'register' ? 'bg-indigo-500 shadow-sm text-white' : 'text-natural-primary/40'}`}
             >
               <TableIcon size={14} className="mr-1.5" /> Register
             </Button>
           </div>

           {reportType === 'register' && (
             <div className="flex bg-natural-bg/50 p-1 rounded-xl border border-black/5 w-full xs:w-auto">
               {(['weekly', 'monthly'] as const).map((p) => (
                 <Button 
                    key={p}
                    variant={period === p ? 'secondary' : 'ghost'} 
                    size="sm"
                    onClick={() => setPeriod(p)}
                    className={`flex-1 xs:flex-none h-8 md:h-9 rounded-lg text-[9px] font-black tracking-widest uppercase transition-all ${period === p ? 'bg-white shadow-sm text-indigo-600' : 'text-natural-primary/40'}`}
                 >
                   {p}
                 </Button>
               ))}
             </div>
           )}

           <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-black/5 shadow-sm w-full xs:w-auto justify-center">
             <Button variant="ghost" size="icon" className="h-8 w-8 text-natural-primary/60 hover:text-indigo-600" onClick={() => navigateDate('prev')}>
               <ChevronLeft size={16} />
             </Button>
             <Input 
              type="date" 
              value={selectedDate}
              max={today}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-32 md:w-36 h-8 border-none bg-transparent shadow-none text-[10px] md:text-[11px] font-bold text-natural-primary text-center focus-visible:ring-0"
             />
             <Button variant="ghost" size="icon" className="h-8 w-8 text-natural-primary/60 hover:text-indigo-600" onClick={() => navigateDate('next')}>
               <ChevronRight size={16} />
             </Button>
           </div>
        </div>
      </div>

      {reportType === 'gallery' ? (
        <>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 md:px-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-indigo-50 border-indigo-100 text-indigo-600 px-3 md:px-4 py-1 md:py-1.5 rounded-full text-[8px] md:text-[10px] font-black tracking-wider shadow-sm italic uppercase">
                {format(new Date(selectedDate), 'EEEE, MMMM dd, yyyy')}
              </Badge>
            </div>
            <div className="flex items-center justify-center gap-2 w-full sm:w-auto">
              <button 
                onClick={() => setActiveView('present')}
                className={`transition-all flex-1 sm:flex-none ${activeView === 'present' ? 'scale-105' : 'opacity-40'}`}
              >
                <Badge variant="outline" className="bg-emerald-500 text-white border-none w-full px-4 py-1.5 rounded-full text-[9px] font-black shadow-lg shadow-emerald-500/20 cursor-pointer text-center">
                  {logs.length} PRESENT
                </Badge>
              </button>
              <button 
                onClick={() => setActiveView('absent')}
                className={`transition-all flex-1 sm:flex-none ${activeView === 'absent' ? 'scale-105' : 'opacity-40'}`}
              >
                <Badge variant="outline" className="bg-rose-500 text-white border-none w-full px-4 py-1.5 rounded-full text-[9px] font-black shadow-lg shadow-rose-500/20 cursor-pointer text-center">
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

          <ScrollArea className="h-[600px] rounded-3xl md:rounded-[40px] bg-white border border-black/5 p-4 md:p-8 shadow-sm">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-8">
              {activeView === 'present' ? (
                logs.map((log) => (
                  <div key={log.dbId} className="flex flex-col items-center group">
                    <div className="relative aspect-[3/4] w-full rounded-[32px] overflow-hidden bg-natural-bg border-4 border-white shadow-md transition-all group-hover:shadow-xl group-hover:-translate-y-1">
                      <div className="absolute top-2 right-2 flex gap-1">
                        <Button 
                          variant="destructive" 
                          size="icon" 
                          className="h-9 w-9 rounded-full bg-red-600/90 text-white shadow-xl hover:bg-red-700 transition-all border-2 border-white z-10 backdrop-blur-sm"
                          disabled={deletingRecordId === log.dbId}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteRecord(log.dbId, log.teacherName);
                          }}
                        >
                          {deletingRecordId === log.dbId ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </Button>
                      </div>
                      <img src={log.verificationPhoto} className="w-full h-full object-cover" alt={log.teacherName} referrerPolicy="no-referrer" />
                      <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-4">
                        <div className="bg-emerald-500 text-white text-[7px] font-black px-2 py-0.5 rounded-full w-fit mb-1 tracking-widest uppercase">
                          IDENTITY VERIFIED
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 text-center space-y-1">
                      <h4 className="font-bold text-natural-primary text-[11px] truncate w-[140px] uppercase tracking-wide">{log.teacherName}</h4>
                      <p className="text-[9px] font-black text-indigo-500 uppercase tracking-tighter">
                        {log.timestamp?.toDate ? format(log.timestamp.toDate(), 'HH:mm a') : 'Just now'}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                getAbsentTeachers().map((teacher) => (
                  <div key={teacher.dbId} className="flex flex-col items-center group">
                    <div className="relative aspect-[3/4] w-full rounded-[32px] overflow-hidden bg-natural-bg border-4 border-white shadow-md transition-all group-hover:shadow-xl group-hover:-translate-y-1 grayscale hover:grayscale-0 transition-all duration-700">
                      <img src={teacher.photoUrl || teacher.photo} className="w-full h-full object-cover" alt={teacher.name} referrerPolicy="no-referrer" />
                      <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-rose-700/80 to-transparent flex flex-col justify-end p-4">
                        <div className="bg-rose-600 text-white text-[7px] font-black px-2 py-0.5 rounded-full w-fit mb-1 tracking-widest uppercase">
                          NOT PRESENT
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 text-center space-y-1">
                      <h4 className="font-bold text-natural-primary text-[11px] truncate w-[140px] uppercase tracking-wide">{teacher.name}</h4>
                      <p className="text-[9px] font-black text-rose-500 uppercase tracking-tighter">
                        Missing Record
                      </p>
                    </div>
                  </div>
                ))
              )}

              {((activeView === 'present' && logs.length === 0) || (activeView === 'absent' && getAbsentTeachers().length === 0)) && !loading && (
                <div className="col-span-full py-40 text-center">
                  <div className="w-20 h-20 bg-natural-bg rounded-full flex items-center justify-center mx-auto mb-6 text-natural-primary/10">
                    <CalendarDays size={40} />
                  </div>
                  <p className="text-natural-primary/30 font-bold uppercase tracking-widest text-[10px]">
                    {activeView === 'present' ? 'No attendance records for this date.' : 'All staff accounts have reported present!'}
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </>
      ) : (
        <Card className="natural-card bg-white border-black/5 shadow-xl rounded-[40px] overflow-hidden">
          <CardHeader className="bg-indigo-50/50 border-b border-indigo-100/50 px-8 py-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg font-black text-indigo-700 italic uppercase flex items-center gap-2">
                  <FileText size={20} /> Staff Attendance Register
                </CardTitle>
                <p className="text-[10px] font-bold text-indigo-400/60 uppercase tracking-[0.2em] mt-1">
                  {period === 'weekly' ? 'Weekly' : 'Monthly'} Review • {format(new Date(selectedDate), 'MMMM yyyy')}
                </p>
              </div>
              <div className="flex gap-4">
                <div className="text-center">
                  <p className="text-[14px] font-black text-emerald-600">P</p>
                  <p className="text-[8px] font-bold text-natural-primary/40 uppercase">Present</p>
                </div>
                <div className="text-center">
                  <p className="text-[14px] font-black text-rose-500">A</p>
                  <p className="text-[8px] font-bold text-natural-primary/40 uppercase">Absent</p>
                </div>
                <div className="text-center">
                  <p className="text-[14px] font-black text-gray-400">-</p>
                  <p className="text-[8px] font-bold text-natural-primary/40 uppercase">Future</p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[600px] w-full">
              <div className="min-w-[800px]">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-20 bg-indigo-50/90 backdrop-blur-md">
                    <tr>
                      <th className="p-4 text-left text-[10px] font-black text-indigo-900 border-b border-indigo-100 uppercase tracking-widest sticky left-0 z-30 bg-indigo-50 border-r w-[200px]">Staff Name</th>
                      {getRangeDates().map((date) => (
                        <th key={date.toString()} className={`p-4 text-center text-[10px] font-black border-b border-indigo-100 uppercase tracking-widest ${isSameDay(date, new Date()) ? 'bg-indigo-500 text-white' : 'text-indigo-900'}`}>
                          <div className="flex flex-col items-center">
                            <span>{format(date, 'EEE')}</span>
                            <span className="text-[14px]">{format(date, 'dd')}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allTeachers.map((teacher, idx) => {
                      const teacherId = String(teacher.id || '').trim().toUpperCase();
                      const teacherLogs = logs.filter(l => String(l.teacherId || '').trim().toUpperCase() === teacherId);
                      
                      return (
                        <tr key={teacher.dbId} className={`group hover:bg-natural-bg/30 transition-all ${idx % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                          <td className="p-4 text-[11px] font-bold text-natural-primary border-b border-black/5 sticky left-0 z-10 bg-white group-hover:bg-indigo-50/50 transition-all border-r">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full overflow-hidden bg-natural-bg border border-black/5 flex-shrink-0">
                                <img src={teacher.photo || teacher.photoUrl} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                              </div>
                              <div className="flex flex-col">
                                <span className="uppercase truncate max-w-[120px]">{teacher.name}</span>
                                <span className="text-[8px] text-natural-primary/40 font-bold uppercase tracking-widest">{teacherId}</span>
                              </div>
                            </div>
                          </td>
                          {getRangeDates().map((date) => {
                            const dateStr = format(date, 'yyyy-MM-dd');
                            const isPresent = teacherLogs.some(l => l.date === dateStr);
                            const isFuture = date > new Date();
                            const isToday = isSameDay(date, new Date());
                            
                            return (
                              <td key={date.toString()} className={`p-4 border-b border-black/5 text-center transition-all ${isToday ? 'bg-indigo-50/30' : ''}`}>
                                {isFuture ? (
                                  <span className="text-gray-200 font-black">-</span>
                                ) : isPresent ? (
                                  <Badge className="bg-emerald-500 text-white border-none h-6 w-6 flex items-center justify-center p-0 rounded-lg mx-auto shadow-sm text-[11px] font-black">P</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-rose-500 border-rose-200 bg-rose-50 h-6 w-6 flex items-center justify-center p-0 rounded-lg mx-auto text-[11px] font-black">A</Badge>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
