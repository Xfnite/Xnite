"use client";

import { createContext, useState } from "react";
import { Trophy, Users } from "lucide-react";

export const RankingContext = createContext<{
  activeTab: "labeller" | "referrer";
  setActiveTab: (tab: "labeller" | "referrer") => void;
}>({
  activeTab: "labeller",
  setActiveTab: () => {},
});

export default function RankingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<"labeller" | "referrer" >("labeller");

  return (
    <RankingContext.Provider value={{ activeTab, setActiveTab }}>
      <div className="flex gap-6 h-full w-full overflow-hidden">
        {/* Sidebar Container */}
        <aside className="w-64 shrink-0 hidden lg:flex flex-col h-full relative z-10">
          <div className="bg-white/25 dark:bg-[#0a1220]/25 backdrop-blur-md border border-black/10 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm flex flex-col h-full p-4">
            
            {/* Header Block */}
            <div className="px-2 pt-2 pb-4 mb-4 border-b border-black/5 dark:border-white/5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[#1F7A1F] dark:text-[#55f761] text-base">🏆</span>
                <span className="text-[10px] font-black uppercase tracking-wider text-[#1F7A1F] dark:text-[#55f761]">
                  LEADERBOARDS
                </span>
              </div>
              <h2 className="text-[13px] font-bold text-[#2F3E46] dark:text-white/60 leading-tight">
                Select Category
              </h2>
            </div>

            {/* Navigation List */}
            <nav className="flex-1 space-y-1.5">
              <button
                onClick={() => setActiveTab("labeller")}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer ${
                  activeTab === "labeller"
                    ? "bg-[#1F7A1F] text-white dark:bg-[#55f761] dark:text-[#060D14] shadow-md shadow-[#1F7A1F]/10 dark:shadow-[#55f761]/10"
                    : "text-[#2F3E46] dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 hover:text-[#0D1B2A] dark:hover:text-white"
                }`}
              >
                <Trophy className={`w-4 h-4 shrink-0 ${activeTab === "labeller" ? "text-white dark:text-[#060D14]" : "text-[#2F3E46]/60 dark:text-white/40"}`} />
                <span>Top Challengers</span>
              </button>

              <button
                onClick={() => setActiveTab("referrer")}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer ${
                  activeTab === "referrer"
                    ? "bg-[#1F7A1F] text-white dark:bg-[#55f761] dark:text-[#060D14] shadow-md shadow-[#1F7A1F]/10 dark:shadow-[#55f761]/10"
                    : "text-[#2F3E46] dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 hover:text-[#0D1B2A] dark:hover:text-white"
                }`}
              >
                <Users className={`w-4 h-4 shrink-0 ${activeTab === "referrer" ? "text-white dark:text-[#060D14]" : "text-[#2F3E46]/60 dark:text-white/40"}`} />
                <span>Top Checkers</span>
              </button>
            </nav>


          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto pr-1">
          {children}
        </div>
      </div>
    </RankingContext.Provider>
  );
}