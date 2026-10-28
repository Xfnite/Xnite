"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useOnboardingProgress, VIDEO_IDS, INSTALL_CHECKLIST, DOWNLOAD_KEYS, BASIC_VIDEO_ITEMS, ADVANCED_ITEMS, BASIC_VIDEO_YOUTUBE_IDS, ADVANCED_VIDEO_YOUTUBE_IDS, BASIC_VIDEO_ITEMS_UI, ADVANCED_ITEMS_UI, ONBOARDING_VIDEO_DURATIONS, calcVideoCountdown } from "@/components/Onboarding/useOnboardingProgress";
import { registerWithGingerAction, getSessionUser, completeDashboardAction } from "@/app/actions/auth";
import { isDemoGingerEmail } from "@/lib/demoAccount";
import InlineVideoPlayer from "@/components/Onboarding/InlineVideoPlayer";
import TrainingModuleCard, { StepVariant, DownloadRow, InstallBlock, VideoItem } from "@/components/Onboarding/TrainingModuleCard";
import AnswerKeyPanel, { ANSWER_KEY_TASKS, ANSWER_KEY_LIBRARY_TASKS } from "@/components/Onboarding/AnswerKeyPanel";
import AnswerCard from "@/components/Onboarding/AnswerCard";
import { isStaff } from "@/config/permissions";

// ─── Admin Config ─────────────────────────────────────────────────────────────
const LIVE_SESSION_ENABLED = false;
const LIVE_SESSION_HREF = "";

// ─── Data ─────────────────────────────────────────────────────────────────────

interface ModuleDef {
  id: string; step: number; tag: string; title: string;
  description: string; variant: StepVariant;
  primaryHref?: string; primaryLabel?: string;
}

// Stage 2 modules (Answer Key moved to Stage 3)
const MODULES: ModuleDef[] = [
  { id: "download",     step: 1, tag: "Step 01 · Required",  title: "Download Our Software",                        description: "Download all pre-requisite software that we will use throughout the Hands-on Training.", variant: "download" },
  { id: "install",      step: 2, tag: "Step 02 · Install",   title: "Install the Software",                         description: "Install all downloaded software following the steps below.", variant: "install-visual" },
  { id: "videos-basic", step: 3, tag: "Step 03 · Required",  title: "Watch Training Videos: Basic Labeling Guide",  description: "Watch all basic labeling training videos before starting Hands-on Training.", variant: "video-basic" },
  { id: "videos-3d",    step: 4, tag: "Step 04 · Required",  title: "Watch Training Videos: 3D & Multilayer Guide", description: "Read and watch all 3D and Multilayer training materials before starting the Hands-on Training.", variant: "video-3d" },
  { id: "answer-key-lib", step: 5, tag: "Step 05",           title: "Answer Key Library",                           description: "Reference for all tasks.", variant: "download" }, // variant doesn't matter much here since we'll render it custom
];

// (ANSWER_KEY_MOD kept for backwards compat with sidebar completion check)
const ANSWER_KEY_MOD_ID = "answer-key";

// Staff preview (/dashboard?preview=1&step=…&sub=…): every part is marked done so mentors can
// open any page a trainee is stuck on. Held in memory only — never saved.
const PREVIEW_VIDEO_KEYS = [
  ...BASIC_VIDEO_ITEMS_UI.map((v) => `videos-basic::${v.id}`),
  ...ADVANCED_ITEMS_UI.map((v) => `videos-3d::${v.id}`),
];
const PREVIEW_PROGRESS = {
  modulesComplete: Object.fromEntries([...MODULES.map((m) => m.id), ANSWER_KEY_MOD_ID].map((id) => [id, true])),
  checklistItems: Object.fromEntries(INSTALL_CHECKLIST.map((i) => [`install::${i.id}`, true])),
  subItemsOpened: Object.fromEntries([...DOWNLOAD_KEYS.map((k) => `download::${k}`), ...PREVIEW_VIDEO_KEYS].map((k) => [k, true])),
  moduleVideoWatched: Object.fromEntries(PREVIEW_VIDEO_KEYS.map((k) => [k, 100])),
  answerKeyProgress: Object.fromEntries(ANSWER_KEY_TASKS.map((t) => [t.taskId, true])),
};

// ─── Icons ─────────────────────────────────────────────────────────────────────
const CheckIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);
function CheckCircleIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function EmptyCircleIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg className="w-3.5 h-3.5 opacity-40" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}
function MenuIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
    </svg>
  );
}
function KeyIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}

// ── Helper to format seconds for video countdown ──────────────────────────────
function formatVideoCountdown(secs: number): string {
  if (secs < 0) return "...";
  if (secs === 0) return "0sec";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m > 0) {
    return s > 0 ? `${m}min ${s}sec` : `${m}min`;
  }
  return `${s}sec`;
}

// ─── Nav button components ─────────────────────────────────────────────────────
const prevBtnCls = "flex items-center gap-2.5 px-5 py-3 rounded-xl bg-white/90 dark:bg-[#1B263B]/90 backdrop-blur-md text-[#0D1B2A] dark:text-white font-bold text-sm shadow-xl shadow-black/5 dark:shadow-white/5 hover:scale-105 active:scale-95 transition-all border border-black/10 dark:border-white/10";
const nextBtnCls = "flex items-center gap-2.5 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] font-bold text-sm shadow-xl shadow-[#1F7A1F]/30 dark:shadow-[#55f761]/30 hover:scale-105 active:scale-95 transition-all border border-[#55f761]/20 cursor-pointer";
const countdownBtnCls = "flex items-center gap-2.5 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] font-bold text-sm shadow-xl shadow-black/5 opacity-60 cursor-not-allowed transition-all border border-[#55f761]/20";
const disabledNextBtnCls = "flex items-center gap-2.5 px-5 py-3 rounded-xl bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40 font-bold text-sm border border-black/10 dark:border-white/10 cursor-not-allowed opacity-50";

