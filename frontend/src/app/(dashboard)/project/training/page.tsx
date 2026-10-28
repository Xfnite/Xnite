"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOnboardingProgress, BASIC_VIDEO_ITEMS_UI, ADVANCED_ITEMS_UI } from "@/components/Onboarding/useOnboardingProgress";
import TrainingModuleCard from "@/components/Onboarding/TrainingModuleCard";

import { LandCoverTrainingModal } from "@/components/Project/LandCoverTrainingModal";
import { syncUserTrainingsAction } from "@/app/actions/project";

const GINGER_BASE = process.env.NEXT_PUBLIC_GINGER_API_URL || "https://ginger.bitmappro.com";

export default function TrainingPage() {
  const [trainings, setTrainings] = useState<any[]>([]);
  const [isTrainingsLoading, setIsTrainingsLoading] = useState(true);
  const [trainingsError, setTrainingsError] = useState("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<any>(null);
  const [selectedTrainingProject, setSelectedTrainingProject] = useState<any>(null);
  const [landCoverModalOpen, setLandCoverModalOpen] = useState(false);
  const [selectedTrainingCourse, setSelectedTrainingCourse] = useState<any>(null);
  const pathname = usePathname();

  const { progress, markModuleVideoProgress, markSubItemOpened } = useOnboardingProgress();

  const getModuleForProject = (subProjectName: string) => {
    if (subProjectName?.toLowerCase().includes("advanced") || subProjectName?.toLowerCase().includes("3d")) {
      return {
        moduleDef: { id: "videos-3d", step: 4, tag: "Step 04", title: "3D & Multilayer", description: "Advanced techniques.", variant: "video-3d" },
        videos: ADVANCED_ITEMS_UI
      };
    }
    return {
      moduleDef: { id: "videos-basic", step: 3, tag: "Step 03", title: "Basic Labeling", description: "Learn the basics.", variant: "video-basic" },
      videos: BASIC_VIDEO_ITEMS_UI
    };
  };

  const startTraining = async (training: any) => {
    try {
      const projectId = training.annotate_project_id || training.annotate_sub_project_id;
      if (!projectId) {
        toast.error("Project ID is missing");
        return;
      }
      setIsUpdatingStatus(projectId);



      const response = await fetch(`/api/ginger/bac/mapping/annotate/training-annotate/update-user-training-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          annotate_project_id: projectId,
          is_active: 1, // Start training
        }),
      });

      const result = await response.json();
      const isSuccess = result.code === 0 || result.state === 0 || result.status === 'success' || (result.msg && result.msg.toLowerCase().includes('success'));

      if (response.ok && isSuccess) {
        toast.success(`Training started!`);
        fetchTrainings();
        setSelectedTrainingProject(null);

        const name = (training.annotate_sub_project_name || training.annotate_name || "").toLowerCase();
        const isLandCover = name.includes("land cover") || name.includes("landcover");

        if (isLandCover) {
          setShowGingerModal(true);
        } else {
          window.open(`${GINGER_BASE}/annotate/${projectId}`, '_blank');
        }
      } else {
        toast.error(`Failed to start training`, {
          description: result.error || result.msg || 'Unknown error',
        });
      }
    } catch (err) {
      toast.error(`Error starting training: ${err}`);
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>('asc');
  const [showGingerModal, setShowGingerModal] = useState(false);

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  const fetchTrainings = async () => {
    setIsTrainingsLoading(true);
    setTrainingsError("");
    try {
      const scrapedData = localStorage.getItem('scrapedGingerData');
      const parsed = scrapedData ? JSON.parse(scrapedData) : null;
      const token = parsed?.credential?.access_token;

      if (!token) {
        setTrainingsError("Unauthorized: Missing access token");
        setIsTrainingsLoading(false);
        return;
      }

      const response = await fetch(`/api/ginger/bac/mapping/annotate/training-annotate/list-ongoing-projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ region: "phi" }),
      });

      const result = await response.json();

      if (response.ok) {
        const fetchedTrainings = result.training_annotate_list || [];
        setTrainings(fetchedTrainings);
        
        // Sync to database
        const mappedForSync = fetchedTrainings.map((t: any) => ({
          projectId: String(t.annotate_project_id || t.annotate_sub_project_id || ""),
          name: t.annotate_sub_project_name || "",
          projectStatus: t.is_online === 1 ? "Running" : "Closed",
          trainingStatus: t.training_status_desc || "",
          passedTask: Number(t.passed_task_num ?? 0),
          totalTask: Number(t.total_task ?? 0),
        }));
        syncUserTrainingsAction(mappedForSync);
      } else {
        setTrainingsError(result.error || "Failed to load trainings");
      }
    } catch (err) {
      setTrainingsError("Unable to load training modules. Please check your connection or try again later.");
    } finally {
      setIsTrainingsLoading(false);
    }
  };

  const toggleTrainingStatus = async (training: any) => {
    let nextActive = 0;
    if (training.is_active !== undefined) {
      nextActive = training.is_active === 1 ? 0 : 1;
    } else {
      nextActive = 1;
    }
    const projectId = training.annotate_project_id || training.annotate_sub_project_id;

    setIsUpdatingStatus(projectId);
    try {
      const scrapedData = localStorage.getItem('scrapedGingerData');
      const parsed = scrapedData ? JSON.parse(scrapedData) : null;
      const token = parsed?.credential?.access_token;

      if (!token) {
        toast.error("Unauthorized: Missing access token");
        setIsUpdatingStatus(null);
        return;
      }

      const response = await fetch(`/api/ginger/bac/mapping/annotate/training-annotate/update-user-training-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          annotate_project_id: projectId,
          is_active: nextActive,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        const isSuccess = result.code === 0 || result.state === 0 || result.status === 'success' || (result.msg && result.msg.toLowerCase().includes('success'));
        if (!isSuccess) {
          toast.error(result.msg || "Failed to update training status");
        } else {
          toast.success(`Training status updated successfully!`);
          fetchTrainings();
          if (nextActive === 1 && projectId !== 1) {
            window.open(`${GINGER_BASE}/annotate/${projectId}`, '_blank');
          }
        }
      } else {
        toast.error(`Failed to update status`, {
          description: result.error || 'Unknown error',
        });
      }
    } catch (err) {
      toast.error("An unexpected error occurred while updating training status.");
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  useEffect(() => {
    fetchTrainings();
  }, []);

  const sortedTrainings = useMemo(() => {
    if (!sortDirection) return trainings;
    return [...trainings].sort((a: any, b: any) => {
      const idA = String(a.annotate_project_id || a.annotate_sub_project_id || "");
      const idB = String(b.annotate_project_id || b.annotate_sub_project_id || "");
      if (sortDirection === 'asc') {
        return idA.localeCompare(idB, undefined, { numeric: true, sensitivity: 'base' });
      } else {
        return idB.localeCompare(idA, undefined, { numeric: true, sensitivity: 'base' });
      }
    });
  }, [trainings, sortDirection]);

  const totalItems = sortedTrainings.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const activePage = Math.min(currentPage, totalPages);
  const paginatedTrainings = sortedTrainings.slice((activePage - 1) * pageSize, activePage * pageSize);

  const isTrainingActive = (training: any) => {
    if (training.training_status_desc === 'STATUS_PASSED') return false;
    return training.is_active === 1 || (training.is_active === undefined && training.training_status_desc !== 'Frozen' && training.training_status_desc !== 'Unregistered');
  };

  const hasActiveTraining = trainings.some(t => isTrainingActive(t));

  return (
    <div className="relative w-full min-h-full">
      {/* Mesh Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute bg-[#55f761] filter blur-[100px] rounded-full opacity-30 dark:opacity-15" style={{ width: '40vw', height: '40vw', top: '-10%', left: '-10%' }}></div>
        <div className="absolute bg-[#1F7A1F] filter blur-[100px] rounded-full opacity-30 dark:opacity-15" style={{ width: '50vw', height: '50vw', top: '40%', right: '-20%' }}></div>
      </div>

      <div className="relative z-10 space-y-6 w-full max-w-5xl mx-auto pt-4 pb-12">
        <section>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#0D1B2A] dark:text-white mb-1 inline-flex items-center gap-4">
            Training
          </h1>
          {/* <p className="text-sm text-[#2F3E46] dark:text-white/60">
            Manage and view your active annotation deployments and training progress.
          </p> */}
        </section>

        {/* Tab Navigation */}
        <div className="flex gap-2 my-6 overflow-x-auto hide-scrollbar">
          <Link
            href="/project"
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-full transition-all duration-300 ${pathname === "/project"
              ? "bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] shadow-md shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20"
              : "bg-black/5 dark:bg-white/5 text-[#2F3E46] dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
              }`}
          >
            Active Projects
          </Link>
          {/* <Link
            href="/project/training"
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-full transition-all duration-300 ${pathname === "/project/training"
              ? "bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] shadow-md shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20"
              : "bg-black/5 dark:bg-white/5 text-[#2F3E46] dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
              }`}
          >
            Training
          </Link> */}
          <Link
            href="/project/task-summary"
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-full transition-all duration-300 ${pathname === "/project/task-summary"
              ? "bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] shadow-md shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20"
              : "bg-black/5 dark:bg-white/5 text-[#2F3E46] dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
              }`}
          >
            Task Summary
          </Link>
        </div>

        {/* Trainings Table */}
        <section className="w-full space-y-3">
          <div>
            <h2 className="text-lg font-bold text-[#0D1B2A] dark:text-white">Training</h2>
            <p className="text-xs text-[#2F3E46] dark:text-white/60">Your ongoing and completed annotation training deployments</p>
          </div>

          <div className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-tr-3xl rounded-bl-3xl shadow-xl overflow-hidden transition-colors duration-300">
            {trainingsError && (
              <div className="p-4 bg-red-500/10 border-b border-red-500/20 text-red-600 dark:text-red-400 text-sm">
                {trainingsError}
              </div>
            )}

            <div className="overflow-x-auto hide-scrollbar">
              <table className="w-full text-sm text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="border-b border-black/10 dark:border-white/10 text-xs text-[#2F3E46] dark:text-white/60 bg-black/5 dark:bg-white/5">
                    <th
                      className="py-4 px-5 font-medium cursor-pointer select-none hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-colors group/sort"
                      onClick={() => {
                        setSortDirection(prev => {
                          if (prev === 'asc') return 'desc';
                          if (prev === 'desc') return null;
                          return 'asc';
                        });
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        Project ID
                        <span className="text-[#2F3E46]/40 dark:text-white/30 group-hover/sort:text-[#1F7A1F] dark:group-hover/sort:text-[#55f761] transition-colors">
                          {sortDirection === 'asc' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7" /><path d="M12 5v14" /></svg>
                          ) : sortDirection === 'desc' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m19 12-7 7-7-7" /><path d="M12 19V5" /></svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21 16-4 4-4-4" /><path d="M17 20V4" /><path d="m3 8 4-4 4 4" /><path d="M7 4v16" /></svg>
                          )}
                        </span>
                      </div>
                    </th>
                    <th className="py-4 px-5 font-medium">Name</th>
                    <th className="py-4 px-5 font-medium">Project Status</th>
                    <th className="py-4 px-5 font-medium">Training Status</th>
                    <th className="py-4 px-5 font-medium">Passed Task</th>
                    <th className="py-4 px-5 font-medium">Total Task</th>
                    <th className="py-4 px-5 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="text-[#0D1B2A] dark:text-white">
                  {isTrainingsLoading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-[#2F3E46] dark:text-white/60">
                        <div className="flex flex-col items-center justify-center">
                          <div className="w-6 h-6 border-2 border-[#1F7A1F] border-t-transparent rounded-full animate-spin mb-2"></div>
                          Loading trainings...
                        </div>
                      </td>
                    </tr>
                  ) : trainings.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-[#2F3E46] dark:text-white/60">
                        No training projects found.
                      </td>
                    </tr>
                  ) : (
                    paginatedTrainings.map((training: any, index: number) => (
                      <tr key={index} className="border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
                        <td className="py-4 px-5 font-medium">
                          {training.annotate_project_id || training.annotate_sub_project_id}
                        </td>
                        <td className="py-4 px-5 font-semibold">
                          {training.annotate_sub_project_name}
                        </td>
                        <td className="py-4 px-5">
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <span className={`h-2.5 w-2.5 rounded-full ${training.is_online === 1 ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                            {training.is_online === 1 ? 'Online' : 'Offline'}
                          </span>
                        </td>
                        <td className="py-4 px-5">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${training.training_status_desc === 'STATUS_PASSED' ? 'bg-[#1F7A1F]/10 text-[#1F7A1F] dark:text-[#55f761]' : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'}`}>
                            {training.training_status_desc === 'STATUS_PASSED' ? 'Passed' : (
                              training.training_status_desc === 'Frozen' ? 'Closed' : (training.training_status_desc || 'Training')
                            )}
                          </span>
                        </td>
                        <td className="py-4 px-5 font-mono text-xs text-[#2F3E46] dark:text-white/80">
                          {training.passed_task_num}
                        </td>
                        <td className="py-4 px-5 font-mono text-xs text-[#2F3E46] dark:text-white/80">
                          {training.total_task}
                        </td>
                        <td className="py-4 px-5 text-right">
                          <div className="flex items-center justify-end gap-2">

                            {training.training_status_desc !== 'STATUS_PASSED' && (() => {
                              const isActive = isTrainingActive(training);
                              const isDisabled = isUpdatingStatus === (training.annotate_project_id || training.annotate_sub_project_id) || (hasActiveTraining && !isActive);
                              
                              return (
                                <button
                                  onClick={() => toggleTrainingStatus(training)}
                                  disabled={isDisabled}
                                  title={hasActiveTraining && !isActive ? "Another training is currently active" : ""}
                                  className={`inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-bold text-white transition-all shadow-md hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 ${
                                    isActive
                                      ? "bg-red-500 hover:bg-red-600 dark:bg-red-500 dark:hover:bg-red-600" 
                                      : "bg-blue-500 hover:bg-blue-600 dark:bg-blue-500 dark:hover:bg-blue-600"
                                  }`}
                                >
                                  {isUpdatingStatus === (training.annotate_project_id || training.annotate_sub_project_id) ? (
                                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                  ) : (
                                    isActive ? (
                                      <>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
                                        Close
                                      </>
                                    ) : (
                                      <>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                        {training.training_status_desc === 'Unregistered' ? 'Register' : 'Reopen'}
                                      </>
                                    )
                                  )}
                                </button>
                              );
                            })()}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {totalItems > 10 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-3 px-5 border-t border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#2F3E46] dark:text-white/60">Show</span>
                  <select
                    value={pageSize}
                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                    className="bg-white/80 dark:bg-[#060D14] border border-black/10 dark:border-white/10 rounded-lg px-2 py-1 text-xs text-[#0D1B2A] dark:text-white focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761]"
                  >
                    <option value={10}>10</option>
                    <option value={30}>30</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span className="text-xs text-[#2F3E46] dark:text-white/60">items per page</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={activePage === 1}
                    className="p-1.5 rounded-lg border border-black/10 dark:border-white/10 text-[#2F3E46] dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent transition-all"
                    title="First Page"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" /></svg>
                  </button>

                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={activePage === 1}
                    className="p-1.5 rounded-lg border border-black/10 dark:border-white/10 text-[#2F3E46] dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent transition-all"
                    title="Previous Page"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>

                  <span className="text-xs font-semibold px-3 text-[#0D1B2A] dark:text-white">
                    Page {activePage} of {totalPages}
                  </span>

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={activePage === totalPages}
                    className="p-1.5 rounded-lg border border-black/10 dark:border-white/10 text-[#2F3E46] dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent transition-all"
                    title="Next Page"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>

                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={activePage === totalPages}
                    className="p-1.5 rounded-lg border border-black/10 dark:border-white/10 text-[#2F3E46] dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent transition-all"
                    title="Last Page"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" /></svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
        {/* Training Modal */}
        {selectedTrainingProject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="bg-white/90 dark:bg-[#060D14]/90 backdrop-blur-2xl rounded-tr-3xl rounded-bl-3xl w-full max-w-4xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10">
                <h2 className="text-lg font-bold text-[#0D1B2A] dark:text-white">Training Module</h2>
                <button onClick={() => setSelectedTrainingProject(null)} className="text-[#2F3E46]/50 hover:text-[#0D1B2A] dark:text-white/50 dark:hover:text-white transition-colors bg-black/5 dark:bg-white/5 p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-0 bg-white dark:bg-[#0D1B2A]">
                {(() => {
                  const moduleData = getModuleForProject(selectedTrainingProject.annotate_sub_project_name);
                  if (!moduleData.moduleDef) return <div className="p-6">Module not found</div>;
                  return (
                    <div className="w-full h-full p-2">
                      <TrainingModuleCard
                        stepId={moduleData.moduleDef.id}
                        step={moduleData.moduleDef.step}
                        tag={moduleData.moduleDef.tag}
                        title={moduleData.moduleDef.title}
                        description={moduleData.moduleDef.description}
                        variant={moduleData.moduleDef.variant as any}
                        videoItems={moduleData.videos}
                        isCompleted={true}
                        isLocked={false}
                        onComplete={() => {}}
                        onSubItemOpen={(itemId) => markSubItemOpened(moduleData.moduleDef.id, itemId)}
                        onVideoProgress={(itemId, percent) => markModuleVideoProgress(moduleData.moduleDef.id, itemId, percent)}
                      />
                    </div>
                  );
                })()}
              </div>

              {/* Modal Footer */}
              <div className="border-t border-black/10 dark:border-white/10 p-5 flex justify-end gap-4 bg-black/5 dark:bg-white/5">
                <button
                  onClick={() => setSelectedTrainingProject(null)}
                  className="rounded-xl px-6 py-2.5 text-sm font-medium text-[#2F3E46] dark:text-white/80 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                >
                  Close
                </button>
                {(() => {
                  const isCurrentActive = isTrainingActive(selectedTrainingProject);
                  const isStartDisabled = isUpdatingStatus === (selectedTrainingProject.annotate_project_id || selectedTrainingProject.annotate_sub_project_id) || (hasActiveTraining && !isCurrentActive);
                  
                  return (
                    <button 
                      onClick={() => startTraining(selectedTrainingProject)}
                      disabled={isStartDisabled}
                      title={hasActiveTraining && !isCurrentActive ? "Another training is currently active" : ""}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1F7A1F] hover:bg-[#145214] dark:bg-[#55f761] dark:hover:bg-[#3de34a] px-8 py-2.5 text-sm font-bold text-white dark:text-[#060D14] transition-all shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100"
                    >
                      {isUpdatingStatus === (selectedTrainingProject.annotate_project_id || selectedTrainingProject.annotate_sub_project_id) ? "Starting..." : "Start Training"}
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                    </button>
                  );
                })()}
              </div>
            </div>
            {/* Land Cover Training Modal */}
      <LandCoverTrainingModal
        isOpen={landCoverModalOpen}
        training={selectedTrainingCourse}
        onClose={() => setLandCoverModalOpen(false)}
        onComplete={() => {
          setLandCoverModalOpen(false);
          setSelectedTrainingProject(selectedTrainingCourse);
        }}
      />
    </div>
        )}

      {showGingerModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#060D14] rounded-2xl w-full max-w-md shadow-2xl border border-black/10 dark:border-white/10 flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex justify-between items-center bg-[#E0E1DD]/30 dark:bg-[#0D1B2A]/30">
              <h3 className="text-lg font-bold text-[#0D1B2A] dark:text-white">Training Started</h3>
              <button onClick={() => setShowGingerModal(false)} className="p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <div className="p-6">
              <p className="text-[#2F3E46] dark:text-white/80">You may now open your Ginger software and download the available tasks to begin your Landcover Training.</p>
            </div>
            <div className="border-t border-black/10 dark:border-white/10 p-4 flex justify-end bg-black/5 dark:bg-white/5">
              <button onClick={() => setShowGingerModal(false)} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] font-bold shadow-lg shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20 hover:scale-105 active:scale-95 transition-all">OK</button>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}
