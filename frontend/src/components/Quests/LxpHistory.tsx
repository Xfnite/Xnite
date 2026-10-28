"use client";

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { History, CheckCircle2, CalendarRange, Loader2, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLxpClaimHistory, type LxpClaimHistoryItem } from "@/app/actions/loyalty";
import { decodeSessionEmailUnsafe } from "@/lib/decodeSessionEmail";

const PAGE_SIZE = 10;

// ─── First-page cache (stale-while-revalidate) ──────────────────────────────
// The first page is kept in localStorage per account so a reload paints the
// last-known history instantly, then refreshes it in the background. Keyed by
// the session email so another account on the same browser never sees it.
const CACHE_PREFIX = "xfnite_lxp_history_v2_";

interface HistoryCache {
  items: LxpClaimHistoryItem[];
  total: number;
}

function getCacheKey(): string | null {
  const token = document.cookie.match(/(?:^|; )xnite_session=([^;]+)/)?.[1];
  const email = token ? decodeSessionEmailUnsafe(token) : null;
  return email ? CACHE_PREFIX + email.toLowerCase() : null;
}

function readCache(): HistoryCache | null {
  try {
    const key = getCacheKey();
    const raw = key ? localStorage.getItem(key) : null;
    return raw ? (JSON.parse(raw) as HistoryCache) : null;
  } catch {
    return null;
  }
}

function writeCache(cache: HistoryCache) {
  try {
    const key = getCacheKey();
    if (key) localStorage.setItem(key, JSON.stringify(cache));
  } catch {
    // Storage full or blocked — caching is best-effort.
  }
}

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

function dayLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return dayFormatter.format(date);
}

// Consecutive items sharing a calendar day, newest first (the list is already sorted).
function groupByDay(items: LxpClaimHistoryItem[]) {
  const groups: { key: string; label: string; lxp: number; items: LxpClaimHistoryItem[] }[] = [];
  for (const item of items) {
    const date = new Date(item.claimedAt);
    const key = date.toDateString();
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: dayLabel(date), lxp: 0, items: [] };
      groups.push(group);
    }
    group.items.push(item);
    group.lxp += item.lxp;
  }
  return groups;
}

// Page numbers to show around the current page, with null marking a gap.
function pageWindow(current: number, totalPages: number): (number | null)[] {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, totalPages, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const result: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push(null);
    result.push(p);
  });
  return result;
}

