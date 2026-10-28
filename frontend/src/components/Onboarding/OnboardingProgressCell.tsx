"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, AlertTriangle, ChevronDown, X, Eye, ExternalLink } from "lucide-react";
import { getOnboardingStatus, getOnboardingPreviewHref, type PartState } from "./onboardingStatus";

interface OnboardingProgressCellProps {
  onboardingProgress: unknown;
  isDashboardCompleted: boolean;
  traineeName?: string;
}

const POPOVER_WIDTH = 300;

const partStyles: Record<PartState, { row: string; icon: React.ReactNode; tag?: string }> = {
  done: {
    row: "text-[#2F3E46]/70 dark:text-white/60",
    icon: <Check className="w-3.5 h-3.5 text-[#1F7A1F] dark:text-[#55f761]" strokeWidth={3} />,
  },
  skipped: {
    row: "text-amber-700 dark:text-amber-300 bg-amber-500/10",
    icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />,
    tag: "Skipped",
  },
  current: {
    row: "text-blue-700 dark:text-blue-300 bg-blue-500/10 font-bold",
    icon: <span className="w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400 animate-pulse" />,
    tag: "Here",
  },
  pending: {
    row: "text-[#2F3E46]/35 dark:text-white/25",
    icon: <span className="w-2 h-2 rounded-full border border-current" />,
  },
};

