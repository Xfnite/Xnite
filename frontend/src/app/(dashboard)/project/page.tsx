"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ActiveProjectsTab } from "@/components/Project/ActiveProjectsTab";
import { TaskSummaryTab } from "@/components/Project/TaskSummaryTab";
import { PerformanceQueryTab } from "@/components/Project/PerformanceQueryTab";
import { RulesModal } from "@/components/Project/RulesTab";
import { getProjectRulesStatus } from "@/app/actions/project";
import { getSessionUser, updateActiveProjectsTutorialProgressAction } from "@/app/actions/auth";

export default function ProjectPage() {
  const [activeTab, setActiveTab] = useState<"active" | "performance" | "summary" | "rules">("active");
  const [isRulesCompleted, setIsRulesCompleted] = useState<boolean | null>(null);
  const [projectWalkthroughStep, setProjectWalkthroughStep] = useState<number>(-1);
  const [isWalkthroughCompleted, setIsWalkthroughCompleted] = useState<boolean>(false);

  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    getProjectRulesStatus().then((res) => {
      setIsRulesCompleted(res.accepted);
    });
  }, []);

  const tabParam = searchParams.get("tab");

  useEffect(() => {
    if (isRulesCompleted === false) {
      setActiveTab("active");
      return;
    }
    if (tabParam === "active" || tabParam === "performance" || tabParam === "summary" || tabParam === "rules") {
      setActiveTab(tabParam);
    }
  }, [tabParam, isRulesCompleted]);

  const isLoaded = useRef(false);
  const isInitialMount = useRef(true);

  useEffect(() => {
    getSessionUser().then((user) => {
      if (user) {
        const isOldLabeler = (user as any).role?.toLowerCase() === "old labeler";
        const tutProgress = (user as any).activeProjectsTutorialProgress || {};

        // Auto-complete for Old Labelers
        const completed = isOldLabeler ? true : (tutProgress.project_walkthrough_completed === true);
        setIsWalkthroughCompleted(completed);

        const trigger = searchParams.get("trigger_project_walkthrough");
        if (trigger === "true") {
          updateActiveProjectsTutorialProgressAction({
            project_walkthrough_completed: false,
            project_walkthrough_step: 0
          }).then(() => {
            setProjectWalkthroughStep(0);
            setIsWalkthroughCompleted(false);
            isLoaded.current = true;
            router.replace("/project");
          });
        } else {
          if (!completed) {
            const stepNum = tutProgress.project_walkthrough_step;
            if (typeof stepNum === 'number' && stepNum >= 0 && stepNum <= 5) {
              setProjectWalkthroughStep(stepNum);
            } else {
              setProjectWalkthroughStep(0);
            }
          } else {
            setProjectWalkthroughStep(-1);
          }
          isLoaded.current = true;
        }
      } else {
        isLoaded.current = true;
        setProjectWalkthroughStep(0);
      }
    });
  }, [searchParams, router]);

  useEffect(() => {
    if (!isLoaded.current) return;

    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (projectWalkthroughStep >= 0) {
      updateActiveProjectsTutorialProgressAction({ project_walkthrough_step: projectWalkthroughStep });
    } else if (projectWalkthroughStep === -1) {
      if (!isWalkthroughCompleted) {
        updateActiveProjectsTutorialProgressAction({
          project_walkthrough_completed: true,
          project_walkthrough_step: -1
        });
        setIsWalkthroughCompleted(true);
      }
    }
  }, [projectWalkthroughStep, isWalkthroughCompleted]);

  // Clean up old localStorage items smoothly
  useEffect(() => {
    localStorage.removeItem("project_walkthrough_completed");
    localStorage.removeItem("project_walkthrough_step");
  }, []);

  if (isRulesCompleted === null) {
    return (
      <div className="w-full min-h-[85vh] flex items-center justify-center p-4">
        <div className="flex items-center gap-3 py-4 text-[#0D1B2A] dark:text-white">
          <div className="w-5 h-5 border-2 border-[#1F7A1F] dark:border-[#55f761] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium opacity-80">Loading project...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-full">
      {/* Mesh Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute bg-[#55f761] filter blur-[100px] rounded-full opacity-30 dark:opacity-15" style={{ width: '40vw', height: '40vw', top: '-10%', left: '-10%' }}></div>
        <div className="absolute bg-[#1F7A1F] filter blur-[100px] rounded-full opacity-30 dark:opacity-15" style={{ width: '50vw', height: '50vw', top: '40%', right: '-20%' }}></div>
      </div>

      <div className="relative z-10 space-y-6 w-full max-w-5xl mx-auto pt-4 pb-12">
        <section className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${projectWalkthroughStep >= 0 ? 'opacity-20 pointer-events-none' : ''}`}>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#0D1B2A] dark:text-white mb-1">
              {activeTab === "active" ? "Active Projects" : activeTab === "performance" ? "Performance Query" : activeTab === "summary" ? "Overall Task Summary" : "Rules and Guidelines"}
            </h1>
            <p className="text-sm text-[#2F3E46] dark:text-white/60">
              {activeTab === "active" ? "View and manage your active project deployments." : activeTab === "performance" ? "Analyze your personal performance." : activeTab === "summary" ? "Analyze your completed tasks." : "View rules and guidelines."}
            </p>
          </div>
          {activeTab === "active" && isRulesCompleted && (
            <button
              onClick={() => setProjectWalkthroughStep(0)}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 text-[#1F7A1F] dark:text-[#55f761] hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 transition-all duration-300 shadow-sm self-start sm:self-auto cursor-pointer"
              title="Show Guide"
              aria-label="Show Guide"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
              </svg>
            </button>
          )}
        </section>



        {/* Tab Content */}
        {activeTab === "active" && (
          <ActiveProjectsTab
            setActiveTab={setActiveTab}
            walkthroughStep={isRulesCompleted ? projectWalkthroughStep : -1}
            setWalkthroughStep={setProjectWalkthroughStep}
            isRulesCompleted={isRulesCompleted}
          />
        )}
        {activeTab === "performance" && <PerformanceQueryTab />}
        {activeTab === "summary" && <TaskSummaryTab />}
        {/* Rules tab inline (only when already completed and user clicks tab) */}
        {activeTab === "rules" && isRulesCompleted && (
          <div className="w-full min-h-[85vh] relative flex flex-col animate-in fade-in zoom-in-95 duration-300">
            <RulesModal
              isOpen={true}
              onClose={() => router.push("/project?tab=active")}
              onSuccess={() => {
                setIsRulesCompleted(true);
                router.push("/project?tab=active");
              }}
            />
          </div>
        )}
      </div>

      {/* Rules Modal Overlay — scoped to project content area only */}
      {!isRulesCompleted && (
        <div className="absolute -inset-6 z-50 flex items-center justify-center animate-in fade-in duration-300">
          {/* Blurred backdrop without darken */}
          <div className="absolute inset-0 backdrop-blur-md" />
          {/* Modal container */}
          <div className="relative z-10 w-[95%] max-w-5xl h-[90%] flex flex-col animate-in zoom-in-95 duration-300 my-4">
            <RulesModal
              isOpen={true}
              onClose={undefined}
              onSuccess={() => {
                setIsRulesCompleted(true);
                router.push("/project?tab=active");
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
