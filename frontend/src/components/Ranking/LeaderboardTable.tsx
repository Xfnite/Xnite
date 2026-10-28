"use client";

import React from "react";

interface Player {
  rank: number;
  name: string;
  avatar: string;
  wager: string;
  prize: string;
}

interface LeaderboardTableProps {
  players: Player[];
  currentUserRow?: Player | null;
  showUnredacted?: boolean;
}

export default function LeaderboardTable({ players, currentUserRow, showUnredacted = false }: LeaderboardTableProps) {
  return (
    <div className="w-full mt-8 animate-in fade-in slide-in-from-bottom duration-700 delay-300">
      {/* Table Headers */}
      <div className="flex items-center justify-between px-6 py-3 text-xs font-bold uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40 border-b border-black/5 dark:border-white/5 mb-3">
        <div className="flex items-center gap-4 flex-1">
          <div className="w-10 text-center">#</div>
          <div>User</div>
        </div>
        <div className="flex items-center justify-end gap-12 md:gap-24 text-right">
          <div className="w-20 md:w-28 text-right">Money</div>
        </div>
      </div>

      {/* Table Rows */}
      <div className="space-y-3">
        {players.map((player, idx) => (
          <PlayerRow key={`${player.rank}-${idx}`} player={player} highlight={false} showUnredacted={showUnredacted} />
        ))}

        {/* Current user row outside top 10 */}
        {currentUserRow && (
          <>
            <div className="flex items-center gap-2 px-2 py-1">
              <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
              <span className="text-xs text-[#2F3E46]/40 dark:text-white/30 shrink-0">your rank</span>
              <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
            </div>
            <PlayerRow player={currentUserRow} highlight={true} showUnredacted={showUnredacted} />
          </>
        )}
      </div>
    </div>
  );
}

function maskWager(wager: string): string {
  const parts = wager.split(".");
  let whole = parts[0];
  
  let digitCount = 0;
  for (let i = whole.length - 1; i >= 0; i--) {
    if (/[0-9]/.test(whole[i])) {
      digitCount++;
      if (digitCount > 3) {
        whole = whole.substring(0, i) + "*" + whole.substring(i + 1);
      }
    }
  }
  
  return parts.length > 1 ? `${whole}.${parts[1]}` : whole;
}

function PlayerRow({ player, highlight, showUnredacted }: { player: Player; highlight: boolean; showUnredacted: boolean }) {
  return (
    <div
      className={`flex items-center justify-between p-4 border rounded-2xl transition-all duration-300 ${
        highlight
          ? "bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border-[#1F7A1F]/30 dark:border-[#55f761]/30"
          : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 hover:scale-[1.005] hover:border-black/20 dark:hover:border-white/20"
      }`}
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className={`w-10 h-10 rounded-full border flex items-center justify-center font-bold text-sm shrink-0 ${
          highlight
            ? "border-[#1F7A1F]/40 dark:border-[#55f761]/40 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 text-[#1F7A1F] dark:text-[#55f761]"
            : "border-black/15 dark:border-white/15 bg-black/10 dark:bg-white/5 text-[#0D1B2A] dark:text-white"
        }`}>
          {player.rank}
        </div>
        <span className={`font-bold text-sm truncate ${highlight ? "text-[#1F7A1F] dark:text-[#55f761]" : "text-[#0D1B2A] dark:text-white"}`}>
          {player.name} {highlight && <span className="font-normal opacity-60">(you)</span>}
        </span>
      </div>

      <div className="flex items-center justify-end gap-12 md:gap-24 text-right">
        <div className="w-20 md:w-28 text-sm font-extrabold text-[#1F7A1F] dark:text-[#55f761] font-mono">
          {highlight || showUnredacted ? player.wager : maskWager(player.wager)}
        </div>
      </div>
    </div>
  );
}