export default function OnboardingProgressCell({ onboardingProgress, isDashboardCompleted, traineeName }: OnboardingProgressCellProps) {
  const status = useMemo(
    () => getOnboardingStatus(onboardingProgress, isDashboardCompleted),
    [onboardingProgress, isDashboardCompleted]
  );
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Where "Preview" should land: first skipped part, else where they are now, else the start
  const focusPart = status.skipped[0] ?? status.current;
  const previewHref = focusPart?.previewHref ?? getOnboardingPreviewHref();

  const badgeText = status.isComplete ? "Done" : status.hasStarted && status.current ? status.current.code : "Not started";
  const skippedCount = status.skipped.length;

  // Position popover under the anchor (flip above when there's no room); close on outside click / scroll / Esc.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 8;
      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      const below = spaceBelow >= 320 || spaceBelow >= spaceAbove;
      const maxHeight = Math.max(200, Math.min(480, (below ? spaceBelow : spaceAbove) - margin));
      const left = Math.min(Math.max(margin, rect.left), window.innerWidth - POPOVER_WIDTH - margin);
      const top = below ? rect.bottom + 6 : Math.max(margin, rect.top - 6 - maxHeight);
      setPos({ top, left, maxHeight });
    };
    place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="w-full text-left space-y-1 rounded-md -m-1 p-1 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
        title="Click to see which parts this trainee has done"
      >
        <div className="flex justify-between items-center text-xs gap-1.5">
          <span className="font-semibold text-[#2F3E46]/80 dark:text-white/70 truncate flex items-center gap-1">
            Onboarding
            <ChevronDown className={`w-3 h-3 opacity-50 transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
          <span className="flex items-center gap-1 shrink-0">
            {skippedCount > 0 && (
              <span
                className="flex items-center gap-0.5 px-1 py-px rounded bg-amber-500/15 text-amber-600 dark:text-amber-300 text-[10px] font-bold"
                title={`${skippedCount} skipped: ${status.skipped.map((s) => s.code).join(", ")}`}
              >
                <AlertTriangle className="w-2.5 h-2.5" />
                {skippedCount}
              </span>
            )}
            <span
              className={`px-1.5 py-px rounded text-[10px] font-black tracking-wide ${
                status.isComplete
                  ? "bg-[#1F7A1F]/10 text-[#1F7A1F] dark:bg-[#55f761]/15 dark:text-[#55f761]"
                  : status.hasStarted
                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-300"
                    : "bg-black/5 text-[#2F3E46]/50 dark:bg-white/10 dark:text-white/40"
              }`}
            >
              {badgeText}
            </span>
          </span>
        </div>

        {/* One segment per module, filled by parts done */}
        <div className="flex gap-0.5">
          {status.modules.map((m) => {
            const pct = (m.done / m.total) * 100;
            const hasSkip = m.parts.some((x) => x.state === "skipped");
            const full = status.isComplete || m.done === m.total;
            return (
              <div
                key={m.num}
                className={`flex-1 h-1.5 rounded-full overflow-hidden bg-black/10 dark:bg-white/10 ${hasSkip ? "ring-1 ring-amber-500/70" : ""}`}
                title={`Mod ${m.num} · ${m.title}: ${m.done}/${m.total}`}
              >
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    full ? "bg-[#1F7A1F] dark:bg-[#55f761]" : "bg-blue-500 dark:bg-blue-400"
                  }`}
                  style={{ width: `${full ? 100 : pct}%` }}
                />
              </div>
            );
          })}
        </div>

        <div className="text-[10px] text-[#2F3E46]/50 dark:text-white/40 truncate">
          {status.isComplete
            ? "All modules completed"
            : status.hasStarted && status.current
              ? `${status.current.moduleTitle} · ${status.current.label}`
              : "Hasn't started yet"}
        </div>
      </button>

      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ top: pos.top, left: pos.left, width: POPOVER_WIDTH, maxHeight: pos.maxHeight }}
            className="fixed z-[100] flex flex-col rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#0d1117] shadow-2xl text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2 border-b border-black/8 dark:border-white/8">
              <div className="min-w-0">
                <div className="text-[10px] font-black tracking-widest uppercase text-[#1F7A1F] dark:text-[#55f761]">Onboarding Progress</div>
                {traineeName && <div className="font-bold text-[#2F3E46] dark:text-white/90 truncate">{traineeName}</div>}
                <div className="text-[10px] text-[#2F3E46]/50 dark:text-white/40">
                  {status.percent}% · {status.isComplete ? "Completed" : status.hasStarted && status.current ? `Currently on ${status.current.code}` : "Not started"}
                  {skippedCount > 0 && <span className="text-amber-600 dark:text-amber-300 font-bold"> · {skippedCount} skipped</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-md text-[#2F3E46]/40 hover:text-[#2F3E46] dark:text-white/40 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10"
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="px-3 py-2 border-b border-black/8 dark:border-white/8">
              <a
                href={previewHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded-lg bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] font-bold hover:opacity-90 transition-opacity"
              >
                <Eye className="w-3.5 h-3.5" />
                {focusPart ? `Preview ${focusPart.code}${status.skipped.length ? " (skipped)" : ""}` : "Preview onboarding"}
              </a>
              <div className="mt-1 text-[10px] text-center text-[#2F3E46]/45 dark:text-white/35">Opens the trainee view in a new tab · click any part below to jump to it</div>
            </div>

            <div className="overflow-y-auto px-2 py-2 space-y-2">
              {status.modules.map((m) => (
                <div key={m.num}>
                  <div className="flex items-center justify-between px-1.5 mb-1">
                    <span className="flex items-center gap-1.5">
                      <span className="px-1.5 py-px rounded bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 text-[#1F7A1F] dark:text-[#55f761] text-[9px] font-black tracking-wider uppercase">
                        Mod {m.num}
                      </span>
                      <span className="font-bold text-[#2F3E46]/80 dark:text-white/80">{m.title}</span>
                    </span>
                    <span className="text-[10px] font-bold text-[#2F3E46]/40 dark:text-white/30">{m.done}/{m.total}</span>
                  </div>
                  <div className="space-y-px">
                    {m.parts.map((part) => {
                      const s = partStyles[part.state];
                      return (
                        <a
                          key={part.code}
                          href={part.previewHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Preview ${part.code} · ${part.label}`}
                          className={`group flex items-center gap-2 px-1.5 py-1 rounded-md hover:ring-1 hover:ring-[#1F7A1F]/30 dark:hover:ring-[#55f761]/30 ${s.row}`}
                        >
                          <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">{s.icon}</span>
                          <span className="text-[10px] font-bold tabular-nums shrink-0 w-[46px] opacity-70">{part.code}</span>
                          <span className="truncate flex-1">{part.label}</span>
                          {s.tag && <span className="text-[9px] font-black uppercase tracking-wider shrink-0">{s.tag}</span>}
                          <ExternalLink className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
                        </a>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