// ─── Sidebar step row ─────────────────────────────────────────────────────────
function SidebarStepRow({
  id, label, isActive, isCompleted, isLocked, onClick, stepNum,
}: {
  id: string; label: string; isActive: boolean; isCompleted: boolean;
  isLocked: boolean; onClick: () => void; stepNum?: string;
}) {
  return (
    <button
      onClick={isLocked ? undefined : onClick}
      className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-150 group
        ${isLocked ? "opacity-40 cursor-default" : "cursor-pointer hover:bg-[#1F7A1F]/5 dark:hover:bg-[#55f761]/5"}
        ${isActive
          ? "border-l-2 border-[#1F7A1F] dark:border-[#55f761] bg-[#1F7A1F]/8 dark:bg-[#55f761]/8 pl-[10px]"
          : "border-l-2 border-transparent"
        }`}
    >
      <span className={`flex-shrink-0 transition-colors ${isLocked ? "text-black/25 dark:text-white/25" : isCompleted ? "text-[#1F7A1F] dark:text-[#55f761]" : "text-black/25 dark:text-white/25"}`}>
        {isLocked ? <LockIcon /> : isCompleted ? <CheckCircleIcon /> : <EmptyCircleIcon />}
      </span>
      <span className={`flex-1 text-xs font-medium leading-snug truncate
        ${isActive ? "text-[#1F7A1F] dark:text-[#55f761] font-semibold" : "text-black/75 dark:text-white/70"}`}>
        {stepNum && <span className="opacity-50 mr-1 font-mono text-[10px]">{stepNum}</span>}
        {label}
      </span>
      {/* {isCompleted && (
        <span className="flex-shrink-0 text-[#1F7A1F] dark:text-[#55f761]">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
          </svg>
        </span>
      )} */}
    </button>
  );
}

// ─── Stage section (collapsible) ──────────────────────────────────────────────
function StageSection({
  stageNum, title, doneCount, totalCount, progressPct, isOpen, onToggle, children, isLocked,
}: {
  stageNum: string; title: string; doneCount: number; totalCount: number;
  progressPct: number; isOpen: boolean; onToggle: () => void;
  children: React.ReactNode; isLocked?: boolean;
}) {
  return (
    <div className="mb-2">
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-2 px-3 py-3 rounded-xl transition-all
          bg-black/[0.03] dark:bg-white/[0.03] hover:bg-black/[0.05] dark:hover:bg-white/[0.05]
          border border-black/8 dark:border-white/8 cursor-pointer
          ${isLocked ? "opacity-50" : ""}`}
      >
        <span className="text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] flex-shrink-0">
          {stageNum}
        </span>
        <span className="flex-1 text-left text-xs font-bold text-black/80 dark:text-white/80 leading-tight">{title}</span>
        <span className="text-[10px] font-semibold text-black/50 dark:text-white/40 flex-shrink-0 mr-1">{doneCount}/{totalCount}</span>
        <ChevronIcon open={isOpen} />
      </button>
      <div className="mx-1 h-0.5 bg-black/8 dark:bg-white/8 rounded-full overflow-hidden mt-0.5 mb-1">
        <div className="h-full bg-gradient-to-r from-[#1F7A1F] to-[#55f761] rounded-full transition-all duration-700" style={{ width: `${progressPct}%` }} />
      </div>
      {isOpen && <div className="pt-1 space-y-0.5 px-1">{children}</div>}
    </div>
  );
}

