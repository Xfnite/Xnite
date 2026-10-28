"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { saveOnboardingProgressAction } from "@/app/actions/auth";

export interface OnboardingProgress {
  // Stage 1 - Videos
  videosWatched: Record<string, number>; // videoId -> percentage watched (0-100)
  stage1Complete: boolean;

  // Stage 2 - Modules
  modulesComplete: Record<string, boolean>; // moduleId -> completed

  // Stage 2 - Sub-state
  checklistItems: Record<string, boolean>;  // `${stepId}::${itemId}` -> ticked
  subItemsOpened: Record<string, boolean>;  // `${stepId}::${itemId}` -> opened

  // Stage 2 - Inline video watch progress (Steps 3 & 4)
  moduleVideoWatched: Record<string, number>; // `${stepId}::${itemId}` -> percent (0-100)

  // Stage 3 - Answer Key task visit progress
  answerKeyProgress: Record<string, boolean>; // taskId -> visited
  answerKeyCompleted: boolean;

  // Overall
  stage2Complete: boolean;
  onboardingComplete: boolean;
}

const STORAGE_KEY = "xfnite_onboarding_progress_v2";

const defaultProgress: OnboardingProgress = {
  videosWatched: {},
  stage1Complete: false,
  modulesComplete: {},
  checklistItems: {},
  subItemsOpened: {},
  moduleVideoWatched: {},
  answerKeyProgress: {},
  answerKeyCompleted: false,
  stage2Complete: false,
  onboardingComplete: false,
};

export const VIDEO_IDS = {
  v1: "3hAiZ4eOAic",
  v2: "uqpGgo0gOEQ",
  v3: "8959gDDuBJQ",
};

// Step 05 (live-session) is auto-skipped and never blocks progress
export const MODULE_IDS = [
  "download",
  "install",
  "videos-basic",
  "videos-3d",
  "answer-key",
  "answer-key-lib"
];

// Items that count toward completion (live-session is auto-complete, excluded from count)
const COMPLETABLE_MODULE_IDS = MODULE_IDS.filter((id) => id !== "live-session");

// Checklist sub-items for Step 02 (install)
export const INSTALL_CHECKLIST = [
  { id: "7zip", label: 'Install 7-Zip (7z2301-x64.exe)' },
  { id: "extract-vc", label: 'Right-click Visual-C-Runtimes-All-in-One.zip → 7-Zip → Extract Here' },
  { id: "run-bat", label: 'Open Visual-C-Runtimes-All-in-One folder → Run install_all.bat and wait for installation to finish' },
  { id: "extract-ginger", label: 'Right-click Ginger.zip → 7-Zip → Extract Here' },
];

// Sub-items for Step 03 (basic labeling videos)
export const BASIC_VIDEO_ITEMS = [
  { id: "basic-p1", label: "Part 1 — Labeling Basics", href: "http://www.youtube.com/watch?v=QSe5XPccazs", isVideo: true },
  { id: "basic-p2", label: "Part 2 — Techniques", href: "http://www.youtube.com/watch?v=IaUeAIqTwjM", isVideo: true },
  { id: "basic-p3", label: "Part 3 — Switching", href: "https://www.youtube.com/watch?v=iVLHd19arhQ", isVideo: true },
];

// Sub-items for Step 04 (3D & multilayer)
export const ADVANCED_ITEMS = [
  { id: "3d-p1", label: "Part 1 — Basic 3D Guide (Read)", href: "https://docs.google.com/document/d/1_irTWx53_2gR42k9jxWsl7ynVo7Nd5tENv_64kV0Bmc", isVideo: false },
  { id: "3d-p2", label: "Part 2 — How to Draw 3D Lines", href: "http://www.youtube.com/watch?v=_sAlAxJSTpE", isVideo: true },
  { id: "3d-p3", label: "Part 3 — 3D Overview", href: "https://www.youtube.com/watch?v=oOgLUJyGczE", isVideo: true },
];

// Step 1 download tracking keys
export const DOWNLOAD_KEYS = ["step1_dl1", "step1_dl2", "step1_dl3"] as const;

