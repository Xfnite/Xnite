"use client";

import { useState, useEffect, useMemo } from "react";
import { acknowledgePerformanceAlertsAction } from "@/app/actions/project";
import { loadMyPerformanceSnapshot } from "@/components/myPerformanceSnapshot";
import { createPortal } from "react-dom";
import { Clock, CheckCircle } from "lucide-react";

interface WorkLog {
  id: number;
  uuid: string;
  ownerName: string;
  projectId: number;
  role: string;
  worktime: number;
  taskNum: number;
  features: number;
  createdAt: Date;
  updatedAt: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
}

interface ProjectSummary {
  projectId: number;
  projectName: string;
  role: string;
  mySpeed: number;
  myWorktime: number;
  overallSpeed: number;
  overallPace: number;
  logs: WorkLog[];
}

interface ProjectAlert {
  projectId: number;
  role: string;
  color: "purple" | "red" | "orange";
  pace: string;
  speed: string;
  paceColorClass: string;
  speedColorClass: string;
  alertKey: string;
}

interface GroupedRoleAlert {
  role: string;
  projects: ProjectAlert[];
}

function getMetricScore(ratio: number): number {
  if (ratio >= 1.2) return 3;
  if (ratio >= 1.0) return 1;
  if (ratio >= 0.9) return 0;
  if (ratio >= 0.75) return -1;
  if (ratio >= 0.5) return -2;
  return -3;
}

function getPerformanceColorClass(score: number): string {
  if (score >= 3) return "text-teal-500 dark:text-teal-400";
  if (score >= 1) return "text-[#1F7A1F] dark:text-[#55f761]";
  if (score === 0) return "text-[#0D1B2A] dark:text-white/90";
  if (score === -1) return "text-orange-500 dark:text-orange-400";
  if (score === -2) return "text-red-500 dark:text-red-400";
  return "text-violet-500 dark:text-violet-400";
}

