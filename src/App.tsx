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
import { UserCheck, Settings, BarChart3, School } from 'lucide-react';

export default function App() {
  return (
    <div className="min-h-screen bg-natural-bg font-sans text-natural-text selection:bg-natural-accent/10 selection:text-natural-primary relative overflow-hidden">
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
          
          <div className="hidden md:flex items-center gap-6 text-right">
            <div>
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
        <Tabs defaultValue="attendance" className="space-y-6 md:space-y-10">
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
            <AttendanceKiosk />
          </TabsContent>
          
          <TabsContent value="admin" className="outline-none">
            <TeacherRegistration />
          </TabsContent>

          <TabsContent value="report" className="outline-none">
            <AttendanceReport />
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