// Inline video item IDs for Steps 3 & 4 (for per-video watch progress)
// These are stored in subItemsOpened (opened/clicked) or a separate watchedItems map
export const BASIC_VIDEO_YOUTUBE_IDS: Record<string, string> = {
  "basic-p1": "QSe5XPccazs",
  "basic-p2": "IaUeAIqTwjM",
  "basic-p3": "iVLHd19arhQ",
};
export const ADVANCED_VIDEO_YOUTUBE_IDS: Record<string, string> = {
  "3d-p2": "_sAlAxJSTpE",
  "3d-p3": "oOgLUJyGczE",
};

export const BASIC_VIDEO_ITEMS_UI: any[] = [
  { id: "basic-p1", partLabel: "Part 1 — Labeling Basics", youtubeId: BASIC_VIDEO_YOUTUBE_IDS["basic-p1"] },
  { id: "basic-p2", partLabel: "Part 2 — Techniques", youtubeId: BASIC_VIDEO_YOUTUBE_IDS["basic-p2"] },
  { id: "basic-p3", partLabel: "Part 3 — Switching", youtubeId: BASIC_VIDEO_YOUTUBE_IDS["basic-p3"] },
];

export const ADVANCED_ITEMS_UI: any[] = [
  { id: "3d-guide-1", partLabel: "3D Guide: Step 1 — Task Overview",       isInfo: true, slideIndex: 0 },
  { id: "3d-guide-2", partLabel: "3D Guide: Step 2 — Labeling Footprint",  isInfo: true, slideIndex: 1 },
  { id: "3d-guide-3", partLabel: "3D Guide: Step 3 — Setting the Vector",  isInfo: true, slideIndex: 2 },
  { id: "3d-guide-4", partLabel: "3D Guide: Step 4 — Selecting the Label", isInfo: true, slideIndex: 3 },
  { id: "3d-guide-5", partLabel: "3D Guide: Step 5 — Generating 3D Lines", isInfo: true, slideIndex: 4 },
  { id: "3d-p2", partLabel: "Part 2 — How to Draw 3D Lines", youtubeId: ADVANCED_VIDEO_YOUTUBE_IDS["3d-p2"] },
  { id: "3d-p3", partLabel: "Part 3 — 3D Overview", youtubeId: ADVANCED_VIDEO_YOUTUBE_IDS["3d-p3"] },
];

// ── Known video durations (seconds) for instant countdown calculation ──────
// These allow the countdown to be displayed immediately without waiting for
// the YouTube player API to report duration.
export const ONBOARDING_VIDEO_DURATIONS: Record<string, number> = {
  "basic-p1": 893,  // Part 1 — Labeling Basics (14:53) - Custom 10s countdown forced in page.tsx
  "basic-p2": 835,  // Part 2 — Techniques (13:55)
  "basic-p3": 206,  // Part 3 — Switching (3:26)
  "3d-p2": 101,  // Part 2 — How to Draw 3D Lines (1:41)
  "3d-p3": 448,  // Part 3 — 3D Overview (7:28)
};

// Answer Key video durations (seconds) for instant countdown
export const ANSWER_KEY_VIDEO_DURATIONS: Record<string, number> = {
  "eZbnMTmMJOI": 620,   // Task 1.0 to Task 1.11 (10:20)
  "1OiRgdRzo68": 624,   // Task 1.5 to 1.33 (10:24)
  "2G3casdSwYQ": 742,   // Task 12 (12:22)
  "WzBdHicQfdg": 793,   // Task 1.27, 1.39 & 1.31 (13:13)
  "HoE6ojgLhD0": 794,   // Task 1.3 to 1.36 (13:14)
  "QGtiHMU8vcQ": 1068,  // Task 1.29 & 1.20 (17:48)
  "azorH4bhIT4": 359,   // Task 1.52 (5:59)
  "wo5rGSiY60c": 786,   // Task 1.51 (13:06)
  "WwZE-YarfgE": 640,   // Task 1.50 to 34 (10:40)
  "QSe5XPccazs": 893,   // Task 1.35 (14:53)
};

// Calculate the initial countdown seconds for a video given its duration
export function calcVideoCountdown(durationSecs: number): number {
  return Math.floor(durationSecs * 0.25) + 10;
}

function getStorageKey(email?: string): string {
  return email ? `xfnite_onboarding_progress_${email.replace(/[^a-zA-Z0-9_-]/g, '_')}` : STORAGE_KEY;
}

