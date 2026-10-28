"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useOnboardingProgress, BASIC_VIDEO_ITEMS_UI, ADVANCED_ITEMS_UI } from "@/components/Onboarding/useOnboardingProgress";
import TrainingModuleCard from "@/components/Onboarding/TrainingModuleCard";
import { getSessionUser, forceGingerLoginAction, markLandCoverTrainingClickedAction, markTransportationTrainingClickedAction, updateActiveProjectsTutorialProgressAction } from "@/app/actions/auth";
import { LandCoverTrainingModal } from "@/components/Project/LandCoverTrainingModal";
import { TransportationTrainingModal } from "@/components/Project/TransportationTrainingModal";
import { RoofTrainingModal } from "@/components/Project/RoofTrainingModal";
import { GuidesLibraryModal } from "@/components/Project/GuidesLibraryModal";
import { syncUserTrainingsAction, cacheGingerDataAction, getCachedGingerDataAction, backupUserProjectsAction, getUserProjectsFromDbAction, getUserTrainingsFromDbAction } from "@/app/actions/project";
import { toUserFacingError } from "@/lib/userFacingError";

const GINGER_BASE = process.env.NEXT_PUBLIC_GINGER_API_URL || "https://ginger.bitmappro.com";

const CubeLoader = () => (
  <div className="cube-loader-wrapper my-8">
    <div className="cube-loader">
      <div className="cube-top" />
      <div className="cube-wrapper">
        <span style={{ '--i': 0 } as React.CSSProperties} className="cube-span">
          <img src="/logo/Logo-mobile.svg" alt="logo" className="cube-logo" />
        </span>
        <span style={{ '--i': 1 } as React.CSSProperties} className="cube-span">
          <img src="/logo/Logo-mobile.svg" alt="logo" className="cube-logo" />
        </span>
        <span style={{ '--i': 2 } as React.CSSProperties} className="cube-span">
          <img src="/logo/Logo-mobile.svg" alt="logo" className="cube-logo" />
        </span>
        <span style={{ '--i': 3 } as React.CSSProperties} className="cube-span">
          <img src="/logo/Logo-mobile.svg" alt="logo" className="cube-logo" />
        </span>
      </div>
    </div>
    <style>{`
      .cube-loader-wrapper {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        padding: 2rem 0;
      }
      .cube-loader {
        position: relative;
        width: 75px;
        height: 75px;
        transform-style: preserve-3d;
        transform: rotateX(-30deg);
        animation: cubeAnimate 4s linear infinite;
      }
      @keyframes cubeAnimate {
        0% { transform: rotateX(-30deg) rotateY(0); }
        100% { transform: rotateX(-30deg) rotateY(360deg); }
      }
      .cube-loader .cube-wrapper {
        position: absolute;
        width: 100%;
        height: 100%;
        transform-style: preserve-3d;
      }
      .cube-loader .cube-wrapper .cube-span {
        position: absolute;
        width: 100%;
        height: 100%;
        transform: rotateY(calc(90deg * var(--i))) translateZ(37.5px);
        background: linear-gradient(to bottom, #112338 0%, #1F7A1F 50%, #55f761 100%);
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .cube-logo {
        width: 45px;
        height: 45px;
        object-fit: contain;
        opacity: 0.9;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));
      }
      .cube-top {
        position: absolute;
        width: 75px;
        height: 75px;
        background: #112338;
        transform: rotateX(90deg) translateZ(37.5px);
        transform-style: preserve-3d;
      }
    `}</style>
  </div>
);

