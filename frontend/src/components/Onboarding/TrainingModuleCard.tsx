"use client";

import { useState, useRef, useEffect } from "react";
import InlineVideoPlayer from "./InlineVideoPlayer";

// ─── 3D Slide data (mirrors pre-course TUTORIAL_SLIDES) ───────────────────────
const TUTORIAL_SLIDES = [
  {
    title: "1. 3D Task Overview",
    description: "Welcome to the 3D Task environment! This is an example of what a 3D labeling task looks like when you begin. The goal is to accurately label structures and generate their 3D bounds.",
    images: ["/tutorial/image3.png"],
  },
  {
    title: "2. Labeling the Footprint",
    description: "When labeling a house/building, label the roof based on the house's footprint (ground footprint/outline), NOT by the actual triangular shape of the roof.",
    extraInfo: "Warning: On the lower left part of the image, the region may look like the ground, but it is actually the house's balcony. You must label it too!",
    images: ["/tutorial/image4.png"],
  },
  {
    title: "3. Setting the Vector",
    description: "First, we set the vector for the task. You only need to set 1 vector per task—this will affect all features within that task once it's set.\n\nClick the Vector tool or press '3', click an edge or a sidewall, then trace the angle of the house/building, and click again to set the end point.",
    extraInfo: "Then press Space to set the vector. A confirmation pop-up should appear.",
    images: ["/tutorial/image5.png", "/tutorial/image6.png"],
  },
  {
    title: "4. Selecting the Label",
    description: "Now we need to select the label we drew before we can construct its 3D model properties.",
    images: ["/tutorial/image7.png", "/tutorial/image8.png"],
  },
  {
    title: "5. Generating 3D Lines",
    description: "After selecting the label, HOLD the 'CTRL' key, then DRAG the label to generate 3D lines. Set the height correctly and release the mouse click first, then release the CTRL key.",
    images: ["/tutorial/image9.png", "/tutorial/image10.png"],
  },
];