function loadLocal(email?: string): OnboardingProgress {
  if (typeof window === "undefined") return defaultProgress;
  try {
    const key = getStorageKey(email);
    const raw = localStorage.getItem(key);
    if (!raw) return defaultProgress;
    return { ...defaultProgress, ...JSON.parse(raw) };
  } catch {
    return defaultProgress;
  }
}

function saveLocal(p: OnboardingProgress, email?: string) {
  if (typeof window === "undefined") return;
  const key = getStorageKey(email);
  localStorage.setItem(key, JSON.stringify(p));
  window.dispatchEvent(new Event("onboarding_progress_updated"));
}

// Total number of answer key tasks
const ANSWER_KEY_TOTAL = 15;

function computeFlags(p: OnboardingProgress): OnboardingProgress {
  const allVideosWatched = Object.values(VIDEO_IDS).every(
    (id) => (p.videosWatched[id] ?? 0) >= 95
  );
  const stage1Complete = allVideosWatched;

  // stage2Complete only depends on actual Stage 2 modules (1 to 3)
  const stage2ModuleIds = ["download", "install", "videos-basic", "videos-3d"];
  const stage2Complete = stage2ModuleIds.every((id) => !!p.modulesComplete[id]);

  // Answer key is complete when all 34 tasks have been visited
  const answerKeyVisited = Object.values(p.answerKeyProgress ?? {}).filter(Boolean).length;
  const answerKeyCompleted = answerKeyVisited >= ANSWER_KEY_TOTAL;

  // Auto-complete the answer-key module when all tasks visited
  const updatedModulesComplete = answerKeyCompleted
    ? { ...p.modulesComplete, "answer-key": true }
    : p.modulesComplete;

  // onboarding is complete when all completable modules (including answer-key) are done
  const allModulesComplete = COMPLETABLE_MODULE_IDS.every((id) => !!updatedModulesComplete[id]);
  const onboardingComplete = allModulesComplete;

  return { ...p, modulesComplete: updatedModulesComplete, stage1Complete, stage2Complete, answerKeyCompleted, onboardingComplete };
}

const fullyCompleteProgress: OnboardingProgress = computeFlags({
  videosWatched: Object.fromEntries(Object.values(VIDEO_IDS).map((id) => [id, 100])),
  stage1Complete: true,
  modulesComplete: Object.fromEntries(MODULE_IDS.map((id) => [id, true])),
  checklistItems: {},
  subItemsOpened: {},
  moduleVideoWatched: {},
  answerKeyProgress: {},
  answerKeyCompleted: false,
  stage2Complete: true,
  onboardingComplete: true,
});

