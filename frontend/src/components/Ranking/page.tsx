"use client";

import { useTransition, useContext } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

import Podium from "./Podium";
import LeaderboardTable from "./LeaderboardTable";
import { RankingContext } from "@/app/(dashboard)/ranking/layout";

interface Player {
  rank: number;
  name: string;
  email: string;
  balance: number;
  wager: string;
  prize: string;
  avatar: string;
}

interface RankingData {
  top10: Player[];
  currentUserRow: Player | null;
  currentUserInTop10: boolean;
  cutoffPeriod?: string;
}

interface RankingViewProps {
  labellerData: RankingData;
  referrerData: RankingData;
  sessionUserRole?: string;
}

export default function RankingView({ labellerData, referrerData, sessionUserRole = "" }: RankingViewProps) {
  const { activeTab, setActiveTab } = useContext(RankingContext);
  
  const unredactedRoles = ["checker", "recruiter", "judger", "admin"];
  const showUnredacted = unredactedRoles.includes(sessionUserRole);

  const currentData = activeTab === "labeller" ? labellerData : referrerData;
  const { top10, currentUserRow, currentUserInTop10 } = currentData;

  const topPlayers = top10.slice(0, 3).map((p) => ({
    rank:   p.rank,
    name:   p.name,
    wager:  p.wager,
    avatar: p.avatar,
  }));

  const leaderboardPlayers = top10.slice(3).map((p) => ({
    rank:   p.rank,
    name:   p.name,
    wager:  p.wager,
    prize:  p.prize,
    avatar: p.avatar,
  }));

  return (
    <div className="relative w-full min-h-full">
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div
          className="absolute bg-[#55f761] filter blur-[100px] rounded-full opacity-30 dark:opacity-15"
          style={{ width: "40vw", height: "40vw", top: "-10%", left: "-10%" }}
        />
        <div
          className="absolute bg-[#1F7A1F] filter blur-[100px] rounded-full opacity-30 dark:opacity-15"
          style={{ width: "50vw", height: "50vw", top: "40%", right: "-20%" }}
        />
      </div>

      <div className="relative z-10 space-y-6 lg:space-y-10 w-full max-w-5xl mx-auto pt-4 pb-12">
        {/* Mobile Category Tabs */}
        <div className="flex lg:hidden gap-2 mb-6 overflow-x-auto hide-scrollbar">
          <button
            onClick={() => setActiveTab("labeller")}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-full transition-all duration-300 ${
              activeTab === "labeller"
                ? "bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] shadow-md shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20"
                : "bg-black/5 dark:bg-white/5 text-[#2F3E46] dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
            }`}
          >
            Top Challengers
          </button>
          <button
            onClick={() => setActiveTab("referrer")}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-full transition-all duration-300 ${
              activeTab === "referrer"
                ? "bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] shadow-md shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20"
                : "bg-black/5 dark:bg-white/5 text-[#2F3E46] dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
            }`}
          >
            Top Checkers
          </button>
        </div>

        <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-in fade-in slide-in-from-top duration-700">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#0D1B2A] dark:text-white mb-1">
              {activeTab === "labeller" ? "Top Challengers" : "Top Checkers"}
            </h1>
            <p className="text-sm text-[#2F3E46] dark:text-white/60">
              {activeTab === "labeller"
                ? "View player standings, wager metrics, and rewards."
                : "View player standings based on total checks."}
            </p>
            {currentData.cutoffPeriod && (
              <div className="mt-3 text-xs font-semibold text-[#1F7A1F] dark:text-[#55f761] bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 px-3 py-1.5 rounded-md inline-block shadow-sm">
                {currentData.cutoffPeriod}
              </div>
            )}
          </div>
        </section>

        <section className="w-full">
          <div className="relative bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-tr-3xl rounded-bl-3xl shadow-xl overflow-hidden transition-colors duration-300 p-6 lg:p-10">
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
              <div
                className="absolute bg-[#1F7A1F] filter blur-[80px] rounded-full opacity-10"
                style={{ width: "300px", height: "300px", top: "-50px", right: "-50px" }}
              />
              <div
                className="absolute bg-[#55f761] filter blur-[80px] rounded-full opacity-5"
                style={{ width: "250px", height: "250px", bottom: "-50px", left: "-50px" }}
              />
            </div>

            <div className="relative z-10">
              <Podium topPlayers={topPlayers} showUnredacted={showUnredacted} />

              <div className="flex flex-col items-center justify-center text-center my-8 max-w-2xl mx-auto animate-in fade-in duration-750 delay-200">
                <h2 className="text-sm md:text-base font-extrabold tracking-wider text-yellow-600 dark:text-[#EAB308] uppercase mb-2">
                  {activeTab === "labeller"
                    ? "CLIMB THE LEADERBOARD AND CLAIM YOUR REWARDS"
                    : "INVITE FRIENDS AND CLIMB THE RANKINGS"}
                </h2>
                <p className="text-xs md:text-sm text-[#2F3E46]/80 dark:text-white/50 leading-relaxed">
                  {activeTab === "labeller"
                    ? "Each day, the top 10 players with the highest wagers earn bonus Coins. Track your position on the live leaderboard now."
                    : "Get active referrals to climb the leaderboard. Track your referral count and position in real-time."}
                </p>
              </div>

              <LeaderboardTable
                players={leaderboardPlayers}
                currentUserRow={!currentUserInTop10 ? currentUserRow : null}
                showUnredacted={showUnredacted}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

