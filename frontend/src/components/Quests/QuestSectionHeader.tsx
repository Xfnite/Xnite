import React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuestSectionHeaderProps {
  title: string;
  completed: number;
  total: number;
  isCollapsed: boolean;
  onToggle: () => void;
}

export default function QuestSectionHeader({
  title,
  completed,
  total,
  isCollapsed,
  onToggle,
}: QuestSectionHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!isCollapsed}
      className="w-full flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-2 mb-0 px-5 select-none cursor-pointer group/section"
    >
      <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest group-hover/section:text-amber-400 transition-colors">
        {title}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
          {completed}/{total}
        </span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-slate-500 dark:text-slate-400 transition-transform",
            isCollapsed && "-rotate-90"
          )}
        />
      </span>
    </button>
  );
}