function Info3DSlide({ slideIndex }: { slideIndex: number }) {
  const slide = TUTORIAL_SLIDES[slideIndex];
  if (!slide) return null;
  return (
    <div className="space-y-4 text-left">
      {"extraInfo" in slide && slide.extraInfo && (
        <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400 text-sm font-semibold flex items-start gap-2.5">
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{slide.extraInfo}</span>
        </div>
      )}
      <div className={`grid gap-3 ${slide.images.length > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
        {slide.images.map((imgSrc, idx) => (
          <div key={idx} className="rounded-xl border border-black/5 dark:border-white/5 bg-white p-2 flex items-center justify-center overflow-hidden shadow-sm hover:shadow-md transition-all">
            <img
              src={imgSrc}
              alt={`${slide.title} guide ${idx + 1}`}
              className="max-w-full max-h-[340px] object-contain rounded-lg hover:scale-[1.01] transition-transform duration-300"
            />
          </div>
        ))}
      </div>
      <div className="rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] shadow-sm">
        
        <div className="p-5 text-sm leading-relaxed text-[#0D1B2A]/80 dark:text-white/80 font-medium whitespace-pre-line">
          {slide.description}
        </div>
      </div>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubItem {
  id: string;
  label: string;
  href: string;
  isVideo: boolean;
}

interface ChecklistItem {
  id: string;
  label: string;
}

// Step 2 install image blocks
export interface InstallBlock {
  id: string;
  texts: string[];          // one or more instruction lines
  imageUrl: string;
  imageAlt?: string;
}

// Step 1 download rows
export interface DownloadRow {
  id: string;            // e.g. "step1_dl1"
  num: string;           // "01" / "02" / "03"
  sectionTitle: string;  // "DOWNLOAD 7-ZIP"
  label: string;         // "7-zip for Windows"
  href: string;
}

// Step 3/4 video items for inline embed
export interface VideoItem {
  id: string;
  partLabel: string;         // "Part 1 — Labeling Basics"
  youtubeId?: string;        // parsed video ID (undefined for playlists/docs)
  playlistId?: string;       // for playlist items
  isPlaylist?: boolean;
  isDoc?: boolean;           // for Part 4 doc link
  isInfo?: boolean;          // for inline info/slide content
  slideIndex?: number;       // which slide to show when isInfo=true
  href?: string;             // full href used for playlist / doc
  docLabel?: string;         // button label for doc type
}

export type StepVariant =
  | "simple"        // external link + self-report Mark Complete
  | "checklist"     // checklist sub-items + Mark Complete when all ticked
  | "sub-links"     // sub-link rows, Mark Complete when all opened
  | "download"      // Step 1: numbered download rows
  | "install-visual"// Step 2: image+text blocks
  | "video-basic"   // Step 3: inline YouTube embeds
  | "video-3d"      // Step 4: doc link + inline embeds
  | "disabled";     // greyed out, auto-complete, non-interactive

interface TrainingModuleCardProps {
  stepId: string;
  step: number;
  tag: string;
  title: string;
  description: string;
  variant: StepVariant;

  // simple / sub-links variants
  primaryHref?: string;
  primaryLabel?: string;

  // checklist variant
  checklistItems?: ChecklistItem[];
  checkedItems?: Record<string, boolean>;
  onChecklistItem?: (itemId: string, value: boolean) => void;

  // sub-links variant
  subItems?: SubItem[];
  openedItems?: Record<string, boolean>;

  // download variant
  downloadRows?: DownloadRow[];

  // install-visual variant
  installBlocks?: InstallBlock[];

  // video-basic / video-3d variant
  videoItems?: VideoItem[];
  activeSubItemIndex?: number;
  watchedItems?: Record<string, number>;
  onVideoProgress?: (itemId: string, percent: number) => void;
  onReach25?: () => void;
  onPlay?: () => void;
  onPlayingStateChange?: (isPlaying: boolean) => void;
  onTimeUpdate?: (itemId: string, currentTime: number, duration: number) => void;
  onVideoEnded?: (itemId: string) => void;
  playSignal?: number;

  // shared state
  isCompleted: boolean;
  isLocked: boolean;
  onComplete: () => void;
  onSubItemOpen?: (itemId: string) => void;
  onPrimaryClick?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STEP_COLORS: Record<number, { accent: string; darkAccent: string; tagColor: string }> = {
  1: { accent: "text-emerald-500", darkAccent: "dark:text-emerald-400", tagColor: "text-emerald-500/70 dark:text-emerald-400/60" },
  2: { accent: "text-emerald-500", darkAccent: "dark:text-emerald-400", tagColor: "text-emerald-500/70 dark:text-emerald-400/60" },
  3: { accent: "text-emerald-500", darkAccent: "dark:text-emerald-400", tagColor: "text-emerald-500/70 dark:text-emerald-400/60" },
  4: { accent: "text-emerald-500", darkAccent: "dark:text-emerald-400", tagColor: "text-emerald-500/70 dark:text-emerald-400/60" },
  5: { accent: "text-emerald-500", darkAccent: "dark:text-emerald-400", tagColor: "text-emerald-500/70 dark:text-emerald-400/60" },
  6: { accent: "text-emerald-500", darkAccent: "dark:text-emerald-400", tagColor: "text-emerald-500/70 dark:text-emerald-400/60" },
};

function CheckIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ExternalLinkIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

function BookIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function DownloadIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TrainingModuleCard(props: TrainingModuleCardProps) {
  const {
    stepId, step, tag, title, description, variant,
    primaryHref, primaryLabel,
    checklistItems = [], checkedItems = {}, onChecklistItem,
    subItems = [], openedItems = {}, onSubItemOpen,
    downloadRows = [],
    installBlocks = [],
    videoItems = [], activeSubItemIndex, watchedItems = {}, onVideoProgress, onReach25,
    onPlay, onPlayingStateChange, onTimeUpdate, onVideoEnded, playSignal,
    isCompleted, isLocked, onComplete, onPrimaryClick,
  } = props;
  const colors = STEP_COLORS[step] ?? STEP_COLORS[1];
  const [primaryClicked, setPrimaryClicked] = useState(false);
  const videoPlayerRef = useRef<any>(null);

  useEffect(() => {
    if (playSignal && playSignal > 0) {
      videoPlayerRef.current?.play();
    }
  }, [playSignal]);

  const isDisabled = variant === "disabled";

  // ── canMarkComplete logic per variant
  const allChecklistDone =
    variant === "checklist" && checklistItems.every((item) => !!checkedItems[item.id]);
  const allSubItemsOpened =
    variant === "sub-links" && subItems.every((item) => !!openedItems[item.id]);
  const allDownloadsDone =
    variant === "download" && downloadRows.every((row) => !!openedItems[row.id]);
  const allInstallBlocksDone =
    variant === "install-visual" && installBlocks.every((b) => !!checkedItems[b.id]);
  const allVideosDone =
    (variant === "video-basic" || variant === "video-3d") &&
    videoItems.every((v) => {
      if (v.isDoc || v.isInfo) return !!openedItems[v.id];
      if (v.isPlaylist) return !!openedItems[v.id];
      return (watchedItems[v.id] ?? 0) >= 95;
    });

  const canMarkComplete =
    (variant === "simple" && primaryClicked) ||
    (variant === "checklist" && allChecklistDone) ||
    (variant === "sub-links" && allSubItemsOpened) ||
    (variant === "download" && allDownloadsDone) ||
    (variant === "install-visual" && allInstallBlocksDone) ||
    ((variant === "video-basic" || variant === "video-3d") && allVideosDone);

  // ── Card wrapper classes
  const wrapperCls = [
    "relative rounded-2xl border overflow-hidden transition-all duration-300 shadow-sm",
    isCompleted
      ? "border-emerald-500/20 dark:border-emerald-400/20 bg-white dark:bg-[#0D1B2A]"
      : isDisabled
        ? "border-gray-200/60 dark:border-white/5 bg-white/60 dark:bg-[#0D1B2A]/60"
        : isLocked
          ? "border-black/5 dark:border-white/5 bg-white/70 dark:bg-[#0D1B2A]/50 opacity-45 cursor-not-allowed"
          : "border-black/10 dark:border-white/10 bg-white dark:bg-[#0D1B2A] hover:border-black/20 dark:hover:border-white/20",
    isDisabled && !isCompleted ? "opacity-60" : "",
  ].filter(Boolean).join(" ");

  const stepNumCls = [
    "text-2xl font-black tracking-tight leading-none font-mono",
    isCompleted
      ? "text-emerald-500 dark:text-emerald-400"
      : isDisabled
        ? "text-gray-300 dark:text-gray-600"
        : isLocked
          ? "text-black/20 dark:text-white/20"
          : `${colors.accent} ${colors.darkAccent}`,
  ].join(" ");

  const tagCls = [
    "text-[10px] font-bold uppercase tracking-widest",
    isCompleted
      ? "text-emerald-500/60 dark:text-emerald-400/60"
      : isDisabled
        ? "text-gray-400/60 dark:text-gray-500/50"
        : colors.tagColor,
  ].join(" ");

  const dotCls = isCompleted
    ? "bg-emerald-500 shadow-[0_0_6px_#10b981]"
    : isDisabled
      ? "bg-gray-200 dark:bg-gray-700"
      : "bg-black/15 dark:bg-white/15";

  // ── Button builders
  function revisitBtn(href: string) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 dark:border-emerald-400/30 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all"
      >
        Revisit
        <ExternalLinkIcon className="w-3 h-3" />
      </a>
    );
  }

  function markCompleteBtn() {
    return null;
  }

  useEffect(() => {
    if (canMarkComplete && !isCompleted) {
      onComplete();
    }
  }, [canMarkComplete, isCompleted, onComplete]);

  // ── Render: Step number column
  const stepCol = (
    <div className={`w-20 flex-shrink-0 flex flex-col items-center justify-center border-r relative
      ${isCompleted
        ? "border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-900/10"
        : isDisabled
          ? "border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.01]"
          : "border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/[0.02]"
      }`}>
      <span className={stepNumCls}>{String(step).padStart(2, "0")}</span>
      <div className={`absolute bottom-2.5 right-2.5 w-2 h-2 rounded-full ${dotCls}`} />
    </div>
  );

  // ── Render: Action column — varies per variant & state
  function renderActions() {
    if (isLocked) {
      return (
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-[0_10px_0_10px] bg-black/5 dark:bg-white/[0.04] border border-black/10 dark:border-white/8 text-black/40 dark:text-white/25 text-xs font-bold">
          <LockIcon />
          Locked
        </div>
      );
    }

    if (isCompleted) {
      // For simple variant (e.g., Answer Key), always show the link button even when completed
      if (variant === "simple" && primaryHref) {
        return (
          <div className="flex flex-col items-end gap-1.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 dark:bg-emerald-400/10 border border-emerald-500/30 dark:border-emerald-400/30 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold">
              <CheckIcon className="w-3 h-3" />
              Completed
            </div>
            <a
              href={primaryHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[0_10px_0_10px] text-xs font-bold transition-all hover:scale-105 active:scale-95 bg-emerald-600 dark:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 dark:hover:bg-emerald-400"
            >
              {primaryLabel ?? "Open"}
              <ExternalLinkIcon />
            </a>
          </div>
        );
      }
      return (
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 dark:bg-emerald-400/10 border border-emerald-500/30 dark:border-emerald-400/30 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold">
          <CheckIcon className="w-3 h-3" />
          Completed
        </div>
      );
    }

    if (isDisabled) {
      return (
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-[0_10px_0_10px] bg-gray-100 dark:bg-white/[0.04] border border-gray-200 dark:border-white/8 text-gray-400 dark:text-white/25 text-xs font-bold cursor-not-allowed">
          Temporarily Stopped
        </div>
      );
    }

    if (variant === "simple") {
      return (
        <div className="flex flex-col items-end gap-1.5">
          {primaryHref && (
            <a
              href={primaryHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => { setPrimaryClicked(true); onPrimaryClick?.(); }}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-[0_10px_0_10px] text-xs font-bold transition-all hover:scale-105 active:scale-95
                bg-emerald-600 dark:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 dark:hover:bg-emerald-400`}
            >
              {primaryLabel ?? "Open"}
              <ExternalLinkIcon />
            </a>
          )}
          {markCompleteBtn()}
        </div>
      );
    }

    // All other active variants have their Mark Complete buttons at the bottom of the subcontent.
    return null;
  }

  // ── Progress hint text
  function progressHint() {
    if (isLocked) return null;

    if (variant === "sub-links" && subItems.length > 0) {
      return null;
    }
    if (variant === "checklist" && checklistItems.length > 0) {
      return null;
    }
    if (variant === "download" && downloadRows.length > 0) {
      return null;
    }
    if (variant === "install-visual" && installBlocks.length > 0) {
      const done = installBlocks.filter((b) => !!checkedItems[b.id]).length;
      return (
        <div className="mt-1 text-[11px] text-black/40 dark:text-white/30">
          {done}/{installBlocks.length} steps done
        </div>
      );
    }
    if ((variant === "video-basic" || variant === "video-3d") && videoItems.length > 0) {
      return null;
    }
    return null;
  }

  // ── Render: Expanded sub-content (below main row)
  // Always rendered (even when completed) so content stays visible and clickable.
  function renderSubContent() {
    if (isLocked) return null;

    // ── Step 1: Download rows
    if (variant === "download") {
      return (
        <div className="border-t border-black/8 dark:border-white/8 bg-black/[0.01] dark:bg-black/20 px-5 py-5">
          <div className="text-[11px] font-bold uppercase tracking-widest text-black/50 dark:text-white/50 mb-4">
            Required Downloads
          </div>
          <div className="space-y-4">
            {downloadRows.map((row, idx) => {
              const downloaded = !!openedItems[row.id];
              return (
                <div
                  key={row.id}
                  className={`rounded-xl border overflow-hidden transition-all duration-200 ${
                    downloaded
                      ? "border-emerald-500/30 dark:border-emerald-400/25 bg-emerald-50 dark:bg-emerald-950/30"
                      : "border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.04]"
                  }`}
                >
                  {/* Number badge + section title row */}
                  <div className="flex items-center gap-3 px-4 pt-3.5 pb-2">
                    <span
                      className="font-black text-3xl tracking-tighter leading-none"
                      style={{ fontFamily: "'Orbitron', monospace" }}
                    >
                      <span className={downloaded ? "text-emerald-500 dark:text-emerald-400" : colors.accent + " " + colors.darkAccent}>
                        {row.num}
                      </span>
                    </span>
                    <div>
                      <div
                        className={`text-[11px] font-black uppercase tracking-widest ${
                          downloaded ? "text-emerald-600 dark:text-emerald-400" : "text-black/80 dark:text-white/80"
                        }`}
                        style={{ fontFamily: "'Orbitron', monospace" }}
                      >
                        {row.sectionTitle}
                      </div>
                    </div>

                  </div>

                  {/* Divider then label + button row */}
                  <div className="flex items-center border-t border-black/8 dark:border-white/8 px-4 py-2.5">
                    <span className="flex-1 text-sm font-medium text-black/80 dark:text-white/80">
                      {row.label}
                    </span>
                    {/* Vertical divider */}
                    <div className="w-px self-stretch bg-black/10 dark:bg-white/10 mx-4" />
                    <a
                      href={row.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => onSubItemOpen?.(row.id)}
                      className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-bold transition-all hover:scale-105 active:scale-95 ${
                        downloaded
                          ? "border-emerald-500/40 dark:border-emerald-400/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                          : "border-black/20 dark:border-white/20 text-black/75 dark:text-white/80 hover:border-black/40 dark:hover:border-white/40 hover:bg-black/5 dark:hover:bg-white/10"
                      }`}
                    >
                      {downloaded
                        ? <CheckIcon className="w-3 h-3" />
                        : <DownloadIcon className="w-3 h-3" />}
                      Download Here
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mark complete appears below once all done */}
          {allDownloadsDone && (
            <div className="mt-5 flex justify-end">
              {markCompleteBtn()}
            </div>
          )}
        </div>
      );
    }

    // ── Step 2: Install visual blocks
    if (variant === "install-visual") {
      return (
        <div className="border-t border-black/8 dark:border-white/8 bg-black/[0.01] dark:bg-black/20 px-5 py-5">
          <div className="text-[11px] font-bold uppercase tracking-widest text-black/50 dark:text-white/50 mb-4 flex flex-col gap-1">
            <p>Installation Steps</p>
            <p className="font-light text-xs">Click mark as done to finish this part of the course</p>
          </div>
          <div className="space-y-0">
  {installBlocks.map((block, idx) => {
    const done = !!checkedItems[block.id];
    return (
      <div key={block.id}>
        {idx > 0 && <div className="border-t border-black/5 dark:border-white/5 my-4" />}
        <div className="flex flex-col md:flex-row gap-4 items-start">
          {/* Left: text + mark as done */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            <div className="space-y-1">
              {block.texts.map((line, li) => (
                <p key={li} className="text-sm leading-relaxed font-medium text-black/85 dark:text-white/85">
                  {line}
                </p>
              ))}
            </div>

           <button
  onClick={() => onChecklistItem?.(block.id, !done)}
  aria-pressed={done}
  className={`self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
    done
      ? "border-emerald-300 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
      : "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 text-red-500 dark:text-red-400 hover:border-red-300 dark:hover:border-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-300"
  }`}
>
  <span className={`w-3.5 h-3.5 rounded-full border-[1.5px] flex items-center justify-center flex-shrink-0 transition-all ${
    done
      ? "border-emerald-500 bg-emerald-500 dark:border-emerald-400 dark:bg-emerald-400"
      : "border-red-300 dark:border-red-600"
  }`}>
    {done && <CheckIcon className="w-2 h-2 text-white" />}
  </span>
  {done ? "Done" : "Mark as done"}
</button>
          </div>

          {/* Right: screenshot */}
          <div className="w-full md:w-[52%] flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={block.imageUrl}
              alt={block.imageAlt ?? `Step screenshot`}
              loading="lazy"
              className="w-full rounded-xl border border-black/10 dark:border-white/10 object-contain bg-black/5 dark:bg-black/40 transition-all"
              style={{ maxHeight: "280px" }}
            />
          </div>
        </div>
      </div>
    );
  })}
</div>

          {allInstallBlocksDone && (
            <div className="mt-5 flex justify-end">
              {markCompleteBtn()}
            </div>
          )}
        </div>
      );
    }

    // ── Steps 3 & 4: Inline video embeds
    if (variant === "video-basic" || variant === "video-3d") {
      // Sub-page mode: render only the active item
      const itemsToShow = activeSubItemIndex !== undefined
        ? videoItems.slice(activeSubItemIndex, activeSubItemIndex + 1)
        : videoItems;

      return (
        <div className="border-t border-black/8 dark:border-white/8 bg-black/[0.01] dark:bg-black/20 px-5 py-5">
          {/* Part counter */}
          {activeSubItemIndex !== undefined && videoItems.length > 1 && (
            <div className="flex items-center justify-between mb-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-black/50 dark:text-white/50">
                {variant === "video-basic" ? "Training Videos" : "3D & Multilayer Materials"}
              </div>
              <span className="text-[11px] font-bold text-black/50 dark:text-white/50 px-2.5 py-1 rounded-full border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04]">
                {(() => {
                  if (variant === "video-3d") {
                    const isInfoGroup = activeSubItemIndex >= 0 && activeSubItemIndex <= 4;
                    const groupedTotal = 3;
                    if (isInfoGroup) {
                      return `Part 1 of ${groupedTotal} (Slide ${activeSubItemIndex + 1} of 5)`;
                    } else {
                      return `Part ${activeSubItemIndex - 3} of ${groupedTotal}`;
                    }
                  }
                  return `Part ${activeSubItemIndex + 1} of ${videoItems.length}`;
                })()}
              </span>
            </div>
          )}
          {activeSubItemIndex === undefined && (
            <div className="text-[11px] font-bold uppercase tracking-widest text-black/50 dark:text-white/50 mb-4">
              {variant === "video-basic" ? "Training Videos" : "3D & Multilayer Materials"}
            </div>
          )}

          <div className="space-y-6">
            {itemsToShow.map((item, idx) => {
              const isItemWatched = item.isDoc || item.isPlaylist
                ? !!openedItems[item.id]
                : (watchedItems[item.id] ?? 0) >= 95;

              return (
                <div key={item.id}>
                  {idx > 0 && <div className="border-t border-black/5 dark:border-white/5 -mx-5 mb-6" />}

                  {/* Part label */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border ${
                      isItemWatched
                        ? "bg-emerald-500/10 dark:bg-emerald-400/10 border-emerald-500/30 dark:border-emerald-400/30 text-emerald-600 dark:text-emerald-400"
                        : "bg-black/5 dark:bg-white/8 border-black/15 dark:border-white/15 text-black/70 dark:text-white/70"
                    }`}>
                      {item.partLabel}
                    </span>
                    {isItemWatched && (
                      <span className="text-emerald-500 dark:text-emerald-400">
                        <CheckIcon className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>

                  {/* Inline info / slide content */}
                  {item.isInfo && item.slideIndex !== undefined && (
                    <Info3DSlide slideIndex={item.slideIndex} />
                  )}

                  {/* Doc link item */}
                  {item.isDoc && item.href && (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => onSubItemOpen?.(item.id)}
                      className={`inline-flex items-center gap-2.5 px-5 py-3 rounded-xl border text-sm font-bold transition-all hover:scale-105 active:scale-95 ${
                        isItemWatched
                          ? "border-emerald-500/40 dark:border-emerald-400/35 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
                          : "border-black/20 dark:border-white/20 bg-black/[0.02] dark:bg-white/[0.05] text-black/85 dark:text-white/90 hover:border-black/35 dark:hover:border-white/35 hover:bg-black/5 dark:hover:bg-white/10"
                      }`}
                    >
                      {isItemWatched
                        ? <CheckIcon className="w-4 h-4" />
                        : <BookIcon className="w-4 h-4" />}
                      {item.docLabel ?? "Read Document"}
                      <ExternalLinkIcon className="w-3.5 h-3.5 opacity-60" />
                    </a>
                  )}

                  {/* Playlist link item */}
                  {item.isPlaylist && item.href && (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => onSubItemOpen?.(item.id)}
                      className={`inline-flex items-center gap-2.5 px-5 py-3 rounded-xl border text-sm font-bold transition-all hover:scale-105 active:scale-95 ${
                        isItemWatched
                          ? "border-emerald-500/40 dark:border-emerald-400/35 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
                          : "border-black/20 dark:border-white/20 bg-black/[0.02] dark:bg-white/[0.05] text-black/85 dark:text-white/90 hover:border-black/35 dark:hover:border-white/35 hover:bg-black/5 dark:hover:bg-white/10"
                      }`}
                    >
                      {isItemWatched
                        ? <CheckIcon className="w-4 h-4" />
                        : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
                      Open Playlist
                      <ExternalLinkIcon className="w-3.5 h-3.5 opacity-60" />
                    </a>
                  )}

                  {/* Inline YouTube player */}
                  {!item.isDoc && !item.isPlaylist && item.youtubeId && (
                    <InlineVideoPlayer
                      ref={videoPlayerRef}
                      videoId={item.youtubeId}
                      watchedPercent={watchedItems[item.id] ?? 0}
                      onProgress={(vidId, pct) => onVideoProgress?.(item.id, pct)}
                      onReach25={onReach25}
                      onPlay={onPlay}
                      onPlayingStateChange={onPlayingStateChange}
                      onTimeUpdate={(vidId, cur, dur) => onTimeUpdate?.(item.id, cur, dur)}
                      onVideoEnded={() => onVideoEnded?.(item.id)}
                      thresholdExtraSecs={10}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {allVideosDone && (
            <div className="mt-6 flex justify-end">
              {markCompleteBtn()}
            </div>
          )}
        </div>
      );
    }

    // ── Step 2 legacy checklist (kept for backwards compat)
    if (variant === "checklist") {
      return (
        <div className="border-t border-black/5 dark:border-white/5 px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-black/40 dark:text-white/30 mb-3">
            Installation Checklist
          </div>
          <ul className="space-y-2.5">
            {checklistItems.map((item) => {
              const checked = !!checkedItems[item.id];
              return (
                <li key={item.id} className="flex items-start gap-3">
                  <button
                    onClick={() => onChecklistItem?.(item.id, !checked)}
                    className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-all
                      ${checked
                        ? "border-emerald-500 bg-emerald-500 dark:border-emerald-400 dark:bg-emerald-400"
                        : "border-black/20 dark:border-white/20 hover:border-emerald-500 dark:hover:border-emerald-400"
                      }`}
                  >
                    {checked && <CheckIcon className="w-3 h-3 text-white dark:text-[#0a1520]" />}
                  </button>
                  <span className={`text-sm leading-relaxed transition-colors
                    ${checked ? "text-black/40 dark:text-white/30 line-through" : "text-black/80 dark:text-white/80"}`}>
                    {item.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      );
    }

    // ── Sub-links
    if (variant === "sub-links") {
      return (
        <div className="border-t border-black/5 dark:border-white/5 px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-black/40 dark:text-white/30 mb-3">
            Resources
          </div>
          <ul className="space-y-2">
            {subItems.map((item) => {
              const opened = !!openedItems[item.id];
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl bg-[#0a1520]/[0.03] dark:bg-[#0a1520] border border-black/5 dark:border-white/5 px-3 py-2.5 group"
                >
                  <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center
                    ${opened
                      ? "bg-emerald-500/10 dark:bg-emerald-400/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40"
                    }`}>
                    {opened
                      ? <CheckIcon className="w-3.5 h-3.5" />
                      : item.isVideo
                        ? <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                        : <BookIcon />
                    }
                  </div>
                  <span className="flex-1 text-sm font-medium leading-tight text-black/80 dark:text-white/80">
                    {item.label}
                  </span>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onSubItemOpen?.(item.id)}
                    className={`flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all
                      ${opened
                        ? "border border-emerald-500/20 dark:border-emerald-400/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                        : "bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black/60 dark:text-white/60 hover:bg-black/10 dark:hover:bg-white/10 hover:scale-105"
                      }`}
                  >
                    {opened && <CheckIcon className="w-3 h-3" />}
                    {item.isVideo
                      ? <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      : <ExternalLinkIcon className="w-3 h-3" />}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      );
    }

    return null;
  }

  return (
    <div className={wrapperCls}>
      {/* ── Main row */}
      <div className="flex items-stretch min-h-[96px]">
        {stepCol}

        {/* Content */}
        <div className="flex-1 px-5 py-4 flex flex-col justify-center gap-1">
          <span className={tagCls}>{tag}</span>
          <div className="text-[15px] font-bold text-black/90 dark:text-white/90 leading-tight">{title}</div>
          <div className="text-xs text-black/55 dark:text-white/50 leading-relaxed">{description}</div>

          {/* Disabled warning note */}
          {isDisabled && (
            <div className="mt-2 flex items-start gap-2 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-700/30 rounded-lg px-3 py-2">
              <span className="text-yellow-500 text-base leading-none flex-shrink-0">⚠️</span>
              <p className="text-xs text-yellow-700 dark:text-yellow-400 leading-relaxed">
                Live sessions are temporarily stopped. This step will be enabled by an admin when sessions resume.
              </p>
            </div>
          )}

          {progressHint()}
        </div>

        {/* Actions */}
        <div className={`flex-shrink-0 flex flex-col items-end justify-center gap-2 px-5 py-4 min-w-[140px]`}>
          {renderActions()}
        </div>
      </div>

      {/* ── Sub-content */}
      {renderSubContent()}
    </div>
  );
}
