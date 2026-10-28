import { BASIC_VIDEO_ITEMS_UI, ADVANCED_ITEMS_UI } from "./useOnboardingProgress";
import { ANSWER_KEY_TASKS } from "./AnswerKeyPanel";

// Derives a trainee's onboarding position (e.g. "Mod 2.1") from the raw
// onboardingProgress JSON, using the same per-part rules as the trainee's
// own dashboard sidebar so mentors see exactly what the trainee sees.

export type PartState = "done" | "skipped" | "current" | "pending";

export interface OnboardingPartStatus {
  code: string;   // "Mod 2.1"
  label: string;  // "Part 1 — Labeling Basics"
  state: PartState;
  previewHref: string; // opens this exact page in the staff onboarding preview
}

export interface OnboardingModuleStatus {
  num: number;
  title: string;
  parts: OnboardingPartStatus[];
  done: number;
  total: number;
}

export interface OnboardingStatus {
  modules: OnboardingModuleStatus[];
  percent: number;
  isComplete: boolean;
  hasStarted: boolean;
  current: OnboardingPartStatus & { moduleTitle: string } | null; // null when complete
  skipped: (OnboardingPartStatus & { moduleTitle: string })[];
}

function parseJson(val: unknown) {
  if (!val) return null;
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }
  return val;
}

export function getOnboardingStatus(rawProgress: unknown, isDashboardCompleted = false): OnboardingStatus {
  const p = parseJson(rawProgress) ?? {};
  const modulesComplete: Record<string, boolean> = p.modulesComplete ?? {};
  const opened: Record<string, boolean> = p.subItemsOpened ?? {};
  const watched: Record<string, number> = p.moduleVideoWatched ?? {};
  const answerKey: Record<string, boolean> = p.answerKeyProgress ?? {};

  const isOpened = (step: string, id: string) => !!opened[`${step}::${id}`];
  const watchedPct = (step: string, id: string) => watched[`${step}::${id}`] ?? 0;

  // step/sub match the dashboard's own navigation (handleSetActiveStep / answer-key sub index)
  const raw: { num: number; title: string; parts: { label: string; done: boolean; step: string; sub?: number }[] }[] = [
    {
      num: 1,
      title: "Software Setup",
      parts: [
        { label: "Download Software", done: !!modulesComplete["download"], step: "download" },
        { label: "Install Software", done: !!modulesComplete["install"], step: "install" },
      ],
    },
    {
      num: 2,
      title: "Basic Labeling",
      parts: BASIC_VIDEO_ITEMS_UI.map((v, i) => ({
        label: v.partLabel,
        step: "videos-basic",
        sub: i,
        done: watchedPct("videos-basic", v.id) >= 95 || (!!v.isPlaylist && isOpened("videos-basic", v.id)),
      })),
    },
    {
      num: 3,
      title: "3D and Multilayer",
      parts: ADVANCED_ITEMS_UI.filter((v) => !(v.isInfo && v.slideIndex > 0)).map((v) => {
        const sub = ADVANCED_ITEMS_UI.indexOf(v);
        if (v.isInfo && v.slideIndex === 0) {
          return {
            label: "Part 1 — 3D Guide",
            step: "videos-3d",
            sub,
            done: [0, 1, 2, 3, 4].every((i) => isOpened("videos-3d", ADVANCED_ITEMS_UI[i].id)),
          };
        }
        return {
          label: v.partLabel,
          step: "videos-3d",
          sub,
          done: v.isDoc || v.isInfo ? isOpened("videos-3d", v.id) : watchedPct("videos-3d", v.id) >= 95,
        };
      }),
    },
    {
      num: 4,
      title: "Answer Key",
      parts: ANSWER_KEY_TASKS.filter((t) => !t.isHiddenInSidebar).map((t) => ({
        label: t.sidebarGroupLabel || t.taskId,
        step: "answer-key",
        sub: ANSWER_KEY_TASKS.indexOf(t),
        done: t.sidebarGroupId
          ? ANSWER_KEY_TASKS.filter((g) => g.sidebarGroupId === t.sidebarGroupId).every((g) => !!answerKey[g.taskId])
          : !!answerKey[t.taskId],
      })),
    },
    {
      num: 5,
      title: "Answer Key Library",
      parts: [{ label: "Answer Key Library", done: !!modulesComplete["answer-key-lib"], step: "answer-key-lib" }],
    },
  ];

  // Flatten to find the furthest part reached; anything left undone before it was skipped.
  const flat = raw.flatMap((m) => m.parts.map((part, i) => ({ m, i, part })));
  let lastDoneIdx = -1;
  flat.forEach((f, idx) => {
    if (f.part.done) lastDoneIdx = idx;
  });
  const currentIdx = flat.findIndex((f, idx) => idx > lastDoneIdx && !f.part.done);

  const modules: OnboardingModuleStatus[] = [];
  const skipped: OnboardingStatus["skipped"] = [];
  let current: OnboardingStatus["current"] = null;
  let flatIdx = 0;

  for (const m of raw) {
    const parts = m.parts.map((part, i) => {
      const idx = flatIdx++;
      const state: PartState = part.done
        ? "done"
        : idx < lastDoneIdx
          ? "skipped"
          : idx === currentIdx && !isDashboardCompleted
            ? "current"
            : "pending";
      const status: OnboardingPartStatus = {
        code: `Mod ${m.num}.${i + 1}`,
        label: part.label,
        state,
        previewHref: getOnboardingPreviewHref(part.step, part.sub),
      };
      if (state === "skipped") skipped.push({ ...status, moduleTitle: m.title });
      if (state === "current") current = { ...status, moduleTitle: m.title };
      return status;
    });
    modules.push({
      num: m.num,
      title: m.title,
      parts,
      done: parts.filter((x) => x.state === "done").length,
      total: parts.length,
    });
  }

  const totalParts = flat.length;
  const doneParts = flat.filter((f) => f.part.done).length;
  const isComplete = isDashboardCompleted || doneParts === totalParts;

  return {
    modules,
    percent: isComplete ? 100 : Math.round((doneParts / totalParts) * 100),
    isComplete,
    hasStarted: doneParts > 0,
    current: isComplete ? null : current,
    skipped,
  };
}

export function getOnboardingPreviewHref(step = "download", sub = 0): string {
  return `/dashboard?preview=1&step=${encodeURIComponent(step)}&sub=${sub}`;
}

// Short text for tables / CSV, e.g. "Mod 2.1 · Basic Labeling — Part 1 — Labeling Basics"
export function getOnboardingStatusText(status: OnboardingStatus): string {
  if (status.isComplete) return "Completed";
  if (!status.hasStarted || !status.current) return "Not started";
  return `${status.current.code} · ${status.current.moduleTitle} — ${status.current.label}`;
}