// Paginated LXP claim history: one page at a time in a capped-height scroll
// area, grouped by day, with numbered page controls underneath.
export default function LxpHistory() {
  const [items, setItems] = useState<LxpClaimHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  // Starts true so the pre-cache render shows a spinner, never a false "empty" state.
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Whether rows are already on screen (cached or loaded); set outside render.
  const hasItemsRef = useRef(false);
  // Bumped per request so a slow response for a page the user already left is discarded.
  const requestIdRef = useRef(0);

  const loadPage = useCallback(async (nextPage: number) => {
    const requestId = ++requestIdRef.current;
    // Refreshing page 1 behind already-visible (cached) items stays silent.
    if (nextPage > 1 || !hasItemsRef.current) setIsLoading(true);

    const result = await getLxpClaimHistory(nextPage, PAGE_SIZE);
    if (requestId !== requestIdRef.current) return;

    if (result.success) {
      hasItemsRef.current = result.data.items.length > 0;
      setItems(result.data.items);
      setTotal(result.data.total);
      setPage(nextPage);
      setError(null);
      scrollRef.current?.scrollTo({ top: 0 });
      if (nextPage === 1) writeCache({ items: result.data.items, total: result.data.total });
    } else {
      setError(result.error);
    }
    setIsLoading(false);
  }, []);

  // Paint the cached first page before the browser's first paint, so a reload
  // with history never flashes a loading state.
  useLayoutEffect(() => {
    const cached = readCache();
    if (!cached) return;
    // Set the ref now: the mount refresh may run before the re-render does.
    hasItemsRef.current = cached.items.length > 0;
    // localStorage only exists on the client, so this can't be initial state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(cached.items);
    setTotal(cached.total);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const refresh = () => loadPage(1);
    refresh();
    // A claim anywhere (quest widget or elsewhere) adds a history row at the top.
    window.addEventListener("refresh_quests", refresh);
    return () => window.removeEventListener("refresh_quests", refresh);
  }, [loadPage]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const goTo = (p: number) => {
    if (p < 1 || p > totalPages || p === page || isLoading) return;
    loadPage(p);
  };

  return (
    <div>
      {/* Header — same collapsible style as the Daily Quests section heading above it */}
      <button
        type="button"
        onClick={() => setIsCollapsed((v) => !v)}
        aria-expanded={!isCollapsed}
        className="w-full flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-3 px-1 select-none cursor-pointer group"
      >
        <span className="flex items-center gap-2 text-xs font-bold text-amber-500 uppercase tracking-widest group-hover:text-amber-400 transition-colors">
          <History className="w-4 h-4" />
          LXP History
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
            {total} {total === 1 ? "claim" : "claims"}
          </span>
          <ChevronDown
            className={cn(
              "w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-300",
              isCollapsed && "-rotate-90"
            )}
          />
        </span>
      </button>

      {/* Collapsible body: grid rows 0fr ↔ 1fr animates the height without measuring. */}
      <div
        inert={isCollapsed}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
          isCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
        )}
      >
      <div className="overflow-hidden">
      <div className="mt-4 rounded-2xl border border-black/5 dark:border-white/10 bg-white/60 dark:bg-slate-900/40 overflow-hidden">
      {/* Scrollable page body */}
      <div
        ref={scrollRef}
        className={cn(
          "relative max-h-[360px] overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-amber-500/20 scrollbar-track-transparent transition-opacity",
          isLoading && items.length > 0 && "opacity-50 pointer-events-none"
        )}
      >
        {items.length === 0 && isLoading ? (
          <div className="py-16 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-14 flex flex-col items-center justify-center gap-2 text-center px-6 select-none">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-1">
              <History className="w-6 h-6 text-amber-500" />
            </div>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
              {error ? "Couldn't load your LXP history" : "No rewards claimed yet"}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {error ? "Please refresh the page to try again." : "Complete and claim quests to start your record."}
            </p>
          </div>
        ) : (
          groupByDay(items).map((group) => (
            <section key={group.key}>
              {/* Day heading stays pinned while its claims scroll under it */}
              <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-2 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur border-b border-black/5 dark:border-white/5 select-none">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  {group.label}
                </span>
                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums">
                  +{group.lxp} LXP
                </span>
              </div>

              <ul className="divide-y divide-black/5 dark:divide-white/5">
                {group.items.map((item) => {
                  const isWeekly = item.questType === "weekly";
                  return (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
                    >
                      <div
                        className={cn(
                          "w-9 h-9 rounded-xl border flex items-center justify-center shrink-0",
                          isWeekly
                            ? "bg-amber-500/10 border-amber-500/20"
                            : "bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border-[#1F7A1F]/20 dark:border-[#55f761]/20"
                        )}
                      >
                        {isWeekly ? (
                          <CalendarRange className="w-4 h-4 text-amber-500" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-[#1F7A1F] dark:text-[#55f761]" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{item.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          <span className={isWeekly ? "text-amber-600 dark:text-amber-400" : "text-[#1F7A1F] dark:text-[#55f761]"}>
                            {isWeekly ? "Weekly quest" : "Daily quest"}
                          </span>
                          <span className="tabular-nums"> · {timeFormatter.format(new Date(item.claimedAt))}</span>
                        </p>
                      </div>

                      <span
                        className={cn(
                          "text-xs font-bold tabular-nums px-2.5 py-1 rounded-lg border shrink-0",
                          isWeekly
                            ? "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20"
                            : "text-[#1F7A1F] dark:text-[#55f761] bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border-[#1F7A1F]/20 dark:border-[#55f761]/20"
                        )}
                      >
                        +{item.lxp} LXP
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center px-5 py-3 border-t border-black/5 dark:border-white/10 select-none">
            <nav className="flex items-center gap-1" aria-label="LXP history pages">
              <button
                type="button"
                onClick={() => goTo(page - 1)}
                disabled={page === 1 || isLoading}
                aria-label="Previous page"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {pageWindow(page, totalPages).map((p, i) =>
                p === null ? (
                  <span key={`gap-${i}`} className="w-6 text-center text-xs text-slate-400">…</span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => goTo(p)}
                    aria-current={p === page ? "page" : undefined}
                    className={cn(
                      "min-w-8 h-8 px-2 rounded-lg text-xs font-semibold tabular-nums transition-colors",
                      p === page
                        ? "bg-amber-500 text-white dark:text-slate-900"
                        : "text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10"
                    )}
                  >
                    {p}
                  </button>
                )
              )}

              <button
                type="button"
                onClick={() => goTo(page + 1)}
                disabled={page === totalPages || isLoading}
                aria-label="Next page"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </nav>
        </div>
      )}
      </div>
      </div>
      </div>
    </div>
  );
}
