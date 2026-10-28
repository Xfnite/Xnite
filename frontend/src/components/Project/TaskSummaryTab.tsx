"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSessionUser } from "@/app/actions/auth";
import { cacheGingerDataAction, getCachedGingerDataAction } from "@/app/actions/project";

const STATE_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  init: { label: "Initialized", color: "text-gray-600 dark:text-gray-400", bg: "bg-gray-500/10", border: "border-gray-500/20" },
  predict_acquire: { label: "Predict Acquire", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  predict_submit: { label: "Predict Submit", color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/20" },
  labeler_editing: { label: "Labeler Editing", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  labeler_submit: { label: "Labeler Submit", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
  checker_editing: { label: "Checker Editing", color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20" },
  checker_submit: { label: "Checker Submit", color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-500/10", border: "border-teal-500/20" },
  checker_pushed_back: { label: "Checker Pushed Back", color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
  judger_editing: { label: "Judger Editing", color: "text-fuchsia-600 dark:text-fuchsia-400", bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/20" },
  finished: { label: "Finished", color: "text-green-600 dark:text-green-400", bg: "bg-green-500/10", border: "border-green-500/20" },
  reviewer_editing: { label: "Reviewer Editing", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
};

const GINGER_BASE = process.env.NEXT_PUBLIC_GINGER_API_URL || "https://ginger.bitmappro.com";

const getStateMeta = (stateTitle: string) => {
  if (STATE_META[stateTitle]) return STATE_META[stateTitle];
  const label = stateTitle.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  return { label, color: "text-gray-500", bg: "bg-gray-500/10", border: "border-gray-500/15" };
};

export function TaskSummaryTab() {
  const [projects, setProjects] = useState<any[]>([]);
  const [isProjectsLoading, setIsProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");

  const getOrSyncGingerToken = async (): Promise<string | null> => {
    try {
      const scrapedData = localStorage.getItem('scrapedGingerData');
      const parsed = scrapedData ? JSON.parse(scrapedData) : null;
      if (parsed?.credential?.access_token) {
        return parsed.credential.access_token;
      }
    } catch (e) {
      console.error("Failed to parse scrapedGingerData from localStorage:", e);
    }

    try {
      const user = await getSessionUser();
      if (user?.gingerToken) {
        localStorage.setItem(
          "scrapedGingerData",
          JSON.stringify({
            credential: {
              access_token: user.gingerToken,
            },
          })
        );
        return user.gingerToken;
      }
    } catch (e) {
      console.error("Failed to fetch session user for gingerToken:", e);
    }

    return null;
  };

  // 1. Fetch ongoing projects on mount
  useEffect(() => {
    const fetchProjects = async () => {
      setIsProjectsLoading(true);
      setProjectsError("");
      try {
        const token = await getOrSyncGingerToken();

        if (!token) {
          setProjectsError("Unauthorized: Missing access token");
          setIsProjectsLoading(false);
          return;
        }

        const response = await fetch(`${GINGER_BASE}/bac/mapping/annotate/list-ongoing-projects-for-annotator`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to load projects list");
        }

        const ongoingList = result.ongoing_annotate_list || [];
        setProjects(ongoingList);
        cacheGingerDataAction('task_summary_projects', ongoingList);
        
        if (ongoingList.length > 0) {
          setSelectedProjectId(ongoingList[0].annotate_id);
        }
      } catch (err) {
        const cached = await getCachedGingerDataAction('task_summary_projects');
        if (cached && Array.isArray(cached)) {
          setProjects(cached);
          if (cached.length > 0) {
            setSelectedProjectId(cached[0].annotate_id);
          }
        } else {
          setProjectsError("Unable to load project summary. Please check your connection or try again later.");
        }
      } finally {
        setIsProjectsLoading(false);
      }
    };

    fetchProjects();
  }, []);

  // 2. Fetch statistics when selectedProjectId changes
  useEffect(() => {
    if (!selectedProjectId) {
      setStats(null);
      return;
    }

    const fetchStats = async () => {
      setIsStatsLoading(true);
      setStatsError("");
      try {
        const token = await getOrSyncGingerToken();

        if (!token) {
          setStatsError("Unable to authenticate session. Please log in again.");
          setIsStatsLoading(false);
          return;
        }

        const response = await fetch(`${GINGER_BASE}/bac/mapping/annotate/detail-annotate-statistics`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ annotate_id: selectedProjectId }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to load project statistics");
        }

        setStats(result);
        cacheGingerDataAction(`task_summary_stats_${selectedProjectId}`, result);
      } catch (err) {
        const cached = await getCachedGingerDataAction(`task_summary_stats_${selectedProjectId}`);
        if (cached) {
          setStats(cached);
        } else {
          setStatsError("Unable to load project statistics. Please check your connection or try again later.");
        }
      } finally {
        setIsStatsLoading(false);
      }
    };

    fetchStats();
  }, [selectedProjectId]);

  // Calculations
  const taskRelease = stats?.statistics?.task_release_statistics;
  const finishedTasks = taskRelease?.finished_task_count || 0;
  const totalTasks = taskRelease?.total_task_count || 1;
  const taskProgressPct = Math.round((finishedTasks / totalTasks) * 100);

  const featureStats = stats?.statistics?.feature_statistics;
  const finishedFeatures = featureStats?.finished_features || 0;
  const processedFeatures = featureStats?.processed_features || 1;
  const featureProgressPct = Math.round((finishedFeatures / processedFeatures) * 100);

  const taskStates = stats?.statistics?.task_state_statistics?.task_state_list || [];

  return (
    <div className="w-full animate-in fade-in zoom-in-95 duration-300">

        {isProjectsLoading ? (
          <div className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-tr-3xl rounded-bl-3xl p-12 text-center text-[#2F3E46] dark:text-white/60">
            <div className="w-8 h-8 border-2 border-[#1F7A1F] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            Loading active projects list...
          </div>
        ) : projectsError ? (
          <div className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 p-6 rounded-tr-2xl rounded-bl-2xl text-sm">
            {projectsError}
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-tr-3xl rounded-bl-3xl p-12 text-center text-[#2F3E46] dark:text-white/60">
            No active annotation projects found.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Project Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/40 dark:bg-black/20 backdrop-blur-md border border-black/5 dark:border-white/5 p-4 rounded-xl">
              <div>
                <label className="block text-[10px] font-bold text-[#2F3E46] dark:text-white/50 mb-1.5 uppercase tracking-wider">Select Annotation Project</label>
                <select
                  value={selectedProjectId || ""}
                  onChange={(e) => setSelectedProjectId(Number(e.target.value))}
                  className="bg-white/80 dark:bg-[#060D14] border border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#0D1B2A] dark:text-white focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-all min-w-[285px]"
                >
                  {projects.map((p) => (
                    <option key={p.annotate_id} value={p.annotate_id}>
                      {p.annotate_name} ({p.annotate_id})
                    </option>
                  ))}
                </select>
              </div>

              {stats && (
                <div className="text-left sm:text-right shrink-0">
                  <div className="text-[10px] font-bold text-[#2F3E46] dark:text-white/50 uppercase tracking-wider mb-1">Last Updated</div>
                  <div className="text-xs font-mono font-semibold text-[#0D1B2A] dark:text-white">
                    {stats.statistics_ts_updated ? new Date(stats.statistics_ts_updated).toLocaleString() : "-"}
                  </div>
                </div>
              )}
            </div>

            {isStatsLoading ? (
              <div className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-tr-3xl rounded-bl-3xl p-16 text-center text-[#2F3E46] dark:text-white/60">
                <div className="w-8 h-8 border-2 border-[#1F7A1F] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                Loading statistics details...
              </div>
            ) : statsError ? (
              <div className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 p-6 rounded-tr-2xl rounded-bl-2xl text-sm">
                {statsError}
              </div>
            ) : !stats ? (
              <div className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-tr-3xl rounded-bl-3xl p-12 text-center text-[#2F3E46] dark:text-white/60">
                Please select a project to load statistics.
              </div>
            ) : (
              <div className="space-y-6">

                {/* Metric Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Task Completion Card */}
                  <div className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between">
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40">Task Completion</div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-black text-[#0D1B2A] dark:text-white font-mono">{finishedTasks}</span>
                        <span className="text-xs text-[#2F3E46]/60 dark:text-white/40">/ {totalTasks} finished</span>
                      </div>
                    </div>
                    <div className="mt-4 space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-[#1F7A1F] dark:text-[#55f761]">Progress</span>
                        <span className="font-mono font-bold text-[#0D1B2A] dark:text-white">{taskProgressPct}%</span>
                      </div>
                      <div className="w-full bg-black/10 dark:bg-white/10 h-2 rounded-full overflow-hidden">
                        <div className="bg-gradient-to-r from-[#1F7A1F] to-[#55f761] h-full rounded-full transition-all duration-500" style={{ width: `${taskProgressPct}%` }}></div>
                      </div>
                    </div>
                  </div>

                  {/* Feature Statistics Card */}
                  <div className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between">
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40">Finished Features</div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-black text-[#0D1B2A] dark:text-white font-mono">{finishedFeatures.toLocaleString()}</span>
                        <span className="text-xs text-[#2F3E46]/60 dark:text-white/40">/ {processedFeatures.toLocaleString()} processed</span>
                      </div>
                    </div>
                    <div className="mt-4 space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-blue-600 dark:text-blue-400">Completion</span>
                        <span className="font-mono font-bold text-[#0D1B2A] dark:text-white">{featureProgressPct}%</span>
                      </div>
                      <div className="w-full bg-black/10 dark:bg-white/10 h-2 rounded-full overflow-hidden">
                        <div className="bg-gradient-to-r from-blue-600 to-sky-400 h-full rounded-full transition-all duration-500" style={{ width: `${featureProgressPct}%` }}></div>
                      </div>
                    </div>
                  </div>

                  {/* Metadata Card */}
                  <div className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl p-5 relative overflow-hidden space-y-4">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40 mb-2">Project Metadata</div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-[#2F3E46] dark:text-white/60">Project ID:</span>
                          <div className="font-mono font-bold text-[#0D1B2A] dark:text-white mt-0.5">{stats.annotate_project_id}</div>
                        </div>
                        <div>
                          <span className="text-[#2F3E46] dark:text-white/60">Region:</span>
                          <div className="font-semibold text-[#0D1B2A] dark:text-white uppercase mt-0.5">{stats.region || "N/A"}</div>
                        </div>
                        <div>
                          <span className="text-[#2F3E46] dark:text-white/60">Index ID:</span>
                          <div className="font-mono font-bold text-[#0D1B2A] dark:text-white mt-0.5">{stats.annotate_index_id}</div>
                        </div>
                        <div>
                          <span className="text-[#2F3E46] dark:text-white/60">Release Status:</span>
                          <div className="font-semibold text-[#0D1B2A] dark:text-white mt-0.5">
                            {taskRelease?.is_all_task_finished ? "All Completed" : "Ongoing"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Task States Details */}
                <div className="space-y-3 mt-8">
                  <div>
                    <h2 className="text-lg font-bold text-[#0D1B2A] dark:text-white">Task State Distribution</h2>
                    <p className="text-xs text-[#2F3E46] dark:text-white/60">Current workflow stages and feature counts across all tasks</p>
                  </div>

                  <div className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-tr-3xl rounded-bl-3xl shadow-xl overflow-hidden transition-colors duration-300">
                    <div className="hidden md:block overflow-x-auto hide-scrollbar">
                      <table className="w-full text-sm text-left border-collapse whitespace-nowrap">
                        <thead>
                          <tr className="border-b border-black/10 dark:border-white/10 text-xs text-[#2F3E46] dark:text-white/60 bg-black/5 dark:bg-white/5">
                            <th className="py-4 px-5 font-medium">State</th>
                            <th className="py-4 px-5 font-medium text-center">Task Count</th>
                            <th className="py-4 px-5 font-medium text-center">Building Count</th>
                            <th className="py-4 px-5 font-medium text-center">Feature Count</th>
                            <th className="py-4 px-5 font-medium text-right">Area (km²)</th>
                          </tr>
                        </thead>
                        <tbody className="text-[#0D1B2A] dark:text-white">
                          {taskStates.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-12 text-center text-[#2F3E46] dark:text-white/60">
                                No task state metrics available.
                              </td>
                            </tr>
                          ) : (
                            taskStates.map((state: any, index: number) => {
                              const meta = getStateMeta(state.state_title);
                              return (
                                <tr key={index} className="border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
                                  <td className="py-4 px-5 font-semibold flex items-center gap-2">
                                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold border ${meta.bg} ${meta.color} ${meta.border}`}>
                                      {meta.label}
                                    </span>
                                  </td>
                                  <td className="py-4 px-5 text-center font-mono text-xs">
                                    {state.task_count?.toLocaleString() ?? 0}
                                  </td>
                                  <td className="py-4 px-5 text-center font-mono text-xs">
                                    {state.building_num?.toLocaleString() ?? 0}
                                  </td>
                                  <td className="py-4 px-5 text-center font-mono text-xs">
                                    {state.feature_count?.toLocaleString() ?? 0}
                                  </td>
                                  <td className="py-4 px-5 text-right font-mono text-xs text-[#2F3E46] dark:text-white/80">
                                    {state.task_area_km2 ? Number(state.task_area_km2).toFixed(4) : "0.0000"}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Task States View */}
                    <div className="md:hidden flex flex-col gap-3 p-4">
                      {taskStates.length === 0 ? (
                        <div className="py-8 text-center text-[#2F3E46] dark:text-white/60 text-sm">
                          No task state metrics available.
                        </div>
                      ) : (
                        taskStates.map((state: any, index: number) => {
                          const meta = getStateMeta(state.state_title);
                          return (
                            <div key={index} className="bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-xl p-4 flex flex-col gap-3">
                              <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-3">
                                <span className={`inline-flex items-center rounded px-2.5 py-1 text-xs font-bold border ${meta.bg} ${meta.color} ${meta.border}`}>
                                  {meta.label}
                                </span>
                                <div className="text-right">
                                  <span className="text-[10px] text-[#2F3E46] dark:text-white/60 block mb-0.5 uppercase tracking-wider font-bold">Area (km²)</span>
                                  <span className="font-mono text-sm font-bold text-[#0D1B2A] dark:text-white">{state.task_area_km2 ? Number(state.task_area_km2).toFixed(4) : "0.0000"}</span>
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="text-center bg-black/5 dark:bg-white/5 rounded-lg py-2">
                                  <div className="text-[10px] text-[#2F3E46] dark:text-white/60 uppercase tracking-wider mb-0.5">Tasks</div>
                                  <div className="font-mono text-sm font-bold text-[#0D1B2A] dark:text-white">{state.task_count?.toLocaleString() ?? 0}</div>
                                </div>
                                <div className="text-center bg-black/5 dark:bg-white/5 rounded-lg py-2">
                                  <div className="text-[10px] text-[#2F3E46] dark:text-white/60 uppercase tracking-wider mb-0.5">Buildings</div>
                                  <div className="font-mono text-sm font-bold text-[#0D1B2A] dark:text-white">{state.building_num?.toLocaleString() ?? 0}</div>
                                </div>
                                <div className="text-center bg-black/5 dark:bg-white/5 rounded-lg py-2">
                                  <div className="text-[10px] text-[#2F3E46] dark:text-white/60 uppercase tracking-wider mb-0.5">Features</div>
                                  <div className="font-mono text-sm font-bold text-[#0D1B2A] dark:text-white">{state.feature_count?.toLocaleString() ?? 0}</div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

              </div>
            )}

          </div>
        )}
    </div>
  );
}
