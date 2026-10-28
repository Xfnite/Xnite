"use client";

import { useState, useEffect, useMemo } from "react";
import { getMyPerformanceLogsAction } from "@/app/actions/project";

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
  log_date: Date;
}

interface ProjectSummary {
  projectId: number;
  projectName: string;
  role: string;
  mySpeed: number;
  myWorktime: number;
  overallSpeed: number;
  overallPace: number;
  improvementRate?: number;
  absoluteImprovement?: number;
  logs: WorkLog[];
}


function formatFeaturesPerMinute(speed: number): string {
  // speed is features/hour; convert to features per 1 minute
  const featuresPerMinute = speed / 60;
  return featuresPerMinute.toFixed(2);
}

function formatMinPerTask(tasks: number, worktimeHours: number): string {
  if (tasks <= 0) return "—";
  // worktime is in hours; convert to minutes then divide by task count
  const minPerTask = (worktimeHours * 60) / tasks;
  return minPerTask.toFixed(1);
}

function timeAgo(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " years ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " months ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " days ago";
  interval = seconds / 3600;
  if (interval > 1) {
    const hours = Math.floor(interval);
    const mins = Math.floor((seconds - hours * 3600) / 60);
    return `${hours} hours ${mins} mins ago`;
  }
  interval = seconds / 60;
  if (interval >= 1) return Math.floor(interval) + " mins ago";
  return Math.max(0, Math.floor(seconds)) + " seconds ago";
}

// Colors an individual speed value based on how it compares to the project's overall average speed.
function getSpeedColorClasses(speed: number, avgSpeed: number): string {
  if (avgSpeed <= 0) return "text-[#0D1B2A] dark:text-white/90";

  const ratio = speed / avgSpeed;

  if (ratio >= 1.2) return "text-teal-500 dark:text-teal-400"; // 120%+ bluegreen
  if (ratio >= 0.9) return "text-[#1F7A1F] dark:text-[#55f761]"; // 90% - 120% green
  if (ratio >= 0.75) return "text-orange-500 dark:text-orange-400"; // 75% - 90% orange
  if (ratio >= 0.5) return "text-red-500 dark:text-red-400"; // 50% - 75% red
  return "text-violet-500 dark:text-violet-400"; // below 50% violet
}

function getPaceColorClasses(pace: number, avgPace: number): string {
  if (avgPace <= 0 || pace <= 0) return "text-[#0D1B2A] dark:text-white/90";
  // Lower pace (min/task) is faster. We invert ratio.
  const ratio = avgPace / pace;

  if (ratio >= 1.2) return "text-teal-500 dark:text-teal-400"; // faster
  if (ratio >= 0.9) return "text-[#1F7A1F] dark:text-[#55f761]"; // good
  if (ratio >= 0.75) return "text-orange-500 dark:text-orange-400"; // ok
  if (ratio >= 0.5) return "text-red-500 dark:text-red-400"; // slow
  return "text-violet-500 dark:text-violet-400"; // very slow
}

