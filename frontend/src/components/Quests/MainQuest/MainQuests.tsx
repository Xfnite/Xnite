import React, { useState, useEffect } from "react";
import { Info, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import QuestSectionHeader from "../QuestSectionHeader";

export interface MainQuestsProps {
  currentUser: {
    email?: string;
    role?: string;
    name?: string;
    groupId?: number | null;
  };
  isRegistered: boolean;
  isStandardBuildingPassed: boolean;
  isDashboardCompleted: boolean;
  isRulesAndGuidelinesCompleted: boolean;
  hasClickedLandCoverTraining: boolean;
  hasClickedTransportationTraining: boolean;
  onboardingProgress: any;
  onQuestClick: (link: string) => void;
  isOpen: boolean;
}

export default function MainQuests({
  currentUser,
  isRegistered,
  isStandardBuildingPassed,
  isDashboardCompleted,
  isRulesAndGuidelinesCompleted,
  hasClickedLandCoverTraining,
  hasClickedTransportationTraining,
  onboardingProgress,
  onQuestClick,
  isOpen,
}: MainQuestsProps) {
  const [hasVisitedProjects, setHasVisitedProjects] = useState(false);
  const [isAccountWalkthroughCompleted, setIsAccountWalkthroughCompleted] = useState(false);
  const [isMainCollapsed, setIsMainCollapsed] = useState(false);
  const [isSideCollapsed, setIsSideCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const completed = localStorage.getItem("account_walkthrough_completed") === "true";
      setIsAccountWalkthroughCompleted(completed || isStandardBuildingPassed);
      setHasVisitedProjects(localStorage.getItem("xfnite_projects_visited") === "true");
    }
  }, [isStandardBuildingPassed, isOpen]);

  // Parse onboarding module progress
  const modules = (onboardingProgress as any)?.modulesComplete || {};
  let onboardingCount = 0;
  if (modules.download && modules.install) onboardingCount++;
  if (modules["videos-basic"]) onboardingCount++;
  if (modules["videos-3d"]) onboardingCount++;
  if (modules["answer-key"]) onboardingCount++;
  if (modules["answer-key-lib"]) onboardingCount++;

  const roleLower = currentUser?.role?.toLowerCase() || "";
  const isExempt = ["admin", "checker", "judger", "recruiter", "old-labeler", "old labeler"].includes(roleLower);
  const isChapter1Complete = onboardingCount === 5 || isExempt || (isDashboardCompleted && roleLower !== "applicant" && roleLower !== "labeler");

  const mainQuests = [
    {
      id: "main_chap1",
      title: "Chapter 1: Xfnite Prologue",
      description: "Complete Onboarding Training",
      target: `${isChapter1Complete ? 5 : onboardingCount}/5 Modules`,
      xp: 10,
      complete: isChapter1Complete,
      link: "/dashboard",
    },
    {
      id: "main_chap2",
      title: "Chapter 2: Live Field Tutorial",
      description: "Open Ginger software and take on the Hands-on Training. To receive the Congratulations pop-up, make sure to download tasks periodically to check for updates.\n\nIf a Checker returns your task, review the comments, fix the errors, and resubmit it. Once all of your training tasks have been approved, the Congratulations pop-up will appear after downloading task once again.",
      target: `${isStandardBuildingPassed ? 35 : 0}/35 Passed Task`,
      xp: 50,
      complete: isStandardBuildingPassed,
      link: "/account",
    },
    {
      id: "main_chap3",
      title: "Chapter 3: The Realm's Decree",
      description: "Finish Rules and Guidelines",
      target: `${isRulesAndGuidelinesCompleted ? 63 : 0}/63 Rules and Guidelines`,
      xp: 25,
      complete: isRulesAndGuidelinesCompleted,
      link: "/project",
    },
    {
      id: "main_chap4",
      title: "Chapter 4: Unlocking the Forbidden Gates I",
      description: "Take live project's pre-requisite trainings",
      target: `${hasClickedLandCoverTraining ? 18 : 0}/18 Landcover Training`,
      xp: 20,
      complete: hasClickedLandCoverTraining,
      link: "/project?register=landcover",
    },
    {
      id: "main_chap5",
      title: "Chapter 5: Quest Complete: The Novice No More",
      description: "You may take available live task here",
      target: `${hasVisitedProjects ? 1 : 0}/1 Visit Projects tab`,
      xp: 10,
      complete: hasVisitedProjects,
      link: "/project",
    },
    {
      id: "main_chap6",
      title: "Chapter 6: Entering the Alliance",
      description: "Please wait while our Dungeon Coordinator assign you an Overseer Guild",
      target: `${(currentUser?.groupId || currentUser?.role?.toLowerCase() === "checker" || currentUser?.role?.toLowerCase() === "judger" || currentUser?.role?.toLowerCase() === "admin") ? 1 : 0}/1 Join Overseer Guild`,
      xp: 10,
      complete: !!currentUser?.groupId || currentUser?.role?.toLowerCase() === "checker" || currentUser?.role?.toLowerCase() === "judger" || currentUser?.role?.toLowerCase() === "admin",
      link: "/project",
    },
    {
      id: "main_chap7",
      title: "Chapter 7: First Blood",
      description: "Take-on and submit 1 live task in Ginger Software",
      target: (() => {
        const hasFirstBlood = currentUser?.role?.toLowerCase() === "checker" || currentUser?.role?.toLowerCase() === "judger" || currentUser?.role?.toLowerCase() === "admin" || (typeof window !== "undefined" && localStorage.getItem("xfnite_first_blood") === "true");
        return `${hasFirstBlood ? 1 : 0}/1 Live Task`;
      })(),
      xp: 15,
      complete: currentUser?.role?.toLowerCase() === "checker" || currentUser?.role?.toLowerCase() === "judger" || currentUser?.role?.toLowerCase() === "admin" || (typeof window !== "undefined" && localStorage.getItem("xfnite_first_blood") === "true"),
      link: "/project",
    },
  ];

  const activeMainQuests = mainQuests.find(q => !q.complete) ? [mainQuests.find(q => !q.complete)!] : [];
  const completedCount = mainQuests.filter(q => q.complete).length;

  const sideQuests = [
    {
      id: "side_transpo",
      title: "Unlocking the Forbidden Gates II",
      description: "Take live project's pre-requisite transportation trainings",
      target: `${hasClickedTransportationTraining ? "Passed" : "0/8 Transportation Training"}`,
      xp: 15,
      complete: hasClickedTransportationTraining,
      link: "/project?register=transportation",
      disabled: false,
    },
    {
      id: "side_3d_match",
      title: "Unlocking the Forbidden Gates III",
      description: "3D Match Training (Temporarily disabled)",
      target: "0/7 3D Match Training",
      xp: 15,
      complete: false,
      link: "#",
      disabled: true,
    },
    {
      id: "side_roof",
      title: "Unlocking the Forbidden Gates IV",
      description: "Roof Training (Temporarily disabled)",
      target: "0/7 Roof Training",
      xp: 15,
      complete: false,
      link: "#",
      disabled: true,
    }
  ];

  return (
    <div className="mt-3">
      <QuestSectionHeader
        title="Main Quests"
        completed={completedCount}
        total={mainQuests.length}
        isCollapsed={isMainCollapsed}
        onToggle={() => setIsMainCollapsed((v) => !v)}
      />
      {isMainCollapsed ? null : activeMainQuests.length === 0 ? (
        <div className="py-2 text-center select-none border-b border-black/5 dark:border-white/5">
          <p className="text-xs text-[#1F7A1F] dark:text-[#55f761] font-bold italic">No active main quests</p>
        </div>
      ) : (
        <div className="space-y-0">
          {activeMainQuests.map((quest) => (
            <div
              key={quest.id}
              className="border-b border-x-0 rounded-none transition-colors overflow-hidden bg-black/5 dark:bg-black/20 border-black/5 dark:border-white/5"
            >
              <div
                onClick={() => onQuestClick(quest.link)}
                className="py-2.5 px-5 flex items-center justify-between select-none cursor-pointer group/quest"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div>
                    <span className="relative flex h-3 w-3 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500 border border-amber-400"></span>
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold tracking-wide text-slate-800 dark:text-slate-200 group-hover/quest:text-amber-500 dark:group-hover/quest:text-amber-400 transition-colors">
                      {quest.title}
                    </h4>
                    <p className="text-[10px] font-bold mt-0.5 text-amber-500 dark:text-amber-400/80">
                      {quest.target}
                    </p>
                  </div>
                </div>
              </div>
              {/* Main Quest Details */}
              <div className="bg-black/5 dark:bg-black/10 text-xs text-slate-600 dark:text-slate-300 border-t border-black/5 dark:border-white/5">
                <div className="px-5 pb-4 pt-2.5">
                  <div className="flex items-start gap-2 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                    <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                      {quest.description}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Side Quests Section - displays only after main quests are complete */}
      {activeMainQuests.length === 0 && (
        <div className="mt-3">
          <QuestSectionHeader
            title="Side Quests"
            completed={sideQuests.filter(q => q.complete).length}
            total={sideQuests.length}
            isCollapsed={isSideCollapsed}
            onToggle={() => setIsSideCollapsed((v) => !v)}
          />
          {!isSideCollapsed && (
          <div className="space-y-0">
            {sideQuests.map((quest) => (
              <div
                key={quest.id}
                className={cn(
                  "border-b border-x-0 rounded-none transition-colors overflow-hidden border-black/5 dark:border-white/5",
                  quest.disabled
                    ? "bg-black/10 dark:bg-black/40 opacity-40 cursor-not-allowed select-none"
                    : "bg-black/5 dark:bg-black/20"
                )}
              >
                <div
                  onClick={() => {
                    if (!quest.disabled) {
                      onQuestClick(quest.link);
                    }
                  }}
                  className={cn(
                    "py-2.5 px-5 flex items-center justify-between select-none",
                    quest.disabled ? "cursor-not-allowed" : "cursor-pointer group/quest"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div>
                      {quest.complete ? (
                        <CheckCircle2 className="w-4 h-4 text-[#1F7A1F] dark:text-[#55f761] fill-[#1F7A1F]/10 dark:fill-[#55f761]/10 shrink-0" />
                      ) : (
                        <span className="relative flex h-3 w-3 shrink-0">
                          {!quest.disabled && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60"></span>}
                          <span className={cn(
                            "relative inline-flex rounded-full h-3 w-3 border",
                            quest.disabled
                              ? "bg-slate-400 border-slate-300 dark:bg-slate-700 dark:border-slate-600"
                              : "bg-amber-500 border-amber-400"
                          )}></span>
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className={cn(
                        "text-xs font-bold tracking-wide transition-colors",
                        quest.disabled
                          ? "text-slate-400 dark:text-slate-500"
                          : "text-slate-800 dark:text-slate-200 group-hover/quest:text-amber-500 dark:group-hover/quest:text-amber-400"
                      )}>
                        {quest.title}
                      </h4>
                      <p className={cn(
                        "text-[10px] font-bold mt-0.5",
                        quest.disabled ? "text-slate-400 dark:text-slate-500" : "text-amber-500 dark:text-amber-400/80"
                      )}>
                        {quest.target}
                      </p>
                    </div>
                  </div>
                </div>
                {/* Details */}
                <div className="bg-black/5 dark:bg-black/10 text-xs text-slate-600 dark:text-slate-300 border-t border-black/5 dark:border-white/5">
                  <div className="px-5 pb-4 pt-2.5">
                    <div className="flex items-start gap-2 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                      <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                        {quest.description}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      )}
    </div>
  );
}
