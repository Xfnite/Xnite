"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  Trophy,
  Coins,
  TrendingUp,
  Info,
  CheckCircle2,
  ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getLoyaltyData, type LoyaltyData } from "@/app/actions/loyalty";
import LxpHistory from "@/components/Quests/LxpHistory";

import { DAILY_QUESTS, TORCH_QUEST_ID } from "@/config/quests";

interface DailyQuest {
  id: string;
  title: string;
  description: string;
  target: string;
  xp: number;
  complete: boolean;
}

const DAILY_QUESTS_CONFIG = DAILY_QUESTS;

export default function LoyaltyPointsPage() {
  const [lxpBalance, setLxpBalance] = useState(0);
  // Title is intentionally blank until getLoyaltyData resolves: the rank-0 name
  // is role-derived (Novice vs Challenger), so no static string is correct here
  // and a placeholder would flash the wrong rank on first paint.
  const [rankInfo, setRankInfo] = useState({ level: 0, title: "", minLxp: 0, nextLxp: 150 as number | null, progress: 0 });
  const [dailyQuests, setDailyQuests] = useState<DailyQuest[]>(
    DAILY_QUESTS_CONFIG.map((q) => ({
      ...q,
      target: q.target.replace(/^0\//, ""),
      complete: false,
    }))
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isDailyCollapsed, setIsDailyCollapsed] = useState(true);

  // Applies an already-fetched LoyaltyData payload with no network call of its
  // own — shared by the initial load and by the refresh_quests handler below
  // when a claim result rides along on the event (see useQuests.ts), so a
  // claim made from the quest widget updates this page's balance immediately
  // instead of waiting on a second getLoyaltyData() round-trip.
  const applyLoyaltyData = useCallback((data: LoyaltyData) => {
    const { totalLxp, rank, completedQuestIds } = data;
    setLxpBalance(totalLxp);
    setRankInfo(rank);
    setDailyQuests(
      DAILY_QUESTS_CONFIG.map((q) => {
        // Pass the Torch's target/reward scale with the user's LXP rank.
        const isTorch = q.id === TORCH_QUEST_ID;
        const target = isTorch
          ? q.target
              .replace(/^0\/\d+/, `${rank.torchTarget}`)
              .replace("Player(s)", rank.torchTarget === 1 ? "Player" : "Players")
          : q.target.replace(/^0\//, "");
        return {
          ...q,
          target,
          xp: isTorch ? rank.torchXp : q.xp,
          complete: completedQuestIds.includes(q.id),
        };
      })
    );
  }, []);

  const loadData = useCallback(async () => {
    const result = await getLoyaltyData();
    if (result.success) {
      applyLoyaltyData(result.data);
    }
    setIsLoading(false);
  }, [applyLoyaltyData]);

  useEffect(() => {
    loadData();
    // A claim result is attached as event.detail (see useQuests.ts) so this can
    // apply it directly with zero extra round-trips; other dispatchers fire the
    // event bare, which still falls back to a fetch.
    const handleRefresh = (e: Event) => {
      const detail = (e as CustomEvent<LoyaltyData | undefined>).detail;
      if (detail) {
        applyLoyaltyData(detail);
      } else {
        loadData();
      }
    };
    window.addEventListener("refresh_quests", handleRefresh);
    return () => {
      window.removeEventListener("refresh_quests", handleRefresh);
    };
  }, [loadData, applyLoyaltyData]);

  return (
    <div className="space-y-6 lg:space-y-10">
      {/* Loyalty Points Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Large Balance Card */}
        <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 dark:from-amber-500/5 dark:to-transparent border border-amber-500/20 dark:border-amber-500/10 rounded-2xl p-6 relative overflow-hidden flex flex-col justify-center">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl -translate-y-12 translate-x-12"></div>
          <div className="relative z-10">
            <div className="flex items-baseline gap-1.5 mb-2">
              <span className="text-4xl lg:text-5xl font-black text-[#0D1B2A] dark:text-white tracking-tighter">
                {lxpBalance}
              </span>
              <span className="text-sm font-bold text-amber-500">LXP</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              <Coins className="w-4 h-4 animate-pulse" />
              <span>Available Loyalty Balance</span>
            </div>
          </div>
        </div>

        {/* Level Progression Card */}
        <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 rounded-full blur-2xl -translate-y-12 translate-x-12"></div>
          <div className="relative z-10 w-full">
            <div className="flex items-center justify-between text-xs font-bold text-[#2F3E46] dark:text-white/60 uppercase tracking-wider mb-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                <span>Rank Status</span>
              </div>
              <span className="text-amber-500">Rank {rankInfo.level}</span>
            </div>
            <div className="mb-2">
              <span className="text-lg font-black text-[#0D1B2A] dark:text-white tracking-tight">
                {rankInfo.title}
              </span>
            </div>
            {/* Custom styled progress bar */}
            <div className="w-full bg-black/10 dark:bg-black/40 rounded-full h-2 overflow-hidden p-[1px] mt-3">
              <div
                className="bg-gradient-to-r from-amber-500 to-yellow-400 h-full rounded-full transition-all duration-1000 ease-linear shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                style={{ width: `${rankInfo.progress}%` }}
              />
            </div>
            <div className="flex justify-between items-center mt-2 text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
              {rankInfo.level < 5 ? (
                <span>{lxpBalance} / {rankInfo.nextLxp} LXP</span>
              ) : (
                <span>{lxpBalance} LXP</span>
              )}
              {rankInfo.level < 5 && (
                <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400/80">
                  <Sparkles className="w-3 h-3" /> Next Rank
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Earning Stats Card */}
        <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 rounded-full blur-2xl -translate-y-12 translate-x-12"></div>
          <div className="relative z-10 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-[#2F3E46] dark:text-white/60 uppercase tracking-wider mb-4">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span>Loyalty Overview</span>
              </div>
              <div className="space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#2F3E46] dark:text-white/50 font-medium">Total Accumulated</span>
                  <span className="font-bold text-[#0D1B2A] dark:text-white">{lxpBalance} LXP</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#2F3E46] dark:text-white/50 font-medium">Daily Quests Completed</span>
                  <span className="font-bold text-[#0D1B2A] dark:text-white">{dailyQuests.filter(q => q.complete).length}/{dailyQuests.length}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 text-[10px] text-[#2F3E46] dark:text-white/40 font-medium flex items-center gap-1.5 bg-black/5 dark:bg-white/5 p-2 rounded-xl border border-black/5 dark:border-white/5">
              <Info className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Earn LXP to unlock custom features &amp; rewards.</span>
            </div>
          </div>
        </div>

      </div>

      {/* Daily Quests */}
      <div>
        <button
          type="button"
          onClick={() => setIsDailyCollapsed((v) => !v)}
          aria-expanded={!isDailyCollapsed}
          className="w-full flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-3 select-none px-1 cursor-pointer group"
        >
          <span className="text-xs font-bold text-amber-500 uppercase tracking-widest group-hover:text-amber-400 transition-colors">Daily Quests</span>
          <ChevronDown
            className={cn(
              "w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-300",
              isDailyCollapsed && "-rotate-90"
            )}
          />
        </button>

        {/* Collapsible body: animating grid rows 0fr ↔ 1fr gives a smooth
            height reveal without measuring the content. */}
        <div
          inert={isDailyCollapsed}
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
            isDailyCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
          )}
        >
        <div className="overflow-hidden">
        <div className="space-y-3 pt-4">
          {dailyQuests.map((quest) => (
            <div
              key={quest.id}
              className="rounded-xl border transition-colors bg-black/5 dark:bg-black/20 border-black/5 dark:border-white/5"
            >
              {/* Quest Header */}
              <div className="py-3.5 px-5 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Quest status indicator */}
                  <div>
                    <span className="relative flex h-3.5 w-3.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60"></span>
                      <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500 border border-amber-400"></span>
                    </span>
                  </div>

                  {/* Quest title & target */}
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold tracking-wide text-slate-800 dark:text-slate-200">
                      {quest.title}
                    </h4>
                    <p className="text-xs font-bold mt-0.5 text-amber-500 dark:text-amber-400/80">
                      {quest.target}
                    </p>
                  </div>
                </div>

                {/* LXP badge */}
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border tracking-wide uppercase shrink-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                  +{quest.xp} LXP
                </span>
              </div>

              {/* Quest Description - always visible */}
              <div className="px-5 pb-3.5">
                <div className="flex items-start gap-2 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                  <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {quest.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
        </div>
        </div>
      </div>

      {/* Claimed LXP history */}
      <LxpHistory />
    </div>
  );
}