export default function GlobalPerformanceAnnouncements() {
  const [myLogs, setMyLogs] = useState<WorkLog[]>([]);
  // Platform averages per "projectId_role", computed on the server.
  const [platformStats, setPlatformStats] = useState<Record<string, { overallSpeed: number; overallPace: number }>>({});
  const [dbAckedAlerts, setDbAckedAlerts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [groupedAlerts, setGroupedAlerts] = useState<GroupedRoleAlert[]>([]);
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);

  const [isMounted, setIsMounted] = useState(false);
  const [canAcknowledge, setCanAcknowledge] = useState(false);
  const [buttonCountdown, setButtonCountdown] = useState(5);
  const [hasRead, setHasRead] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (groupedAlerts.length > 0 && currentGroupIndex < groupedAlerts.length) {
      setCanAcknowledge(false);
      setButtonCountdown(5);
      setHasRead(false);
    }
  }, [groupedAlerts.length, currentGroupIndex]);

  useEffect(() => {
    if (groupedAlerts.length > 0 && currentGroupIndex < groupedAlerts.length && hasRead) {
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
  }, [groupedAlerts.length, currentGroupIndex, hasRead]);

  useEffect(() => {
    loadMyPerformanceSnapshot()
      .then((res) => {
        if (res.success && res.myLogs && res.platformStats) {
          setMyLogs(res.myLogs as WorkLog[]);
          setPlatformStats(res.platformStats);
          if (res.ackedAlerts) setDbAckedAlerts(res.ackedAlerts);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const projectSummaries = useMemo(() => {
    if (isLoading) return [];

    const myMap: Record<string, WorkLog> = {};
    myLogs.forEach((log) => {
      if (log.projectId >= 1 && log.projectId <= 5) return;
      const key = `${log.projectId}_${log.role}`;
      const existing = myMap[key];
      if (!existing || log.id > existing.id) myMap[key] = log;
    });
    const finalMyLogs = Object.values(myMap);

    const projectRolePairs = finalMyLogs.map((log) => ({ projectId: log.projectId, role: log.role }));
    const uniquePairs = projectRolePairs.filter(
      (pair, index, self) => index === self.findIndex((p) => p.projectId === pair.projectId && p.role === pair.role)
    );

    return uniquePairs.map(({ projectId: pId, role }) => {
      const pMyLogs = finalMyLogs.filter((log) => log.projectId === pId && log.role === role);

      const myWorktime = pMyLogs.reduce((acc, log) => acc + log.worktime, 0);
      const myFeatures = pMyLogs.reduce((acc, log) => acc + log.features, 0);
      const mySpeed = myWorktime > 0 ? myFeatures / myWorktime : 0;

      const overallSpeed = platformStats[`${pId}_${role}`]?.overallSpeed ?? 0;
      const overallPace = platformStats[`${pId}_${role}`]?.overallPace ?? 0;

      return {
        projectId: pId,
        projectName: "Project",
        role,
        mySpeed,
        myWorktime,
        overallSpeed,
        overallPace,
        logs: pMyLogs,
      };
    });
  }, [myLogs, platformStats, isLoading]);

  useEffect(() => {
    if (isLoading || projectSummaries.length === 0) return;
    
    const newAlerts: ProjectAlert[] = [];
    projectSummaries.forEach(p => {
      if (p.overallSpeed <= 0) return;
      
      const myTasks = p.logs.reduce((acc, l) => acc + l.taskNum, 0);
      const myWorktime = p.logs.reduce((acc, l) => acc + l.worktime, 0);
      const myPace = myTasks > 0 && myWorktime > 0 ? (myWorktime * 60) / myTasks : 0;
      
      const speedRatio = p.mySpeed / p.overallSpeed;
      const paceRatio = (p.overallPace > 0 && myPace > 0) ? p.overallPace / myPace : 1;
      
      const speedScore = getMetricScore(speedRatio);
      const paceScore = myPace > 0 && p.overallPace > 0 ? getMetricScore(paceRatio) : 0;
      
      const overallScore = paceScore + speedScore;
      
      // Do not pop up performance if they are 0 or greater
      if (overallScore >= 0) return;
      
      const alertKey = `perf_${p.projectId}_${p.role}`;
      if (dbAckedAlerts.includes(alertKey)) return;
      
      const storageKey = `acked_${alertKey}`;
      if (typeof window !== "undefined" && localStorage.getItem(storageKey)) return;
      
      let color: "purple" | "red" | "orange" = "purple";
      if (overallScore === -1) color = "orange";
      else if (overallScore === -2) color = "red";
      else color = "purple"; // -3 or less
      
      newAlerts.push({
        projectId: p.projectId,
        role: p.role,
        color,
        pace: myPace > 0 ? myPace.toFixed(1) : "—",
        speed: p.mySpeed.toFixed(2),
        paceColorClass: getPerformanceColorClass(paceScore).split(' ')[0],
        speedColorClass: getPerformanceColorClass(speedScore).split(' ')[0],
        alertKey
      });
    });

    // Group by role
    const groupedMap: Record<string, ProjectAlert[]> = {};
    newAlerts.forEach(a => {
      if (!groupedMap[a.role]) groupedMap[a.role] = [];
      groupedMap[a.role].push(a);
    });

    const finalGroups = Object.keys(groupedMap).map(role => ({
      role,
      projects: groupedMap[role]
    }));
    
    setGroupedAlerts(prev => prev.length === 0 && finalGroups.length > 0 ? finalGroups : prev);
  }, [isLoading, projectSummaries, dbAckedAlerts]);

  const handleAcknowledge = async () => {
    const group = groupedAlerts[currentGroupIndex];
    if (group) {
      const alertKeys = group.projects.map(p => p.alertKey);
      
      if (typeof window !== "undefined") {
        alertKeys.forEach(k => localStorage.setItem(`acked_${k}`, "true"));
      }
      
      setDbAckedAlerts(prev => [...prev, ...alertKeys]);
      acknowledgePerformanceAlertsAction(alertKeys).catch(console.error);
    }
    setCurrentGroupIndex(prev => prev + 1);
  };

  const currentGroup = groupedAlerts[currentGroupIndex];

  if (!isMounted || typeof document === 'undefined' || !currentGroup) {
    return null;
  }

  // Determine overall modal theme based on the worst severity in this role
  let worstColor = "orange";
  if (currentGroup.projects.some(p => p.color === "purple")) worstColor = "purple";
  else if (currentGroup.projects.some(p => p.color === "red")) worstColor = "red";

  return createPortal(
    <div id="performance-alerts-modal" className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/20 dark:bg-black/80 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white/95 dark:bg-[#1A232C]/95 backdrop-blur-xl border border-black/10 dark:border-white/10 p-8 rounded-2xl max-w-2xl w-full shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="flex-shrink-0 flex flex-col space-y-4 mb-6">
          <div className="text-xs text-[#2F3E46]/60 dark:text-gray-500 font-mono">
            {new Date().toLocaleString()}
          </div>
          <h2 className="text-2xl font-bold text-[#0D1B2A] dark:text-white flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <span>Performance Alerts for <span className="text-[#1F7A1F] dark:text-teal-400 capitalize">{currentGroup.role}</span> Role</span>
          </h2>
          
          <div className="text-sm text-[#2F3E46]/80 dark:text-gray-300 space-y-2">
            {worstColor === 'purple' && (
              <p>Your current pace in some projects is critically below the required speed. Please improve your task completion rate to avoid losing opportunities.</p>
            )}
            {worstColor === 'red' && (
              <p>Your pace is below expected project speeds. Try to complete tasks more consistently while maintaining quality.</p>
            )}
            {worstColor === 'orange' && (
              <p>You're close to the required pace in these projects, but still slightly below average. A small improvement can put you in the safe zone.</p>
            )}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {currentGroup.projects.map((proj, idx) => (
            <div key={idx} className="bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-xl p-5 flex flex-col space-y-3">
              <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-2">
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] uppercase tracking-wider text-[#2F3E46]/60 dark:text-gray-500 font-semibold">Project ID</span>
                  <span className="font-mono font-bold text-[#0D1B2A] dark:text-white text-sm">#{proj.projectId}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] uppercase tracking-wider text-[#2F3E46]/60 dark:text-gray-500 font-semibold">Status</span>
                  <span className={`text-xs font-bold uppercase tracking-wider ${
                    proj.color === 'purple' ? 'text-violet-600 dark:text-violet-400' : proj.color === 'red' ? 'text-red-600 dark:text-red-500' : 'text-orange-600 dark:text-orange-400'
                  }`}>
                    {proj.color === 'purple' ? 'Critical' : proj.color === 'red' ? 'Warning' : 'Needs Improvement'}
                  </span>
                </div>
              </div>
              <div className="font-mono font-bold text-xl flex items-center flex-wrap gap-x-2">
                <span className={proj.paceColorClass}>{proj.pace}</span>
                <span className="text-sm font-sans text-[#2F3E46]/60 dark:text-gray-500 font-normal mr-6">min/task</span>
                <span className={proj.speedColorClass}>{proj.speed}</span>
                <span className="text-sm font-sans text-[#2F3E46]/60 dark:text-gray-500 font-normal">F/hr</span>
              </div>
            </div>
          ))}
        </div>
        
        {/* Footer & Acknowledgment */}
        <div className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-2 border-t border-black/10 dark:border-white/10">
          <label
            htmlFor="understand-checkbox"
            className="flex items-start gap-3 cursor-pointer group flex-1"
          >
            <div className="relative flex items-center justify-center mt-0.5">
              <input
                type="checkbox"
                id="understand-checkbox"
                checked={hasRead}
                onChange={(e) => setHasRead(e.target.checked)}
                className="peer w-5 h-5 rounded-md border-2 border-black/20 dark:border-white/20 appearance-none checked:border-[#1F7A1F] dark:checked:border-[#55f761] checked:bg-[#1F7A1F] dark:checked:bg-[#55f761] transition-all cursor-pointer"
              />
              <svg className="absolute w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-[#2F3E46]/80 dark:text-white/80 group-hover:text-[#0D1B2A] dark:group-hover:text-white transition-colors leading-snug">
              I have read and fully understand the performance warnings above.
            </span>
          </label>

          <button
            onClick={handleAcknowledge}
            disabled={!hasRead || buttonCountdown > 0 || !canAcknowledge}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all w-full sm:w-auto flex items-center justify-center gap-2 ${!hasRead || buttonCountdown > 0 || !canAcknowledge
              ? "bg-black/10 dark:bg-white/10 text-black/40 dark:text-white/40 cursor-not-allowed"
              : "bg-[#1F7A1F] hover:bg-[#1A661A] text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5"
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