export function PerformanceQueryTab() {
  const [myLogs, setMyLogs] = useState<WorkLog[]>([]);
  const [allLogs, setAllLogs] = useState<WorkLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeProjectIds, setActiveProjectIds] = useState<number[]>([]);
  const [showPreviousProjects, setShowPreviousProjects] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState<"daily" | "all_time">("daily");

  useEffect(() => {
    setIsLoading(true);
    
    async function loadData() {
      try {
        const logsRes = await getMyPerformanceLogsAction();

        if (logsRes.success && logsRes.myLogs && logsRes.allLogs) {
          setMyLogs(logsRes.myLogs);
          setAllLogs(logsRes.allLogs);
        } else {
          setError(logsRes.error || "Failed to load performance logs");
        }

        // Get exact active project IDs directly from the Active Projects tab via local storage
        if (typeof window !== 'undefined') {
          const stored = localStorage.getItem('xnite_active_project_ids');
          if (stored) {
            setActiveProjectIds(JSON.parse(stored));
          }
        }
        
      } catch (err) {
        console.error("Failed to load performance logs:", err);
        setError("Unable to load performance metrics. Please check your connection or try again later.");
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  const { projectSummaries, previousSummaries, finalMyLogs, overallMySpeed, overallImprovementRate, overallAbsoluteImprovement } = useMemo(() => {
    if (!myLogs || !allLogs) return { projectSummaries: [], previousSummaries: [], finalMyLogs: [], overallMySpeed: 0, overallImprovementRate: undefined, overallAbsoluteImprovement: undefined };

    // Get the latest log per user/project/role FOR THE SELECTED DATE
    const myMap: Record<string, WorkLog> = {};
    myLogs.forEach((log) => {
      if (log.projectId >= 1 && log.projectId <= 5) return;
      
      const logDate = new Date(log.log_date).toISOString().split('T')[0];
      if (logDate !== selectedDate) return;

      const key = `${log.projectId}_${log.role}`;
      const existing = myMap[key];
      if (!existing || log.id > existing.id) {
        myMap[key] = log;
      }
    });

    const getPreviousLog = (currentLog: WorkLog): WorkLog | undefined => {
      const currentDateStr = new Date(currentLog.log_date).toISOString().split('T')[0];
      let bestPrevLog: WorkLog | undefined;
      
      myLogs.forEach(l => {
        if (l.projectId === currentLog.projectId && l.role === currentLog.role) {
          const lDateStr = new Date(l.log_date).toISOString().split('T')[0];
          if (lDateStr < currentDateStr) {
            if (!bestPrevLog || l.id > bestPrevLog.id) {
              bestPrevLog = l;
            }
          }
        }
      });
      
      return bestPrevLog;
    };

    const computeDeltaLog = (log: WorkLog): WorkLog => {
      if (viewMode === "all_time") return log;
      const prevLog = getPreviousLog(log);
      if (prevLog) {
        return {
          ...log,
          worktime: Math.max(0, log.worktime - prevLog.worktime),
          taskNum: Math.max(0, log.taskNum - prevLog.taskNum),
          features: Math.max(0, log.features - prevLog.features)
        };
      }
      return log;
    };

    const finalMyLogs = Object.values(myMap).map(computeDeltaLog);

    // Get the latest log per user/project/role FOR ALL LOGS (for overall averages)
    const allMap: Record<string, WorkLog> = {};
    allLogs.forEach((log) => {
      if (log.projectId >= 1 && log.projectId <= 5) return;
      const key = `${log.ownerName}_${log.projectId}_${log.role}`;
      const existing = allMap[key];
      if (!existing || log.id > existing.id) {
        allMap[key] = log;
      }
    });
    const finalAllLogs = Object.values(allMap);

    // Get unique project-role pairs for the user and sort them by projectId, then by role name
    const projectRolePairs = finalMyLogs.map((log) => ({
      projectId: log.projectId,
      role: log.role,
    }));
    const uniquePairs = projectRolePairs.filter(
      (pair, index, self) =>
        index === self.findIndex((p) => p.projectId === pair.projectId && p.role === pair.role)
    );
    uniquePairs.sort((a, b) => {
      if (a.projectId !== b.projectId) {
        return a.projectId - b.projectId;
      }
      return a.role.localeCompare(b.role);
    });

    // Get previous day's logs for improvement rate calculation
    const getPrevDay = (dStr: string) => {
      const d = new Date(dStr);
      d.setDate(d.getDate() - 1);
      return d.toISOString().split('T')[0];
    };
    const prevDateStr = getPrevDay(selectedDate);

    const prevDateMap: Record<string, WorkLog> = {};
    myLogs.forEach((log) => {
      if (log.projectId >= 1 && log.projectId <= 5) return;
      const logDate = new Date(log.log_date).toISOString().split('T')[0];
      if (logDate !== prevDateStr) return;
      const key = `${log.projectId}_${log.role}`;
      const existing = prevDateMap[key];
      if (!existing || log.id > existing.id) {
        prevDateMap[key] = log;
      }
    });
    const finalPrevDateLogs = Object.values(prevDateMap).map(computeDeltaLog);

    const buildSummary = (pId: number, role: string, pMyLogs: WorkLog[], pPrevLogs: WorkLog[] = []): ProjectSummary => {
      const pAllLogs = finalAllLogs.filter((log) => log.projectId === pId && log.role === role);

      const myWorktime = pMyLogs.reduce((acc, log) => acc + log.worktime, 0);
      const myFeatures = pMyLogs.reduce((acc, log) => acc + log.features, 0);
      const mySpeed = myWorktime > 0 ? myFeatures / myWorktime : 0;

      const sortedAllLogs = pAllLogs.slice().sort((a, b) => {
        const speedA = a.worktime > 0 ? a.features / a.worktime : 0;
        const speedB = b.worktime > 0 ? b.features / b.worktime : 0;
        return speedA - speedB;
      });
      
      // Trim top and bottom 10% of outliers (max 10 items trimmed from each end)
      const trimCount = Math.min(10, Math.floor(sortedAllLogs.length * 0.1));
      const filteredAllLogs = trimCount > 0 ? sortedAllLogs.slice(trimCount, -trimCount) : sortedAllLogs;

      const allWorktime = filteredAllLogs.reduce((acc, log) => acc + log.worktime, 0);
      const allFeatures = filteredAllLogs.reduce((acc, log) => acc + log.features, 0);
      const overallSpeed = allWorktime > 0 ? allFeatures / allWorktime : 0;
      const allTasks = filteredAllLogs.reduce((acc, log) => acc + log.taskNum, 0);
      const overallPace = allWorktime > 0 && allTasks > 0 ? (allWorktime * 60) / allTasks : 0;

      const prevWorktime = pPrevLogs.reduce((acc, log) => acc + log.worktime, 0);
      const prevFeatures = pPrevLogs.reduce((acc, log) => acc + log.features, 0);
      const prevSpeed = prevWorktime > 0 ? prevFeatures / prevWorktime : 0;
      
      let improvementRate: number | undefined = undefined;
      let absoluteImprovement: number | undefined = undefined;
      if (prevSpeed > 0) {
        improvementRate = ((mySpeed - prevSpeed) / prevSpeed) * 100;
        absoluteImprovement = mySpeed - prevSpeed;
      }

      return {
        projectId: pId,
        projectName: "Project",
        role,
        mySpeed,
        myWorktime,
        overallSpeed,
        overallPace,
        improvementRate,
        absoluteImprovement,
        logs: pMyLogs,
      };
    };

    const summaries: ProjectSummary[] = uniquePairs.map(({ projectId: pId, role }) => {
      const pMyLogs = finalMyLogs.filter((log) => log.projectId === pId && log.role === role);
      const pPrevLogs = finalPrevDateLogs.filter((log) => log.projectId === pId && log.role === role);
      return buildSummary(pId, role, pMyLogs, pPrevLogs);
    });

    // Build previous summaries: most recent log per combo with NO record on selected date
    const coveredKeys = new Set(finalMyLogs.map(log => `${log.projectId}_${log.role}`));
    const prevMap: Record<string, WorkLog> = {};
    if (showPreviousProjects) {
      myLogs.forEach((log) => {
        if (log.projectId >= 1 && log.projectId <= 5) return;
        const key = `${log.projectId}_${log.role}`;
        if (coveredKeys.has(key)) return; // already shown in current date view
        const existing = prevMap[key];
        if (!existing || log.id > existing.id) {
          prevMap[key] = log;
        }
      });
    }
    const prevLogs = Object.values(prevMap).map(computeDeltaLog);
    const prevPairs = prevLogs
      .map(log => ({ projectId: log.projectId, role: log.role }))
      .filter((pair, idx, self) => idx === self.findIndex(p => p.projectId === pair.projectId && p.role === pair.role))
      .sort((a, b) => a.projectId !== b.projectId ? a.projectId - b.projectId : a.role.localeCompare(b.role));
    const previousSummaries: ProjectSummary[] = prevPairs.map(({ projectId: pId, role }) => {
      const pMyLogs = prevLogs.filter(log => log.projectId === pId && log.role === role);
      return buildSummary(pId, role, pMyLogs);
    });

    // Calculate Overall Computed Speed across all projects for selectedDate
    // Filter active projects only? The user wants "today's compute speed".
    // We can just sum up the finalMyLogs (which already correspond to selectedDate).
    const totalMyFeatures = finalMyLogs.reduce((acc, log) => acc + log.features, 0);
    const totalMyWorktime = finalMyLogs.reduce((acc, log) => acc + log.worktime, 0);
    const overallMySpeed = totalMyWorktime > 0 ? totalMyFeatures / totalMyWorktime : 0;

    // Previous day equivalent
    const prevFeatures = finalPrevDateLogs.reduce((acc, log) => acc + log.features, 0);
    const prevWorktime = finalPrevDateLogs.reduce((acc, log) => acc + log.worktime, 0);
    const overallMyPrevSpeed = prevWorktime > 0 ? prevFeatures / prevWorktime : undefined;

    let overallImprovementRate: number | undefined;
    let overallAbsoluteImprovement: number | undefined;
    if (overallMyPrevSpeed !== undefined && overallMyPrevSpeed > 0) {
      overallImprovementRate = ((overallMySpeed - overallMyPrevSpeed) / overallMyPrevSpeed) * 100;
      overallAbsoluteImprovement = overallMySpeed - overallMyPrevSpeed;
    }

    return { 
      projectSummaries: summaries, 
      previousSummaries, 
      finalMyLogs,
      overallMySpeed,
      overallImprovementRate,
      overallAbsoluteImprovement
    };
  }, [myLogs, allLogs, selectedDate, showPreviousProjects, viewMode]);

  const legend = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold">
      <span className="flex items-center gap-1.5 text-violet-600/80 dark:text-violet-300/80">
        <span className="w-2.5 h-2.5 rounded-full bg-violet-500/70 dark:bg-violet-400/70 shrink-0" />
        Slowest Pace
      </span>
      <span className="flex items-center gap-1.5 text-red-600/80 dark:text-red-300/80">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500/70 dark:bg-red-400/70 shrink-0" />
        Lagging Behind
      </span>
      <span className="flex items-center gap-1.5 text-orange-600/80 dark:text-orange-300/80">
        <span className="w-2.5 h-2.5 rounded-full bg-orange-500/70 dark:bg-orange-400/70 shrink-0" />
        Below Standard
      </span>
      <span className="flex items-center gap-1.5 text-[#2F3E46]/70 dark:text-white/50">
        <span className="w-2.5 h-2.5 rounded-full bg-[#0D1B2A] dark:bg-white/90 shrink-0" />
        Steady Pace
      </span>
      <span className="flex items-center gap-1.5 text-[#1F7A1F]/80 dark:text-[#55f761]/80">
        <span className="w-2.5 h-2.5 rounded-full bg-[#1F7A1F]/70 dark:bg-[#55f761]/70 shrink-0" />
        Excellent Speed
      </span>
      <span className="flex items-center gap-1.5 text-teal-600/80 dark:text-teal-300/80">
        <span className="w-2.5 h-2.5 rounded-full bg-teal-500/70 dark:bg-teal-400/70 shrink-0" />
        Unmatched Speed
      </span>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2 px-1">{legend}</div>
        <div className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-tr-3xl rounded-bl-3xl p-16 text-center text-[#2F3E46] dark:text-white/60">
          <div className="w-8 h-8 border-2 border-[#1F7A1F] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          Loading performance calculations...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2 px-1">{legend}</div>
        <div className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 p-6 rounded-tr-2xl rounded-bl-2xl text-sm">
          {error}
        </div>
      </div>
    );
  }


  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      {/* Legend + Last Updated Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2 px-1">
        {legend}

        {/* Last Updated */}
        {(() => {
          let lastUpdateString = "";
          if (allLogs.length > 0) {
            const latest = allLogs.reduce((acc, log) => {
              const d = new Date(log.updatedAt).getTime();
              return d > acc ? d : acc;
            }, 0);
            if (latest > 0) {
              lastUpdateString = timeAgo(new Date(latest).toISOString());
            }
          }
          if (!lastUpdateString) return null;
          return (
            <div className="flex items-center text-xs font-semibold text-[#2F3E46]/60 dark:text-white/50 shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              Last updated {lastUpdateString}
            </div>
          );
        })()}
      </div>

      {/* Overall Speed Summary Card */}
      <div className="flex flex-col mt-2">
        <div className="bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl p-5 shadow-lg backdrop-blur-md min-w-[280px] w-fit">
          <h3 className="text-[10px] uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40 font-bold">
            {selectedDate === new Date().toISOString().split('T')[0] ? "Today's Avg Compute Speed" : "Avg Compute Speed"}
          </h3>
          <div className="flex items-end gap-3 mt-1.5">
            <div className="text-3xl font-black text-[#0D1B2A] dark:text-white leading-none">
              {overallMySpeed.toFixed(2)} <span className="text-xs font-semibold text-gray-500">F/hr</span>
            </div>
            {overallAbsoluteImprovement !== undefined && overallImprovementRate !== undefined && (
              <div className={`flex flex-col ${overallAbsoluteImprovement > 0 ? 'text-green-600 dark:text-green-400' : overallAbsoluteImprovement < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500'}`}>
                <span className="text-sm font-bold flex items-center gap-1 leading-none">
                  {overallAbsoluteImprovement > 0 ? '↑' : overallAbsoluteImprovement < 0 ? '↓' : ''} {Math.abs(overallImprovementRate).toFixed(1)}%
                </span>
                <span className="text-[9px] font-semibold opacity-80 mt-0.5">
                  {overallAbsoluteImprovement > 0 ? '+' : ''}{overallAbsoluteImprovement.toFixed(2)} from yesterday
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Projects List Header / Toggle / Date Picker */}
      <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-4">
        
        {/* Date Filter Toggle */}
        <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 rounded-md p-1 border border-black/10 dark:border-white/10 shadow-sm">
          <button
            onClick={() => {
              const today = new Date().toISOString().split('T')[0];
              setSelectedDate(today);
            }}
            className={`px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-md transition-all ${
              selectedDate === new Date().toISOString().split('T')[0]
                ? "bg-white dark:bg-[#1E293B] shadow-sm text-[#0D1B2A] dark:text-white"
                : "text-[#2F3E46]/70 dark:text-white/60 hover:text-[#0D1B2A] dark:hover:text-white"
            }`}
          >
            Today
          </button>
          <button
            onClick={() => {
              const yest = new Date();
              yest.setDate(yest.getDate() - 1);
              setSelectedDate(yest.toISOString().split('T')[0]);
            }}
            className={`px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-md transition-all ${
              selectedDate === new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().split('T')[0]
                ? "bg-white dark:bg-[#1E293B] shadow-sm text-[#0D1B2A] dark:text-white"
                : "text-[#2F3E46]/70 dark:text-white/60 hover:text-[#0D1B2A] dark:hover:text-white"
            }`}
          >
            Yesterday
          </button>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-wider mx-2">
          <button 
            onClick={() => setViewMode("daily")}
            className={`transition-colors ${viewMode === "daily" ? "text-[#1F7A1F] dark:text-[#55f761]" : "text-[#2F3E46]/40 dark:text-white/30 hover:text-[#2F3E46]/70 dark:hover:text-white/60"}`}
          >
            Daily
          </button>
          <span className="text-[#2F3E46]/20 dark:text-white/20">|</span>
          <button 
            onClick={() => setViewMode("all_time")}
            className={`transition-colors ${viewMode === "all_time" ? "text-[#1F7A1F] dark:text-[#55f761]" : "text-[#2F3E46]/40 dark:text-white/30 hover:text-[#2F3E46]/70 dark:hover:text-white/60"}`}
          >
            All-Time
          </button>
        </div>

        {/* Toggle Button */}
        <button
          onClick={() => setShowPreviousProjects(!showPreviousProjects)}
          className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all shadow-sm flex items-center gap-2 ${
            showPreviousProjects
              ? "bg-[#1F7A1F] text-white hover:bg-[#145214] dark:bg-[#55f761] dark:text-[#060D14] dark:hover:bg-[#3de34a]"
              : "bg-black/5 text-[#2F3E46]/80 hover:bg-black/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10"
          }`}
        >
          {showPreviousProjects ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
              Hide Previous Projects
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14m-7-7h14"/></svg>
              Show Previous Projects
            </>
          )}
        </button>
      </div>

      {/* Projects List */}
      {finalMyLogs.length === 0 ? (
        <div className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-tr-3xl rounded-bl-3xl p-12 text-center text-[#2F3E46] dark:text-white/60 mt-8">
          No active performance records found for {selectedDate === new Date().toISOString().split('T')[0] ? "Today" : "Yesterday"}. Complete some tasks first!
        </div>
      ) : (
      <div className="space-y-4 mt-4">
        <div className="space-y-3">
          {projectSummaries.filter(p => showPreviousProjects || activeProjectIds.includes(p.projectId)).map((p) => {
            return (
              <div
                key={`${p.projectId}_${p.role}`}
                className="bg-white/50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-2xl overflow-hidden transition-all duration-300 shadow-sm"
              >
                {/* Project Summary Header Row */}
                <div
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 transition-all duration-200 border-b border-black/10 dark:border-white/10"
                >
                  <div className="flex items-center gap-3">
                    {/* Project ID Tag */}

                    <div>
                      <h3 className="text-sm font-bold text-[#0D1B2A] dark:text-white">
                        {p.projectName}
                      </h3>
                    </div>
                    <span className="inline-flex items-center justify-center font-mono font-bold text-xs w-7 h-7 rounded-lg text-[#1F7A1F] dark:text-[#55f761]">
                      #{p.projectId}
                    </span>
                    <span className="inline-flex items-center justify-center font-mono font-bold text-[10px] px-2 py-0.5 rounded bg-black/5 dark:bg-white/5 text-[#2F3E46]/80 dark:text-white/80 capitalize">
                      {p.role}
                    </span>
                  </div>

                  <div className="flex items-start gap-6 self-end sm:self-auto">
                    {/* Avg Tasks / Min */}
                    {(() => {
                      const totalTasks = p.logs.reduce((acc, l) => acc + l.taskNum, 0);
                      const totalWorktime = p.logs.reduce((acc, l) => acc + l.worktime, 0);
                      const tpm = totalWorktime > 0 && totalTasks > 0
                        ? (totalWorktime * 60) / totalTasks
                        : 0;
                      return (
                        <div className="text-center sm:text-right">
                          <div className="text-[9px] uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40 font-semibold mb-0.5">
                            Avg Task Pace
                          </div>
                          <div className="font-mono text-sm font-bold text-[#0D1B2A] dark:text-white">
                            {tpm > 0 ? tpm.toFixed(1) : "—"} <span className="text-[10px] text-gray-500 mt-0.5 font-medium">min per task</span>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="text-center sm:text-right">
                      <div className="text-[9px] uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40 font-semibold mb-0.5">
                        Overall Avg Speed
                      </div>
                      <div className="font-mono text-sm font-bold text-[#0D1B2A] dark:text-white">
                        {p.overallSpeed.toFixed(2)} <span className="text-[10px] font-normal text-gray-500 ml-0.5">Features/Hour</span>
                      </div>
                    </div>

                    {/* <div className="text-center sm:text-right">
                      <div className="text-[9px] uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40 font-semibold mb-0.5">
                        Work Time
                      </div>
                    </div> */}
                  </div>
                </div>

                {/* Dropdown Task Details List (Always Open/Visible) */}
                <div className="bg-black/5 dark:bg-black/45 p-4">

                  {/* Mobile: Card layout */}
                  <div className="flex flex-col gap-3 sm:hidden">
                    {p.logs.map((log) => {
                      const entrySpeed = log.worktime > 0 ? log.features / log.worktime : 0;
                      const entryPace = log.taskNum > 0 ? (log.worktime * 60) / log.taskNum : 0;
                      return (
                        <div
                          key={log.id}
                          className="bg-white/50 dark:bg-black/30 border border-black/5 dark:border-white/5 rounded-xl p-4 space-y-3"
                        >
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <div className="text-[9px] uppercase tracking-wider text-[#2F3E46]/50 dark:text-white/40 font-semibold mb-0.5">Worktime</div>
                              <div className="font-mono text-sm font-bold text-[#0D1B2A] dark:text-white">{log.worktime.toFixed(2)}<span className="text-[10px] font-normal text-gray-500 ml-0.5">h</span></div>
                            </div>
                            <div>
                              <div className="text-[9px] uppercase tracking-wider text-[#2F3E46]/50 dark:text-white/40 font-semibold mb-0.5">Tasks</div>
                              <div className="font-mono text-sm font-bold text-[#0D1B2A] dark:text-white">{log.taskNum}</div>
                            </div>
                            <div>
                              <div className="text-[9px] uppercase tracking-wider text-[#2F3E46]/50 dark:text-white/40 font-semibold mb-0.5">Features</div>
                              <div className="font-mono text-sm font-bold text-[#0D1B2A] dark:text-white">{log.features}</div>
                            </div>
                            <div>
                              <div className="text-[9px] uppercase tracking-wider text-[#2F3E46]/50 dark:text-white/40 font-semibold mb-0.5">Min / Task</div>
                              <div className={`font-mono text-sm font-bold ${getPaceColorClasses(entryPace, p.overallPace)}`}>
                                {formatMinPerTask(log.taskNum, log.worktime)}
                                <span className="text-[10px] font-normal text-gray-500 ml-0.5">min/task</span>
                              </div>
                            </div>
                          </div>
                          <div className="pt-3 border-t border-black/5 dark:border-white/5 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <div className="text-[9px] uppercase tracking-wider text-[#2F3E46]/50 dark:text-white/40 font-semibold mb-0.5">Computed Speed</div>
                              <div className={`font-mono text-sm font-black ${getSpeedColorClasses(entrySpeed, p.overallSpeed)}`}>
                                {entrySpeed.toFixed(2)}
                                <span className="text-[10px] font-normal text-gray-500 font-sans ml-1">Features/Hour</span>
                              </div>
                            </div>
                            {p.absoluteImprovement !== undefined && p.improvementRate !== undefined && (
                              <div className={`flex items-center justify-between gap-2 text-xs font-bold px-3 py-1.5 rounded-md w-full ${p.absoluteImprovement > 0 ? 'bg-green-500/15 text-green-600 dark:text-green-400' : p.absoluteImprovement < 0 ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-gray-500/15 text-gray-600 dark:text-gray-400'}`}>
                                <span className="text-[10px] uppercase font-semibold opacity-70">Vs Yesterday</span>
                                <div className="flex items-center gap-2">
                                  <span>{p.absoluteImprovement > 0 ? '+' : p.absoluteImprovement < 0 ? '' : ''}{p.absoluteImprovement.toFixed(2)} <span className="text-[9px] font-medium opacity-70">F/hr</span></span>
                                  <span className="opacity-30">|</span>
                                  <span>{p.improvementRate > 0 ? '↑' : p.improvementRate < 0 ? '↓' : ''}{Math.abs(p.improvementRate).toFixed(1)}%</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop: Table layout */}
                  <div className="hidden sm:block overflow-x-auto hide-scrollbar rounded-xl border border-black/5 dark:border-white/5">
                    <table className="w-full text-xs text-left border-collapse whitespace-nowrap bg-white/30 dark:bg-black/20">
                      <thead>
                        <tr className="border-b border-black/10 dark:border-white/10 text-[#2F3E46] dark:text-white/60 bg-black/5 dark:bg-white/5 font-semibold">
                          <th className="py-3 px-4 text-center">Worktime (Hours)</th>
                          <th className="py-3 px-4 text-center">Tasks Completed</th>
                          <th className="py-3 px-4 text-center">Features Mapped</th>
                          <th className="py-3 px-4 text-center">Min / Task</th>
                          <th className="py-3 px-4 text-right">Computed Speed</th>
                        </tr>
                      </thead>
                      <tbody className="text-[#0D1B2A] dark:text-white/90">
                        {p.logs.map((log) => {
                          const entrySpeed = log.worktime > 0 ? log.features / log.worktime : 0;
                          const entryPace = log.taskNum > 0 ? (log.worktime * 60) / log.taskNum : 0;
                          return (
                            <tr
                              key={log.id}
                              className="border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            >
                              <td className="py-3 px-4 text-center font-mono">
                                {log.worktime.toFixed(2)}h
                              </td>
                              <td className="py-3 px-4 text-center font-mono">
                                {log.taskNum}
                              </td>
                              <td className="py-3 px-4 text-center font-mono font-semibold">
                                {log.features}
                              </td>
                              <td className={`py-3 px-4 text-center font-mono font-bold ${getPaceColorClasses(entryPace, p.overallPace)}`}>
                                {formatMinPerTask(log.taskNum, log.worktime)}
                                <span className="text-[9px] font-normal text-gray-500 font-sans ml-0.5">min/task</span>
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-black">
                                <div className={`flex flex-col items-end gap-1 ${getSpeedColorClasses(entrySpeed, p.overallSpeed)}`}>
                                  <span>
                                    {entrySpeed.toFixed(2)}{" "}
                                    <span className="text-[9px] font-normal text-gray-500 font-sans">
                                      Features/Hour
                                    </span>
                                  </span>
                                  {p.absoluteImprovement !== undefined && p.improvementRate !== undefined && (
                                    <span className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded ${p.absoluteImprovement > 0 ? 'bg-green-500/15 text-green-600 dark:text-green-400' : p.absoluteImprovement < 0 ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-gray-500/15 text-gray-600 dark:text-gray-400'}`}>
                                      <span>{p.absoluteImprovement > 0 ? '+' : p.absoluteImprovement < 0 ? '' : ''}{p.absoluteImprovement.toFixed(2)} F/hr</span>
                                      <span className="opacity-30">|</span>
                                      <span>{p.improvementRate > 0 ? '↑' : p.improvementRate < 0 ? '↓' : ''}{Math.abs(p.improvementRate).toFixed(1)}%</span>
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {showPreviousProjects && previousSummaries.length > 0 && (() => {
            const roleColor = (role: string) => {
              const r = role.toLowerCase();
              if (r === "labeler")  return "bg-green-500/15 text-green-600 dark:text-green-400";
              if (r === "checker")  return "bg-blue-500/15 text-blue-600 dark:text-blue-400";
              if (r === "filter")   return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
              if (r === "reviewer") return "bg-orange-500/15 text-orange-600 dark:text-orange-400";
              if (r === "judger")   return "bg-purple-500/15 text-purple-600 dark:text-purple-400";
              return "bg-white/5 text-[#2F3E46]/60 dark:text-white/50";
            };

            const grouped = previousSummaries.reduce<Record<number, ProjectSummary[]>>((acc, p) => {
              if (!acc[p.projectId]) acc[p.projectId] = [];
              acc[p.projectId].push(p);
              return acc;
            }, {});
            const groupedEntries = Object.entries(grouped)
              .map(([id, summaries]) => ({ projectId: Number(id), summaries }))
              .sort((a, b) => a.projectId - b.projectId);

            return (
              <>
                <div className="flex items-center gap-3 mt-6 mb-2">
                  <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
                  <span className="text-xs font-semibold text-[#2F3E46]/50 dark:text-white/40 uppercase tracking-wider">Previous Projects</span>
                  <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
                </div>
                <div className="space-y-3 opacity-75">
                  {groupedEntries.map(({ projectId, summaries: roles }) => {
                    const lastDate = roles[0]?.logs[0]?.log_date;
                    return (
                      <div
                        key={`prev_${projectId}`}
                        className="bg-white/30 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm"
                      >
                        {/* Project Header */}
                        <div className="flex items-center justify-between px-5 py-3 border-b border-black/10 dark:border-white/10">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-[#0D1B2A] dark:text-white">
                              Project <span className="text-[#1F7A1F] dark:text-[#55f761]">#{projectId}</span>
                            </h3>
                            <span className="text-[10px] font-semibold bg-black/5 dark:bg-white/5 text-[#2F3E46]/60 dark:text-white/40 px-2 py-0.5 rounded-full">Inactive</span>
                          </div>
                          {lastDate && (
                            <p className="text-[10px] text-[#2F3E46]/40 dark:text-white/30">
                              Last recorded: {new Date(lastDate).toLocaleDateString()}
                            </p>
                          )}
                        </div>

                        {/* Shared column header */}
                        <div className="grid grid-cols-5 text-[10px] font-semibold uppercase tracking-wider text-[#2F3E46]/40 dark:text-white/25 px-5 py-2 border-b border-black/5 dark:border-white/5">
                          <span>Role</span>
                          <span className="text-right">Worktime</span>
                          <span className="text-right">Tasks</span>
                          <span className="text-right">Features</span>
                          <span className="text-right">Speed</span>
                        </div>

                        {/* One data row per role */}
                        {roles.map((p, idx) => {
                          const spd = p.logs.reduce((a, l) => a + l.features, 0) /
                                      (p.logs.reduce((a, l) => a + l.worktime, 0) || 1);
                          const totalWorktime = p.logs.reduce((a, l) => a + l.worktime, 0);
                          const totalTasks    = p.logs.reduce((a, l) => a + l.taskNum, 0);
                          const totalFeatures = p.logs.reduce((a, l) => a + l.features, 0);
                          return (
                            <div
                              key={`prev_${projectId}_${p.role}`}
                              className={`grid grid-cols-5 items-center px-5 py-3 text-xs ${idx < roles.length - 1 ? "border-b border-black/5 dark:border-white/5" : ""}`}
                            >
                              <span className={`inline-flex items-center w-fit px-2 py-0.5 rounded-md text-[11px] font-semibold capitalize ${roleColor(p.role)}`}>
                                {p.role}
                              </span>
                              <span className="text-right font-mono text-[#0D1B2A] dark:text-white">{totalWorktime.toFixed(2)}h</span>
                              <span className="text-right font-mono text-[#0D1B2A] dark:text-white">{totalTasks.toLocaleString()}</span>
                              <span className="text-right font-mono text-[#0D1B2A] dark:text-white">{totalFeatures.toLocaleString()}</span>
                              <span className="text-right font-mono font-bold text-[#0D1B2A] dark:text-white">
                                {spd.toFixed(2)} <span className="text-[9px] font-normal text-gray-500">F/hr</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()
        }
      </div>
      )}
    </div>
  );
}
