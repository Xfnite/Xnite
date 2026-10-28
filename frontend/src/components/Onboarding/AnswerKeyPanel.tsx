"use client";

import { useState, useEffect, useRef } from "react";
import { answerKeyImages } from "@/components/Onboarding/answerKeyImages";
import InlineVideoPlayer from "./InlineVideoPlayer";
import { ANSWER_KEY_VIDEO_DURATIONS, calcVideoCountdown } from "./useOnboardingProgress";

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskType = "video" | "image";

interface ExtraButton {
  label: string;
  href: string;
}

interface ExtraImage {
  configKey: string;
  caption?: string;
}

export interface AnswerKeyTask {
  pageNum: number;
  taskId: string;
  type: TaskType;
  embedUrl?: string;
  youtubeId?: string;
  startTime?: number;
  endTime?: number;
  imageConfigKey?: string;
  note?: string;
  extraButtons?: ExtraButton[];
  extraImages?: ExtraImage[];
  sidebarGroupId?: string;
  sidebarGroupLabel?: string;
  isHiddenInSidebar?: boolean;
}

// ─── 15 Task Definitions ──────────────────────────────────────────────────────

export const ANSWER_KEY_TASKS: AnswerKeyTask[] = [
  {
    pageNum: 1, taskId: "Task 1.0 to Task 1.11", type: "video",
    youtubeId: "eZbnMTmMJOI", startTime: 0,
    note: "Task 1.4: To 3D, select the label with sidewall, HOLD CTRL then drag down.",
  },
  {
    pageNum: 2, taskId: "Task 1.15 to 1.33", type: "video",
    youtubeId: "1OiRgdRzo68", startTime: 0,
  },
  {
    pageNum: 3, taskId: "Task 12", type: "video",
    youtubeId: "2G3casdSwYQ", startTime: 0,
    sidebarGroupId: "group_12_124", sidebarGroupLabel: "Task 12 & 1.24"
  },
  {
    pageNum: 4, taskId: "Task 1.24", type: "image",
    imageConfigKey: "task_1_24",
    sidebarGroupId: "group_12_124", isHiddenInSidebar: true
  },
  {
    pageNum: 5, taskId: "Task 1.27, 1.39 & 1.31", type: "video",
    youtubeId: "WzBdHicQfdg", startTime: 0,
  },
  {
    pageNum: 6, taskId: "Task 1.28 & 1.30", type: "image",
    imageConfigKey: "task_1_28",
    extraImages: [
      { configKey: "task_1_30" }
    ],
  },
  {
    pageNum: 7, taskId: "Task 1.3 to 1.36", type: "video",
    youtubeId: "HoE6ojgLhD0", startTime: 0,
    note: "Task 1.3: To 3D, select the label with sidewall, HOLD CTRL then drag down.",
  },
  {
    pageNum: 8, taskId: "Deadlock Error & Task 1.5 (variant)", type: "image",
    imageConfigKey: "task_1_36_img1",
    note: "Task 1.36: To fix DEADLOCK ERROR, zoom in the building, then drag the line with the error to put a very small opening space (as small as you can).\n\nTask 1.5: To 3D, select the label with sidewall, HOLD CTRL then drag down.",
    extraImages: [
      { configKey: "task_1_36_img2" },
      { configKey: "task_1_36_img3" },
      { configKey: "task_1_36_img4" },
      { configKey: "task_1_5_variant" },
      { configKey: "task_1_5_variant_2" },
    ],
  },
  {
    pageNum: 9, taskId: "Task 1.10 & 1.13", type: "image",
    imageConfigKey: "task_1_10",
    extraImages: [
      { configKey: "task_1_13" },
    ],
  },
  {
    pageNum: 10, taskId: "Task 1.29 & 1.20", type: "video",
    youtubeId: "QGtiHMU8vcQ", startTime: 0,
  },
  {
    pageNum: 11, taskId: "Task 1.52", type: "video",
    youtubeId: "azorH4bhIT4", startTime: 0,
    extraButtons: [
      { label: "If Checker returns 'Use U TOOL' — Watch this", href: "https://youtu.be/UVqh78pB5Bg" },
    ],
    sidebarGroupId: "group_152_151", sidebarGroupLabel: "Task 1.52 & 1.51"
  },
  {
    pageNum: 12, taskId: "Task 1.51", type: "video",
    youtubeId: "wo5rGSiY60c", startTime: 0,
    extraButtons: [
      { label: "Latest Tagalog Version", href: "https://youtu.be/u45-0m37Aos" },
    ],
    sidebarGroupId: "group_152_151", isHiddenInSidebar: true
  },
  {
    pageNum: 13, taskId: "Task 1.50 to 1.42", type: "video",
    youtubeId: "WwZE-YarfgE", startTime: 0,
  },
  {
    pageNum: 14, taskId: "Task 1.34", type: "image",
    imageConfigKey: "task_1_34",
    sidebarGroupId: "group_134_135", sidebarGroupLabel: "Task 1.34 & 1.35"
  },
  {
    pageNum: 15, taskId: "Task 1.35", type: "video",
    youtubeId: "QSe5XPccazs", startTime: 456,
    sidebarGroupId: "group_134_135", isHiddenInSidebar: true
  },
];

