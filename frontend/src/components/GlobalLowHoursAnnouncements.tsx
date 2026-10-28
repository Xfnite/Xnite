"use client";

import { useState, useEffect } from "react";
import { loadMyPerformanceSnapshot } from "@/components/myPerformanceSnapshot";
import { createPortal } from "react-dom";
import { Clock } from "lucide-react";

interface WorkLog {
  id: number;
  projectId: number;
  role: string;
  worktime: number;
  taskNum: number;
  features: number;
  log_date?: Date;
  createdAt?: Date;
}

export default function GlobalLowHoursAnnouncements() {
  const [myLogs, setMyLogs] = useState<WorkLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isMounted, setIsMounted] = useState(false);
  const [canAcknowledge, setCanAcknowledge] = useState(false);
  const [buttonCountdown, setButtonCountdown] = useState(5);
  const [hasRead, setHasRead] = useState(false);

  const [showAlert, setShowAlert] = useState(false);
  const [alertData, setAlertData] = useState<{ weekHours: number, dayHours: number } | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    // The alert only shows in the warning windows (1st-7th, 15th-21st) and at most
    // once a day (same checks as below), so don't load the logs on other days.
    const today = new Date();
    const day = today.getDate();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const inWarningWindow = (day >= 1 && day <= 7) || (day >= 15 && day <= 21);
    if (!inWarningWindow || localStorage.getItem(`acked_low_hours_${todayStr}`)) {
      setIsLoading(false);
      return;
    }

    loadMyPerformanceSnapshot()
      .then((res) => {
        if (res.success && res.myLogs) {
          setMyLogs(res.myLogs);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (isLoading || myLogs.length === 0) return;

    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const todayStr = `${currentYear}-${String(currentMonth+1).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;
    const storageKey = `acked_low_hours_${todayStr}`;
    if (typeof window !== "undefined" && localStorage.getItem(storageKey)) return;

    // Check if we are in Warning Window (1-7 or 15-21)
    let isWarningWindow = false;
    let checkWindowStart: Date;
    let checkWindowEnd: Date;

    if (currentDay >= 1 && currentDay <= 7) {
      isWarningWindow = true;
      // 1st cut-off check window: 23rd of previous month to end of previous month
      checkWindowStart = new Date(currentYear, currentMonth - 1, 23);
      checkWindowEnd = new Date(currentYear, currentMonth, 0); 
    } else if (currentDay >= 15 && currentDay <= 21) {
      isWarningWindow = true;
      // 2nd cut-off check window: 8th to 14th of current month
      checkWindowStart = new Date(currentYear, currentMonth, 8);
      checkWindowEnd = new Date(currentYear, currentMonth, 14);
    } else {
      return;
    }

    if (!isWarningWindow) return;

    // Helper to safely parse log date
    const getLogDate = (log: WorkLog) => {
      const d = new Date(log.log_date || log.createdAt || new Date());
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    };

    const normalizeDate = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    
    const startNorm = normalizeDate(checkWindowStart);
    const endNorm = normalizeDate(checkWindowEnd);
    const todayNorm = normalizeDate(today);

    let weekWorktime = 0;
    let todayWorktime = 0;
    
    const logsByDateProjectRole: Record<string, WorkLog> = {};

    myLogs.forEach(log => {
       if (log.projectId >= 1 && log.projectId <= 5) return;
       const dNorm = getLogDate(log);
       const key = `${dNorm.getTime()}_${log.projectId}_${log.role}`;
       const existing = logsByDateProjectRole[key];
       if (!existing || log.id > existing.id) {
           logsByDateProjectRole[key] = log;
       }
    });

    Object.values(logsByDateProjectRole).forEach(log => {
       const dNorm = getLogDate(log);
       
       if (dNorm >= startNorm && dNorm <= endNorm) {
           weekWorktime += log.worktime;
       }

       if (dNorm.getTime() === todayNorm.getTime()) {
           todayWorktime += log.worktime;
       }
    });

    // Threshold logic: Weekly < 10 AND Daily <= 3
    if (weekWorktime < 10 && todayWorktime <= 3) {
       setAlertData({ weekHours: weekWorktime, dayHours: todayWorktime });
       setShowAlert(true);
    }

  }, [myLogs, isLoading]);

  useEffect(() => {
    if (showAlert && hasRead) {
      const interval = setInterval(() => {
        setButtonCountdown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            setCanAcknowledge(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    } else if (!hasRead) {
      setCanAcknowledge(false);
      setButtonCountdown(5);
    }
  }, [showAlert, hasRead]);

  const handleAcknowledge = () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const storageKey = `acked_low_hours_${todayStr}`;
    
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, "true");
    }
    setShowAlert(false);
  };

  if (!isMounted || typeof document === 'undefined' || !showAlert || !alertData) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/40 dark:bg-black/90 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white/95 dark:bg-[#1A232C]/95 backdrop-blur-xl border border-red-500/30 dark:border-red-500/20 p-8 rounded-2xl max-w-xl w-full shadow-2xl relative overflow-hidden flex flex-col">
        
        <div className="flex-shrink-0 flex flex-col space-y-4 mb-6">
          <div className="text-xs text-[#2F3E46]/60 dark:text-gray-500 font-mono">
            {new Date().toLocaleString()}
          </div>
          <h2 className="text-2xl font-bold text-[#0D1B2A] dark:text-white flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <span className="text-red-600 dark:text-red-500">Low Work Hours Warning</span>
          </h2>
          
          <div className="text-sm text-[#2F3E46]/80 dark:text-gray-300 space-y-3 mt-4">
            <p>We noticed that your total work hours for the previous week are lower than expected.</p>
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl p-4">
               <div className="flex justify-between items-center mb-2">
                 <span className="text-xs font-semibold uppercase text-red-800/70 dark:text-red-200/50">Previous Week Hours</span>
                 <span className="font-mono font-bold text-red-700 dark:text-red-400">{alertData.weekHours.toFixed(2)}h / 10.00h</span>
               </div>
               <div className="flex justify-between items-center">
                 <span className="text-xs font-semibold uppercase text-red-800/70 dark:text-red-200/50">Today's Hours</span>
                 <span className="font-mono font-bold text-red-700 dark:text-red-400">{alertData.dayHours.toFixed(2)}h</span>
               </div>
            </div>
            <p className="font-semibold text-red-600 dark:text-red-400 mt-2">
              Please ensure you log sufficient hours today and for the rest of the week to stay on track.
            </p>
          </div>
        </div>
        
        {/* Footer & Acknowledgment */}
        <div className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-2 border-t border-black/10 dark:border-white/10">
          <label
            htmlFor="understand-checkbox-hours"
            className="flex items-start gap-3 cursor-pointer group flex-1"
          >
            <div className="relative flex items-center justify-center mt-0.5">
              <input
                type="checkbox"
                id="understand-checkbox-hours"
                checked={hasRead}
                onChange={(e) => setHasRead(e.target.checked)}
                className="peer w-5 h-5 rounded-md border-2 border-black/20 dark:border-white/20 appearance-none checked:border-red-600 dark:checked:border-red-500 checked:bg-red-600 dark:checked:bg-red-500 transition-all cursor-pointer"
              />
              <svg className="absolute w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-[#2F3E46]/80 dark:text-white/80 group-hover:text-[#0D1B2A] dark:group-hover:text-white transition-colors leading-snug">
              I have read and understand this warning.
            </span>
          </label>

          <button
            onClick={handleAcknowledge}
            disabled={!hasRead || buttonCountdown > 0 || !canAcknowledge}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all w-full sm:w-auto flex items-center justify-center gap-2 ${!hasRead || buttonCountdown > 0 || !canAcknowledge
              ? "bg-black/10 dark:bg-white/10 text-black/40 dark:text-white/40 cursor-not-allowed"
              : "bg-red-600 hover:bg-red-700 text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5"
              }`}
          >
            {buttonCountdown > 0 ? (
              <>
                <Clock className="w-4 h-4 animate-pulse" />
                Wait {buttonCountdown}s
              </>
            ) : (
              "Acknowledged"
            )}
          </button>
        </div>
        
      </div>
    </div>,
    document.body
  );
}
