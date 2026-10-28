"use client";

import { useState } from "react";
import { Calendar, ArrowUp, ArrowDown } from "lucide-react";

// Joined date + last login merged into one "Activity" column for the recruiter tables.

function fullDateTime(date: Date): string {
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ActivityCell({
  createdAt,
  lastLogin,
  align = "left",
}: {
  createdAt: Date;
  lastLogin: Date | null;
  align?: "left" | "right";
}) {
  const [now] = useState(() => Date.now());
  const hoursSince = lastLogin ? (now - lastLogin.getTime()) / 36e5 : Infinity;
  const dot =
    hoursSince < 24 ? "bg-[#1F7A1F] dark:bg-[#55f761]" : hoursSince < 24 * 7 ? "bg-amber-500" : "bg-black/20 dark:bg-white/20";

  const label = "text-[9px] font-black uppercase tracking-wider text-[#2F3E46]/40 dark:text-white/30";

  // Stacked short lines keep the column narrow (full timestamp on hover)
  return (
    <div className={`flex flex-col gap-0.5 text-xs leading-tight ${align === "right" ? "items-end" : ""}`}>
      <span className={label}>Last login</span>
      <span
        className="flex items-center gap-1.5 font-bold text-[#0D1B2A]/80 dark:text-white/80"
        title={lastLogin ? fullDateTime(lastLogin) : "Never logged in"}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
        {lastLogin ? lastLogin.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : <span className="text-[#2F3E46]/40 dark:text-white/30">Never</span>}
      </span>
      {lastLogin && (
        <span className="pl-3 text-[11px] font-semibold text-[#2F3E46]/50 dark:text-white/40">
          {lastLogin.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
      )}
      <span className={`${label} mt-1.5`}>Joined</span>
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#2F3E46]/60 dark:text-white/45" title={fullDateTime(createdAt)}>
        <Calendar className="w-3 h-3 shrink-0 opacity-70" />
        {createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </span>
    </div>
  );
}

type ActivitySortField = "createdAt" | "lastLogin";

export function ActivityHeader({
  sortField,
  sortOrder,
  onSort,
}: {
  sortField: string;
  sortOrder: "asc" | "desc";
  onSort: (field: ActivitySortField) => void;
}) {
  // One pill per date: click to sort by it, click again to flip the order
  const pill = (field: ActivitySortField, label: string) => {
    const active = sortField === field;
    return (
      <button
        type="button"
        onClick={() => onSort(field)}
        aria-pressed={active}
        title={active ? "Click to reverse order" : `Sort by ${label.toLowerCase()}`}
        className={`inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded-full border normal-case tracking-normal text-[10px] font-bold transition-colors cursor-pointer ${
          active
            ? "bg-[#1F7A1F] border-[#1F7A1F] text-white dark:bg-[#55f761] dark:border-[#55f761] dark:text-[#060D14]"
            : "border-black/15 dark:border-white/15 text-[#2F3E46]/60 dark:text-white/50 hover:border-[#1F7A1F]/40 hover:text-[#1F7A1F] dark:hover:border-[#55f761]/40 dark:hover:text-[#55f761]"
        }`}
      >
        {label}
        {active && (sortOrder === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-1">
      <span>Activity</span>
      <div className="flex flex-col gap-1">
        {pill("lastLogin", "Last login")}
        {pill("createdAt", "Joined")}
      </div>
    </div>
  );
}