type LibraryTaskDef = Omit<AnswerKeyTask, "pageNum"> & { pageNum?: number };

const rawLibraryTasks: LibraryTaskDef[] = [
  { taskId: "Task 1.0", type: "video", youtubeId: "eZbnMTmMJOI", startTime: 0, endTime: 84 },
  { taskId: "Task 1.1", type: "video", youtubeId: "eZbnMTmMJOI", startTime: 84, endTime: 168 },
  { taskId: "Task 1.2", type: "video", youtubeId: "eZbnMTmMJOI", startTime: 168, endTime: 270 },
  { taskId: "Task 1.4", type: "video", youtubeId: "eZbnMTmMJOI", startTime: 270, endTime: 441, note: "Task 1.4: To 3D, select the label with sidewall, HOLD CTRL then drag down." },
  { taskId: "Task 1.9", type: "video", youtubeId: "eZbnMTmMJOI", startTime: 441, endTime: 578 },
  { taskId: "Task 1.11", type: "video", youtubeId: "eZbnMTmMJOI", startTime: 578, endTime: 620 },
  { taskId: "Task 1.15", type: "video", youtubeId: "1OiRgdRzo68", startTime: 0, endTime: 135 },
  { taskId: "Task 1.22", type: "video", youtubeId: "1OiRgdRzo68", startTime: 135, endTime: 451 },
  { taskId: "Task 1.33", type: "video", youtubeId: "1OiRgdRzo68", startTime: 451, endTime: 624 },

  ...ANSWER_KEY_TASKS.slice(2, 4),

  { taskId: "Task 1.27", type: "video", youtubeId: "WzBdHicQfdg", startTime: 0, endTime: 183 },
  { taskId: "Task 1.39", type: "video", youtubeId: "WzBdHicQfdg", startTime: 183, endTime: 584 },
  { taskId: "Task 1.31", type: "video", youtubeId: "WzBdHicQfdg", startTime: 584, endTime: 793 },

  { taskId: "Task 1.28", type: "image", imageConfigKey: "task_1_28" },
  { taskId: "Task 1.30", type: "image", imageConfigKey: "task_1_30" },

  { taskId: "Task 1.3", type: "video", youtubeId: "HoE6ojgLhD0", startTime: 0, endTime: 115, note: "Task 1.3: To 3D, select the label with sidewall, HOLD CTRL then drag down." },
  { taskId: "Task 1.17", type: "video", youtubeId: "HoE6ojgLhD0", startTime: 115, endTime: 290 },
  { taskId: "Task 1.18", type: "video", youtubeId: "HoE6ojgLhD0", startTime: 290, endTime: 412 },
  { taskId: "Task 1.14", type: "video", youtubeId: "HoE6ojgLhD0", startTime: 412, endTime: 571 },
  { taskId: "Task 1.36", type: "video", youtubeId: "HoE6ojgLhD0", startTime: 571, endTime: 794 },

  { 
    taskId: "Deadlock Error", type: "image", imageConfigKey: "task_1_36_img1", 
    note: "Task 1.36: To fix DEADLOCK ERROR, zoom in the building, then drag the line with the error to put a very small opening space (as small as you can).",
    extraImages: [
      { configKey: "task_1_36_img2" },
      { configKey: "task_1_36_img3" },
      { configKey: "task_1_36_img4" },
    ]
  },
  { 
    taskId: "Task 1.5 (variant)", type: "image", imageConfigKey: "task_1_5_variant", 
    note: "Task 1.5: To 3D, select the label with sidewall, HOLD CTRL then drag down.",
    extraImages: [
      { configKey: "task_1_5_variant_2" },
    ]
  },

  { taskId: "Task 1.10", type: "image", imageConfigKey: "task_1_10" },
  { taskId: "Task 1.13", type: "image", imageConfigKey: "task_1_13" },

  { taskId: "Task 1.29", type: "video", youtubeId: "QGtiHMU8vcQ", startTime: 0, endTime: 385 },
  { taskId: "Task 1.20", type: "video", youtubeId: "QGtiHMU8vcQ", startTime: 385, endTime: 583 },

  ...ANSWER_KEY_TASKS.slice(10, 12),

  { taskId: "Task 1.50", type: "video", youtubeId: "WwZE-YarfgE", startTime: 0, endTime: 187 },
  { taskId: "Task 1.40", type: "video", youtubeId: "WwZE-YarfgE", startTime: 187, endTime: 459 },
  { taskId: "Task 1.41", type: "video", youtubeId: "WwZE-YarfgE", startTime: 459, endTime: 475 },
  { taskId: "Task 1.42", type: "video", youtubeId: "WwZE-YarfgE", startTime: 475, endTime: 640 },

  ...ANSWER_KEY_TASKS.slice(13)
];

