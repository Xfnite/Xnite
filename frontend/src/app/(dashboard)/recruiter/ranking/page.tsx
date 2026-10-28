"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { getSessionUser } from "@/app/actions/auth";
import { getRecruiterLeaderboardsAction } from "@/app/actions/ranking";
import { getInnerCouncilAccessAction } from "@/app/actions/user";
import { Trophy, Calendar, ChevronDown } from "lucide-react";

interface RankingEntry {
  id: string;
  email: string;
  username: string;
  balance: number;
  rank: number;
  createdAt: Date;
  updatedAt: Date;
}

export default function RankingsPage() {
  const [rankings, setRankings] = useState<any[]>([]);
  const [availableMonths, setAvailableMonths] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Default to current month (YYYY-MM)
  const currentMonthKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadData = async (month: string) => {
    setIsLoading(true);
    try {
      const [leaderboardsData, session, access] = await Promise.all([
        getRecruiterLeaderboardsAction(month),
        getSessionUser(),
        getInnerCouncilAccessAction()
      ]);

      if (session) {
        // Staff, or labelers / old labelers who earned Inner Council
        if (!access.hasAccess) {
          toast.error("Unauthorized access.");
          window.location.href = "/account";
          return;
        }
        setCurrentUser(session);
      }

      setRankings(leaderboardsData.rankings);
      setAvailableMonths(leaderboardsData.availableMonths);
    } catch (err) {
      console.error("Error loading rankings:", err);
      toast.error("An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedMonth);
  }, [selectedMonth]);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  // Top 3 Podium entries
  const first = rankings.find((p) => p.rank === 1);
  const second = rankings.find((p) => p.rank === 2);
  const third = rankings.find((p) => p.rank === 3);

  // Remaining players for the table (rank 4+)
  const leaderboardPlayers = useMemo(() => {
    return rankings.slice(3);
  }, [rankings]);

  // Find if current user is in top 3 or in the remaining list
  const currentUserRow = useMemo(() => {
    if (!currentUser) return null;
    return rankings.find((r) => r.email === currentUser.email) || null;
  }, [rankings, currentUser]);

  const currentUserInTop3 = useMemo(() => {
    if (!currentUserRow) return false;
    return currentUserRow.rank <= 3;
  }, [currentUserRow]);

  if (isLoading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center text-[#2F3E46] dark:text-white/60">
        <div className="w-10 h-10 border-4 border-[#1F7A1F] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="font-medium animate-pulse">Loading leaderboards...</p>
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-full">
      {/* Mesh Background */}
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
        {/* Header Section */}
        <section className="relative z-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-in fade-in slide-in-from-top duration-700">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#0D1B2A] dark:text-white mb-1">
              Top Mentors
            </h1>
            <p className="text-sm text-[#2F3E46] dark:text-white/60">
              View mentor standings based on the number of squires.
            </p>
          </div>

          {/* Month Filter Dropdown */}
          <div 
            ref={dropdownRef}
            className="relative flex items-center gap-2.5 bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl px-4 py-2 backdrop-blur-md cursor-pointer select-none"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <Calendar className="w-4 h-4 text-[#1F7A1F] dark:text-[#55f761]" />
            <div className="flex items-center gap-2 text-sm font-bold text-[#0D1B2A] dark:text-white">
              <span>{selectedMonth === "all" ? "All Time" : availableMonths.find(m => m.value === selectedMonth)?.label || "All Time"}</span>
              <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isDropdownOpen ? "rotate-180" : ""}`} />
            </div>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <div className="absolute top-full mt-2 right-0 w-48 bg-white dark:bg-[#0B1221] border border-black/10 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
                <div 
                  className={`px-4 py-3 text-sm font-semibold cursor-pointer transition-colors ${selectedMonth === "all" ? "bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 text-[#1F7A1F] dark:text-[#55f761]" : "text-[#0D1B2A] dark:text-white hover:bg-black/5 dark:hover:bg-white/5"}`}
                  onClick={(e) => { e.stopPropagation(); setSelectedMonth("all"); setIsDropdownOpen(false); }}
                >
                  All Time
                </div>
                {availableMonths.map((m) => (
                  <div 
                    key={m.value}
                    className={`px-4 py-3 text-sm font-semibold cursor-pointer transition-colors border-t border-black/5 dark:border-white/5 ${selectedMonth === m.value ? "bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 text-[#1F7A1F] dark:text-[#55f761]" : "text-[#0D1B2A] dark:text-white hover:bg-black/5 dark:hover:bg-white/5"}`}
                    onClick={(e) => { e.stopPropagation(); setSelectedMonth(m.value); setIsDropdownOpen(false); }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 3D Podium & Leaderboard Card */}
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
              {/* 3D Podium */}
              <div className="flex flex-col items-center w-full select-none py-4">
                <svg className="absolute w-0 h-0">
                  <defs>
                    {/* Gold gradients */}
                    <linearGradient id="goldTopGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#ca8a04" />
                      <stop offset="100%" stopColor="#78350f" />
                    </linearGradient>
                    <linearGradient id="goldBodyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#78350f" />
                      <stop offset="35%" stopColor="#ca8a04" />
                      <stop offset="55%" stopColor="#fef08a" />
                      <stop offset="70%" stopColor="#eab308" />
                      <stop offset="100%" stopColor="#854d0e" />
                    </linearGradient>

                    {/* Teal gradients */}
                    <linearGradient id="tealTopGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#0f766e" />
                      <stop offset="100%" stopColor="#115e59" />
                    </linearGradient>
                    <linearGradient id="tealBodyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#042f2e" />
                      <stop offset="35%" stopColor="#115e59" />
                      <stop offset="55%" stopColor="#2dd4bf" />
                      <stop offset="75%" stopColor="#14b8a6" />
                      <stop offset="100%" stopColor="#115e59" />
                    </linearGradient>
                  </defs>
                </svg>

                <div className="flex items-end justify-center w-full max-w-4xl px-4 mt-8 gap-6 sm:gap-12 md:gap-16">
                  {/* SECOND PLACE (LEFT) */}
                  <div className="flex flex-col items-center z-10 animate-in fade-in slide-in-from-bottom duration-700 delay-100">
                    <div className="flex flex-col items-center mb-6 text-center">
                      <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 filter drop-shadow-[0_0_10px_rgba(226,232,240,0.5)] transition-transform duration-300 hover:scale-105 cursor-pointer mb-3">
                        <div
                          className="w-full h-full bg-gradient-to-b from-[#E2E8F0] to-[#94A3B8] flex items-center justify-center"
                          style={{ clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)" }}
                        >
                          <div
                            className="w-[90%] h-[90%] bg-[#0B0F19] flex items-center justify-center"
                            style={{ clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)" }}
                          >
                            <span className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-b from-[#FFFFFF] to-[#CBD5E1] drop-shadow-[0_2px_4px_rgba(255,255,255,0.4)] select-none">
                              2
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="text-xs sm:text-sm font-bold text-[#0D1B2A] dark:text-white truncate max-w-[90px] sm:max-w-[120px]">
                        {second ? second.username : "-"}
                      </span>
                      <span className="text-[11px] sm:text-xs font-bold text-yellow-600 dark:text-[#EAB308] mt-0.5">
                        {second ? `${second.balance} apprentices` : "0 apprentices"}
                      </span>
                      <span className="text-[11px] sm:text-xs font-bold text-[#1F7A1F] dark:text-[#55f761]">
                        {second ? `${second.passers} passers` : "0 passers"}
                      </span>
                      <span className="text-[11px] sm:text-xs font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                        {second ? `${second.squires} squires` : "0 squires"}
                      </span>
                    </div>

                    <div className="relative flex justify-center w-[110px] sm:w-[145px] md:w-[180px]">
                      <div className="absolute -top-4 sm:-top-5 left-1/2 -translate-x-1/2 z-30">
                        <svg width="34" height="34" viewBox="0 0 100 100" fill="none" className="drop-shadow-[0_3px_5px_rgba(0,0,0,0.35)] sm:w-[38px] sm:h-[38px]">
                          <path d="M50 5 L63 20 L80 15 L80 33 L95 45 L80 57 L80 75 L63 80 L50 95 L37 80 L20 75 L20 57 L5 45 L20 33 L20 15 L37 20 Z" fill="#94a3b8" stroke="#f1f5f9" strokeWidth="6" />
                          <path d="M50 15 L59 27 L72 23 L72 37 L83 45 L72 53 L72 67 L59 73 L50 85 L41 73 L28 67 L28 53 L17 45 L28 37 L28 23 L41 27 Z" fill="none" stroke="#e2e8f0" strokeWidth="2" />
                          <text x="50" y="60" textAnchor="middle" fill="#0f172a" fontSize="38" fontWeight="extrabold" fontFamily="sans-serif">2</text>
                        </svg>
                      </div>

                      <svg
                        width="100%"
                        viewBox="0 0 160 120"
                        fill="none"
                        className="z-10 overflow-visible"
                        style={{
                          WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 13%, rgba(0,0,0,0) 100%)",
                          maskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 13%, rgba(0,0,0,0) 100%)"
                        }}
                      >
                        <path d="M 0,16 L 0,90 A 80,16 0 0,0 160,90 L 160,16 Z" fill="url(#tealBodyGrad)" />
                        <ellipse cx="80" cy="16" rx="80" ry="16" fill="url(#tealTopGrad)" stroke="#2dd4bf" strokeWidth="0.5" />
                      </svg>
                    </div>
                  </div>

                  {/* FIRST PLACE (CENTER - TALLER & FOREGROUND) */}
                  <div className="flex flex-col items-center z-20 animate-in fade-in slide-in-from-bottom duration-700">
                    <div className="flex flex-col items-center mb-8 text-center">
                      <div className="relative w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 filter drop-shadow-[0_0_15px_rgba(251,191,36,0.6)] transition-transform duration-300 hover:scale-105 cursor-pointer mb-2">
                        <div
                          className="w-full h-full bg-gradient-to-b from-[#FFE259] to-[#FFA751] flex items-center justify-center"
                          style={{ clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)" }}
                        >
                          <div
                            className="w-[90%] h-[90%] bg-[#0B0F19] flex items-center justify-center"
                            style={{ clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)" }}
                          >
                            <span className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-[#FFFFFF] to-[#FFE259] drop-shadow-[0_2px_6px_rgba(255,226,89,0.6)] select-none">
                              1
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="text-xs sm:text-base font-bold text-[#0D1B2A] dark:text-white truncate max-w-[110px] sm:max-w-[150px]">
                        {first ? first.username : "-"}
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-yellow-600 dark:text-[#EAB308] mt-0.5">
                        {first ? `${first.balance} apprentices` : "0 apprentices"}
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-[#1F7A1F] dark:text-[#55f761]">
                        {first ? `${first.passers} passers` : "0 passers"}
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                        {first ? `${first.squires} squires` : "0 squires"}
                      </span>
                    </div>

                    <div className="relative flex justify-center w-[140px] sm:w-[185px] md:w-[230px]">
                      <div className="absolute -top-5 sm:-top-6 left-1/2 -translate-x-1/2 z-30">
                        <svg width="38" height="38" viewBox="0 0 100 100" fill="none" className="drop-shadow-[0_3px_6px_rgba(0,0,0,0.4)] sm:w-[42px] sm:h-[42px]">
                          <polygon points="50,5 90,28 90,72 50,95 10,72 10,28" fill="#e06c13" stroke="#f59e0b" strokeWidth="6" />
                          <polygon points="50,15 80,33 80,67 50,85 20,67 20,33" fill="none" stroke="#fef08a" strokeWidth="2" />
                          <text x="50" y="65" textAnchor="middle" fill="#ffffff" fontSize="42" fontWeight="extrabold" fontFamily="sans-serif">1</text>
                        </svg>
                      </div>

                      <svg
                        width="100%"
                        viewBox="0 0 200 155"
                        fill="none"
                        className="z-10 overflow-visible"
                        style={{
                          WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 13%, rgba(0,0,0,0) 100%)",
                          maskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 13%, rgba(0,0,0,0) 100%)"
                        }}
                      >
                        <path d="M 0,20 L 0,130 A 100,20 0 0,0 200,130 L 200,20 Z" fill="url(#goldBodyGrad)" />
                        <ellipse cx="100" cy="20" rx="100" ry="20" fill="url(#goldTopGrad)" stroke="#fef08a" strokeWidth="0.5" />
                      </svg>
                    </div>
                  </div>

                  {/* THIRD PLACE (RIGHT) */}
                  <div className="flex flex-col items-center z-10 animate-in fade-in slide-in-from-bottom duration-700 delay-200">
                    <div className="flex flex-col items-center mb-6 text-center">
                      <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 filter drop-shadow-[0_0_10px_rgba(180,83,9,0.5)] transition-transform duration-300 hover:scale-105 cursor-pointer mb-3">
                        <div
                          className="w-full h-full bg-gradient-to-b from-[#F59E0B] to-[#B45309] flex items-center justify-center"
                          style={{ clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)" }}
                        >
                          <div
                            className="w-[90%] h-[90%] bg-[#0B0F19] flex items-center justify-center"
                            style={{ clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)" }}
                          >
                            <span className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-b from-[#FFFFFF] to-[#F59E0B] drop-shadow-[0_2px_4px_rgba(245,158,11,0.4)] select-none">
                              3
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="text-xs sm:text-sm font-bold text-[#0D1B2A] dark:text-white truncate max-w-[90px] sm:max-w-[120px]">
                        {third ? third.username : "-"}
                      </span>
                      <span className="text-[11px] sm:text-xs font-bold text-yellow-600 dark:text-[#EAB308] mt-0.5">
                        {third ? `${third.balance} apprentices` : "0 apprentices"}
                      </span>
                      <span className="text-[11px] sm:text-xs font-bold text-[#1F7A1F] dark:text-[#55f761]">
                        {third ? `${third.passers} passers` : "0 passers"}
                      </span>
                      <span className="text-[11px] sm:text-xs font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                        {third ? `${third.squires} squires` : "0 squires"}
                      </span>
                    </div>

                    <div className="relative flex justify-center w-[110px] sm:w-[145px] md:w-[180px]">
                      <div className="absolute -top-4 sm:-top-5 left-1/2 -translate-x-1/2 z-30">
                        <svg width="34" height="34" viewBox="0 0 100 100" fill="none" className="drop-shadow-[0_3px_5px_rgba(0,0,0,0.35)] sm:w-[38px] sm:h-[38px]">
                          <path d="M50 5 L63 20 L80 15 L80 33 L95 45 L80 57 L80 75 L63 80 L50 95 L37 80 L20 75 L20 57 L5 45 L20 33 L20 15 L37 20 Z" fill="#94a3b8" stroke="#f1f5f9" strokeWidth="6" />
                          <path d="M50 15 L59 27 L72 23 L72 37 L83 45 L72 53 L72 67 L59 73 L50 85 L41 73 L28 67 L28 53 L17 45 L28 37 L28 23 L41 27 Z" fill="none" stroke="#e2e8f0" strokeWidth="2" />
                          <text x="50" y="60" textAnchor="middle" fill="#0f172a" fontSize="38" fontWeight="extrabold" fontFamily="sans-serif">3</text>
                        </svg>
                      </div>

                      <svg
                        width="100%"
                        viewBox="0 0 160 120"
                        fill="none"
                        className="z-10 overflow-visible"
                        style={{
                          WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 13%, rgba(0,0,0,0) 100%)",
                          maskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 13%, rgba(0,0,0,0) 100%)"
                        }}
                      >
                        <path d="M 0,16 L 0,72 A 80,16 0 0,0 160,72 L 160,16 Z" fill="url(#tealBodyGrad)" />
                        <ellipse cx="80" cy="16" rx="80" ry="16" fill="url(#tealTopGrad)" stroke="#2dd4bf" strokeWidth="0.5" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sub-header Divider Notice */}
              <div className="flex flex-col items-center justify-center text-center my-8 max-w-2xl mx-auto animate-in fade-in duration-750 delay-200">
                <h2 className="text-sm md:text-base font-extrabold tracking-wider text-yellow-600 dark:text-[#EAB308] uppercase mb-2">
                  INVITE FRIENDS AND CLIMB THE RANKINGS
                </h2>
                <p className="text-xs md:text-sm text-[#2F3E46]/80 dark:text-white/50 leading-relaxed">
                  Get active referrals to climb the leaderboard. Track your referral count and position in real-time.
                  <br />
                  <span className="text-[#1F7A1F] dark:text-[#55f761] font-semibold mt-1 inline-block">Note: Rankings are primarily based on the number of squires.</span>
                </p>
              </div>

              {/* Leaderboard Table (Runner-Ups) */}
              <div className="w-full mt-8 animate-in fade-in slide-in-from-bottom duration-700 delay-300">
                {/* Table Headers */}
                <div className="flex items-center justify-between px-6 py-3 text-xs font-bold uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40 border-b border-black/5 dark:border-white/5 mb-3">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-10 text-center">#</div>
                    <div>User</div>
                  </div>
                  <div className="flex items-center justify-end text-right">
                    <div className="w-32 md:w-48 text-right">Apprentices / Passers / Squires</div>
                  </div>
                </div>

                {/* Table Rows */}
                <div className="space-y-3">
                  {leaderboardPlayers.map((player, idx) => {
                    const isSelf = currentUser && player.email === currentUser.email;
                    return (
                      <div
                        key={`${player.rank}-${idx}`}
                        className={`flex items-center justify-between p-4 border rounded-2xl transition-all duration-300 ${
                          isSelf
                            ? "bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border-[#1F7A1F]/30 dark:border-[#55f761]/30"
                            : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 hover:scale-[1.005] hover:border-black/20 dark:hover:border-white/20"
                        }`}
                      >
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className={`w-10 h-10 rounded-full border flex items-center justify-center font-bold text-sm shrink-0 ${
                            isSelf
                              ? "border-[#1F7A1F]/40 dark:border-[#55f761]/40 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 text-[#1F7A1F] dark:text-[#55f761]"
                              : "border-black/15 dark:border-white/15 bg-black/10 dark:bg-white/5 text-[#0D1B2A] dark:text-white"
                          }`}>
                            {player.rank}
                          </div>
                          <span className={`font-bold text-sm truncate ${isSelf ? "text-[#1F7A1F] dark:text-[#55f761]" : "text-[#0D1B2A] dark:text-white"}`}>
                            {player.username} {isSelf && <span className="font-normal opacity-60">(you)</span>}
                          </span>
                        </div>

                        <div className="flex items-center justify-end text-right">
                          <div className="w-32 md:w-48 flex flex-col items-end">
                            <span className="text-sm font-extrabold text-[#2F3E46] dark:text-white/80 font-mono">
                              {player.balance} apprentices
                            </span>
                            <span className="text-xs font-bold text-[#1F7A1F] dark:text-[#55f761] font-mono">
                              {player.passers} passers
                            </span>
                            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 font-mono">
                              {player.squires} squires
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {leaderboardPlayers.length === 0 && !currentUserRow && (
                    <div className="text-center py-8 text-xs text-[#2F3E46]/50 dark:text-white/30">
                      No runner-up ranking records found.
                    </div>
                  )}

                  {/* Current user row if outside top 3 and not in top 10 */}
                  {currentUserRow && !currentUserInTop3 && rankings.indexOf(currentUserRow) >= 10 && (
                    <>
                      <div className="flex items-center gap-2 px-2 py-1">
                        <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
                        <span className="text-xs text-[#2F3E46]/40 dark:text-white/30 shrink-0">your rank</span>
                        <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
                      </div>
                      <div
                        className="flex items-center justify-between p-4 border rounded-2xl transition-all duration-300 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border-[#1F7A1F]/30 dark:border-[#55f761]/30"
                      >
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-full border flex items-center justify-center font-bold text-sm shrink-0 border-[#1F7A1F]/40 dark:border-[#55f761]/40 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 text-[#1F7A1F] dark:text-[#55f761]">
                            {currentUserRow.rank}
                          </div>
                          <span className="font-bold text-sm truncate text-[#1F7A1F] dark:text-[#55f761]">
                            {currentUserRow.username} <span className="font-normal opacity-60">(you)</span>
                          </span>
                        </div>

                        <div className="flex items-center justify-end text-right">
                          <div className="w-32 md:w-48 flex flex-col items-end">
                            <span className="text-sm font-extrabold text-[#2F3E46] dark:text-white/80 font-mono">
                              {currentUserRow.balance} apprentices
                            </span>
                            <span className="text-xs font-bold text-[#1F7A1F] dark:text-[#55f761] font-mono">
                              {currentUserRow.passers} passers
                            </span>
                            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 font-mono">
                              {currentUserRow.squires} squires
                            </span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