export function ActiveProjectsTab({
  setActiveTab,
  walkthroughStep = -1,
  setWalkthroughStep = () => { },
  isRulesCompleted = false
}: {
  setActiveTab: (tab: "active" | "performance" | "summary" | "rules") => void;
  walkthroughStep?: number;
  setWalkthroughStep?: (step: number) => void;
  isRulesCompleted?: boolean | null;
}) {
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [tutProgress, setTutProgress] = useState<Record<string, any>>({});
  const isManualNavigating = useRef(false);

  const updateTutorialProgress = (updates: Record<string, any>) => {
    setTutProgress(prev => ({ ...prev, ...updates }));
    updateActiveProjectsTutorialProgressAction(updates);
  };
  const [error, setError] = useState("");

  const [selectedRegisterProject, setSelectedRegisterProject] = useState<any>(null);
  const [isRegistering, setIsRegistering] = useState(false);


  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>('desc');

  const [trainings, setTrainings] = useState<any[]>([]);
  const [isTrainingsLoading, setIsTrainingsLoading] = useState(true);
  const [trainingsError, setTrainingsError] = useState("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<any>(null);
  const [selectedTrainingProject, setSelectedTrainingProject] = useState<any>(null);
  const [successModalData, setSuccessModalData] = useState<{ type: 'project' | 'training', isOpen: boolean } | null>(null);

  const [trainingSortDirection, setTrainingSortDirection] = useState<'asc' | 'desc' | null>('asc');
  const [landCoverModalOpen, setLandCoverModalOpen] = useState(false);
  const [transportationModalOpen, setTransportationModalOpen] = useState(false);
  const [roofModalOpen, setRoofModalOpen] = useState(false);
  const [guidesLibraryModalOpen, setGuidesLibraryModalOpen] = useState(false);
  const [guidesLibraryType, setGuidesLibraryType] = useState<"landcover" | "transportation" | "roof" | null>(null);
  const [selectedTrainingCourse, setSelectedTrainingCourse] = useState<any>(null);
  const [hasClickedLandCover, setHasClickedLandCover] = useState(false);
  const [hasClickedTransportation, setHasClickedTransportation] = useState(false);
  const [hasClickedRoof, setHasClickedRoof] = useState(false);
  const [hadProjectBefore, setHadProjectBefore] = useState(false);
  const [pendingModalAction, setPendingModalAction] = useState<(() => void) | null>(null);

  const [showStartActiveProjectsWalkthrough, setShowStartActiveProjectsWalkthrough] = useState(false);
  const [walkthroughCooldown, setWalkthroughCooldown] = useState(5);
  const [maxWalkthroughStep, setMaxWalkthroughStep] = useState(-1);

  useEffect(() => {
    if (walkthroughStep >= 0) {
      if (walkthroughStep <= maxWalkthroughStep) {
        setWalkthroughCooldown(0);
      } else {
        setMaxWalkthroughStep(walkthroughStep);
        setWalkthroughCooldown(5);
        const interval = setInterval(() => {
          setWalkthroughCooldown((prev) => {
            if (prev <= 1) {
              clearInterval(interval);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        return () => clearInterval(interval);
      }
    }
  }, [walkthroughStep, maxWalkthroughStep]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("trigger_projects_start=true")) {
      updateTutorialProgress({ active_projects_start_walkthrough_completed: false });
      setShowStartActiveProjectsWalkthrough(true);
    }
  }, []);

  const isLandCoverPassed = useMemo(() => {
    if (!trainings || trainings.length === 0) return false;
    return trainings.some(t => {
      const name = (t.annotate_sub_project_name || t.annotate_name || "").toLowerCase();
      const isLandCover = name.includes("land cover") || name.includes("landcover");
      const rawStatus = (t.training_status_desc || "").trim().toLowerCase();
      const isPassed = rawStatus.includes("pass") || rawStatus === "status_passed";
      return isLandCover && isPassed;
    });
  }, [trainings]);

  const isTransportationPassed = useMemo(() => {
    if (!trainings || trainings.length === 0) return false;
    return trainings.some(t => {
      const name = (t.annotate_sub_project_name || t.annotate_name || "").toLowerCase();
      const isTransportation = name.includes("transportation") || name.includes("transport");
      const rawStatus = (t.training_status_desc || "").trim().toLowerCase();
      const isPassed = rawStatus.includes("pass") || rawStatus === "status_passed";
      return isTransportation && isPassed;
    });
  }, [trainings]);

  const isLandCoverOngoing = useMemo(() => {
    if (!trainings || trainings.length === 0) return false;
    return trainings.some(t => {
      const name = (t.annotate_sub_project_name || t.annotate_name || "").toLowerCase();
      const isLandCover = name.includes("land cover") || name.includes("landcover");
      return isLandCover && t.is_active === 1;
    });
  }, [trainings]);

  const isTransportationOngoing = useMemo(() => {
    if (!trainings || trainings.length === 0) return false;
    return trainings.some(t => {
      const name = (t.annotate_sub_project_name || t.annotate_name || "").toLowerCase();
      const isTransportation = name.includes("transportation") || name.includes("transport");
      return isTransportation && t.is_active === 1;
    });
  }, [trainings]);

  const isRoofPassed = useMemo(() => {
    if (!trainings || trainings.length === 0) return false;
    return trainings.some(t => {
      const name = (t.annotate_sub_project_name || t.annotate_name || "").toLowerCase();
      const isRoof = name.includes("roof");
      const rawStatus = (t.training_status_desc || "").trim().toLowerCase();
      const isPassed = rawStatus.includes("pass") || rawStatus === "status_passed";
      return isRoof && isPassed;
    });
  }, [trainings]);

  const isRoofOngoing = useMemo(() => {
    if (!trainings || trainings.length === 0) return false;
    return trainings.some(t => {
      const name = (t.annotate_sub_project_name || t.annotate_name || "").toLowerCase();
      const isRoof = name.includes("roof");
      return isRoof && t.is_active === 1;
    });
  }, [trainings]);

  const hasGroupOrTeam = useMemo(() => {
    let gId = currentUser?.group_id;
    let tId = currentUser?.team_id;

    if ((gId === null || gId === undefined) && typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("scrapedGingerData");
        const parsed = raw ? JSON.parse(raw) : null;
        const fallbackGId = parsed?.koala_user_details?.group_id || parsed?.group_id || parsed?.data?.koala_user_details?.group_id || parsed?.data?.group_id;
        const fallbackTId = parsed?.koala_user_details?.team_id || parsed?.team_id || parsed?.data?.koala_user_details?.team_id || parsed?.data?.team_id;
        if (fallbackGId !== undefined && fallbackGId !== null) gId = fallbackGId;
        if (fallbackTId !== undefined && fallbackTId !== null) tId = fallbackTId;
      } catch (e) {
        // ignore
      }
    }

    const validGroup = gId !== null && gId !== undefined && gId !== 0 && gId !== -1 && gId !== "";
    const validTeam = tId !== null && tId !== undefined && tId !== 0 && tId !== -1 && tId !== "";
    return validGroup || validTeam;
  }, [currentUser]);

  const hasAutoOpenedRef = useRef({ landCover: false, transportation: false });

  useEffect(() => {
    if (trainings.length > 0 && isRulesCompleted) {
      // Always show congratulatory popup if walkthrough is finished and trainings are passed
      if (walkthroughStep === -1 && isLandCoverPassed && isRoofPassed && isTransportationPassed) {
        const isDone = tutProgress?.active_projects_start_walkthrough_completed === true;
        if (!isDone) {
          setShowStartActiveProjectsWalkthrough(true);
        }
      }

      // Fallback interval to ensure it pops up even if React missed a state update
      const fallbackTimer = setInterval(() => {
        if (walkthroughStep === -1 && isLandCoverPassed && isRoofPassed && isTransportationPassed) {
          setTutProgress(prev => {
            if (prev?.active_projects_start_walkthrough_completed !== true) {
              setShowStartActiveProjectsWalkthrough(true);
            }
            return prev;
          });
        }
      }, 1000);

      if (isManualNavigating.current) {
        return () => clearInterval(fallbackTimer);
      }
      if (walkthroughStep === -1 || walkthroughStep === 2 || walkthroughStep === 3 || walkthroughStep === 4) {
        const lcOpened = tutProgress.tut_lc_opened === true || (isLandCoverOngoing && tutProgress.tut_lc_closed !== true);
        const lcClosed = tutProgress.tut_lc_closed === true;
        const roofOpened = tutProgress.tut_roof_opened === true || (isRoofOngoing && tutProgress.tut_roof_closed !== true);
        const roofClosed = tutProgress.tut_roof_closed === true;
        const tsOpened = tutProgress.tut_ts_opened === true || (isTransportationOngoing && tutProgress.tut_ts_closed !== true);
        const tsClosed = tutProgress.tut_ts_closed === true;

        if (!isRoofPassed) {
          if (roofOpened) {
            if (walkthroughStep !== -1) setWalkthroughStep(-1);
          } else {
            if (walkthroughStep !== 2) setWalkthroughStep(2);
          }
        } else if (!isLandCoverPassed) {
          if (lcOpened) {
            if (walkthroughStep !== -1) setWalkthroughStep(-1);
          } else {
            if (walkthroughStep !== 3) setWalkthroughStep(3);
          }
        } else if (!isTransportationPassed) {
          if (tsOpened) {
            if (walkthroughStep !== -1) setWalkthroughStep(-1);
          } else {
            if (walkthroughStep !== 4) setWalkthroughStep(4);
          }
        } else {
          if (walkthroughStep === 2 || walkthroughStep === 3 || walkthroughStep === 4) {
            setWalkthroughStep(-1);
          }
        }
      }
      return () => clearInterval(fallbackTimer);
    }
  }, [trainings, isLandCoverPassed, isRoofPassed, isTransportationPassed, walkthroughStep, isRulesCompleted, tutProgress]);

  const completeStartActiveProjectsWalkthrough = () => {
    updateTutorialProgress({ active_projects_start_walkthrough_completed: true });
    setShowStartActiveProjectsWalkthrough(false);
  };

  useEffect(() => {
    getSessionUser().then((user) => {
      if (user) {
        setCurrentUser(user);
        setHasClickedLandCover(!!user.hasClickedLandCoverTraining);
        setHasClickedTransportation(!!user.hasClickedTransportationTraining);
        setHadProjectBefore(!!(user as any).hadProjectBefore);
        const progress = (user as any).activeProjectsTutorialProgress || {};
        setHasClickedRoof(!!progress.hasClickedRoofTraining);
        setTutProgress(progress);
      }
    });
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const registerType = params.get("register");
      if (registerType === "landcover") {
        setLandCoverModalOpen(true);
        const newUrl = window.location.pathname;
        window.history.replaceState({ path: newUrl }, "", newUrl);
      } else if (registerType === "transportation") {
        setTransportationModalOpen(true);
        const newUrl = window.location.pathname;
        window.history.replaceState({ path: newUrl }, "", newUrl);
      } else if (registerType === "roof") {
        setRoofModalOpen(true);
        const newUrl = window.location.pathname;
        window.history.replaceState({ path: newUrl }, "", newUrl);
      }
    }
  }, []);

  // Auto-mark hasClicked flags for existing users who are already in training/passed status
  // (they registered before this feature was introduced, so they never saw the modal)
  useEffect(() => {
    if (!trainings || trainings.length === 0) return;
    const lcAlreadyActive = trainings.some(t => {
      const name = (t.annotate_sub_project_name || t.annotate_name || "").toLowerCase();
      return (name.includes("land cover") || name.includes("landcover")) &&
        (t.is_active === 1 || t.training_status_desc === "STATUS_PASSED");
    });
    const tsAlreadyActive = trainings.some(t => {
      const name = (t.annotate_sub_project_name || t.annotate_name || "").toLowerCase();
      return (name.includes("transportation") || name.includes("transport")) &&
        (t.is_active === 1 || t.training_status_desc === "STATUS_PASSED");
    });
    const roofAlreadyActive = trainings.some(t => {
      const name = (t.annotate_sub_project_name || t.annotate_name || "").toLowerCase();
      return name.includes("roof") && t.user_state !== -1;
    });
    if (lcAlreadyActive && !hasClickedLandCover) {
      setHasClickedLandCover(true);
      markLandCoverTrainingClickedAction();
    }
    if (tsAlreadyActive && !hasClickedTransportation) {
      setHasClickedTransportation(true);
      markTransportationTrainingClickedAction();
    }
    if (roofAlreadyActive && !hasClickedRoof) {
      setHasClickedRoof(true);
      updateTutorialProgress({ hasClickedRoofTraining: true });
    }
  }, [trainings, hasClickedLandCover, hasClickedTransportation, hasClickedRoof]);

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
        setSuccessModalData({ type: 'training', isOpen: true });

        const name = (training.annotate_sub_project_name || training.annotate_name || "").toLowerCase();
        const isLandCover = name.includes("land cover") || name.includes("landcover");
        const isTransportation = name.includes("transportation") || name.includes("transport");

        if (isLandCover) {
          setWalkthroughStep(-1);
          updateTutorialProgress({ tut_lc_opened: true, tut_lc_closed: false });
        }
        if (isTransportation) {
          setWalkthroughStep(-1);
          updateTutorialProgress({ tut_ts_opened: true, tut_ts_closed: false });
        }

        fetchTrainings();
        setSelectedTrainingProject(null);
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

  const getOrSyncGingerToken = async (): Promise<{ token: string | null; error?: string }> => {
    try {
      const scrapedData = localStorage.getItem('scrapedGingerData');
      const parsed = scrapedData ? JSON.parse(scrapedData) : null;
      if (parsed?.credential?.access_token) {
        return { token: parsed.credential.access_token };
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
        return { token: user.gingerToken };
      }
    } catch (e) {
      console.error("Failed to fetch session user for gingerToken:", e);
    }

    try {
      console.log("No token found in storage or session. Forcing Ginger login...");
      const forceRes = await forceGingerLoginAction();
      if (forceRes.success && forceRes.token) {
        localStorage.setItem(
          "scrapedGingerData",
          JSON.stringify({
            credential: {
              access_token: forceRes.token,
            },
          })
        );
        return { token: forceRes.token };
      }
      let errorMsg = forceRes.error || "Ginger login failed.";
      if (errorMsg.toLowerCase().includes("invalid") || errorMsg.toLowerCase().includes("failed") || errorMsg.toLowerCase().includes("credentials")) {
        errorMsg = "invalid credentials";
      }
      return { token: null, error: errorMsg };
    } catch (e) {
      console.error("Failed to force Ginger login:", e);
      return { token: null, error: toUserFacingError(e, "Ginger login failed. Please try again.") };
    }
  };

  const fetchProjects = async () => {
    setIsLoading(true);
    setError("");
    try {
      const { token, error: tokenError } = await getOrSyncGingerToken();

      if (!token) {
        setError(`Unauthorized: ${tokenError || "Missing access token"}`);
        setIsLoading(false);
        return;
      }

      // 1. Fetch ongoing projects
      let ongoingList: any[] = [];
      let currentOffset = 0;
      const pageSize = 20;
      let totalSize = 0;

      do {
        const listResponse = await fetch(`/api/ginger/bac/mapping/annotate/list-ongoing-projects-for-annotator`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ offset: currentOffset, size: pageSize }),
        });

        const listResult = await listResponse.json();

        if (!listResponse.ok) {
          throw new Error(listResult.error || "Failed to load projects list");
        }

        const items = listResult.ongoing_annotate_list || [];
        ongoingList = [...ongoingList, ...items];
        totalSize = listResult.total_size || 0;

        currentOffset += pageSize;
        
        // Safety break if API returns fewer items than totalSize suggests
        if (items.length === 0) break;
      } while (ongoingList.length < totalSize);

      if (ongoingList.length === 0) {
        setProjects([]);
        cacheGingerDataAction('active_projects', []);
        backupUserProjectsAction([]);
        setIsLoading(false);
        return;
      }

      // 2. Fetch statistics for them (chunked to prevent payload too large)
      const annotateIds = ongoingList.map((p: any) => p.annotate_id);
      let statsList: any[] = [];
      let statsSuccess = true;

      for (let i = 0; i < annotateIds.length; i += 20) {
        const chunk = annotateIds.slice(i, i + 20);
        const statsResponse = await fetch(`/api/ginger/bac/mapping/annotate/list-projects-with-statistics`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ annotate_id_list: chunk }),
        });

        if (statsResponse.ok) {
          const statsResult = await statsResponse.json();
          statsList = [...statsList, ...(statsResult.annotate_list || [])];
        } else {
          statsSuccess = false;
        }
      }

      if (statsSuccess || statsList.length > 0) {
        const merged = ongoingList.map((project: any) => {
          const stats = statsList.find((s: any) => s.annotate_id === project.annotate_id);
          return {
            ...project,
            statistics: stats?.statistics || null
          };
        });
        setProjects(merged);
        cacheGingerDataAction('active_projects', merged);
        backupUserProjectsAction(merged);
        if (typeof window !== 'undefined') {
          localStorage.setItem('xnite_active_project_ids', JSON.stringify(merged.map((p: any) => Number(p.annotate_project_id || p.annotate_id || p.id))));
        }
      } else {
        setProjects(ongoingList);
        cacheGingerDataAction('active_projects', ongoingList);
        backupUserProjectsAction(ongoingList);
        if (typeof window !== 'undefined') {
          localStorage.setItem('xnite_active_project_ids', JSON.stringify(ongoingList.map((p: any) => Number(p.annotate_project_id || p.annotate_id || p.id))));
        }
      }
    } catch (err) {
      const cached = await getCachedGingerDataAction('active_projects');
      if (cached && Array.isArray(cached) && cached.length > 0) {
        setProjects(cached);
      } else {
        const dbRes = await getUserProjectsFromDbAction();
        if (dbRes.success && dbRes.data && dbRes.data.length > 0) {
          setProjects(dbRes.data);
          if (typeof window !== 'undefined') {
            localStorage.setItem('xnite_active_project_ids', JSON.stringify(dbRes.data.map((p: any) => Number(p.projectId))));
          }
        } else {
          setError("Unable to load active projects. Please check your connection or try again later.");
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTrainings = async () => {
    setIsTrainingsLoading(true);
    setTrainingsError("");
    try {
      const { token, error: tokenError } = await getOrSyncGingerToken();

      if (!token) {
        setTrainingsError("Unable to authenticate session. Please log in again.");
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

      if (!response.ok) {
        throw new Error(result.error || "Failed to load trainings");
      }

      const fetchedTrainings = result.training_annotate_list || [];
      setTrainings(fetchedTrainings);
      cacheGingerDataAction('trainings', fetchedTrainings);
      syncUserTrainingsAction(fetchedTrainings);
    } catch (err) {
      const cached = await getCachedGingerDataAction('trainings');
      if (cached && Array.isArray(cached) && cached.length > 0) {
        setTrainings(cached);
      } else {
        const dbRes = await getUserTrainingsFromDbAction();
        if (dbRes.success && dbRes.data && Array.isArray(dbRes.data) && dbRes.data.length > 0) {
          setTrainings(dbRes.data);
        } else {
          setTrainingsError("Unable to load training modules. Please check your connection or try again later.");
        }
      }
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
      const { token } = await getOrSyncGingerToken();

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
          console.error("Update Training Status Non-Zero Code:", result);
          toast.error("Failed to update training status", {
            description: result.msg || result.error || JSON.stringify(result)
          });
        } else {
          const name = (training.annotate_sub_project_name || training.annotate_name || "").toLowerCase();
          const isLandCover = name.includes("land cover") || name.includes("landcover");
          const isTransportation = name.includes("transportation") || name.includes("transport");
          const isRoof = name.includes("roof");

          if (nextActive === 1) {
            setSuccessModalData({ type: 'training', isOpen: true });
            if (isLandCover) {
              setWalkthroughStep(-1);
              updateTutorialProgress({ tut_lc_opened: true, tut_lc_closed: false });
            }
            if (isRoof) {
              setWalkthroughStep(-1);
              updateTutorialProgress({ tut_roof_opened: true, tut_roof_closed: false });
            }
            if (isTransportation) {
              setWalkthroughStep(-1);
              updateTutorialProgress({ tut_ts_opened: true, tut_ts_closed: false });
            }
          } else {
            toast.success(`Training status updated successfully!`);
            if (isLandCover) {
              updateTutorialProgress({ tut_lc_closed: true, tut_lc_opened: false });
              if (!isRoofPassed) {
                const roofOpened = tutProgress.tut_roof_opened === true || (isRoofOngoing && tutProgress.tut_roof_closed !== true);
                const walkthroughAlreadyDone = tutProgress.active_projects_start_walkthrough_completed === true;
                if (!roofOpened && !walkthroughAlreadyDone) {
                  isManualNavigating.current = true;
                  setWalkthroughStep(2);
                }
              } else if (!isTransportationPassed) {
                const tsOpened = tutProgress.tut_ts_opened === true || (isTransportationOngoing && tutProgress.tut_ts_closed !== true);
                const walkthroughAlreadyDone = tutProgress.active_projects_start_walkthrough_completed === true;
                if (!tsOpened && !walkthroughAlreadyDone) {
                  isManualNavigating.current = true;
                  setWalkthroughStep(4);
                }
              }
            }
            if (isRoof) {
              updateTutorialProgress({ tut_roof_closed: true, tut_roof_opened: false });
              if (!isRoofPassed) {
                const walkthroughAlreadyDone = tutProgress.active_projects_start_walkthrough_completed === true;
                if (!walkthroughAlreadyDone) {
                  isManualNavigating.current = true;
                  setWalkthroughStep(2);
                }
              } else if (!isLandCoverPassed) {
                const lcOpened = tutProgress.tut_lc_opened === true || (isLandCoverOngoing && tutProgress.tut_lc_closed !== true);
                const walkthroughAlreadyDone = tutProgress.active_projects_start_walkthrough_completed === true;
                if (!lcOpened && !walkthroughAlreadyDone) {
                  isManualNavigating.current = true;
                  setWalkthroughStep(3);
                }
              } else if (!isTransportationPassed) {
                const tsOpened = tutProgress.tut_ts_opened === true || (isTransportationOngoing && tutProgress.tut_ts_closed !== true);
                const walkthroughAlreadyDone = tutProgress.active_projects_start_walkthrough_completed === true;
                if (!tsOpened && !walkthroughAlreadyDone) {
                  isManualNavigating.current = true;
                  setWalkthroughStep(4);
                }
              } else {
                setWalkthroughStep(-1);
              }
            }
            if (isTransportation) {
              updateTutorialProgress({ tut_ts_closed: true, tut_ts_opened: false });
              if (!isRoofPassed) {
                setWalkthroughStep(2);
              } else if (!isLandCoverPassed) {
                setWalkthroughStep(3);
              } else {
                setWalkthroughStep(-1);
              }
            }
          }

          fetchTrainings();
        }
      } else {
        console.error("Update Training Status Error Response:", result);
        toast.error(`Failed to update status`, {
          description: result.error || result.msg || JSON.stringify(result) || 'Unknown error',
        });
      }
    } catch (err) {
      toast.error("An unexpected error occurred while updating training status.");
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchTrainings();
  }, []);

  const openRegisterModal = (project: any) => {
    setSelectedRegisterProject(project);
  };

  const closeRegisterModal = () => {
    setSelectedRegisterProject(null);
  };

  const handleRegisterSubmit = async () => {
    if (!selectedRegisterProject) return;

    setIsRegistering(true);
    try {
      const { token } = await getOrSyncGingerToken();

      if (!token) {
        toast.error("Unauthorized: Missing access token");
        setIsRegistering(false);
        return;
      }

      const response = await fetch(`/api/ginger/bac/mapping/annotate/register-worktime`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          annotate_id: selectedRegisterProject.annotate_id,
          register_hours: 1,
          start_of_cycle: selectedRegisterProject.annotate_schedule_details?.start_of_cycle,
          end_of_cycle: selectedRegisterProject.annotate_schedule_details?.end_of_cycle
        }),
      });

      const result = await response.json();

      if (response.ok) {
        const hasError =
          (result.errcode !== undefined && result.errcode !== 0) ||
          (result.code !== undefined && result.code !== 0) ||
          (result.status !== undefined && result.status !== 'success') ||
          (result.success !== undefined && result.success === false) ||
          result.error;

        if (hasError) {
          const errorMessage = result.errmesg || result.message || result.msg || result.error || (typeof result === 'string' ? result : JSON.stringify(result));
          toast.error(errorMessage);
        } else {
          setSuccessModalData({ type: 'project', isOpen: true });
          closeRegisterModal();
          fetchProjects();
        }
      } else {
        const errorDesc = result.error || result.message || result.msg || (typeof result === 'string' ? result : JSON.stringify(result)) || 'Unknown error';
        toast.error(`Registration failed`, {
          description: errorDesc,
        });
      }
    } catch (err) {
      toast.error("An unexpected error occurred during registration.");
    } finally {
      setIsRegistering(false);
    }
  };

  const sortedProjects = useMemo(() => {
    if (!sortDirection) return projects;
    return [...projects].sort((a: any, b: any) => {
      const idA = String(a.annotate_project_id || a.annotate_id || "");
      const idB = String(b.annotate_project_id || b.annotate_id || "");
      if (sortDirection === 'asc') {
        return idA.localeCompare(idB, undefined, { numeric: true, sensitivity: 'base' });
      } else {
        return idB.localeCompare(idA, undefined, { numeric: true, sensitivity: 'base' });
      }
    });
  }, [projects, sortDirection]);

  const paginatedProjects = sortedProjects;

  const getRowWalkthroughStatus = (training: any) => {
    const name = (training.annotate_sub_project_name || training.annotate_name || "").toLowerCase();
    const isLandCover = name.includes("land cover") || name.includes("landcover");
    const isTransportation = name.includes("transportation") || name.includes("transport");
    const is3DMatch = name.includes("3d_match") || name.includes("3d match");
    const isRoof = name.includes("roof");

    if (walkthroughStep === 2) {
      return isRoof ? "highlighted" : "faded";
    }
    if (walkthroughStep === 3) {
      return isLandCover ? "highlighted" : "faded";
    }
    if (walkthroughStep === 4) {
      return isTransportation ? "highlighted" : "faded";
    }

    return "normal";
  };

  const sortedTrainings = useMemo(() => {
    if (!trainingSortDirection) return trainings;
    return [...trainings].sort((a: any, b: any) => {
      const idA = String(a.annotate_project_id || a.annotate_sub_project_id || "");
      const idB = String(b.annotate_project_id || b.annotate_sub_project_id || "");
      if (trainingSortDirection === 'asc') {
        return idA.localeCompare(idB, undefined, { numeric: true, sensitivity: 'base' });
      } else {
        return idB.localeCompare(idA, undefined, { numeric: true, sensitivity: 'base' });
      }
    });
  }, [trainings, trainingSortDirection]);

  const blockingTraining = useMemo(() => {
    if (walkthroughStep !== 2 && walkthroughStep !== 3 && walkthroughStep !== 4) return null;

    return trainings.find((t: any) => {
      const name = (t.annotate_sub_project_name || t.annotate_name || "").toLowerCase();
      const isLandCover = name.includes("land cover") || name.includes("landcover");
      const isRoof = name.includes("roof");
      const isTransportation = name.includes("transportation") || name.includes("transport");

      const isStandardBuilding = t.annotate_project_id === 1 || t.annotate_sub_project_id === 1;
      const isOngoing = (isStandardBuilding || t.is_active === 1) && t.training_status_desc !== 'STATUS_PASSED';

      if (!isOngoing) return false;

      if (walkthroughStep === 2 && !isRoof) return true;
      if (walkthroughStep === 3 && !isLandCover) return true;
      if (walkthroughStep === 4 && !isTransportation) return true;
      return false;
    });
  }, [trainings, walkthroughStep]);

  const paginatedTrainings = sortedTrainings;

  return (
    <div className="w-full animate-in fade-in zoom-in-95 duration-300 flex flex-col gap-6">

      {/* Active Projects Table */}
      <section
        className={`w-full transition-all duration-300 ${walkthroughStep === 0 || showStartActiveProjectsWalkthrough
          ? 'relative z-[10000] scale-[1.01]'
          : (walkthroughStep >= 1 && walkthroughStep <= 5)
            ? 'opacity-20 pointer-events-none'
            : ''
          }`}
      >
          <div className="flex justify-between items-center mb-2">
  <span></span>
  <h2 className="text-sm italic text-[#0D1B2A] dark:text-white">{projects.length} active projects</h2>
</div>

        <div className={`rounded-tr-3xl rounded-bl-3xl overflow-hidden transition-all duration-300 ${walkthroughStep === 0 || showStartActiveProjectsWalkthrough
          ? 'bg-white/95 dark:bg-[#0D1B2A]/95 border-2 border-[#1F7A1F] dark:border-[#55f761] shadow-2xl shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20'
          : 'bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-xl'
          }`}>

          {error && (
            <div className="p-4 bg-red-500/10 border-b border-red-500/20 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="hidden md:block overflow-x-auto hide-scrollbar">
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
                  <th className="py-4 px-5 font-medium">Status</th>
                  <th className="py-4 px-5 font-medium">Started Date</th>
                  <th className="py-4 px-5 font-medium">Task Num</th>
                  <th className="py-4 px-5 font-medium">Registered?</th>
                  <th className="py-4 px-5 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="text-[#0D1B2A] dark:text-white">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[#2F3E46] dark:text-white/60">
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-6 h-6 border-2 border-[#1F7A1F] border-t-transparent rounded-full animate-spin mb-2"></div>
                        Loading projects...
                      </div>
                    </td>
                  </tr>
                ) : projects.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[#2F3E46] dark:text-white/60">
                      {(isLandCoverPassed && isTransportationPassed && isRoofPassed && !hadProjectBefore && !hasGroupOrTeam) ? (
                        <div className="flex flex-col items-center justify-center max-w-md mx-auto space-y-4">
                          <CubeLoader />
                          <h4 className="font-bold text-lg text-[#0D1B2A] dark:text-white">Account Under Verification</h4>
                          <div className="text-sm leading-relaxed space-y-2 px-4">
                            <p>Please wait while the Judgers verify your account. Once your verification is complete,</p>
                            <p>you will be assigned a Checker Guild. Join their guild Chat and connect with your Checker Guild Leader.</p>
                          </div>
                        </div>
                      ) : (
                        "No available project right now"
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedProjects.map((project: any, index: number) => (
                    <tr key={index} className="border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
                      <td className="py-4 px-5 font-medium">
                        {project.annotate_project_id || project.annotate_id}
                      </td>
                      <td className="py-4 px-5 font-semibold">
                        {project.annotate_name}
                      </td>
                      <td className="py-4 px-5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${project.annotate_status === 'running' ? 'bg-[#1F7A1F]/10 text-[#1F7A1F] dark:text-[#55f761]' : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'}`}>
                          {project.annotate_status === 'running' ? 'Ongoing' : project.annotate_status}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-xs text-[#2F3E46] dark:text-white/60">
                        {project.ts_started ? new Date(project.ts_started).toLocaleString() : '-'}
                      </td>
                      <td className="py-4 px-5 text-[#2F3E46] dark:text-white/80 font-mono">
                        {project.statistics?.task_release_statistics?.total_task_count?.toLocaleString() || '-'}
                      </td>
                      <td className="py-4 px-5 font-bold">
                        {project.annotate_schedule_details?.register_hours > 0 ? (
                          <span className="text-green-600 dark:text-green-400">Yes</span>
                        ) : (
                          <span className="text-red-500 dark:text-red-400">No</span>
                        )}
                      </td>
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end">
                          {project.annotate_schedule_details?.register_hours > 0 ? (
                            <button
                              onClick={() => openRegisterModal(project)}
                              className="inline-flex items-center gap-1.5 rounded-md bg-green-500/10 px-4 py-1.5 text-xs font-bold text-green-600 dark:text-green-400 hover:bg-green-500/20 transition-all cursor-pointer active:scale-95"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                              Registered
                            </button>
                          ) : (
                            <button
                              onClick={() => openRegisterModal(project)}
                              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#1F7A1F] hover:bg-[#145214] dark:bg-[#55f761] dark:hover:bg-[#3de34a] dark:text-[#060D14] px-4 py-1.5 text-xs font-bold text-white transition-all shadow-md hover:scale-105 active:scale-95 cursor-pointer"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" /></svg>
                              Register
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Projects View */}
          <div className="md:hidden flex flex-col gap-4 p-4">
            {isLoading ? (
              <div className="py-12 text-center text-[#2F3E46] dark:text-white/60">
                <div className="flex flex-col items-center justify-center">
                  <div className="w-6 h-6 border-2 border-[#1F7A1F] border-t-transparent rounded-full animate-spin mb-2"></div>
                  Loading projects...
                </div>
              </div>
            ) : projects.length === 0 ? (
              <div className="py-12 text-center text-[#2F3E46] dark:text-white/60">
                {(isLandCoverPassed && isTransportationPassed && isRoofPassed && !hadProjectBefore && !hasGroupOrTeam) ? (
                  <div className="flex flex-col items-center justify-center max-w-md mx-auto space-y-4">
                    <CubeLoader />
                    <h4 className="font-bold text-lg text-[#0D1B2A] dark:text-white">Account Under Verification</h4>
                    <div className="text-sm leading-relaxed space-y-2 px-2">
                      <p>Please wait while the Judgers verify your account. Once your verification is complete,</p>
                      <p> you will be assigned a Checker Guild. Join their guild chat and connect with your Checker Guild Leader.</p>
                    </div>
                  </div>
                ) : (
                  "No available project right now"
                )}
              </div>
            ) : (
              paginatedProjects.map((project: any, index: number) => (
                <div key={index} className="bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-xl p-4 flex flex-col gap-3 relative">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs text-[#2F3E46] dark:text-white/60 font-mono mb-1">ID: {project.annotate_project_id || project.annotate_id}</div>
                      <div className="font-bold text-[#0D1B2A] dark:text-white text-base leading-tight">{project.annotate_name}</div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase shrink-0 ${project.annotate_status === 'running' ? 'bg-[#1F7A1F]/10 text-[#1F7A1F] dark:text-[#55f761]' : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'}`}>
                      {project.annotate_status === 'running' ? 'Ongoing' : project.annotate_status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-[#2F3E46] dark:text-white/80 border-t border-black/5 dark:border-white/5 pt-3 mt-1">
                    <div>
                      <div className="text-[#2F3E46]/60 dark:text-white/40 mb-0.5">Started Date</div>
                      <div>{project.ts_started ? new Date(project.ts_started).toLocaleString() : '-'}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[#2F3E46]/60 dark:text-white/40 mb-0.5">Registered?</div>
                      <div className="font-bold">
                        {project.annotate_schedule_details?.register_hours > 0 ? (
                          <span className="text-green-600 dark:text-green-400">Yes</span>
                        ) : (
                          <span className="text-red-500 dark:text-red-400">No</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[#2F3E46]/60 dark:text-white/40 mb-0.5">Total Tasks</div>
                      <div className="font-mono font-bold">{project.statistics?.task_release_statistics?.total_task_count?.toLocaleString() || '-'}</div>
                    </div>
                  </div>

                  <div className="border-t border-black/5 dark:border-white/5 pt-3 mt-1">
                    {project.annotate_schedule_details?.register_hours > 0 ? (
                      <button
                        onClick={() => openRegisterModal(project)}
                        className="w-full flex items-center justify-center gap-2 rounded-lg bg-green-500/10 px-4 py-2.5 text-sm font-bold text-green-600 dark:text-green-400 hover:bg-green-500/20 transition-all cursor-pointer active:scale-95"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                        Registered
                      </button>
                    ) : (
                      <button
                        onClick={() => openRegisterModal(project)}
                        className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#1F7A1F] hover:bg-[#145214] dark:bg-[#55f761] dark:hover:bg-[#3de34a] dark:text-[#060D14] px-4 py-2.5 text-sm font-bold text-white transition-all shadow-md active:scale-95 cursor-pointer"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" /></svg>
                        Register
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Trainings Table */}
      <section
        className={`w-full space-y-3 transition-all duration-300 ${walkthroughStep === 1
          ? 'relative z-[10000] scale-[1.01]'
          : (walkthroughStep >= 2 && walkthroughStep <= 5)
            ? 'relative z-[10000]'
            : walkthroughStep === 0 || showStartActiveProjectsWalkthrough
              ? 'opacity-20 pointer-events-none'
              : ''
          }`}
      >
        <div className={walkthroughStep >= 1 && walkthroughStep <= 5 ? 'relative z-[10000]' : ''}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-[#0D1B2A] dark:text-white">Training</h2>
          </div>

        </div>

        <div className={`rounded-tr-3xl rounded-bl-3xl overflow-hidden transition-all duration-300 ${walkthroughStep === 1
          ? 'bg-white/95 dark:bg-[#0D1B2A]/95 border-2 border-[#1F7A1F] dark:border-[#55f761] shadow-2xl shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20'
          : (walkthroughStep >= 2 && walkthroughStep <= 5)
            ? 'bg-white/95 dark:bg-[#0D1B2A]/95 border border-[#1F7A1F]/30 dark:border-[#55f761]/30 shadow-xl'
            : 'bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-xl'
          }`}>
          {trainingsError && (
            <div className="p-4 bg-red-500/10 border-b border-red-500/20 text-red-600 dark:text-red-400 text-sm">
              {trainingsError}
            </div>
          )}

          <div className="hidden md:block overflow-x-auto hide-scrollbar">
            <table className="w-full text-sm text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="border-b border-black/10 dark:border-white/10 text-xs text-[#2F3E46] dark:text-white/60 bg-black/5 dark:bg-white/5">
                  <th
                    className="py-4 px-3 font-medium cursor-pointer select-none hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-colors group/sort"
                    onClick={() => {
                      setTrainingSortDirection(prev => {
                        if (prev === 'asc') return 'desc';
                        if (prev === 'desc') return null;
                        return 'asc';
                      });
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      Project ID
                      <span className="text-[#2F3E46]/40 dark:text-white/30 group-hover/sort:text-[#1F7A1F] dark:group-hover/sort:text-[#55f761] transition-colors">
                        {trainingSortDirection === 'asc' ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7" /><path d="M12 5v14" /></svg>
                        ) : trainingSortDirection === 'desc' ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m19 12-7 7-7-7" /><path d="M12 19V5" /></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21 16-4 4-4-4" /><path d="M17 20V4" /><path d="m3 8 4-4 4 4" /><path d="M7 4v16" /></svg>
                        )}
                      </span>
                    </div>
                  </th>
                  <th className="py-4 px-3 font-medium">Name</th>
                  <th className="py-4 px-3 font-medium">Project Status</th>
                  <th className="py-4 px-3 font-medium">Training Status</th>
                  <th className="py-4 px-3 font-medium text-center">Passed Task</th>
                  <th className="py-4 px-3 font-medium text-center">Total Task</th>
                  <th className="py-4 px-3 font-medium text-center">Account ID</th>
                  <th className="py-4 px-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="text-[#0D1B2A] dark:text-white">
                {isTrainingsLoading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-[#2F3E46] dark:text-white/60">
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-6 h-6 border-2 border-[#1F7A1F] border-t-transparent rounded-full animate-spin mb-2"></div>
                        Loading trainings...
                      </div>
                    </td>
                  </tr>
                ) : trainings.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-[#2F3E46] dark:text-white/60">
                      No training projects found.
                    </td>
                  </tr>
                ) : (
                  paginatedTrainings.map((training: any, index: number) => {
                    const isStandardBuilding = training.annotate_project_id === 1 || training.annotate_sub_project_id === 1;
                    const projectName = isStandardBuilding ? 'Standard Building' : training.annotate_sub_project_name;
                    const isOngoing = isStandardBuilding || training.is_active === 1;

                    const hasOngoing = trainings.some((t: any) => {
                      const isTStandardBuilding = t.annotate_project_id === 1 || t.annotate_sub_project_id === 1;
                      const isTOngoing = isTStandardBuilding || t.is_active === 1;
                      const tRawStatus = (t.training_status_desc || "").trim();
                      const tPassed = tRawStatus === 'STATUS_PASSED' || tRawStatus.toLowerCase() === 'passed';
                      return isTOngoing && !tPassed;
                    });

                    const isUpdating = isUpdatingStatus === (training.annotate_project_id || training.annotate_sub_project_id);
                    const isClosed = training.is_online !== 1;
                    const isDisabled = isUpdating || (hasOngoing && !isOngoing) || isClosed;

                    const rawStatus = (training.training_status_desc || "").trim();
                    const isPassed = rawStatus === 'STATUS_PASSED' || rawStatus.toLowerCase() === 'passed';

                    const isUnregistered = !isPassed && training.user_state === -1;
                    const isFrozen = !isPassed && !isUnregistered && training.is_active === 0 && !isStandardBuilding;

                    let displayStatus = 'Closed';
                    if (isFrozen) displayStatus = 'Paused';
                    else if (isUnregistered) displayStatus = 'Unregistered';
                    else if (rawStatus.startsWith('STATUS_')) {
                      displayStatus = rawStatus.replace('STATUS_', '');
                      displayStatus = displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1).toLowerCase();
                    } else if (rawStatus) {
                      displayStatus = rawStatus;
                    }

                    const rawName = (training.annotate_sub_project_name || training.annotate_name || "").toLowerCase();
                    const isLandCover = rawName.includes("land cover") || rawName.includes("landcover");
                    const isTransportation = rawName.includes("transportation") || rawName.includes("transport");
                    const isRoof = rawName.includes("roof");

                    const rowStatus = getRowWalkthroughStatus(training);

                    return (
                      <tr
                        key={index}
                        className={`border-b border-black/5 dark:border-white/5 transition-all duration-300 group ${rowStatus === "highlighted"
                          ? "bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 font-bold border-l-4 border-l-[#1F7A1F] dark:border-l-[#55f761]"
                          : rowStatus === "faded"
                            ? "opacity-20 pointer-events-none"
                            : "hover:bg-black/5 dark:hover:bg-white/5"
                          }`}
                      >
                        <td className="py-4 px-3 font-medium">
                          {training.annotate_project_id || training.annotate_sub_project_id}
                        </td>
                        <td className="py-4 px-3 font-medium">
                          {projectName}
                        </td>
                        <td className="py-4 px-3">
                          <span className="inline-flex items-center gap-1.5 text-xs text-[#2F3E46] dark:text-white/80">
                            <span className={`h-1.5 w-1.5 rounded-full ${training.is_online === 1 ? 'bg-[#2196F3]' : 'bg-[#F44336]'}`}></span>
                            {training.is_online === 1 ? 'Running' : 'Closed'}
                          </span>
                        </td>
                        <td className="py-4 px-3">
                          {isPassed ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#1F7A1F]/10 text-[#1F7A1F] dark:text-[#55f761] px-2.5 py-1 rounded-full">
                              <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
                              Passed
                            </span>
                          ) : isOngoing ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-[#2196F3]/10 text-[#2196F3] dark:text-[#64B5F6] border border-[#2196F3]/20 px-2.5 py-1 rounded-full">
                              <span className="h-2 w-2 rounded-full bg-current animate-pulse"></span>
                              Ongoing
                            </span>
                          ) : isUnregistered ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-[#2F3E46] dark:text-white/80">
                              <span className="h-1.5 w-1.5 rounded-full bg-gray-400"></span>
                              Unregistered
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs text-[#2F3E46] dark:text-white/80">
                              <span className="h-1.5 w-1.5 rounded-full bg-gray-400"></span>
                              {displayStatus}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-3 text-xs text-[#2F3E46] dark:text-white/80 text-center">
                          {training.passed_task_num}
                        </td>
                        <td className="py-4 px-3 text-xs text-[#2F3E46] dark:text-white/80 text-center">
                          {training.total_task}
                        </td>
                        <td className="py-4 px-3 text-xs font-mono text-[#2F3E46] dark:text-white/80 text-center">
                          {training.user_id !== -1 ? training.user_id : ""}
                        </td>
                        <td className="py-4 px-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Guides Button */}
                            {(() => {
                              const showGuides = (isLandCover && (hasClickedLandCover || !isUnregistered)) || (isTransportation && (hasClickedTransportation || !isUnregistered)) || isRoof;
                              if (showGuides) {
                                return (
                                  <button
                                    onClick={() => {
                                      setGuidesLibraryType(isLandCover ? "landcover" : isTransportation ? "transportation" : "roof");
                                      setGuidesLibraryModalOpen(true);
                                    }}
                                    className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#2F3E46]/10 hover:bg-[#2F3E46]/20 dark:bg-white/10 dark:hover:bg-white/20 px-3 py-1.5 text-xs font-bold text-[#2F3E46] dark:text-white transition-all shadow-sm hover:scale-105 active:scale-95 cursor-pointer mr-2"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
                                    Guides
                                  </button>
                                );
                              }
                              return null;
                            })()}

                            {isPassed ? (
                              <span className="text-xs font-semibold text-[#1F7A1F] dark:text-[#55f761] mr-2">Passed</span>
                            ) : (
                              <>

                                {/* Register/Reopen/Close Button */}
                                {!isStandardBuilding && (
                                  <button
                                    onClick={() => {
                                      const doToggle = () => toggleTrainingStatus(training);
                                      const isRegisterBtn = !isOngoing && isUnregistered;

                                      if (isLandCover && !hasClickedLandCover && isRegisterBtn) {
                                        setSelectedTrainingCourse(training);
                                        setPendingModalAction(() => doToggle);
                                        setLandCoverModalOpen(true);
                                      } else if (isTransportation && !hasClickedTransportation && isRegisterBtn) {
                                        setSelectedTrainingCourse(training);
                                        setPendingModalAction(() => doToggle);
                                        setTransportationModalOpen(true);
                                      } else if (isRoof && !hasClickedRoof && isRegisterBtn) {
                                        setSelectedTrainingCourse(training);
                                        setPendingModalAction(() => doToggle);
                                        setRoofModalOpen(true);
                                      } else {
                                        doToggle();
                                      }
                                    }}
                                    disabled={isDisabled}
                                    title={hasOngoing && !isOngoing ? "Another training is currently active" : ""}
                                    className={`inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-bold text-white transition-all shadow-md hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 cursor-pointer min-w-[100px] ${isDisabled
                                      ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed'
                                      : isOngoing
                                        ? 'bg-red-500 hover:bg-red-600 dark:bg-red-500 dark:hover:bg-red-600'
                                        : 'bg-[#1F7A1F] hover:bg-[#145214] dark:bg-[#55f761] dark:hover:bg-[#3de34a] dark:text-[#060D14]'
                                      } ${(walkthroughStep === 2 && isRoof) || (walkthroughStep === 3 && isLandCover) || (walkthroughStep === 4 && isTransportation) ? `relative z-[10001] ${!isOngoing ? 'ring-2 ring-[#1F7A1F] dark:ring-[#55f761] ring-offset-2 ring-offset-white dark:ring-offset-[#0D1B2A] shadow-[0_0_15px_rgba(31,122,31,0.6)] dark:shadow-[0_0_15px_rgba(85,247,97,0.4)] animate-expand-contract' : ''}` : ''}`}
                                  >
                                    {((walkthroughStep === 2 && isRoof && !isOngoing) || (walkthroughStep === 3 && isLandCover && !isOngoing) || (walkthroughStep === 4 && isTransportation && !isOngoing)) && (
                                      <span className="absolute inset-0 rounded-md ring-4 ring-[#1F7A1F] dark:ring-[#55f761] opacity-50 pointer-events-none"></span>
                                    )}
                                    {isUpdating ? (
                                      <>
                                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        Updating...
                                      </>
                                    ) : isOngoing ? (
                                      <>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="4" height="16" x="6" y="4" /><rect width="4" height="16" x="14" y="4" /></svg>
                                        Pause
                                      </>
                                    ) : isUnregistered ? (
                                      <>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                                        Register
                                      </>
                                    ) : (
                                      <>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                                        Reopen
                                      </>
                                    )}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Trainings View */}
          <div className="md:hidden flex flex-col gap-4 p-4">
            {isTrainingsLoading ? (
              <div className="py-12 text-center text-[#2F3E46] dark:text-white/60">
                <div className="flex flex-col items-center justify-center">
                  <div className="w-6 h-6 border-2 border-[#1F7A1F] border-t-transparent rounded-full animate-spin mb-2"></div>
                  Loading trainings...
                </div>
              </div>
            ) : trainings.length === 0 ? (
              <div className="py-12 text-center text-[#2F3E46] dark:text-white/60">
                No training projects found.
              </div>
            ) : (
              paginatedTrainings.map((training: any, index: number) => {
                const isStandardBuilding = training.annotate_project_id === 1 || training.annotate_sub_project_id === 1;
                const projectName = isStandardBuilding ? 'Standard Building' : training.annotate_sub_project_name;
                const isOngoing = isStandardBuilding || training.is_active === 1;

                const hasOngoing = trainings.some((t: any) => {
                  const isTStandardBuilding = t.annotate_project_id === 1 || t.annotate_sub_project_id === 1;
                  const isTOngoing = isTStandardBuilding || t.is_active === 1;
                  const tRawStatus = (t.training_status_desc || "").trim();
                  const tPassed = tRawStatus === 'STATUS_PASSED' || tRawStatus.toLowerCase() === 'passed';
                  return isTOngoing && !tPassed;
                });

                const isUpdating = isUpdatingStatus === (training.annotate_project_id || training.annotate_sub_project_id);
                const isClosed = training.is_online !== 1;
                const isDisabled = isUpdating || (hasOngoing && !isOngoing) || isClosed;

                const rawStatus = (training.training_status_desc || "").trim();
                const isPassed = rawStatus === 'STATUS_PASSED' || rawStatus.toLowerCase() === 'passed';

                const isUnregistered = !isPassed && training.user_state === -1;
                const isFrozen = !isPassed && !isUnregistered && training.is_active === 0 && !isStandardBuilding;

                let displayStatus = 'Closed';
                if (isFrozen) displayStatus = 'Paused';
                else if (isUnregistered) displayStatus = 'Unregistered';
                else if (rawStatus.startsWith('STATUS_')) {
                  displayStatus = rawStatus.replace('STATUS_', '');
                  displayStatus = displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1).toLowerCase();
                } else if (rawStatus) {
                  displayStatus = rawStatus;
                }

                const rawName = (training.annotate_sub_project_name || training.annotate_name || "").toLowerCase();
                const isLandCover = rawName.includes("land cover") || rawName.includes("landcover");
                const isTransportation = rawName.includes("transportation") || rawName.includes("transport");
                const isRoof = rawName.includes("roof");

                const rowStatus = getRowWalkthroughStatus(training);

                return (
                  <div key={index} className={`bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-xl p-4 flex flex-col gap-3 relative transition-all ${rowStatus === "highlighted" ? "ring-2 ring-[#1F7A1F] dark:ring-[#55f761] shadow-lg" : rowStatus === "faded" ? "opacity-20 pointer-events-none" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs text-[#2F3E46] dark:text-white/60 font-mono mb-1">ID: {training.annotate_project_id || training.annotate_sub_project_id}</div>
                        <div className="font-bold text-[#0D1B2A] dark:text-white text-base leading-tight">{projectName}</div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="inline-flex items-center gap-1 text-[10px] text-[#2F3E46] dark:text-white/80 uppercase font-bold tracking-wider">
                          <span className={`h-1.5 w-1.5 rounded-full ${training.is_online === 1 ? 'bg-[#2196F3]' : 'bg-[#F44336]'}`}></span>
                          {training.is_online === 1 ? 'Running' : 'Closed'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs border-y border-black/5 dark:border-white/5 py-3 mt-1">
                      <div>
                        <div className="text-[#2F3E46]/60 dark:text-white/40 mb-1">Training Status</div>
                        <div>
                          {isPassed ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#1F7A1F]/10 text-[#1F7A1F] dark:text-[#55f761] px-2 py-0.5 rounded-full">
                              <span className="h-1.5 w-1.5 rounded-full bg-current"></span>Passed
                            </span>
                          ) : isOngoing ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-[#2196F3]/10 text-[#2196F3] dark:text-[#64B5F6] border border-[#2196F3]/20 px-2 py-0.5 rounded-full">
                              <span className="h-2 w-2 rounded-full bg-current animate-pulse"></span>Ongoing
                            </span>
                          ) : isUnregistered ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-[#2F3E46] dark:text-white/80">
                              <span className="h-1.5 w-1.5 rounded-full bg-gray-400"></span>Unregistered
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs text-[#2F3E46] dark:text-white/80">
                              <span className="h-1.5 w-1.5 rounded-full bg-gray-400"></span>{displayStatus}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[#2F3E46]/60 dark:text-white/40 mb-1">Passed / Total</div>
                        <div className="font-mono font-bold">
                          <span className={`${training.passed_task_num >= training.total_task && training.total_task > 0 ? "text-[#1F7A1F] dark:text-[#55f761]" : "text-[#0D1B2A] dark:text-white"}`}>{training.passed_task_num}</span>
                          <span className="text-[#2F3E46]/40 dark:text-white/30 mx-1">/</span>
                          {training.total_task}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                      {(() => {
                        const showGuides = (isLandCover && (hasClickedLandCover || !isUnregistered)) || (isTransportation && (hasClickedTransportation || !isUnregistered)) || isRoof;
                        if (showGuides) {
                          return (
                            <button
                              onClick={() => {
                                setGuidesLibraryType(isLandCover ? "landcover" : isTransportation ? "transportation" : "roof");
                                setGuidesLibraryModalOpen(true);
                              }}
                              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#2F3E46]/10 hover:bg-[#2F3E46]/20 dark:bg-white/10 dark:hover:bg-white/20 px-3 py-2 text-xs font-bold text-[#2F3E46] dark:text-white transition-all shadow-sm active:scale-95 cursor-pointer flex-1"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
                              Guides
                            </button>
                          );
                        }
                        return null;
                      })()}

                      {isPassed ? (
                        <span className="text-sm font-semibold text-[#1F7A1F] dark:text-[#55f761] w-full text-center py-2">Passed</span>
                      ) : (
                        <>
                          {!isStandardBuilding && (
                            <button
                              onClick={() => {
                                const doToggle = () => toggleTrainingStatus(training);
                                const isRegisterBtn = !isOngoing && isUnregistered;

                                if (isLandCover && !hasClickedLandCover && isRegisterBtn) {
                                  setSelectedTrainingCourse(training);
                                  setPendingModalAction(() => doToggle);
                                  setLandCoverModalOpen(true);
                                } else if (isTransportation && !hasClickedTransportation && isRegisterBtn) {
                                  setSelectedTrainingCourse(training);
                                  setPendingModalAction(() => doToggle);
                                  setTransportationModalOpen(true);
                                } else if (isRoof && !hasClickedRoof && isRegisterBtn) {
                                  setSelectedTrainingCourse(training);
                                  setPendingModalAction(() => doToggle);
                                  setRoofModalOpen(true);
                                } else {
                                  doToggle();
                                }
                              }}
                              disabled={isDisabled}
                              className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-bold text-white transition-all shadow-md active:scale-95 flex-1 ${isDisabled
                                ? 'bg-gray-400 dark:bg-gray-700 cursor-not-allowed opacity-50'
                                : isOngoing
                                  ? 'bg-red-500 hover:bg-red-600 dark:bg-red-500 dark:hover:bg-red-600'
                                  : (!isOngoing && isUnregistered)
                                    ? 'bg-[#1F7A1F] hover:bg-[#145214] dark:bg-[#55f761] dark:hover:bg-[#3de34a] dark:text-[#060D14]'
                                    : 'bg-[#1F7A1F] hover:bg-[#145214] dark:bg-[#55f761] dark:hover:bg-[#3de34a] dark:text-[#060D14]'
                                } ${(walkthroughStep === 2 && isRoof) || (walkthroughStep === 3 && isLandCover) || (walkthroughStep === 4 && isTransportation) ? `relative z-[10001] ${!isOngoing ? 'ring-2 ring-[#1F7A1F] dark:ring-[#55f761] ring-offset-2 ring-offset-white dark:ring-offset-[#0D1B2A] shadow-[0_0_15px_rgba(31,122,31,0.6)] dark:shadow-[0_0_15px_rgba(85,247,97,0.4)] animate-expand-contract' : ''}` : ''}`}
                            >
                              {((walkthroughStep === 2 && isRoof && !isOngoing) || (walkthroughStep === 3 && isLandCover && !isOngoing) || (walkthroughStep === 4 && isTransportation && !isOngoing)) && (
                                <span className="absolute inset-0 rounded-md ring-4 ring-[#1F7A1F] dark:ring-[#55f761] opacity-50 pointer-events-none"></span>
                              )}
                              {isUpdating ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              ) : isOngoing ? (
                                <>
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="4" height="16" x="6" y="4" /><rect width="4" height="16" x="14" y="4" /></svg>
                                  Pause
                                </>
                              ) : (!isOngoing && isUnregistered) ? (
                                <>
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" /></svg>
                                  Register
                                </>
                              ) : (
                                <>
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 3 20 12 6 21 6 3" /></svg>
                                  Reopen
                                </>
                              )}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* Register Modal */}
      {selectedRegisterProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white/90 dark:bg-[#060D14]/90 backdrop-blur-2xl rounded-tr-3xl rounded-bl-3xl w-full max-w-4xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden flex flex-col max-h-[90vh]">

            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10">
              <h2 className="text-lg font-bold text-[#0D1B2A] dark:text-white">Register Project</h2>
              <button onClick={closeRegisterModal} className="text-[#2F3E46]/50 hover:text-[#0D1B2A] dark:text-white/50 dark:hover:text-white transition-colors bg-black/5 dark:bg-white/5 p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-0 flex flex-col md:flex-row">
              {/* Left Column */}
              <div className="w-full md:w-1/3 p-6 border-r border-black/10 dark:border-white/10 space-y-6 bg-black/5 dark:bg-white/5">
                <div>
                  <div className="text-xs text-[#2F3E46] dark:text-white/60 mb-1">Name</div>
                  <div className="text-sm text-[#0D1B2A] dark:text-white font-semibold">{selectedRegisterProject.annotate_name}</div>
                </div>

                <div>
                  <div className="text-xs text-[#2F3E46] dark:text-white/60 mb-1">Begin Cycle</div>
                  <div className="text-sm text-[#0D1B2A] dark:text-white font-mono text-xs">
                    {selectedRegisterProject.annotate_schedule_details?.start_of_cycle || '-'}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-[#2F3E46] dark:text-white/60 mb-1">End Cycle</div>
                  <div className="text-sm text-[#0D1B2A] dark:text-white font-mono text-xs">
                    {selectedRegisterProject.annotate_schedule_details?.end_of_cycle || '-'}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-[#2F3E46] dark:text-white/60 mb-1">Status</div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${selectedRegisterProject.annotate_status === 'running' ? 'bg-[#1F7A1F]/10 text-[#1F7A1F] dark:text-[#55f761]' : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'}`}>
                    {selectedRegisterProject.annotate_status === 'running' ? 'Ongoing' : selectedRegisterProject.annotate_status}
                  </span>
                </div>
              </div>

              {/* Right Column */}
              <div className="w-full md:w-2/3 p-6 flex flex-col gap-6">
                <div className="flex-1 flex flex-col">
                  <div className="text-sm font-semibold text-[#0D1B2A] dark:text-white mb-2 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#1F7A1F] dark:text-[#55f761]"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                    Important Guidelines
                  </div>
                  <ScrollArea className="flex-1 min-h-[250px] rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
                    <div className="text-xs text-[#2F3E46] dark:text-white/80 p-4 leading-relaxed">
                      Tips:<br />
                      1. For road and road connected landcover features, turn on the 3rd product type, and edit from there. (minimize the editing on road unless it's very wrong)<br />
                      2. Use group category and right click to change category quicky<br />
                      3. Understand the definition and requirement of how to close a region<br />
                      4. No need to edit nature features<br />
                      5. Need to understand each topo error meaning and use the proper tool to fix them quickly<br />
                      6. When report, everyone needs to understand who is wrong. Always try to fix the error in your own tasks first, then we put all necessary comments before reporting. (avoid endless report loop)<br />
                      7. If the neighbor connecting error is from tree canopy, no need to report, fix and connect in your task.
                    </div>
                  </ScrollArea>
                </div>

                <div>
                  <div className="text-xs text-[#2F3E46] dark:text-white/60 mb-2">Authority Level</div>
                  <div className="flex gap-2 flex-wrap">
                    {selectedRegisterProject.annotate_control_details?.authority_level_list?.map((level: string, i: number) => (
                      <span key={i} className="inline-flex items-center rounded-full border border-[#1F7A1F]/30 dark:border-[#55f761]/30 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 px-2.5 py-1 text-[10px] font-bold text-[#1F7A1F] dark:text-[#55f761] uppercase">
                        {level}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-black/10 dark:border-white/10 p-5 flex justify-end gap-4 bg-black/5 dark:bg-white/5">
              <button
                onClick={closeRegisterModal}
                disabled={isRegistering}
                className="rounded-xl px-6 py-2.5 text-sm font-medium text-[#2F3E46] dark:text-white/80 hover:bg-black/10 dark:hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRegisterSubmit}
                disabled={isRegistering}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1F7A1F] hover:bg-[#145214] dark:bg-[#55f761] dark:hover:bg-[#3de34a] px-8 py-2.5 text-sm font-bold text-white dark:text-[#060D14] transition-all shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 cursor-pointer"
              >
                {isRegistering ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Registering...
                  </>
                ) : (
                  'Confirm Registration'
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Land Cover Training Modal */}
      <LandCoverTrainingModal
        isOpen={landCoverModalOpen}
        training={selectedTrainingCourse}
        onClose={() => setLandCoverModalOpen(false)}
        onComplete={() => {
          setHasClickedLandCover(true);
          markLandCoverTrainingClickedAction();
          setLandCoverModalOpen(false);

          if (pendingModalAction) {
            pendingModalAction();
            setPendingModalAction(null);
          } else {
            const projectId = selectedTrainingCourse?.annotate_project_id || selectedTrainingCourse?.annotate_sub_project_id;
            if (projectId) {
              window.open(`${GINGER_BASE}/annotate/${projectId}`, '_blank');
            }
          }
        }}
      />

      {/* Transportation Training Modal */}
      <TransportationTrainingModal
        isOpen={transportationModalOpen}
        training={selectedTrainingCourse}
        onClose={() => setTransportationModalOpen(false)}
        onComplete={() => {
          setHasClickedTransportation(true);
          markTransportationTrainingClickedAction();
          setTransportationModalOpen(false);

          if (pendingModalAction) {
            pendingModalAction();
            setPendingModalAction(null);
          } else {
            const projectId = selectedTrainingCourse?.annotate_project_id || selectedTrainingCourse?.annotate_sub_project_id;
            if (projectId) {
              window.open(`${GINGER_BASE}/annotate/${projectId}`, '_blank');
            }
          }
        }}
      />

      {/* Roof Training Modal */}
      <RoofTrainingModal
        isOpen={roofModalOpen}
        training={selectedTrainingCourse}
        onClose={() => setRoofModalOpen(false)}
        onComplete={() => {
          setHasClickedRoof(true);
          updateTutorialProgress({ hasClickedRoofTraining: true });
          setRoofModalOpen(false);

          if (pendingModalAction) {
            pendingModalAction();
            setPendingModalAction(null);
          } else {
            const projectId = selectedTrainingCourse?.annotate_project_id || selectedTrainingCourse?.annotate_sub_project_id;
            if (projectId) {
              window.open(`${GINGER_BASE}/annotate/${projectId}`, '_blank');
            }
          }
        }}
      />

      {/* Guides Library Modal */}
      <GuidesLibraryModal
        isOpen={guidesLibraryModalOpen}
        trainingType={guidesLibraryType}
        onClose={() => {
          setGuidesLibraryModalOpen(false);
          setTimeout(() => setGuidesLibraryType(null), 300);
        }}
      />

      {/* Walkthrough Tooltip Overlay */}
      {walkthroughStep >= 0 && (
        <>
          {/* Backdrop overlay - covers the entire screen including sidebar for focus */}
          <div className="fixed inset-0 z-[9999] bg-black/85 transition-all duration-300 pointer-events-none" />

          <div className="fixed top-0 right-0 md:top-4 md:right-4 z-[10000] flex w-full md:w-[32rem] lg:w-[34rem] max-w-[100vw] transition-all duration-300 pointer-events-none p-3 sm:p-4">
            <div className="relative w-full flex flex-col bg-white/95 dark:bg-[#0D1B2A]/95 backdrop-blur-xl border border-[#1F7A1F]/30 dark:border-[#55f761]/30 rounded-2xl md:rounded-3xl shadow-2xl p-6 mt-[100px] md:p-[40px] md:mt-[100px] transition-all duration-300 transform scale-100 pointer-events-auto">

              {/* Close Button */}
              <button
                onClick={() => {
                  isManualNavigating.current = true;
                  setWalkthroughStep(-1);
                }}
                className="absolute top-4 right-4 p-2 rounded-full text-[#2F3E46]/40 hover:text-[#2F3E46]/70 dark:text-white/40 dark:hover:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 transition-colors z-[10010] cursor-pointer"
                title="Dismiss Tutorial"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>

              <div className="overflow-y-auto hide-scrollbar space-y-4 mb-2 pr-1 max-h-[35vh]">
                {/* Step Counter */}
                <div className="flex justify-between items-center mb-2 relative z-10">
                  <span className="text-[10px] font-black tracking-widest text-[#1F7A1F] dark:text-[#55f761] uppercase bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 px-2.5 py-1 rounded-full">
                    Step {walkthroughStep + 1} of 5
                  </span>
                </div>

                {/* Content */}
                <div className="space-y-4 relative z-10">
                  <h3 className="text-lg font-extrabold text-[#0D1B2A] dark:text-white tracking-tight">
                    {walkthroughStep === 0 && "Active Projects"}
                    {walkthroughStep === 1 && "Training Projects"}
                    {walkthroughStep === 2 && "Roof Training"}
                    {walkthroughStep === 3 && "Land Cover Training"}
                    {walkthroughStep === 4 && "Transportation Training"}
                  </h3>

                  <div className="text-sm leading-relaxed text-[#2F3E46]/90 dark:text-white/80 space-y-2">
                    {walkthroughStep === 0 && (
                      <>
                        <p>This is where all active live projects are listed.</p>
                        <p>Some projects are available immediately after completing the Hands-On Training, while others require additional prerequisite training, such as Landcover Training, Transportation Training, or other project-specific courses.</p>
                        <p>If you've recently passed the Hands-On Training, you may need to complete the required specialized training before you can register for certain live projects.</p>
                      </>
                    )}
                    {walkthroughStep === 1 && (
                      <>
                        <p>This is where you can access additional project-specific training.</p>
                        <p>To begin, click <strong>Open</strong> (or Re-open if you've started before), then open your Ginger software and download the available tasks. Complete all assigned training tasks and submit them for review.</p>
                        <p>The review process is the same as your Hands-On Training. Checkers typically review tasks within 1–3 days, although some may be completed within a few hours.</p>
                        <p>While waiting for your training tasks to be reviewed, you can close the current training project and start another available special training. This allows you to complete multiple prerequisite trainings while your previous submissions are being checked.</p>
                        <p>If you need a refresher at any time, click the <strong>Guides</strong> button to review the training materials and videos.</p>
                      </>
                    )}
                    {walkthroughStep === 2 && (
                      <>
                        <p>This is where you can access additional project-specific training.</p>
                        <p>To begin, click <strong>Open</strong> (or Re-open if you've started before), then open your Ginger software and download the available tasks. Complete all assigned training tasks and submit them for review.</p>
                        <p>The review process is the same as your Hands-On Training. Checkers typically review tasks within 1–3 days, although some may be completed within a few hours.</p>
                        <p>While waiting for your training tasks to be reviewed, you can close the current training project and start another available special training. This allows you to complete multiple prerequisite trainings while your previous submissions are being checked.</p>
                        <p>If you need a refresher at any time, click the <strong>Guides</strong> button to review the training materials and videos.</p>
                      </>
                    )}
                    {walkthroughStep === 3 && (
                      <>
                        <p>This is where you can access additional project-specific training.</p>
                        <p>To begin, click <strong>Open</strong> (or Re-open if you've started before), then open your Ginger software and download the available tasks. Complete all assigned training tasks and submit them for review.</p>
                        <p>The review process is the same as your Hands-On Training. Checkers typically review tasks within 1–3 days, although some may be completed within a few hours.</p>
                        <p>While waiting for your training tasks to be reviewed, you can close the current training project and start another available special training. This allows you to complete multiple prerequisite trainings while your previous submissions are being checked.</p>
                        <p>If you need a refresher at any time, click the <strong>Guides</strong> button to review the training materials and videos.</p>
                      </>
                    )}
                    {walkthroughStep === 4 && (
                      <>
                        <p>You can do the same with Transportation Training.</p>
                        <p>You can close Landcover or Roof Training and click <strong>Open</strong> on Transportation Training to begin. Watch all the training videos, then open Ginger and download the training tasks.</p>
                        <p>You can switch between trainings at any time. Simply Re-open the training you want to continue, then download tasks in Ginger to receive your pending tasks or results. This works for Landcover, Roof, Transportation Training, and other special trainings.</p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Navigation Actions */}
              <div className="flex-shrink-0 flex flex-col mt-4 pt-4 border-t border-black/10 dark:border-white/10 relative z-10 gap-3">

                <div className="flex justify-between items-center w-full">
                  {walkthroughStep > 0 ? (
                    <button
                      onClick={() => {
                        isManualNavigating.current = true;
                        setWalkthroughStep(walkthroughStep - 1);
                      }}
                      className="px-4 py-2 rounded-xl border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-xs font-bold text-[#1F7A1F] dark:text-[#55f761] hover:bg-[#1F7A1F]/5 dark:hover:bg-[#55f761]/5 active:scale-95 transition-all cursor-pointer"
                    >
                      Back
                    </button>
                  ) : (
                    <div />
                  )}
                  <button
                    disabled={walkthroughCooldown > 0}
                    onClick={() => {
                      isManualNavigating.current = true;
                      if (walkthroughStep < 4) {
                        setWalkthroughStep(walkthroughStep + 1);
                      } else {
                        setWalkthroughStep(-1);
                      }
                    }}
                    className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all ${walkthroughCooldown > 0
                      ? "bg-black/5 dark:bg-white/5 text-[#2F3E46]/50 dark:text-white/50 cursor-not-allowed"
                      : "bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] shadow-lg shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20 hover:shadow-[#1F7A1F]/30 dark:hover:shadow-[#55f761]/30 active:scale-95 border-[#55f761]/20 cursor-pointer"
                      }`}
                  >
                    {walkthroughCooldown > 0 ? (
                      walkthroughStep < 4 ? (
                        `Next (${walkthroughCooldown}s)`
                      ) : (
                        `Finish (${walkthroughCooldown}s)`
                      )
                    ) : walkthroughStep === 4 ? (
                      "Finish"
                    ) : (
                      "Next"
                    )}
                  </button>
                </div>
              </div>

            </div>
          </div>
        </>
      )}
      {/* Start Active Projects Walkthrough Tooltip Overlay */}
      {showStartActiveProjectsWalkthrough && (
        <>
          {/* Backdrop overlay - covers the entire screen including sidebar for focus */}
          <div className="fixed inset-0 z-[9999] bg-black/85 transition-all duration-300" />

          <div className="fixed inset-y-0 right-0 left-0 md:left-[240px] z-[10000] flex items-center justify-end p-10 transition-all duration-300 pointer-events-none">
            <div className="relative w-full max-w-xl flex flex-col justify-between bg-white/95 dark:bg-[#0D1B2A]/95 backdrop-blur-xl border border-[#1F7A1F]/30 dark:border-[#55f761]/30 rounded-3xl shadow-2xl p-6 lg:p-8 overflow-hidden transition-all duration-300 transform scale-100 pointer-events-auto">

              {/* Close Button */}
              <button
                onClick={completeStartActiveProjectsWalkthrough}
                className="absolute top-4 right-4 p-2 rounded-full text-[#2F3E46]/40 hover:text-[#2F3E46]/70 dark:text-white/40 dark:hover:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 transition-colors z-[10010] cursor-pointer"
                title="Dismiss Walkthrough"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>

              <div className="space-y-4">
                {/* Step Counter */}
                <div className="flex justify-between items-center mb-2 relative z-10">
                  <span className="text-[10px] font-black tracking-widest text-[#1F7A1F] dark:text-[#55f761] uppercase bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 px-2.5 py-1 rounded-full">
                    Certification Completed!
                  </span>
                </div>

                {/* Content */}
                <div className="space-y-4 relative z-10">
                  <h3 className="text-lg font-extrabold text-[#0D1B2A] dark:text-white tracking-tight">
                    Start Active Projects
                  </h3>

                  <div className="text-sm leading-relaxed text-[#2F3E46]/90 dark:text-white/80 space-y-3">
                    <p>Congratulations on completing both Landcover Training and Transportation Training! 🎉</p>
                    <p>You are now eligible to register for live projects.</p>
                    <p>Please note that some projects require Judger verification before they become available to you. This process may take a few hours. Once you're verified and a project becomes available, you can register immediately.</p>
                    <p>If you've been waiting for a while, feel free to contact your Team Manager or send a message in the Community Chat so the Judgers can verify your account.</p>
                  </div>
                </div>
              </div>

              {/* Navigation Actions */}
              <div className="flex justify-end items-center mt-6 pt-4 border-t border-black/10 dark:border-white/10 relative z-10">
                <button
                  onClick={completeStartActiveProjectsWalkthrough}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] text-xs font-black shadow-lg shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20 hover:shadow-[#1F7A1F]/30 dark:hover:shadow-[#55f761]/30 active:scale-95 transition-all border border-[#55f761]/20 cursor-pointer"
                >
                  Let's Start
                </button>
              </div>

            </div>
          </div>
        </>
      )}

      {/* Custom Styles for Walkthrough */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes expandContract {
          0%, 100% { 
            transform: scale(1); 
            box-shadow: 0 0 0px rgba(85, 247, 97, 0);
          }
          50% { 
            transform: scale(1.08); 
            box-shadow: 0 0 15px 5px rgba(85, 247, 97, 0.5);
          }
        }
        .animate-expand-contract {
          animation: expandContract 1.5s ease-in-out infinite;
        }
      `}} />
      {successModalData?.isOpen && successModalData.type === 'project' && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#060D14] rounded-2xl w-full max-w-md shadow-2xl border border-black/10 dark:border-white/10 flex flex-col overflow-hidden text-center">
            <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 bg-[#E0E1DD]/30 dark:bg-[#0D1B2A]/30">
              <h3 className="text-lg font-bold text-[#0D1B2A] dark:text-white flex items-center justify-center gap-2">
                🎉 Registration Successful!
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-[#0D1B2A] dark:text-white font-semibold">
                Get ready to enter the dungeon and start earning!
              </p>
              <p className="text-[#2F3E46] dark:text-white/80 text-sm">
                The Dungeon Coordinator will now register your account for this project. Open your Ginger Software and you can start taking on tasks.
              </p>
            </div>
            <div className="border-t border-black/10 dark:border-white/10 p-4 bg-black/5 dark:bg-white/5 flex justify-center">
              <button onClick={() => setSuccessModalData(null)} className="px-8 py-2.5 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] font-bold shadow-lg shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20 hover:scale-105 active:scale-95 transition-all">
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {successModalData?.isOpen && successModalData.type === 'training' && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#060D14] rounded-2xl w-full max-w-md shadow-2xl border border-black/10 dark:border-white/10 flex flex-col overflow-hidden text-center">
            <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 bg-[#E0E1DD]/30 dark:bg-[#0D1B2A]/30">
              <h3 className="text-lg font-bold text-[#0D1B2A] dark:text-white flex items-center justify-center gap-2">
                🎓 Training Unlocked!
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-[#0D1B2A] dark:text-white font-semibold">
                Hello, Challenger! Welcome to the Training Zone.
              </p>
              <p className="text-[#2F3E46] dark:text-white/80 text-sm">
                The Dungeon Coordinator will now register your account for this training. You may open Ginger Software and download your training tasks to begin.
              </p>
            </div>
            <div className="border-t border-black/10 dark:border-white/10 p-4 bg-black/5 dark:bg-white/5 flex justify-center">
              <button onClick={() => setSuccessModalData(null)} className="px-8 py-2.5 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] font-bold shadow-lg shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20 hover:scale-105 active:scale-95 transition-all">
                OK
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