export const ANSWER_KEY_LIBRARY_TASKS: AnswerKeyTask[] = rawLibraryTasks.map((t, i) => ({
  ...t,
  pageNum: i + 1
} as AnswerKeyTask));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildEmbedUrl(task: AnswerKeyTask): string {
  if (!task.youtubeId) return "";
  const base = `https://www.youtube-nocookie.com/embed/${task.youtubeId}`;
  const params = new URLSearchParams({ rel: "0", modestbranding: "1", playsinline: "1" });
  if (task.startTime && task.startTime > 0) params.set("start", String(task.startTime));
  return `${base}?${params.toString()}`;
}

function formatVideoCountdown(secs: number): string {
  if (secs < 0) return "...";
  if (secs === 0) return "0sec";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

function CheckIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

function ImageOrPlaceholder({ configKey, caption }: { configKey: string; caption?: string }) {
  const url = answerKeyImages[configKey];
  if (url) {
    return (
      <div className="w-full max-w-3xl mx-auto">
        <img
          src={url}
          alt={configKey}
          className="max-w-full max-h-[480px] w-auto h-auto rounded-xl border border-black/10 dark:border-white/10 object-contain bg-black/5 dark:bg-black/40 mx-auto block"
          style={{ minHeight: "200px" }}
        />
        {caption && (
          <p className="mt-2 text-center text-[11px] text-black/50 dark:text-white/40 italic">{caption}</p>
        )}
      </div>
    );
  }
  return (
    <div
      className="w-full rounded-xl border-2 border-dashed border-amber-400/40 dark:border-amber-400/25 bg-amber-50/50 dark:bg-amber-900/10 flex flex-col items-center justify-center gap-2 p-6"
      style={{ minHeight: "200px" }}
    >
      <svg className="w-8 h-8 text-amber-400/60" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 18h16.5M21 12V6.75A2.25 2.25 0 0018.75 4.5H5.25A2.25 2.25 0 003 6.75V18" />
      </svg>
      <p className="text-xs font-mono text-amber-600/70 dark:text-amber-400/60 text-center">
        [Admin: add image URL for <strong>{configKey}</strong>]
      </p>
      {caption && (
        <p className="text-[11px] text-black/40 dark:text-white/30 italic text-center">{caption}</p>
      )}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AnswerKeyPanelProps {
  currentIndex: number;
  onNavigate: (index: number) => void;
  visitedTasks: Record<string, boolean>;
  onTaskVisited: (taskId: string) => void;
  isLocked?: boolean;
  onNavigateToLibrary?: () => void;
  previewMode?: boolean; // staff preview: no timers, nothing persisted
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AnswerKeyPanel({
  currentIndex,
  onNavigate,
  visitedTasks,
  onTaskVisited,
  isLocked = false,
  onNavigateToLibrary,
  previewMode = false,
}: AnswerKeyPanelProps) {
  const isDev = process.env.NEXT_PUBLIC_APP_ENV === "development" || (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_APP_ENV !== "production");
  const TOTAL = ANSWER_KEY_TASKS.length;
  const task = ANSWER_KEY_TASKS[currentIndex];
  const visitedCount = Object.values(visitedTasks).filter(Boolean).length;

  const [countdownMap, setCountdownMap] = useState<Record<string, number>>({});
  const [hasVideoStarted, setHasVideoStarted] = useState(false);
  const [completedTabs, setCompletedTabs] = useState<Record<string, boolean>>({});

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [isVideoEnded, setIsVideoEnded] = useState(false);
  const [playSignal, setPlaySignal] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const videoPlayerRef = useRef<any>(null);

  const [activeTab, setActiveTab] = useState<number>(0);
  const [navigatingBack, setNavigatingBack] = useState(false);

  const [prevTaskId, setPrevTaskId] = useState<string>("");
  const [prevActiveTab, setPrevActiveTab] = useState<number>(0);

  if (task && (task.taskId !== prevTaskId || activeTab !== prevActiveTab)) {
    setPrevTaskId(task.taskId);
    setPrevActiveTab(activeTab);

    let targetTab = activeTab;
    if (task.taskId !== prevTaskId) {
      const newMaxTabs = task.extraImages ? task.extraImages.length : 0;
      targetTab = navigatingBack ? newMaxTabs : 0;
      setActiveTab(targetTab);
      setPrevActiveTab(targetTab);
      setNavigatingBack(false);
    }

    setHasVideoStarted(false);
    setIsVideoPlaying(false);
    setVideoDuration(0);
    setVideoCurrentTime(0);
    setIsVideoEnded(false);

    const newKey = `${task.taskId}::${targetTab}`;
    setCountdownMap((prev) => {
      const next = { ...prev };
      delete next[newKey];
      return next;
    });
  }

  const activeKey = task ? `${task.taskId}::${activeTab}` : "";
  const currentCountdown = task ? (countdownMap[activeKey] ?? -1) : -1;

  const [completedVideos, setCompletedVideos] = useState<Record<string, boolean>>({});

  const isVideoFinished = previewMode ? true : task.type === "video" && activeTab === 0
    ? (!!completedVideos[task.taskId] || isVideoEnded || (videoDuration > 0 && (videoCurrentTime / videoDuration) >= 0.95) || (task.endTime && videoCurrentTime >= task.endTime))
    : true;

  const canGoNext = currentCountdown === 0 && isVideoFinished;

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("xfnite_completed_answer_key_videos");
        if (raw) setCompletedVideos(JSON.parse(raw));
        const rawTabs = localStorage.getItem("xfnite_completed_answer_key_tabs");
        if (rawTabs) setCompletedTabs(JSON.parse(rawTabs));
      } catch (e) {
        console.error("Failed to load answer key states from localStorage:", e);
      }
    }
  }, []);

  useEffect(() => {
    if (!previewMode && task?.type === "video" && currentCountdown === 0 && isVideoFinished) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompletedVideos((prev) => {
        if (prev[task.taskId]) return prev;
        const next = { ...prev, [task.taskId]: true };
        if (typeof window !== "undefined") {
          localStorage.setItem("xfnite_completed_answer_key_videos", JSON.stringify(next));
        }
        return next;
      });
    }
  }, [currentCountdown, isVideoFinished, task, previewMode]);

  useEffect(() => {
    if (!previewMode && Object.keys(completedTabs).length > 0 && typeof window !== "undefined") {
      localStorage.setItem("xfnite_completed_answer_key_tabs", JSON.stringify(completedTabs));
    }
  }, [completedTabs, previewMode]);

  useEffect(() => {
    if (playSignal && playSignal > 0) videoPlayerRef.current?.play();
  }, [playSignal]);

  useEffect(() => {
    if (!task) return;
    const key = `${task.taskId}::${activeTab}`;
    /* eslint-disable react-hooks/set-state-in-effect */
    setCountdownMap((prev) => {
      const currentVal = prev[key];
      const isCompleted = completedTabs[key] || (task.type === "video" && activeTab === 0 && completedVideos[task.taskId]);
      if (isCompleted) {
        if (currentVal === 0) return prev;
        return { ...prev, [key]: 0 };
      }
      if (currentVal !== undefined && currentVal >= 0) return prev;

      let initialVal = 0;
      if (task.type === "video" && activeTab === 0) {
        if (isDev || previewMode) {
          initialVal = 0;
        } else if (task.youtubeId === "QSe5XPccazs") {
          initialVal = 10;
        } else if (task.youtubeId && ANSWER_KEY_VIDEO_DURATIONS[task.youtubeId]) {
          const duration = task.endTime ? task.endTime - (task.startTime || 0) : ANSWER_KEY_VIDEO_DURATIONS[task.youtubeId];
          initialVal = calcVideoCountdown(duration);
        } else {
          initialVal = 60;
        }
      } else if (task.type === "image") {
        if (visitedTasks[task.taskId] && activeTab === 0) {
          initialVal = 0;
        } else {
          initialVal = isDev ? 0 : 0;
        }
      } else {
        initialVal = 0;
      }
      return { ...prev, [key]: initialVal };
    });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [task?.taskId, task?.type, activeTab, completedVideos, visitedTasks, completedTabs]);

  useEffect(() => {
    if (!task) return;
    const isImageTab = (task.type === "image" && activeTab === 0) || activeTab > 0;
    if (!isImageTab) return;
    const key = `${task.taskId}::${activeTab}`;
    const currentVal = countdownMap[key];
    if (currentVal === undefined || currentVal <= 0) return;
    const interval = setInterval(() => {
      setCountdownMap((prev) => {
        const val = prev[key];
        if (val === undefined) return prev;
        if (val <= 1) { clearInterval(interval); return { ...prev, [key]: 0 }; }
        return { ...prev, [key]: val - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [task?.taskId, task?.type, activeTab, countdownMap[activeKey] === undefined]);

  useEffect(() => {
    if (!task || task.type !== "video" || activeTab !== 0) return;
    const key = `${task.taskId}::0`;
    const currentVal = countdownMap[key];
    if (currentVal === undefined || currentVal <= 0) return;
    if (!hasVideoStarted || !isVideoPlaying) return;
    const interval = setInterval(() => {
      setCountdownMap((prev) => {
        const val = prev[key];
        if (val === undefined) return prev;
        if (val <= 1) { clearInterval(interval); return { ...prev, [key]: 0 }; }
        return { ...prev, [key]: val - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [task?.taskId, task?.type, activeTab, hasVideoStarted, isVideoPlaying, countdownMap[activeKey] === undefined]);

  const isLastPage = currentIndex >= TOTAL - 1;
  const maxTabs = task?.extraImages ? task.extraImages.length : 0;
  const isLastTab = activeTab >= maxTabs;
  const isFirstTab = activeTab === 0;

  const handleNext = () => {
    const currentKey = `${task.taskId}::${activeTab}`;
    setCompletedTabs((prev) => ({ ...prev, [currentKey]: true }));
    if (!isLastTab) {
      setActiveTab((prev) => prev + 1);
    } else if (!isLastPage) {
      onTaskVisited(task.taskId);
      onNavigate(currentIndex + 1);
    }
  };

  const handleBack = () => {
    if (!isFirstTab) {
      setActiveTab((prev) => prev - 1);
    } else if (currentIndex > 0) {
      setNavigatingBack(true);
      onNavigate(currentIndex - 1);
    }
  };

  if (!task) return null;

  // ── Button styles (matching page.tsx)
  const prevBtnCls = "flex items-center gap-2.5 px-5 py-3 rounded-xl bg-white/90 dark:bg-[#1B263B]/90 backdrop-blur-md text-[#0D1B2A] dark:text-white font-bold text-sm shadow-xl shadow-black/5 dark:shadow-white/5 hover:scale-105 active:scale-95 transition-all border border-black/10 dark:border-white/10";
  const nextBtnCls = "flex items-center gap-2.5 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] font-bold text-sm shadow-xl shadow-[#1F7A1F]/30 dark:shadow-[#55f761]/30 hover:scale-105 active:scale-95 transition-all border border-[#55f761]/20 cursor-pointer";
  const nextDisabledCls = "flex items-center gap-2.5 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] font-bold text-sm shadow-xl shadow-black/5 opacity-60 cursor-not-allowed transition-all border border-[#55f761]/20";

  // ── Locked state
  if (isLocked) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto pb-6 min-h-[calc(100vh-4rem)] flex flex-col relative">
        <div className="relative rounded-2xl border overflow-hidden border-black/5 dark:border-white/5 bg-white/70 dark:bg-[#0D1B2A]/50 opacity-45 cursor-not-allowed shadow-sm">
          <div className="flex items-stretch min-h-[96px]">
            <div className="w-20 flex-shrink-0 flex flex-col items-center justify-center border-r border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/[0.02] relative">
              <span className="text-2xl font-black tracking-tight leading-none font-mono text-black/20 dark:text-white/20">04</span>
              <div className="absolute bottom-2.5 right-2.5 w-2 h-2 rounded-full bg-black/15 dark:bg-white/15" />
            </div>
            <div className="flex-1 px-5 py-4 flex flex-col justify-center gap-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/70 dark:text-emerald-400/60">Step 04 · Answer Key</span>
              <div className="text-[15px] font-bold text-black/90 dark:text-white/90 leading-tight">Answer Key</div>
              <div className="text-xs text-black/55 dark:text-white/50 leading-relaxed">Complete all training modules to unlock the Answer Key.</div>
            </div>
            <div className="flex-shrink-0 flex flex-col items-end justify-center gap-2 px-5 py-4 min-w-[140px]">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-[0_10px_0_10px] bg-black/5 dark:bg-white/[0.04] border border-black/10 dark:border-white/8 text-black/40 dark:text-white/25 text-xs font-bold">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                Locked
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isCompleted = visitedCount >= TOTAL;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto pb-6 min-h-[calc(100vh-4rem)] flex flex-col relative">
      {/* ── Card shell matching TrainingModuleCard */}
      <div className={`relative rounded-2xl border overflow-hidden transition-all duration-300 shadow-sm ${
        isCompleted
          ? "border-emerald-500/20 dark:border-emerald-400/20 bg-white dark:bg-[#0D1B2A]"
          : "border-black/10 dark:border-white/10 bg-white dark:bg-[#0D1B2A] hover:border-black/20 dark:hover:border-white/20"
      }`}>
        {/* ── Main header row */}
        <div className="flex items-stretch min-h-[96px]">
          {/* Step number column */}
          <div className={`w-20 flex-shrink-0 flex flex-col items-center justify-center border-r relative ${
            isCompleted
              ? "border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-900/10"
              : "border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/[0.02]"
          }`}>
            <span className={`text-2xl font-black tracking-tight leading-none font-mono ${
              isCompleted ? "text-emerald-500 dark:text-emerald-400" : "text-emerald-500 dark:text-emerald-400"
            }`}>04</span>
            <div className={`absolute bottom-2.5 right-2.5 w-2 h-2 rounded-full ${
              isCompleted ? "bg-emerald-500 shadow-[0_0_6px_#10b981]" : "bg-black/15 dark:bg-white/15"
            }`} />
          </div>

          {/* Title / meta */}
          <div className="flex-1 px-5 py-4 flex flex-col justify-center gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/70 dark:text-emerald-400/60">
              Step 04 · Answer Key
            </span>
            <div className="text-[15px] font-bold text-black/90 dark:text-white/90 leading-tight">
              Answer Key
            </div>
            <div className="text-xs text-black/55 dark:text-white/50 leading-relaxed">
              Review all answer key tasks before completing your training.
            </div>
            <div className="mt-1 text-[11px] text-black/40 dark:text-white/30">
              {visitedCount}/{TOTAL} visited
            </div>
          </div>

          {/* Completed badge */}
          <div className="flex-shrink-0 flex flex-col items-end justify-center gap-2 px-5 py-4 min-w-[140px]">
            {isCompleted && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 dark:bg-emerald-400/10 border border-emerald-500/30 dark:border-emerald-400/30 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold">
                <CheckIcon className="w-3 h-3" />
                Completed
              </div>
            )}
          </div>
        </div>

        {/* ── Sub-content area (matches TrainingModuleCard sub-content style) */}
        <div className="border-t border-black/8 dark:border-white/8 bg-black/[0.01] dark:bg-black/20 px-5 py-5">
          {/* Task counter header */}
          <div className="flex items-center justify-between mb-4">
            <div className="text-[11px] font-bold uppercase tracking-widest text-black/50 dark:text-white/50">
              Answer Key Tasks
            </div>
            <span className="text-sm font-bold text-black/60 dark:text-white/60 px-3 py-1.5 rounded-full border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04]">
              Task {currentIndex + 1} of {TOTAL}
            </span>
          </div>

          {/* Task label + visited badge */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-black uppercase tracking-wider px-3 py-1 rounded-full border bg-black/5 dark:bg-white/8 border-black/15 dark:border-white/15 text-black/80 dark:text-white/80">
              {task.taskId}
            </span>
            {visitedTasks[task.taskId] && (
              <span className="text-emerald-500 dark:text-emerald-400 text-[11px] font-bold flex items-center gap-1">
                <CheckIcon className="w-3.5 h-3.5" />
                Visited
              </span>
            )}
          </div>

          {/* Note callout */}
          {task.note && (
            <div className="flex gap-3 px-4 py-3 rounded-xl border border-amber-400/30 dark:border-amber-400/20 bg-amber-50/80 dark:bg-amber-900/10 mb-4">
              <div className="w-1 flex-shrink-0 rounded-full bg-amber-400/80 dark:bg-amber-400/60" />
              <div className="flex-1">
                <p className="text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 mb-1">Note</p>
                <p className="text-sm leading-relaxed text-amber-900/80 dark:text-amber-200/80 whitespace-pre-line">{task.note}</p>
              </div>
            </div>
          )}

          {/* Main content: video or image */}
          <div className="flex flex-col gap-5">
            {activeTab === 0 && (
              <>
                {task.type === "video" && task.youtubeId && (
                  <InlineVideoPlayer
                    ref={videoPlayerRef}
                    videoId={task.youtubeId}
                    watchedPercent={0}
                    onProgress={() => {}}
                    onPlay={() => setHasVideoStarted(true)}
                    onPlayingStateChange={setIsVideoPlaying}
                    onTimeUpdate={(_vidId, cur, dur) => {
                      setVideoDuration(dur);
                      setVideoCurrentTime(cur);
                      if (dur > 0 && (cur / dur) < 0.95) setIsVideoEnded(false);
                    }}
                    onVideoEnded={() => setIsVideoEnded(true)}
                    startTime={task.startTime}
                  />
                )}
                {task.type === "image" && task.imageConfigKey && (
                  <ImageOrPlaceholder configKey={task.imageConfigKey} />
                )}
              </>
            )}

            {activeTab > 0 && task.extraImages && task.extraImages[activeTab - 1] && (
              <ImageOrPlaceholder
                configKey={task.extraImages[activeTab - 1].configKey}
                caption={task.extraImages[activeTab - 1].caption}
              />
            )}

            {task.extraButtons && task.extraButtons.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-1">
                {task.extraButtons.map((btn) => (
                  <a
                    key={btn.href}
                    href={btn.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/[0.05] text-sm font-semibold text-black/75 dark:text-white/80 hover:border-[#1F7A1F]/50 dark:hover:border-[#55f761]/50 hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-all hover:scale-105 active:scale-95 shadow-sm"
                  >
                    <ExternalLinkIcon />
                    {btn.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Navigation buttons */}
      <div className="mt-auto pt-8 flex items-center justify-between">
        {/* Back */}
        <div>
          {currentIndex > 0 || !isFirstTab ? (
            <button onClick={handleBack} className={prevBtnCls}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>
          ) : (
            <div />
          )}
        </div>

        {/* Next */}
        <div>
          {!isLastPage || !isLastTab ? (
            task.type === "video" && activeTab === 0 && !hasVideoStarted ? (
              <button
                onClick={() => { setHasVideoStarted(true); setPlaySignal((s) => s + 1); }}
                className={nextBtnCls}
              >
                Play Video
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                  <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
                </svg>
              </button>
            ) : currentCountdown > 0 ? (
              <div className={nextDisabledCls}>
                Next ({formatVideoCountdown(currentCountdown)})
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            ) : task.type === "video" && activeTab === 0 && !isVideoFinished ? (
              <div className="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1F7A1F]/40 to-[#2ea82e]/40 dark:from-[#55f761]/30 dark:to-[#3de34a]/30 text-white/60 dark:text-[#060D14]/50 font-bold text-sm shadow-xl border border-[#55f761]/10 cursor-not-allowed transition-all">
                Finish Video
                <svg className="w-4 h-4 opacity-40" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : (
              <button onClick={handleNext} className={nextBtnCls}>
                Next
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            )
          ) : (
            task.type === "video" && activeTab === 0 && !hasVideoStarted ? (
              <button
                onClick={() => { setHasVideoStarted(true); setPlaySignal((s) => s + 1); }}
                className={nextBtnCls}
              >
                Play Video
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                  <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
                </svg>
              </button>
            ) : currentCountdown > 0 ? (
              <div className={nextDisabledCls}>
                Finish ({formatVideoCountdown(currentCountdown)})
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : task.type === "video" && activeTab === 0 && !isVideoFinished ? (
              <div className="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1F7A1F]/40 to-[#2ea82e]/40 dark:from-[#55f761]/30 dark:to-[#3de34a]/30 text-white/60 dark:text-[#060D14]/50 font-bold text-sm shadow-xl border border-[#55f761]/10 cursor-not-allowed transition-all">
                Finish Video
                <svg className="w-4 h-4 opacity-40" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : !visitedTasks[task.taskId] ? (
              <button onClick={() => {
                onTaskVisited(task.taskId);
                if (visitedCount + 1 >= TOTAL && onNavigateToLibrary) {
                  onNavigateToLibrary();
                }
              }} className={visitedCount + 1 >= TOTAL ? "inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-400 dark:hover:bg-emerald-500 text-white dark:text-[#060D14] text-sm font-bold shadow-xl shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95" : nextBtnCls}>
                {visitedCount + 1 >= TOTAL ? "Continue to Library" : "Finish"}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            ) : visitedCount >= TOTAL ? (
              onNavigateToLibrary ? (
                <button onClick={onNavigateToLibrary} className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-400 dark:hover:bg-emerald-500 text-white dark:text-[#060D14] text-sm font-bold shadow-xl shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95">
                  Continue to Library
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500/10 dark:bg-emerald-400/10 border border-emerald-500/30 dark:border-emerald-400/30 text-emerald-600 dark:text-emerald-400 text-sm font-bold">
                  <CheckIcon className="w-4 h-4" />
                  All Tasks Complete!
                </div>
              )
            ) : (
              <div className="text-xs font-semibold text-black/40 dark:text-white/30 px-4 py-2.5">
                Last page
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
