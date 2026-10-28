import React from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface DailyQuestCardProps {
  quest: {
    id: string;
    title: string;
    description: string;
    target: string;
    xp: number;
    complete: boolean;
    claimed: boolean;
  };
  isExpanded: boolean;
  onHeaderClick: () => void;
}

export default function QuestCard({
  quest,
  isExpanded,
  onHeaderClick,
}: DailyQuestCardProps) {
  // Claimed quests stay listed but greyed out until the daily/weekly reset.
  const isClaimable = quest.complete && !quest.claimed;

  return (
    <div
      className={cn(
        "border-b border-x-0 rounded-none transition-all duration-500 overflow-hidden",
        quest.claimed
          ? "bg-black/5 dark:bg-black/30 border-black/5 dark:border-white/5 opacity-50 grayscale"
          : quest.complete
            ? "bg-[#1F7A1F]/5 dark:bg-[#55f761]/5 border-[#1F7A1F]/20 dark:border-[#55f761]/15 hover:border-[#1F7A1F]/30 dark:hover:border-[#55f761]/25"
            : "bg-black/5 dark:bg-black/20 border-black/5 dark:border-white/5 hover:border-amber-500/30"
      )}
    >
      {/* Quest Card Header */}
      <div
        onClick={onHeaderClick}
        className="py-2.5 px-5 flex items-center justify-between select-none cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Quest status indicator */}
          <div>
            {quest.claimed ? (
              <CheckCircle2 className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0" />
            ) : quest.complete ? (
              <CheckCircle2 className="w-5 h-5 text-[#1F7A1F] dark:text-[#55f761] fill-[#1F7A1F]/10 dark:fill-[#55f761]/10 shrink-0" />
            ) : (
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500 border border-amber-400"></span>
              </span>
            )}
          </div>

          {/* Quest titles */}
          <div className="min-w-0">
            <h4 className={cn(
              "text-xs font-bold tracking-wide",
              quest.claimed
                ? "text-slate-500 dark:text-slate-400 line-through decoration-slate-500/60"
                : isClaimable
                  ? "text-[#1F7A1F] dark:text-[#55f761]"
                  : "text-slate-800 dark:text-slate-200"
            )}>
              {quest.title}
            </h4>
            <p className={cn(
              "text-[10px] font-bold mt-0.5",
              quest.claimed
                ? "text-slate-500 dark:text-slate-500"
                : isClaimable
                  ? "text-[#1F7A1F]/80 dark:text-[#55f761]/80"
                  : "text-amber-500 dark:text-amber-400/80"
            )}>
              {quest.target}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* LXP badge */}
          <span className={cn(
            "text-[9px] font-bold px-2 py-0.5 rounded-full border tracking-wide uppercase",
            quest.claimed
              ? "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20"
              : isClaimable
                ? "bg-[#1F7A1F]/10 text-[#1F7A1F] dark:text-[#55f761] border-[#1F7A1F]/25 dark:border-[#55f761]/25"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
          )}>
            {quest.claimed ? "Claimed" : `+${quest.xp} LXP`}
          </span>

          {/* Chevron toggle */}
          <div>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            )}
          </div>
        </div>
      </div>

      {/* Quest Card Details */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out bg-black/5 dark:bg-black/10 text-xs text-slate-600 dark:text-slate-300",
          isExpanded
            ? "grid-rows-[1fr] opacity-100 border-t border-black/5 dark:border-white/5"
            : "grid-rows-[0fr] opacity-0 border-t-0 border-transparent"
        )}
      >
        <div className="overflow-hidden">
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
    </div>
  );
}