// ─── Welcome card ─────────────────────────────────────────────────────────────
function WelcomeCard({ overallPercent, tasksDone, totalTasks, onStart }: { overallPercent: number; tasksDone: number; totalTasks: number; onStart: () => void }) {
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-[#1F7A1F]/20 to-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 flex items-center justify-center">
          <span className="text-2xl">🚀</span>
        </div>
        <h2 className="text-xl font-black text-black/90 dark:text-white/90 mb-2">Welcome to XFNITE</h2>
        <p className="text-sm text-black/55 dark:text-white/50 mb-8 leading-relaxed">
          Complete all steps to unlock your full dashboard.
        </p>
        <div className="bg-white/60 dark:bg-white/[0.04] border border-black/8 dark:border-white/8 rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-black/60 dark:text-white/50">Overall Progress</span>
            <span className="text-sm font-black text-[#1F7A1F] dark:text-[#55f761]">{overallPercent}%</span>
          </div>
          <div className="h-2 bg-black/8 dark:bg-white/8 rounded-full overflow-hidden mb-3">
            <div className="h-full bg-gradient-to-r from-[#1F7A1F] to-[#55f761] rounded-full transition-all duration-700 shadow-[0_0_8px_rgba(85,247,97,0.3)]" style={{ width: `${overallPercent}%` }} />
          </div>
          <p className="text-[11px] text-black/45 dark:text-white/35">{tasksDone} of {totalTasks} tasks completed</p>
        </div>
        <button
          onClick={onStart}
          className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] font-black text-sm shadow-xl shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20 hover:shadow-[#1F7A1F]/30 dark:hover:shadow-[#55f761]/30 active:scale-95 transition-all border border-[#55f761]/20 cursor-pointer"
        >
          {tasksDone > 0 ? "Continue" : "Start Now"}
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Completion banner ─────────────────────────────────────────────────────────
function CompletionBanner({ onNavigate, isStandardBuildingPassed }: { onNavigate: () => void, isStandardBuildingPassed: boolean }) {
  const [loading, setLoading] = useState(false);

  const handleFinish = async () => {
    try {
      setLoading(true);
      const { success } = await completeDashboardAction();
      if (success) {
        if (!isStandardBuildingPassed) {
          const { forceGingerLoginAction } = await import("@/app/actions/auth");
          const res = await forceGingerLoginAction();
          if (res.success && res.token) {
            localStorage.setItem("scrapedGingerData", JSON.stringify({
              credential: { access_token: res.token }
            }));
          }
        }
        onNavigate();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-[#1F7A1F] to-[#55f761] flex items-center justify-center shadow-xl shadow-[#1F7A1F]/30">
          <svg className="w-10 h-10 text-white dark:text-[#060D14]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-black text-black/90 dark:text-white/90 mb-2">Onboarding Complete!</h2>
        <p className="text-sm text-black/55 dark:text-white/50 mb-6">
          You've completed all stages. {isStandardBuildingPassed ? "Your full dashboard is now unlocked." : "Please continue to your Account Info."}
        </p>
        <button
          onClick={handleFinish}
          disabled={loading}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#1F7A1F] text-white dark:bg-[#55f761] dark:text-[#060D14] font-bold text-sm hover:bg-[#145214] dark:hover:bg-[#3de34a] transition-all hover:scale-105 active:scale-95 shadow-xl shadow-[#1F7A1F]/20 disabled:opacity-50 cursor-pointer"
        >
          {loading ? "Unlocking..." : (isStandardBuildingPassed ? "Go to Dashboard" : "Continue to Account Info")}
          {!loading && (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function OnboardingDashboardPage() {
  const router = useRouter();
  const isDev = process.env.NEXT_PUBLIC_APP_ENV === "development" || (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_APP_ENV !== "production");
  const [isRegistered, setIsRegistered] = useState(false);
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);
  const [dbProgress, setDbProgress] = useState<any>(null);
  const [isStandardBuildingPassed, setIsStandardBuildingPassed] = useState(false);
  const [isPreview, setIsPreview] = useState(false);

  useEffect(() => {
    import("@/app/actions/auth").then(({ checkStandardBuildingPassedAction }) => {
      checkStandardBuildingPassedAction().then(setIsStandardBuildingPassed);
    });

    getSessionUser().then((user) => {
      // Demo/stub account: no onboarding — send straight to Projects.
      if (isDemoGingerEmail(user?.email)) {
        router.replace("/project");
        return;
      }

      // Staff preview: don't load or touch the viewer's own onboarding, and skip Ginger registration
      if (new URLSearchParams(window.location.search).get("preview") === "1" && isStaff(user?.role)) {
        setIsPreview(true);
        return;
      }

      if (user?.isRegistered) setIsRegistered(true);
      if (user?.email) setUserEmail(user.email);
      if (user?.onboardingProgress) setDbProgress(user.onboardingProgress);

      // Trigger Ginger registration IMMEDIATELY if not registered
      if (user && !user.isRegistered) {
        import("@/app/actions/auth").then(({ registerWithGingerAction }) => {
          registerWithGingerAction().then((res) => {
            if (res.success && res.data?.credential?.access_token) {
              setIsRegistered(true);
              localStorage.setItem(
                "scrapedGingerData",
                JSON.stringify({
                  credential: {
                    access_token: res.data.credential.access_token,
                  },
                })
              );
            }
          }).catch(console.error);
        });
      }
    });
  }, []);

  const {
    progress, overallPercent, tasksDone, totalTasks,
    markVideoProgress, markModuleComplete, markChecklistItem, markSubItemOpened, markModuleVideoProgress,
    markAnswerKeyTaskVisited,
  } = useOnboardingProgress(
    undefined,
    isRegistered,
    isPreview ? undefined : userEmail,
    isPreview ? PREVIEW_PROGRESS : dbProgress,
    isPreview
  );

  const hasCalledCompleteDashboardRef = useRef(false);

  useEffect(() => {
    if (isPreview) return;
    if (progress.onboardingComplete && !hasCalledCompleteDashboardRef.current) {
      hasCalledCompleteDashboardRef.current = true;
      completeDashboardAction().then(() => {
        window.dispatchEvent(new Event("dashboard_completed"));
      }).catch(console.error);
    }
  }, [progress.onboardingComplete, isPreview]);

  // ── Navigation state
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [activeSubItemIndex, setActiveSubItemIndex] = useState<number>(0);
  const [answerKeySubIndex, setAnswerKeySubIndex] = useState<number>(0);
  const [stage1Open, setStage1Open] = useState(true);
  const [stage2Open, setStage2Open] = useState(true);
  const [stage3Open, setStage3Open] = useState(true);
  const [stage4Open, setStage4Open] = useState(true);
  const [stage5Open, setStage5Open] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Auto-collapse/expand modules based on state
  useEffect(() => {
    // Module 1
    const m1Selected = activeStep === "download" || activeStep === "install";
    const m1Finished = !!progress.modulesComplete["download"] && !!progress.modulesComplete["install"];
    if (m1Selected) setStage1Open(true);
    else if (m1Finished) setStage1Open(false);
    else setStage1Open(true);

    // Module 2
    const m2Selected = activeStep === "videos-basic";
    const m2Finished = !!progress.modulesComplete["videos-basic"];
    const m2Locked = !progress.modulesComplete["install"];
    if (m2Selected) setStage2Open(true);
    else if (m2Finished || m2Locked) setStage2Open(false);
    else setStage2Open(true);

    // Module 3
    const m3Selected = activeStep === "videos-3d";
    const m3Finished = !!progress.modulesComplete["videos-3d"];
    const m3Locked = !progress.modulesComplete["videos-basic"];
    if (m3Selected) setStage3Open(true);
    else if (m3Finished || m3Locked) setStage3Open(false);
    else setStage3Open(true);

    // Module 4 (Answer Key)
    const m4Selected = activeStep === ANSWER_KEY_MOD_ID;
    const m4Finished = !!progress.modulesComplete[ANSWER_KEY_MOD_ID];
    const m4Locked = !progress.stage2Complete;
    if (m4Selected) setStage4Open(true);
    else if (m4Finished || m4Locked) setStage4Open(false);
    else setStage4Open(true);

    // Module 5 (Answer Key Lib)
    const m5Selected = activeStep === "answer-key-lib";
    const m5Finished = false; // it's never "finished" as it's a library
    const m5Locked = !m4Finished;
    if (m5Selected) setStage5Open(true);
    else if (m5Finished || m5Locked) setStage5Open(false);
    else setStage5Open(true);
  }, [activeStep, progress.modulesComplete, progress.stage2Complete]);

  // ── Per-video countdown state for "Next" button unlock
  // Maps video key ("stepId::itemId") to countdown seconds.
  // -1 = not yet started, N = counting down, 0 = unlocked
  const [countdownMap, setCountdownMap] = useState<Record<string, number>>({});
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [hasVideoStarted, setHasVideoStarted] = useState(false);
  const [videoTimeState, setVideoTimeState] = useState<Record<string, { currentTime: number; duration: number }>>({});
  const [initiallyCompletedVideos, setInitiallyCompletedVideos] = useState<Record<string, boolean>>({});
  const [currentlyEndedVideos, setCurrentlyEndedVideos] = useState<Record<string, boolean>>({});
  const [playSignal, setPlaySignal] = useState(0);

  // ── Search state (for Stage 3 page)
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const filteredAnswerKeyTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return ANSWER_KEY_LIBRARY_TASKS;
    return ANSWER_KEY_LIBRARY_TASKS.filter((t) =>
      t.taskId.toLowerCase().includes(q) ||
      (t.note ?? "").toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // ── Step transition — resets sub-item + video state but NOT countdown map
  const handleSetActiveStep = useCallback((stepId: string | null, subIndex: number = 0) => {
    setActiveStep(stepId);
    setActiveSubItemIndex(subIndex);
    setSearchQuery("");
    setSearchOpen(false);
    // Don't reset countdown map - per-video countdowns persist across navigation
    setHasVideoStarted(false);
    setIsVideoPlaying(false);
  }, []);

  // Staff preview deep link: jump straight to the requested part (defaults to the first page)
  useEffect(() => {
    if (!isPreview) return;
    const params = new URLSearchParams(window.location.search);
    const step = params.get("step") || "download";
    const sub = Math.max(0, Number(params.get("sub")) || 0);
    if (step === ANSWER_KEY_MOD_ID) {
      handleSetActiveStep(step);
      setAnswerKeySubIndex(Math.min(sub, ANSWER_KEY_TASKS.length - 1));
    } else {
      handleSetActiveStep(step, sub);
    }
  }, [isPreview, handleSetActiveStep]);

  // Check if current active sub-item has a video
  const activeSubItem = (() => {
    if (!activeStep) return null;
    const mod = MODULES.find((m) => m.id === activeStep);
    if (!mod || (mod.variant !== "video-basic" && mod.variant !== "video-3d")) return null;
    const items = mod.id === "videos-basic" ? BASIC_VIDEO_ITEMS_UI : ADVANCED_ITEMS_UI;
    return items[activeSubItemIndex] || null;
  })();

  const hasVideoOnPage = !!(activeSubItem && !activeSubItem.isDoc && !activeSubItem.isPlaylist && !activeSubItem.isInfo);
  const hasInfoOnPage = !!(activeSubItem && activeSubItem.isInfo);
  const hasCountdownOnPage = hasVideoOnPage || hasInfoOnPage;

  // Get the current video's countdown key and seconds
  const activeVideoKey = activeStep && activeSubItem ? `${activeStep}::${activeSubItem.id}` : null;
  const countdownSecs = isDev || isPreview ? 0 : (activeVideoKey ? (countdownMap[activeVideoKey] ?? -1) : 0);

  const isVideoFinished = (() => {
    if (!activeStep || !activeSubItem) return false;
    if (activeSubItem.isDoc || activeSubItem.isPlaylist) return false;
    if (isPreview) return true;
    // Info slides are "finished" once their countdown reaches 0
    if (activeSubItem.isInfo) return countdownSecs === 0;
    const key = `${activeStep}::${activeSubItem.id}`;
    if (initiallyCompletedVideos[key]) return true;
    return !!currentlyEndedVideos[key];
  })();

  const isPlayButtonShown = hasVideoOnPage && !isVideoFinished && !hasVideoStarted;

  // Reset video start/playing state when step/sub-item changes
  useEffect(() => {
    setHasVideoStarted(false);
    setIsVideoPlaying(false);
  }, [activeStep, activeSubItemIndex]);

  // Auto-mark info slides as "opened" (completed) once their countdown reaches 0
  useEffect(() => {
    if (!hasInfoOnPage || !activeStep || !activeSubItem) return;
    if (countdownSecs === 0) {
      markSubItemOpened(activeStep, activeSubItem.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInfoOnPage, countdownSecs, activeSubItem?.id]);

  // Wall-clock ticking effect - ticks the ACTIVE video/info countdown
  useEffect(() => {
    if (!hasCountdownOnPage || !activeVideoKey || countdownSecs <= 0) return;

    // For info slides, tick immediately (no play required)
    const shouldTick = hasInfoOnPage || (hasVideoStarted && isVideoPlaying);
    if (!shouldTick) return;

    const interval = setInterval(() => {
      setCountdownMap((prev) => {
        const current = prev[activeVideoKey!] ?? 0;
        if (current <= 1) {
          clearInterval(interval);
          return { ...prev, [activeVideoKey!]: 0 };
        }
        return { ...prev, [activeVideoKey!]: current - 1 };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [hasCountdownOnPage, hasInfoOnPage, hasVideoStarted, isVideoPlaying, countdownSecs, activeVideoKey]);

  // Initialize countdown for the active video from known durations
  useEffect(() => {
    if (!activeStep) return;

    const modIndex = MODULES.findIndex((m) => m.id === activeStep);
    if (modIndex < 0) return;

    const mod = MODULES[modIndex];
    const isVideoStep = mod.variant === "video-basic" || mod.variant === "video-3d";
    if (!isVideoStep) return;

    const items = mod.id === "videos-basic" ? BASIC_VIDEO_ITEMS_UI : ADVANCED_ITEMS_UI;
    const item = items[activeSubItemIndex];
    if (!item || item.isDoc || item.isPlaylist) return;

    const key = `${mod.id}::${item.id}`;

    // Info slides always get a fresh 10-second countdown (no progress tracking)
    if (item.isInfo) {
      setCountdownMap((prev) => ({ ...prev, [key]: isDev || isPreview ? 0 : 10 }));
      return;
    }

    const pct = (progress.moduleVideoWatched as any)?.[key] ?? 0;
    if (pct >= 95) {
      // Already finished watching - set to 0
      setCountdownMap((prev) => ({ ...prev, [key]: 0 }));
      setInitiallyCompletedVideos((prev) => ({ ...prev, [key]: true }));
      return;
    }

    // Always re-initialize countdown when navigating to this video
    setCountdownMap((prev) => {
      if (isDev) {
        return { ...prev, [key]: 10 };
      }
      // Part 1 — Labeling Basics is uniquely 10 seconds
      if (item.id === "basic-p1") {
        return { ...prev, [key]: 10 };
      }
      // Pre-compute countdown from known durations
      if (item.id in ONBOARDING_VIDEO_DURATIONS) {
        return { ...prev, [key]: calcVideoCountdown(ONBOARDING_VIDEO_DURATIONS[item.id]) };
      }
      // Fallback to 60 seconds for unknown videos
      return { ...prev, [key]: 60 };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, activeSubItemIndex]);

  const handleVideoTimeUpdate = (itemId: string, currentTime: number, duration: number) => {
    const key = `${activeStep}::${itemId}`;
    setVideoTimeState((prev) => ({ ...prev, [key]: { currentTime, duration } }));

    // If the video is rewound or not near the end, reset the ended state
    if (duration > 0 && (currentTime / duration) < 0.95) {
      setCurrentlyEndedVideos((prev) => {
        if (!prev[key]) return prev;
        return { ...prev, [key]: false };
      });
    }
  };

  const handleVideoEnded = (itemId: string) => {
    const key = `${activeStep}::${itemId}`;
    setCurrentlyEndedVideos((prev) => ({ ...prev, [key]: true }));
  };

  // ── Derived counts
  const stage2 = progress.stage2Complete;
  const COMPLETABLE_MODULES = MODULES.filter((m) => m.variant !== "disabled");
  const modulesDone = COMPLETABLE_MODULES.filter((m) => !!progress.modulesComplete[m.id]).length;
  const answerKeyDone = !!progress.modulesComplete[ANSWER_KEY_MOD_ID];
  const groupedAnswerKeyTasks = ANSWER_KEY_TASKS.filter(t => !t.isHiddenInSidebar);
  const answerKeyTotalCount = groupedAnswerKeyTasks.length;
  const answerKeyVisitedCount = groupedAnswerKeyTasks.filter((task) => {
    if (task.sidebarGroupId) {
      const groupTasks = ANSWER_KEY_TASKS.filter(t => t.sidebarGroupId === task.sidebarGroupId);
      return groupTasks.every(t => !!(progress.answerKeyProgress ?? {})[t.taskId]);
    }
    return !!(progress.answerKeyProgress ?? {})[task.taskId];
  }).length;

  // ── Sub-item helpers
  function getCheckedItems(stepId: string) {
    const prefix = `${stepId}::`;
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(progress.checklistItems ?? {})) {
      if (k.startsWith(prefix)) out[k.replace(prefix, "")] = v;
    }
    return out;
  }
  function getOpenedItems(stepId: string) {
    const prefix = `${stepId}::`;
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(progress.subItemsOpened ?? {})) {
      if (k.startsWith(prefix)) out[k.replace(prefix, "")] = v;
    }
    return out;
  }
  function getModuleVideoWatched(stepId: string) {
    const prefix = `${stepId}::`;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(progress.moduleVideoWatched ?? {})) {
      if (k.startsWith(prefix)) out[k.replace(prefix, "")] = v;
    }
    return out;
  }

  // ── Stage completion metrics
  const stage1Done = (progress.modulesComplete["download"] ? 1 : 0) + (progress.modulesComplete["install"] ? 1 : 0);
  const stage1Total = 2;
  const stage1Pct = (stage1Done / stage1Total) * 100;

  const stage2Done = BASIC_VIDEO_ITEMS_UI.filter((v) => {
    const watched = getModuleVideoWatched("videos-basic")[v.id] ?? 0;
    const opened = !!getOpenedItems("videos-basic")[v.id];
    return watched >= 95 || (v.isPlaylist && opened);
  }).length;
  const stage2Total = BASIC_VIDEO_ITEMS_UI.length;
  const stage2Pct = stage2Total > 0 ? (stage2Done / stage2Total) * 100 : 0;

  const groupedAdvancedItems = ADVANCED_ITEMS_UI.filter(v => !(v.isInfo && v.slideIndex > 0));
  const stage3Total = groupedAdvancedItems.length;

  const stage3Done = groupedAdvancedItems.filter((v) => {
    if (v.isInfo && v.slideIndex === 0) {
      return [0,1,2,3,4].every(i => !!getOpenedItems("videos-3d")[ADVANCED_ITEMS_UI[i].id]);
    }
    const watched = getModuleVideoWatched("videos-3d")[v.id] ?? 0;
    const opened = !!getOpenedItems("videos-3d")[v.id];
    return (v.isDoc || v.isInfo) ? opened : watched >= 95;
  }).length;
  const stage3Pct = stage3Total > 0 ? (stage3Done / stage3Total) * 100 : 0;

  // ── Step 1 download rows
  const DOWNLOAD_ROWS: DownloadRow[] = [
    { id: "step1_dl1", num: "01", sectionTitle: "DOWNLOAD 7-ZIP", label: "7-zip for Windows", href: "https://www.7-zip.org/a/7z2301-x64.exe" },
    { id: "step1_dl2", num: "02", sectionTitle: "DOWNLOAD VC-REDISTS", label: "VC-Redists", href: "https://www.techpowerup.com/download/visual-c-redistributable-runtime-package-all-in-one/" },
    { id: "step1_dl3", num: "03", sectionTitle: "DOWNLOAD GINGER SOFTWARE", label: "Ginger Software", href: "https://www.mediafire.com/folder/giykm5tceipcr/Latest_Ginger" },
  ];

  // ── Step 2 install image blocks
  const INSTALL_BLOCKS: InstallBlock[] = [
    { id: "7zip", texts: ["Step 1: Install 7-zip"], imageUrl: "https://biltph.com/training/_assets/media/0c4bf9d21bc96023390cb61184e78854.png", imageAlt: "Install 7-zip screenshot" },
    { id: "extract-vc", texts: ["Step 2: Right Click Visual-C-Runtimes-All-in-One.zip", "Step 3: Choose 7-zip and Click 'Extract Here'"], imageUrl: "https://biltph.com/training/_assets/media/05bdc516dbc075ed965ea6850bdda323.png", imageAlt: "Extract VC Redists screenshot" },
    { id: "run-bat", texts: ["Step 4: Open Visual-C-Runtimes-All-in-One Folder", "Step 5: Run Install_all.bat and wait till Installation finishes"], imageUrl: "https://biltph.com/training/_assets/media/1b241beeb66cf40476e6caf17c2cf885.jpg", imageAlt: "Run install bat screenshot" },
    { id: "extract-ginger", texts: ["Step 6: Right Click Ginger.zip", "Step 7: Choose 7-zip and Click 'Extract Here'"], imageUrl: "https://biltph.com/training/_assets/media/e02d8c01e61af7f33b12172e98fd2446.png", imageAlt: "Extract Ginger screenshot" },
  ];



  // ── Sequential locking for modules
  function isModuleLocked(index: number): boolean {
    if (index === 0) return false;
    const prevMod = MODULES[index - 1];
    if (prevMod.variant === "disabled") return isModuleLocked(index - 1);
    return !progress.modulesComplete[prevMod.id];
  }

  // ── Searchable index for Stage 3 search bar
  interface SearchItem { label: string; sublabel: string; stageTag: string; navigate: () => void; }
  const SEARCHABLE: SearchItem[] = [
    ...MODULES.map((m) => ({
      label: m.title,
      sublabel: m.tag,
      stageTag: "Stage 2",
      navigate: () => handleSetActiveStep(m.id),
    })),
    ...BASIC_VIDEO_ITEMS_UI.map((v, i) => ({
      label: v.partLabel,
      sublabel: "Basic Labeling Guide · Step 3",
      stageTag: "Stage 2",
      navigate: () => { handleSetActiveStep("videos-basic"); setActiveSubItemIndex(i); },
    })),
    ...ADVANCED_ITEMS_UI.map((v, i) => ({
      label: v.partLabel,
      sublabel: "3D & Multilayer Guide · Step 4",
      stageTag: "Stage 2",
      navigate: () => { handleSetActiveStep("videos-3d"); setActiveSubItemIndex(i); },
    })),
    ...ANSWER_KEY_TASKS.map((task, i) => ({
      label: task.taskId,
      sublabel: "Answer Key · Module 04",
      stageTag: "Stage 3",
      navigate: () => { handleSetActiveStep(ANSWER_KEY_MOD_ID); setAnswerKeySubIndex(i); },
    })),
  ];

  const filteredSearch = searchQuery.trim().length >= 1
    ? SEARCHABLE.filter((item) => {
        const q = searchQuery.toLowerCase();
        return item.label.toLowerCase().includes(q) || item.sublabel.toLowerCase().includes(q) || item.stageTag.toLowerCase().includes(q);
      })
    : [];

  // Close search dropdown when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Next button helper — renders countdown, enabled, or nothing
  function renderNextBtn(canShow: boolean, onClick: () => void) {
    if (!canShow) return null;

    if (isPlayButtonShown) {
      return (
        <button
          onClick={() => {
            setHasVideoStarted(true);
            setPlaySignal((s) => s + 1);
          }}
          className={nextBtnCls}
        >
          Play Video
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
          </svg>
        </button>
      );
    }

    if (countdownSecs !== 0) {
      // Countdown running (> 0) or not yet initialized (-1) — show countdown button
      return (
        <div className={countdownBtnCls}>
          Next ({countdownSecs > 0 ? formatVideoCountdown(countdownSecs) : '...'})
          <svg className="w-4 h-4 opacity-80" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>
      );
    }

    if (!isVideoFinished && !isDev) {
      // Countdown finished (countdownSecs === 0) but video not finished watching yet (pct < 95)
      return (
        <div className="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1F7A1F]/40 to-[#2ea82e]/40 dark:from-[#55f761]/30 dark:to-[#3de34a]/30 text-white/60 dark:text-[#060D14]/50 font-bold text-sm shadow-xl border border-[#55f761]/10 cursor-not-allowed transition-all">
          Finish Video
          <svg className="w-4 h-4 opacity-40" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
    }

    // Unlocked and finished (isVideoFinished is true)
    return (
      <button onClick={onClick} className={nextBtnCls}>
        Next
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </button>
    );
  }



    // ── Active step content resolver
  function renderRightContent() {
    if (activeStep) {
      // noop — handled below
    } else {
      if (progress.onboardingComplete && !isPreview) {
        return <CompletionBanner onNavigate={() => router.push(isStandardBuildingPassed ? "/project" : "/account?trigger_walkthrough=true")} isStandardBuildingPassed={isStandardBuildingPassed} />;
      }
      return (
        <WelcomeCard
          overallPercent={overallPercent}
          tasksDone={tasksDone}
          totalTasks={totalTasks}
          onStart={() => {
            const completableIds = ["download", "install", "videos-basic", "videos-3d", "answer-key"];
            const firstIncompleteId = completableIds.find(id => !progress.modulesComplete[id]);
            
            if (firstIncompleteId) {
              handleSetActiveStep(firstIncompleteId);
              if (firstIncompleteId === "answer-key") {
                const unvisitedIndex = ANSWER_KEY_TASKS.findIndex(t => !progress.answerKeyProgress?.[t.taskId]);
                if (unvisitedIndex !== -1) {
                  setAnswerKeySubIndex(unvisitedIndex);
                }
              }
            } else {
              markModuleComplete("answer-key-lib");
              handleSetActiveStep("answer-key-lib");
            }
          }}
        />
      );
    }

    if (activeStep === "answer-key-lib") {
      return (
        <div className="p-6 lg:p-8 max-w-6xl mx-auto pb-6 min-h-[calc(100vh-4rem)] flex flex-col relative">
          <div className="bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 rounded-xl p-4 mb-8 text-[#1F7A1F] dark:text-[#55f761] flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <CheckCircleIcon className="w-6 h-6 flex-shrink-0" />
              <div className="flex flex-col">
                <span className="font-bold text-sm">All Tasks Complete!</span>
                <span className="text-xs opacity-90">You can now start the hands-on training in the software, you may get your ginger id and password in account info.</span>
              </div>
            </div>
            <Link
              href="/account?trigger_walkthrough=true"
              className="sm:ml-auto flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] font-bold text-xs hover:scale-105 transition-transform shadow-md"
            >
              Continue to Account Info
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>

          <div className="flex flex-col gap-4 mb-8">
            <div className="max-w-2xl">
              <h1 className="text-2xl font-black text-black/90 dark:text-white/90 mb-1">Answer Key Library</h1>
              <p className="text-sm text-black/50 dark:text-white/45">
                Reference all answer key tasks here.
              </p>
            </div>

            <div className="relative w-full">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-black/35 dark:text-white/30 pointer-events-none">
                <SearchIcon />
              </span>
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-black/12 dark:border-white/12 bg-white dark:bg-[#0D1B2A] text-sm text-black/80 dark:text-white/80 placeholder:text-black/30 dark:placeholder:text-white/30 outline-none focus:border-[#1F7A1F]/60 dark:focus:border-[#55f761]/60 transition-colors shadow-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-black/30 dark:text-white/30 hover:text-black/60 dark:hover:text-white/60 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {searchQuery && (
            <p className="text-xs text-black/40 dark:text-white/30 mb-4">
              {filteredAnswerKeyTasks.length} result{filteredAnswerKeyTasks.length !== 1 ? "s" : ""} for &ldquo;{searchQuery}&rdquo;
            </p>
          )}

          {filteredAnswerKeyTasks.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {filteredAnswerKeyTasks.map((task) => (
                <AnswerCard key={task.taskId} task={task} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20 text-black/35 dark:text-white/25 text-sm">
              No tasks match &ldquo;{searchQuery}&rdquo;
            </div>
          )}
        </div>
      );
    }

    // Stage 3 — Answer Key (new paginated panel)
    if (activeStep === ANSWER_KEY_MOD_ID) {
      return (
        <AnswerKeyPanel
          currentIndex={answerKeySubIndex}
          onNavigate={(idx) => setAnswerKeySubIndex(idx)}
          visitedTasks={progress.answerKeyProgress ?? {}}
          onTaskVisited={(taskId) => markAnswerKeyTaskVisited(taskId)}
          isLocked={!stage2}
          previewMode={isPreview}
          onNavigateToLibrary={() => {
            markModuleComplete("answer-key-lib");
            handleSetActiveStep("answer-key-lib");
          }}
        />
      );
    }

    // Stage 2 module step
    const modIndex = MODULES.findIndex((m) => m.id === activeStep);
    if (modIndex >= 0) {
      const mod = MODULES[modIndex];
      const locked = isModuleLocked(modIndex);
      const isAutoComplete = mod.variant === "disabled";
      const isCompleted = isAutoComplete ? true : !!progress.modulesComplete[mod.id];

      const isVideoStep = mod.variant === "video-basic" || mod.variant === "video-3d";
      const currentVideoItems = mod.id === "videos-basic" ? BASIC_VIDEO_ITEMS_UI : mod.id === "videos-3d" ? ADVANCED_ITEMS_UI : [];
      const subItemCount = isVideoStep ? currentVideoItems.length : 0;
      const hasNextSubItem = isVideoStep && activeSubItemIndex < subItemCount - 1;
      const hasPrevSubItem = isVideoStep && activeSubItemIndex > 0;

      const prevModIndex = modIndex - 1;
      const prevMod = prevModIndex >= 0 ? MODULES[prevModIndex] : undefined;

      let prevSubItemCount = 0;
      if (prevMod) {
        if (prevMod.id === "videos-basic") prevSubItemCount = BASIC_VIDEO_ITEMS_UI.length;
        else if (prevMod.id === "videos-3d") prevSubItemCount = ADVANCED_ITEMS_UI.length;
      }
      const prevModSubIndex = prevSubItemCount > 0 ? prevSubItemCount - 1 : 0;

      // Active sub-item — does it need countdown?
      const activeSubItem = isVideoStep ? currentVideoItems[activeSubItemIndex] : null;
      const subItemNeedsCountdown = isVideoStep && activeSubItem && !activeSubItem.isDoc && !activeSubItem.isPlaylist;
      const isActiveSubItemCompleted = (() => {
        if (!activeSubItem) return true;
        if (activeSubItem.isDoc || activeSubItem.isPlaylist) {
          return !!getOpenedItems(mod.id)[activeSubItem.id];
        }
        if (activeSubItem.isInfo) {
          // Info slides: completed when countdown reaches 0 (or already opened)
          return isVideoFinished || !!getOpenedItems(mod.id)[activeSubItem.id];
        }
        return isVideoFinished;
      })();

      let nextModIndex = modIndex + 1;
      while (nextModIndex < MODULES.length && isModuleLocked(nextModIndex)) nextModIndex++;
      const nextMod = nextModIndex < MODULES.length ? MODULES[nextModIndex] : undefined;
      const nextIsStage3 = !nextMod && isCompleted;
      const modCanProceed = isCompleted;

      let stageNum = "Stage 2";
      let stageTitle = "Training Modules";
      let doneCount = modulesDone;
      let totalCount = COMPLETABLE_MODULES.length;

      if (mod.id === "download" || mod.id === "install") {
        stageNum = "Module 01";
        stageTitle = "Software Setup";
        doneCount = stage1Done;
        totalCount = stage1Total;
      } else if (mod.id === "videos-basic") {
        stageNum = "Module 02";
        stageTitle = "Basic Labeling";
        doneCount = stage2Done;
        totalCount = stage2Total;
      } else if (mod.id === "videos-3d") {
        stageNum = "Module 03";
        stageTitle = "3D and Multilayer";
        doneCount = stage3Done;
        totalCount = stage3Total;
      }

      return (
        <div className="p-6 lg:p-8 max-w-5xl mx-auto pb-6 min-h-[calc(100vh-4rem)] flex flex-col relative">
          {/* Top bar */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[10px] font-black tracking-widest uppercase px-2.5 py-1 rounded-full bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761]">
              {stageNum}
            </span>
            <span className="text-xs font-semibold text-black/60 dark:text-white/60">
              {stageTitle}
            </span>
            <span className="ml-auto text-[11px] font-bold text-black/65 dark:text-white/65 px-2.5 py-1 rounded-full border border-black/12 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.05] whitespace-nowrap">
              {doneCount} of {totalCount} steps complete
            </span>
          </div>



          <TrainingModuleCard
            stepId={mod.id}
            step={mod.step}
            tag={mod.tag}
            title={mod.title}
            description={mod.description}
            variant={mod.variant}
            primaryHref={mod.primaryHref}
            primaryLabel={mod.primaryLabel}
            installBlocks={mod.id === "install" ? INSTALL_BLOCKS : []}
            checklistItems={[]}
            checkedItems={getCheckedItems(mod.id)}
            onChecklistItem={(itemId, value) => markChecklistItem(mod.id, itemId, value)}
            downloadRows={mod.id === "download" ? DOWNLOAD_ROWS : []}
            videoItems={mod.id === "videos-basic" ? BASIC_VIDEO_ITEMS_UI : mod.id === "videos-3d" ? ADVANCED_ITEMS_UI : []}
            activeSubItemIndex={isVideoStep ? activeSubItemIndex : undefined}
            watchedItems={getModuleVideoWatched(mod.id)}
            onVideoProgress={(itemId, pct) => markModuleVideoProgress(mod.id, itemId, pct)}
            openedItems={getOpenedItems(mod.id)}
            onSubItemOpen={(itemId) => markSubItemOpened(mod.id, itemId)}
            onPlay={() => setHasVideoStarted(true)}
            onPlayingStateChange={setIsVideoPlaying}
            onTimeUpdate={handleVideoTimeUpdate}
            onVideoEnded={handleVideoEnded}
            playSignal={playSignal}
            isCompleted={isCompleted}
            isLocked={locked}
            onComplete={() => markModuleComplete(mod.id)}
          />

          {/* Navigation */}
          <div className="mt-auto pt-8 flex items-center justify-between">
            {/* Previous */}
            <div>
              {hasPrevSubItem ? (
                <button onClick={() => setActiveSubItemIndex((i) => i - 1)} className={prevBtnCls}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Previous
                </button>
              ) : prevMod ? (
                <button onClick={() => handleSetActiveStep(prevMod.id, prevModSubIndex)} className={prevBtnCls}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Previous
                </button>
              ) : null}
            </div>

            {/* Next */}
            <div>
              {hasNextSubItem ? (
                // Sub-item — needs countdown for video items
                isActiveSubItemCompleted ? (
                  subItemNeedsCountdown
                    ? renderNextBtn(true, () => setActiveSubItemIndex((i) => i + 1))
                    : (
                      <button onClick={() => setActiveSubItemIndex((i) => i + 1)} className={nextBtnCls}>
                        Next
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </button>
                    )
                ) : (
                  subItemNeedsCountdown
                    ? renderNextBtn(true, () => setActiveSubItemIndex((i) => i + 1))
                    : (
                      <button disabled className={disabledNextBtnCls}>
                        Next
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </button>
                    )
                )
              ) : subItemNeedsCountdown && (!isCompleted || countdownSecs !== 0 || !isVideoFinished) ? (
                // Last sub-item is a video, and it's either not completed yet, or the countdown is ticking, or the video is not finished (e.g. rewound)
                renderNextBtn(true, () => {
                  markModuleComplete(mod.id);
                  if (mod.id === "videos-3d") {
                    handleSetActiveStep(ANSWER_KEY_MOD_ID);
                  } else if (nextMod) {
                    handleSetActiveStep(nextMod.id);
                  } else if (nextIsStage3) {
                    handleSetActiveStep(ANSWER_KEY_MOD_ID);
                  }
                })
              ) : mod.id === "videos-3d" ? (
                modCanProceed ? (
                  <button onClick={() => handleSetActiveStep(ANSWER_KEY_MOD_ID)} className={nextBtnCls}>
                    Next
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                ) : (
                  <button disabled className={disabledNextBtnCls}>
                    Next
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                )
              ) : nextMod ? (
                modCanProceed ? (
                  <button onClick={() => handleSetActiveStep(nextMod.id)} className={nextBtnCls}>
                    Next
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                ) : (
                  <button disabled className={disabledNextBtnCls}>
                    Next
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                )
              ) : nextIsStage3 ? (
                <button onClick={() => handleSetActiveStep(ANSWER_KEY_MOD_ID)} className={nextBtnCls}>
                  Next
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              ) : (
                <button disabled className={disabledNextBtnCls}>
                  Next
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }



    return (
      <WelcomeCard
        overallPercent={overallPercent}
        tasksDone={tasksDone}
        totalTasks={totalTasks}
        onStart={() => {
          const firstIncomplete = MODULES.find((m) => !progress.modulesComplete[m.id]);
          handleSetActiveStep(firstIncomplete ? firstIncomplete.id : "download");
        }}
      />
    );
  }

  // ── Sidebar content
  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 border-b border-black/8 dark:border-white/8 flex-shrink-0">
        <div className="text-[10px] font-black tracking-widest uppercase text-[#1F7A1F] dark:text-[#55f761] mb-1">🚀 XFNITE Onboarding</div>
        <div className="text-sm font-bold text-black/80 dark:text-white/80 mb-3">Complete Your Training</div>
        <div className="flex items-center gap-2 mb-1">
          <div className="flex-1 h-1.5 bg-black/8 dark:bg-white/8 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#1F7A1F] to-[#55f761] rounded-full transition-all duration-700" style={{ width: `${overallPercent}%` }} />
          </div>
          <span className="text-[11px] font-black text-[#1F7A1F] dark:text-[#55f761]">{overallPercent}%</span>
        </div>
        <div className="text-[10px] text-black/40 dark:text-white/30">{tasksDone} of {totalTasks} tasks</div>
      </div>

      {(() => {
        return (
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
            {/* Module 1 */}
            <StageSection
              stageNum="Module 01" title="Software Setup"
              doneCount={stage1Done} 
              totalCount={stage1Total}
              progressPct={stage1Pct}
              isOpen={stage1Open} onToggle={() => setStage1Open((o) => !o)}
            >
              <SidebarStepRow
                id="download" label="Download Software"
                isActive={activeStep === "download"}
                isCompleted={!!progress.modulesComplete["download"]} isLocked={isModuleLocked(0)}
                onClick={() => { handleSetActiveStep("download"); setSidebarOpen(false); }}
              />
              <SidebarStepRow
                id="install" label="Install Software"
                isActive={activeStep === "install"}
                isCompleted={!!progress.modulesComplete["install"]} isLocked={isModuleLocked(1)}
                onClick={() => { handleSetActiveStep("install"); setSidebarOpen(false); }}
              />
            </StageSection>

            {/* Module 2 */}
            <StageSection
              stageNum="Module 02" title="Basic Labeling"
              doneCount={stage2Done}
              totalCount={stage2Total}
              progressPct={stage2Pct}
              isOpen={stage2Open} onToggle={() => setStage2Open((o) => !o)}
              isLocked={isModuleLocked(2)}
            >
              {BASIC_VIDEO_ITEMS_UI.map((video, index) => {
                const isCompleted = (getModuleVideoWatched("videos-basic")[video.id] ?? 0) >= 95 || (video.isPlaylist ? !!getOpenedItems("videos-basic")[video.id] : false);
                
                let isPrevCompleted = true;
                if (index > 0) {
                  const prevVideo = BASIC_VIDEO_ITEMS_UI[index - 1];
                  isPrevCompleted = (getModuleVideoWatched("videos-basic")[prevVideo.id] ?? 0) >= 95 || (prevVideo.isPlaylist ? !!getOpenedItems("videos-basic")[prevVideo.id] : false);
                }
                const isItemLocked = isModuleLocked(2) || !isPrevCompleted;

                return (
                  <SidebarStepRow
                    key={video.id} id={video.id} label={video.partLabel}
                    isActive={activeStep === "videos-basic" && activeSubItemIndex === index}
                    isCompleted={isCompleted} isLocked={isItemLocked}
                    onClick={() => { handleSetActiveStep("videos-basic", index); setSidebarOpen(false); }}
                  />
                );
              })}
            </StageSection>

            {/* Module 3 */}
            <StageSection
              stageNum="Module 03" title="3D and Multilayer"
              doneCount={stage3Done}
              totalCount={stage3Total}
              progressPct={stage3Pct}
              isOpen={stage3Open} onToggle={() => setStage3Open((o) => !o)}
              isLocked={isModuleLocked(3)}
            >
              {ADVANCED_ITEMS_UI.map((video, index) => {
                if (video.isInfo && video.slideIndex && video.slideIndex > 0) return null;

                let isCompleted = false;
                if (video.isInfo && video.slideIndex === 0) {
                  isCompleted = [0,1,2,3,4].every(i => !!getOpenedItems("videos-3d")[ADVANCED_ITEMS_UI[i].id]);
                } else {
                  isCompleted = (video.isDoc || video.isInfo) ? !!getOpenedItems("videos-3d")[video.id] : (getModuleVideoWatched("videos-3d")[video.id] ?? 0) >= 95;
                }
                
                let isPrevCompleted = true;
                if (index > 0) {
                  if (video.id === "3d-p2") {
                    isPrevCompleted = !!getOpenedItems("videos-3d")["3d-guide-5"];
                  } else {
                    const prevVideo = ADVANCED_ITEMS_UI[index - 1];
                    isPrevCompleted = (prevVideo.isDoc || prevVideo.isInfo) ? !!getOpenedItems("videos-3d")[prevVideo.id] : (getModuleVideoWatched("videos-3d")[prevVideo.id] ?? 0) >= 95;
                  }
                }
                const isItemLocked = isModuleLocked(3) || !isPrevCompleted;

                const isActive = activeStep === "videos-3d" && (
                  activeSubItemIndex === index || 
                  (video.isInfo && video.slideIndex === 0 && activeSubItemIndex >= 0 && activeSubItemIndex <= 4)
                );

                const label = video.isInfo && video.slideIndex === 0 ? "Part 1 — 3D Guide" : video.partLabel;

                return (
                  <SidebarStepRow
                    key={video.id} id={video.id} label={label}
                    isActive={isActive}
                    isCompleted={isCompleted} isLocked={isItemLocked}
                    onClick={() => { handleSetActiveStep("videos-3d", index); setSidebarOpen(false); }}
                  />
                );
              })}
            </StageSection>

            {/* Module 4 — Answer Key */}
            <StageSection
              stageNum="Module 04" title="Answer Key"
              doneCount={answerKeyVisitedCount} totalCount={answerKeyTotalCount}
              progressPct={answerKeyTotalCount > 0 ? (answerKeyVisitedCount / answerKeyTotalCount) * 100 : 0}
              isOpen={stage4Open} onToggle={() => setStage4Open((o) => !o)}
              isLocked={!stage2}
            >
              {ANSWER_KEY_TASKS.map((task, index) => {
                if (task.isHiddenInSidebar) return null;

                let isCompleted = false;
                if (task.sidebarGroupId) {
                  const groupTasks = ANSWER_KEY_TASKS.filter(t => t.sidebarGroupId === task.sidebarGroupId);
                  isCompleted = groupTasks.every(t => !!(progress.answerKeyProgress ?? {})[t.taskId]);
                } else {
                  isCompleted = !!(progress.answerKeyProgress ?? {})[task.taskId];
                }

                let isPrevVisited = true;
                if (index > 0) {
                  const prevTask = ANSWER_KEY_TASKS[index - 1];
                  if (prevTask.sidebarGroupId) {
                    const prevGroupTasks = ANSWER_KEY_TASKS.filter(t => t.sidebarGroupId === prevTask.sidebarGroupId);
                    isPrevVisited = prevGroupTasks.every(t => !!(progress.answerKeyProgress ?? {})[t.taskId]);
                  } else {
                    isPrevVisited = !!(progress.answerKeyProgress ?? {})[prevTask.taskId];
                  }
                }
                const isItemLocked = !stage2 || !isPrevVisited;

                const isActive = Boolean(activeStep === ANSWER_KEY_MOD_ID && (
                  answerKeySubIndex === index || 
                  (task.sidebarGroupId && ANSWER_KEY_TASKS[answerKeySubIndex]?.sidebarGroupId === task.sidebarGroupId)
                ));

                const label = task.sidebarGroupLabel || task.taskId;

                return (
                  <SidebarStepRow
                    key={task.taskId}
                    id={task.taskId}
                    label={label}
                    isActive={isActive}
                    isCompleted={isCompleted}
                    isLocked={isItemLocked}
                    onClick={() => {
                      handleSetActiveStep(ANSWER_KEY_MOD_ID);
                      setAnswerKeySubIndex(index);
                      setSidebarOpen(false);
                    }}
                  />
                );
              })}
            </StageSection>

            {/* Module 5 — Answer Key Library */}
            <StageSection
              stageNum="Module 05" title="Answer Key Library"
              doneCount={1} totalCount={1}
              progressPct={100}
              isOpen={stage5Open} onToggle={() => setStage5Open((o) => !o)}
              isLocked={!progress.modulesComplete[ANSWER_KEY_MOD_ID]}
            >
              <SidebarStepRow
                id="answer-key-lib"
                label="Answer Key Library"
                isActive={activeStep === "answer-key-lib"}
                isCompleted={!!progress.modulesComplete["answer-key-lib"]}
                isLocked={!progress.modulesComplete[ANSWER_KEY_MOD_ID]}
                onClick={() => {
                  markModuleComplete("answer-key-lib");
                  handleSetActiveStep("answer-key-lib");
                  setSidebarOpen(false);
                }}
              />
            </StageSection>
          </div>
        );
      })()}

      </div>
  );

  return (
    <div className="relative -m-6 flex" style={{ minHeight: "calc(100vh - 4rem)" }}>
      {/* Background glows */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute bg-[#55f761] filter blur-[120px] rounded-full opacity-8 dark:opacity-5" style={{ width: "40vw", height: "40vw", top: "-10%", left: "-10%" }} />
        <div className="absolute bg-[#1F7A1F] filter blur-[120px] rounded-full opacity-8 dark:opacity-5" style={{ width: "35vw", height: "35vw", top: "40%", right: "-15%" }} />
      </div>

      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`
          fixed lg:sticky z-40 lg:z-10
          flex-shrink-0 w-[280px] lg:w-[25%]
          bg-white/95 dark:bg-[#0D1B2A]/98 backdrop-blur-xl
          border-r border-black/8 dark:border-white/8
          flex flex-col
          transition-transform duration-300 ease-in-out
          lg:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          top-0 lg:top-0 bottom-0 left-0
          lg:self-start
          overflow-hidden
        `}
        style={{ height: "calc(100vh - 4rem)", maxHeight: "calc(100vh - 4rem)", top: "4rem" }}
      >
        <button
          onClick={() => setSidebarOpen(false)}
          className="absolute top-3 right-3 lg:hidden p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-black/50 dark:text-white/50 z-10"
        >
          <XIcon />
        </button>
        {sidebarContent}
      </aside>

      {/* Right content panel */}
      <main className="flex-1 relative z-10 min-w-0 overflow-y-auto" style={{ height: "calc(100vh - 4rem)", maxHeight: "calc(100vh - 4rem)" }}>
        <button
          onClick={() => setSidebarOpen(true)}
          className="lg:hidden fixed top-20 left-4 z-20 p-2 rounded-xl bg-white/90 dark:bg-[#0D1B2A]/90 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-lg text-black/60 dark:text-white/60 hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-colors"
        >
          <MenuIcon />
        </button>
        {isPreview && (
          <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-amber-100/95 dark:bg-amber-500/15 border-b border-amber-500/30 backdrop-blur-xl text-amber-800 dark:text-amber-200 text-xs">
            <span><b>Preview mode</b> — you&apos;re viewing the onboarding as a trainee. Everything is unlocked and nothing is saved.</span>
            <Link href="/recruiter/recruits" className="font-bold underline underline-offset-2 hover:opacity-80">Exit preview</Link>
          </div>
        )}
        {renderRightContent()}
      </main>
    </div>
  );
}