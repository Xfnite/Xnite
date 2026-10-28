"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { getProjectRulesStatus } from "@/app/actions/project";

const NAV_ITEMS = [
  {
    label: "Rules and Guideline",
    href: "/project/rules",
    locked: false,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <line x1="10" y1="9" x2="8" y2="9" />
      </svg>
    ),
  },
  {
    label: "Active Projects",
    href: "/project",
    locked: true, // controlled by rulesAccepted
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    ),
  },
  {
    label: "Task Summary",
    href: "/project/task-summary",
    locked: true, // controlled by rulesAccepted
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
];

function LockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="ml-auto shrink-0 opacity-40"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export default function ProjectSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [rulesAccepted, setRulesAccepted] = useState(false);

  useEffect(() => {
    const check = () => {
      getProjectRulesStatus().then((res) => setRulesAccepted(res.accepted));
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, [pathname]); // re-run on navigation so sidebar updates immediately after accepting

  const isTabActive = (href: string) => {
    if (href === "/project") return pathname === "/project";
    return pathname.startsWith(href);
  };

  return (
    <aside className="w-64 shrink-0 hidden lg:flex flex-col h-full">
      <div className="bg-white dark:bg-[#0a1220] border border-black/10 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm flex flex-col h-full p-4">

        {/* Header Block */}
        <div className="px-2 pt-2 pb-4 mb-4 border-b border-black/5 dark:border-white/5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[#1F7A1F] dark:text-[#55f761] text-base">🚀</span>
            <span className="text-[10px] font-black uppercase tracking-wider text-[#1F7A1F] dark:text-[#55f761]">
              XNITE PROJECTS
            </span>
          </div>
          <h2 className="text-[15px] font-bold text-[#0D1B2A] dark:text-white leading-tight">
            Navigation Hub
          </h2>
        </div>

        {/* Navigation List */}
        <nav className="flex-1 space-y-1.5">
          {NAV_ITEMS.map((item) => {
            const isLocked = item.locked && !rulesAccepted;
            const active = isTabActive(item.href);

            if (isLocked) {
              return (
                <button
                  key={item.href}
                  onClick={() => router.push("/project/rules")}
                  title="Complete Rules & Guidelines first"
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold cursor-not-allowed select-none text-[#2F3E46]/35 dark:text-white/25 bg-black/[0.02] dark:bg-white/[0.02]"
                >
                  <span className="shrink-0 text-[#2F3E46]/25 dark:text-white/20">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                  <LockIcon />
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  active
                    ? "bg-[#1F7A1F] text-white dark:bg-[#55f761] dark:text-[#060D14] shadow-md shadow-[#1F7A1F]/10 dark:shadow-[#55f761]/10"
                    : "text-[#2F3E46] dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 hover:text-[#0D1B2A] dark:hover:text-white"
                }`}
              >
                <span className={`shrink-0 ${active ? "text-white dark:text-[#060D14]" : "text-[#2F3E46]/60 dark:text-white/40"}`}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Lock notice */}
        {!rulesAccepted && (
          <div className="mt-4 px-3 py-2.5 rounded-xl bg-amber-500/5 border border-amber-500/15 text-[10px] text-amber-600/70 dark:text-amber-400/60 leading-relaxed">
            🔒 Acknowledge the Rules & Guidelines to unlock Active Projects and Task Summary.
          </div>
        )}

      </div>
    </aside>
  );
}
