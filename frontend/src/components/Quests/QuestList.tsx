import React, { useState, useEffect } from "react";
import MainQuests from "./MainQuest/MainQuests";
import DailyQuests, { DailyQuestType } from "./DailyQuest/DailyQuests";

interface QuestListProps {
  // Daily quest properties
  localDailyQuests: DailyQuestType[];
  expandedQuestId: string | null;
  toggleQuest: (id: string) => void;
  handleCompletedClick: (questId: string, xp: number) => void;

  // Main quest properties
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

export default function QuestList({
  localDailyQuests,
  expandedQuestId,
  toggleQuest,
  handleCompletedClick,
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
}: QuestListProps) {
  const [hasVisitedProjects, setHasVisitedProjects] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHasVisitedProjects(localStorage.getItem("xfnite_projects_visited") === "true");
    }
  }, [isOpen]);

  const roleLower = currentUser?.role?.toLowerCase() || "";
  // `currentUser.role` is the RAW db role, not the gamified label. "Challenger"
  // is only the display name for `labeler` (see getGamifiedRoleLabel), so
  // comparing against "challenger" here was never true and hid every daily quest.
  const isChallenger = roleLower === "labeler" || roleLower === "challenger";
  const isStaffOrExempt = ["admin", "checker", "judger", "recruiter", "old-labeler", "old labeler"].includes(roleLower);

  // "Challenger and up": labeler (Challenger) plus every senior role. Novice
  // (applicant) and any unranked role sit below Challenger and never see dailies.
  // This is known instantly from the role, unlike the props below, so it's the
  // only thing allowed to hide the section outright.
  const isChallengerOrAbove = isChallenger || isStaffOrExempt;

  // "Finished the main quest" — through Chapter 5 ("Quest Complete: The Novice No
  // More"). Staff/senior roles are past the main quest, so they count as finished.
  // Deliberately excludes isStandardBuildingPassed: that prop arrives from a slow
  // (sometimes external-API-backed) check in the layout and defaults to false
  // while it's in flight, so including it here made Daily Quests visibly pop in
  // 1-2s after Main Quests for users who HAD passed it. The other three signals
  // don't have that race (single fast session field or synchronous localStorage),
  // so they still gate the section normally.
  const isMainQuestFinished = isStaffOrExempt || (
    isRulesAndGuidelinesCompleted &&
    hasClickedLandCoverTraining &&
    hasVisitedProjects
  );

  // Daily quests require BOTH: Challenger-or-above AND the main quest finished
  // (by the instantly-known signals above).
  const showDailyQuests = isChallengerOrAbove && isMainQuestFinished;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto pt-0 pb-0 px-0 space-y-3 scrollbar-thin scrollbar-thumb-amber-500/20 scrollbar-track-transparent">
      {/* Main Quests */}
      <MainQuests
        currentUser={currentUser}
        isRegistered={isRegistered}
        isStandardBuildingPassed={isStandardBuildingPassed}
        isDashboardCompleted={isDashboardCompleted}
        isRulesAndGuidelinesCompleted={isRulesAndGuidelinesCompleted}
        hasClickedLandCoverTraining={hasClickedLandCoverTraining}
        hasClickedTransportationTraining={hasClickedTransportationTraining}
        onboardingProgress={onboardingProgress}
        onQuestClick={onQuestClick}
        isOpen={isOpen}
      />

      {/* Daily Quests Section (only when the main quest is finished AND the role is Challenger-or-above) */}
      {showDailyQuests && (
        <DailyQuests
          localDailyQuests={localDailyQuests}
          expandedQuestId={expandedQuestId}
          toggleQuest={toggleQuest}
          handleCompletedClick={handleCompletedClick}
        />
      )}
    </div>
  );
}