// readOnly: progress lives only in memory (used by the staff preview) — never written to localStorage or the DB.
export function useOnboardingProgress(onStage1Complete?: () => void, isRegistered?: boolean, email?: string, dbProgress?: any, readOnly = false) {
  const [progress, setProgress] = useState<OnboardingProgress>(defaultProgress);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const stage1CompletedRef = { current: false };

  useEffect(() => {
    const key = getStorageKey(email);
    let loaded = loadLocal(email);

    if (dbProgress && typeof dbProgress === "object") {
      // Overwrite local progress with dbProgress if DB has data
      loaded = { ...defaultProgress, ...dbProgress };
      if (!readOnly) saveLocal(loaded, email);
    }

    const computed = computeFlags(loaded);
    setProgress(computed);
    stage1CompletedRef.current = computed.stage1Complete;
    setLoadedKey(key);
    setIsLoaded(true);
  }, [email, dbProgress, readOnly]);

  const progressRef = useRef(progress);
  const emailRef = useRef(email);
  const isLoadedRef = useRef(isLoaded);
  const loadedKeyRef = useRef(loadedKey);
  const isDirtyRef = useRef(false);
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  useEffect(() => {
    progressRef.current = progress;
    emailRef.current = email;
    isLoadedRef.current = isLoaded;
    loadedKeyRef.current = loadedKey;
  }, [progress, email, isLoaded, loadedKey]);

  // Save to localStorage immediately, and debounce database writes to 10 seconds only when changes occur.
  useEffect(() => {
    if (readOnly || !isLoaded || loadedKey !== getStorageKey(email)) return;

    saveLocal(progress, email);

    // If no progress changes were initiated by the user during this session/render, do NOT ping the database.
    if (!email || !isDirtyRef.current) return;

    const handler = setTimeout(() => {
      if (isDirtyRef.current && emailRef.current) {
        isDirtyRef.current = false;
        saveOnboardingProgressAction(progressRef.current).catch(console.error);
      }
    }, 10000);

    return () => clearTimeout(handler);
  }, [progress, isLoaded, loadedKey, email, readOnly]);

  // Ensure any pending dirty progress is flushed to the database on unmount
  useEffect(() => {
    return () => {
      if (!readOnlyRef.current && isDirtyRef.current && isLoadedRef.current && loadedKeyRef.current === getStorageKey(emailRef.current) && emailRef.current) {
        isDirtyRef.current = false;
        saveOnboardingProgressAction(progressRef.current).catch(console.error);
      }
    };
  }, []);

  const markVideoProgress = useCallback((videoId: string, percent: number) => {
    setProgress((prev) => {
      const existing = prev.videosWatched[videoId] ?? 0;
      if (percent <= existing) return prev; // no progress made, avoid state update & API call

      isDirtyRef.current = true;
      const updated = computeFlags({
        ...prev,
        videosWatched: {
          ...prev.videosWatched,
          [videoId]: Math.max(existing, percent),
        },
      });
      if (!readOnlyRef.current) saveLocal(updated);
      if (updated.stage1Complete && !stage1CompletedRef.current) {
        stage1CompletedRef.current = true;
        onStage1Complete?.();
      }
      return updated;
    });
  }, [onStage1Complete]);

  const markModuleComplete = useCallback((moduleId: string) => {
    setProgress((prev) => {
      if (prev.modulesComplete[moduleId]) return prev;
      isDirtyRef.current = true;
      const updated = computeFlags({
        ...prev,
        modulesComplete: { ...prev.modulesComplete, [moduleId]: true },
      });
      return updated;
    });
  }, []);

  const markChecklistItem = useCallback((stepId: string, itemId: string, value: boolean) => {
    setProgress((prev) => {
      const key = `${stepId}::${itemId}`;
      if (prev.checklistItems[key] === value) return prev;
      isDirtyRef.current = true;
      const updated = computeFlags({
        ...prev,
        checklistItems: { ...prev.checklistItems, [key]: value },
      });
      return updated;
    });
  }, []);

  const markSubItemOpened = useCallback((stepId: string, itemId: string) => {
    setProgress((prev) => {
      const key = `${stepId}::${itemId}`;
      if (prev.subItemsOpened[key]) return prev; // already opened, no re-render needed
      isDirtyRef.current = true;
      const updated = computeFlags({
        ...prev,
        subItemsOpened: { ...prev.subItemsOpened, [key]: true },
      });
      return updated;
    });
  }, []);

  const markModuleVideoProgress = useCallback((stepId: string, itemId: string, percent: number) => {
    setProgress((prev) => {
      const key = `${stepId}::${itemId}`;
      const existing = prev.moduleVideoWatched[key] ?? 0;
      if (percent <= existing) return prev; // no regression
      isDirtyRef.current = true;
      const updated = computeFlags({
        ...prev,
        moduleVideoWatched: { ...prev.moduleVideoWatched, [key]: Math.max(existing, percent) },
      });
      return updated;
    });
  }, []);

  const markAnswerKeyTaskVisited = useCallback((taskId: string) => {
    setProgress((prev) => {
      if (prev.answerKeyProgress?.[taskId]) return prev; // already visited
      isDirtyRef.current = true;
      const updated = computeFlags({
        ...prev,
        answerKeyProgress: { ...(prev.answerKeyProgress ?? {}), [taskId]: true },
      });
      return updated;
    });
  }, []);

  // Overall progress counts completable modules
  const overallPercent = (() => {
    const total = COMPLETABLE_MODULE_IDS.length;
    if (total === 0) return 100;
    const modulesDone = COMPLETABLE_MODULE_IDS.filter((id) => !!progress.modulesComplete[id]).length;
    return Math.round((modulesDone / total) * 100);
  })();

  const tasksDone = COMPLETABLE_MODULE_IDS.filter((id) => !!progress.modulesComplete[id]).length;
  const totalTasks = COMPLETABLE_MODULE_IDS.length;

  return {
    progress,
    overallPercent,
    tasksDone,
    totalTasks,
    markVideoProgress,
    markModuleComplete,
    markChecklistItem,
    markSubItemOpened,
    markModuleVideoProgress,
    markAnswerKeyTaskVisited,
  };
}
