/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { isLabelerOrOldLabeler, REFERRAL_BONUS_MIN_WITHDRAW } from "@/config/permissions";
import {
  Users,
  Search,
  ChevronDown,
  Copy,
  Check,
  TrendingUp,
  ArrowUpDown,
  ArrowUpRight,
  Clock,
  Wallet,
} from "lucide-react";
import {
  getReferralBonusesAction,
  withdrawReferralBonusAction,
} from "@/app/actions/wallet";
import { getReferralSlugAction } from "@/app/actions/referral";
import { type ResolvedReferralBonusItem } from "@/lib/referralBonus";

export default function ReferralBonusPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overview" | "breakdown">("overview");
  const [bonuses, setBonuses] = useState<ResolvedReferralBonusItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [, startTransition] = useTransition();

  // User & permissions
  const [currentUser, setCurrentUser] = useState<{
    email: string;
    role: string;
    isAdmin: boolean;
    isStaff: boolean;
  } | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const limit = 20;

  // Filters
  const [availableCutoffs, setAvailableCutoffs] = useState<string[]>([]);
  const [selectedCutoff, setSelectedCutoff] = useState<string>("All");
  const [isCutoffDropdownOpen, setIsCutoffDropdownOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Sort order: default Highest to Lowest (desc)
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  // Summaries
  const [summary, setSummary] = useState({
    totalEarned: 0,
    claimableBonus: 0,
    sendingBonus: 0,
    totalRecruitsCount: 0,
    lifetimeRecruitsCount: 0,
    currentCutoffEarned: 0,
    currentCutoffName: "",
    nextCutoffName: "",
    sourceBreakdown: {
      referral_link: 0,
      direct_referral: 0,
      fallback_iru: 0,
      organic: 0,
    },
    paymentDetails: null as {
      paymentMethod?: string | null;
      payeeUid?: string | null;
      payeeName?: string | null;
    } | null,
    payoutHistory: [] as Array<{
      id: string;
      amountPaid: number;
      status: string;
      cutoff: string;
      createdAt: string;
      payoutDate?: string | null;
    }>,
  });

  // Referral link
  const [referralLink, setReferralLink] = useState("");
  const [hasCopiedLink, setHasCopiedLink] = useState(false);

  // Load referral link slug
  useEffect(() => {
    getReferralSlugAction()
      .then((slug) => {
        if (slug) {
          const origin = typeof window !== "undefined" ? window.location.origin : "";
          setReferralLink(`${origin}/r/${slug}`);
        }
      })
      .catch(console.error);
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load bonuses
  const loadData = useCallback(() => {
    setIsLoading(true);
    startTransition(async () => {
      try {
        const res = await getReferralBonusesAction({
          cutoff: selectedCutoff,
          searchQuery: debouncedSearch,
          sortBy: sortOrder === "desc" ? "amount_desc" : "amount_asc",
          page,
          limit,
        });

        if (res.success && res.data) {
          if (!isLabelerOrOldLabeler(res.data.currentUser?.role)) {
            toast.info("Referral bonuses for Inner Council are included directly in your salary payout.");
            router.replace("/wallet");
            return;
          }
          setBonuses(res.data.items);
          setTotalItems(res.data.totalItems);
          setTotalPages(res.data.totalPages || 1);
          setSummary(res.data.summary as any);
          setAvailableCutoffs(["All", ...res.data.availableCutoffs]);
          setCurrentUser(res.data.currentUser);
        } else {
          toast.error(res.error || "Failed to load referral bonuses");
          if (res.error?.includes("Inner Council")) {
            router.replace("/wallet");
          }
        }
      } catch {
        toast.error("An error occurred while loading referral bonuses");
      } finally {
        setIsLoading(false);
      }
    });
  }, [selectedCutoff, debouncedSearch, sortOrder, page, limit]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const copyReferralLink = () => {
    if (!referralLink) {
      toast.info("Generating referral link...");
      return;
    }
    navigator.clipboard.writeText(referralLink);
    setHasCopiedLink(true);
    toast.success("Referral link copied!");
    setTimeout(() => setHasCopiedLink(false), 2000);
  };

  // Withdraw handler
  const handleWithdraw = async () => {
    if (!summary.paymentDetails?.paymentMethod || !summary.paymentDetails?.payeeUid) {
      toast.error("Please configure your payment method in Wallet > Payment Method before withdrawing.");
      return;
    }

    if (summary.claimableBonus <= 0) {
      toast.error("No active referral bonus available to withdraw. This cutoff has already been withdrawn.");
      return;
    }

    if (summary.claimableBonus < REFERRAL_BONUS_MIN_WITHDRAW) {
      toast.error(
        `Minimum referral bonus withdrawal is ₱${REFERRAL_BONUS_MIN_WITHDRAW.toLocaleString("en-US", { minimumFractionDigits: 2 })}.`
      );
      return;
    }

    setIsWithdrawing(true);
    const toastId = toast.loading("Processing withdrawal request...");
    try {
      const res = await withdrawReferralBonusAction({ cutoff: selectedCutoff });
      if (res.success) {
        toast.success(
          `Withdrawal submitted! ₱${res.data?.amount?.toLocaleString("en-US", {
            minimumFractionDigits: 2,
          })}`,
          {
            id: toastId,
            description: "Your referral bonus withdrawal request has been received and is being processed.",
            duration: 5000,
          }
        );
        loadData();
      } else {
        toast.error(res.error || "Failed to process withdrawal", { id: toastId });
      }
    } catch {
      toast.error("An unexpected error occurred while withdrawing.", { id: toastId });
    } finally {
      setIsWithdrawing(false);
    }
  };

  const claimableAmount = summary.claimableBonus;
  const isBelowMinimum = claimableAmount > 0 && claimableAmount < REFERRAL_BONUS_MIN_WITHDRAW;

  // A withdrawal still being processed takes priority; otherwise, with nothing left
  // to claim, show the latest withdrawal's result. Cancelled ones don't count.
  const liveHistory = (summary.payoutHistory || []).filter(
    (h) => !["cancelled", "canceled", "failed", "rejected"].includes((h.status || "").toLowerCase())
  );
  const pendingPayout = liveHistory.find(
    (h) => !["sent", "paid"].includes((h.status || "").toLowerCase())
  );
  const activePayoutForCutoff = pendingPayout ?? (claimableAmount <= 0 ? liveHistory[0] : undefined);

  const isAlreadyWithdrawn = Boolean(claimableAmount <= 0 && activePayoutForCutoff);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner & Referral Link */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0D1B2A] dark:text-white">
            Referral Earnings
          </h2>
          <p className="text-xs text-[#2F3E46]/70 dark:text-white/60">
            Track bonuses earned from recruited members and manage withdrawals.
          </p>
        </div>

        {referralLink && (
          <button
            onClick={copyReferralLink}
            className="flex items-center gap-2 px-4 py-2 bg-[#1F7A1F] hover:bg-[#145214] dark:bg-[#55f761] dark:hover:bg-[#3de34a] text-white dark:text-[#060D14] text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
          >
            {hasCopiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{hasCopiedLink ? "Copied!" : "Copy Referral Link"}</span>
          </button>
        )}
      </div>

      {/* Sub Tabs: Overview & Recruit Breakdown */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar border-b border-black/10 dark:border-white/10 pb-4">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-full transition-all duration-300 cursor-pointer ${
            activeTab === "overview"
              ? "bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] shadow-md shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20"
              : "bg-black/5 dark:bg-white/5 text-[#2F3E46] dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab("breakdown")}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-full transition-all duration-300 cursor-pointer ${
            activeTab === "breakdown"
              ? "bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] shadow-md shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20"
              : "bg-black/5 dark:bg-white/5 text-[#2F3E46] dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
          }`}
        >
          Recruit Breakdown
        </button>
      </div>

      {/* TAB 1: OVERVIEW & WITHDRAWAL */}
      {activeTab === "overview" && (
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* Main Claimable Bonus / Final Payment Card (styled exactly like Wallet) */}
          <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-6 relative overflow-hidden transition-all duration-300 shadow-sm">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 rounded-full blur-2xl -translate-y-12 translate-x-12"></div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative z-10">
              <div>
                <div className="text-xs font-semibold text-[#2F3E46] dark:text-white/60 mb-2 flex items-center gap-2">
                  <span>Claimable Referral Bonus</span>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold bg-blue-500/10 px-2 py-0.5 rounded-full">
                    Monthly (15th)
                  </span>
                </div>
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="text-4xl font-black text-[#0D1B2A] dark:text-white tracking-tighter">
                    ₱
                    {claimableAmount.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="text-xs text-[#2F3E46]/70 dark:text-white/60 flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-[#0D1B2A] dark:text-white">
                    {summary.currentCutoffName || "October 15, 2026 Cutoff"}
                  </span>
                  {summary.nextCutoffName && (
                    <>
                      <span>•</span>
                      <span>Next claim: {summary.nextCutoffName.replace(/cutoff/i, "").trim()}</span>
                    </>
                  )}
                </div>

                {activePayoutForCutoff && (
                  <div className="mt-2.5">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${
                        activePayoutForCutoff?.status?.toLowerCase() === "sent"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                      }`}
                    >
                      {activePayoutForCutoff?.status?.toLowerCase() === "sent" ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>
                            Payout Sent (₱
                            {activePayoutForCutoff.amountPaid.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                            )
                          </span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            Payout Processing (₱
                            {activePayoutForCutoff.amountPaid.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                            )
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Withdraw Button */}
              <div className="flex flex-col items-start sm:items-end gap-2 shrink-0 w-full sm:w-auto">
                <button
                  onClick={handleWithdraw}
                  disabled={isWithdrawing || claimableAmount < REFERRAL_BONUS_MIN_WITHDRAW || isAlreadyWithdrawn}
                  className="w-full sm:w-auto px-6 py-2.5 bg-[#1F7A1F] hover:bg-[#145214] dark:bg-[#55f761] dark:hover:bg-[#3de34a] text-white dark:text-[#060D14] text-sm font-bold rounded-xl transition-all shadow-lg hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 cursor-pointer"
                >
                  {isWithdrawing
                    ? "Processing..."
                    : isAlreadyWithdrawn
                    ? "Withdrawn"
                    : "Withdraw"}
                </button>
                {isBelowMinimum && !isAlreadyWithdrawn && (
                  <span className="text-[10px] text-[#2F3E46]/60 dark:text-white/40">
                    Min. ₱{REFERRAL_BONUS_MIN_WITHDRAW.toLocaleString("en-US", { minimumFractionDigits: 2 })} to withdraw
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Referral Payout History */}
          <div>
            <h2 className="text-lg font-bold text-[#0D1B2A] dark:text-white mb-4">
              Payout History
            </h2>

            {summary.payoutHistory && summary.payoutHistory.length > 0 ? (
              <div className="flex flex-col gap-3">
                {summary.payoutHistory.map((history) => (
                  <div
                    key={history.id}
                    className="flex flex-col bg-white/40 dark:bg-black/40 backdrop-blur-md rounded-xl border border-black/10 dark:border-white/5 shadow-sm overflow-hidden transition-colors"
                  >
                    {/* Top Row */}
                    <div className="flex items-start justify-between px-5 py-3 border-b border-black/5 dark:border-white/5">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-bold text-[#0D1B2A] dark:text-white">
                          {history.cutoff}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs text-[#2F3E46]/60 dark:text-white/40">
                          <Clock className="w-3 h-3" />
                          <span>
                            {history.createdAt
                              ? new Date(history.createdAt).toLocaleString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "N/A"}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`text-xs font-bold uppercase px-2.5 py-0.5 rounded-full ${
                            history.status?.toLowerCase() === "sent"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                          }`}
                        >
                          {history.status || "Sending"}
                        </span>
                        <span className="text-[10px] text-[#2F3E46]/60 dark:text-white/40 font-mono">
                          #{history.id.split("-")[0].toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {/* Bottom Row */}
                    <div className="flex justify-between items-center px-5 py-3">
                      <span className="text-sm text-[#2F3E46]/80 dark:text-white/70">
                        Total Payout
                      </span>
                      <span className="text-base font-black text-[#1F7A1F] dark:text-[#55f761]">
                        ₱
                        {history.amountPaid.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl p-8 text-center backdrop-blur-md">
                <Wallet className="w-10 h-10 mx-auto text-black/20 dark:text-white/20 mb-2" />
                <p className="text-sm font-semibold text-[#0D1B2A] dark:text-white">
                  No payout history yet
                </p>
                <p className="text-xs text-[#2F3E46]/60 dark:text-white/40 mt-1">
                  When you withdraw your referral bonus, your payout requests and records will appear here.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: RECRUIT BREAKDOWN */}
      {activeTab === "breakdown" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Total Earned */}
            <div className="bg-white dark:bg-[#0D1B2A] border border-black/10 dark:border-white/10 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40">
                  Total Referral Bonus
                </span>
                <div className="p-1.5 rounded-lg bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 text-[#1F7A1F] dark:text-[#55f761]">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-[#0D1B2A] dark:text-white">
                ₱
                {summary.totalEarned.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>

            {/* Current Cutoff */}
            <div className="bg-white dark:bg-[#0D1B2A] border border-black/10 dark:border-white/10 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40 truncate">
                    {summary.currentCutoffName
                      ? summary.currentCutoffName.replace(/cutoff/i, "").trim()
                      : "Current Cutoff"}
                  </span>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold shrink-0">
                    Monthly (15th)
                  </span>
                </div>
                <div className="text-2xl font-black text-blue-600 dark:text-blue-400">
                  ₱
                  {summary.currentCutoffEarned.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
              {summary.nextCutoffName && (
                <div className="text-[10px] text-[#2F3E46]/60 dark:text-white/40 mt-1">
                  Next claim:{" "}
                  <span className="font-semibold text-[#0D1B2A] dark:text-white">
                    {summary.nextCutoffName.replace(/cutoff/i, "").trim()}
                  </span>
                </div>
              )}
            </div>

            {/* Recruits Count */}
            <div className="bg-white dark:bg-[#0D1B2A] border border-black/10 dark:border-white/10 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40">
                    Earning Recruits
                  </span>
                  <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-[#0D1B2A] dark:text-white">
                  {summary.totalRecruitsCount}
                </div>
              </div>
              {summary.lifetimeRecruitsCount !== undefined && summary.lifetimeRecruitsCount > 0 && (
                <div className="text-[10px] text-[#2F3E46]/60 dark:text-white/40 mt-1">
                  Total network:{" "}
                  <span className="font-semibold text-[#0D1B2A] dark:text-white">
                    {summary.lifetimeRecruitsCount} registered
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="bg-white/50 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Sort: Highest to Lowest Toggle */}
              <button
                onClick={() => {
                  setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
                  setPage(1);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl text-xs font-bold text-[#0D1B2A] dark:text-white hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
                title="Toggle sort order"
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-[#1F7A1F] dark:text-[#55f761]" />
                <span>{sortOrder === "desc" ? "Highest to Lowest" : "Lowest to Highest"}</span>
              </button>

              {/* Cutoff Filter */}
              <div className="relative">
                <button
                  onClick={() => setIsCutoffDropdownOpen(!isCutoffDropdownOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl text-xs font-bold text-[#0D1B2A] dark:text-white cursor-pointer"
                >
                  <span className="text-[#2F3E46]/60 dark:text-white/40">Cutoff:</span>
                  <span>{selectedCutoff}</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {isCutoffDropdownOpen && (
                  <div className="absolute left-0 mt-2 z-30 w-52 bg-white dark:bg-[#0D1B2A] border border-black/10 dark:border-white/10 rounded-2xl shadow-xl py-1.5 max-h-56 overflow-y-auto">
                    {availableCutoffs.map((cutoff) => (
                      <button
                        key={cutoff}
                        onClick={() => {
                          setSelectedCutoff(cutoff);
                          setIsCutoffDropdownOpen(false);
                          setPage(1);
                        }}
                        className={`w-full text-left px-3.5 py-1.5 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer ${
                          selectedCutoff === cutoff
                            ? "text-[#1F7A1F] dark:text-[#55f761] font-bold"
                            : "text-[#2F3E46] dark:text-white/80"
                        }`}
                      >
                        {cutoff}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Search */}
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#2F3E46]/50 dark:text-white/40" />
              <input
                type="text"
                placeholder="Search members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] text-[#0D1B2A] dark:text-white placeholder:text-[#2F3E46]/40 dark:placeholder:text-white/40"
              />
            </div>
          </div>

          {/* Recruits Table */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <div className="w-7 h-7 border-3 border-[#1F7A1F] border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs text-[#2F3E46]/60 dark:text-white/50">Loading...</p>
            </div>
          ) : bonuses.length === 0 ? (
            <div className="bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl p-8 text-center backdrop-blur-md">
              <Users className="w-10 h-10 mx-auto text-black/20 dark:text-white/20 mb-2" />
              <p className="text-sm font-semibold text-[#0D1B2A] dark:text-white">
                No recruit records found
              </p>
              <p className="text-xs text-[#2F3E46]/60 dark:text-white/40 mt-1">
                Recruits and their generated bonuses for this cutoff will appear here.
              </p>
            </div>
          ) : (
            <div className="relative z-10 bg-white dark:bg-[#121B22] border border-black/10 dark:border-white/10 rounded-2xl overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-black/5 dark:bg-white/5 uppercase font-bold text-[#2F3E46]/70 dark:text-white/60 border-b border-black/10 dark:border-white/10 whitespace-nowrap text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Member</th>
                      <th
                        onClick={() => {
                          setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
                          setPage(1);
                        }}
                        className="px-4 py-3 text-right cursor-pointer select-none hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-colors"
                      >
                        <div className="inline-flex items-center gap-1 font-bold">
                          <span>Referral Share</span>
                          <ArrowUpDown className="w-3 h-3 text-[#1F7A1F] dark:text-[#55f761]" />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 dark:divide-white/5 whitespace-nowrap">
                    {bonuses.map((item) => (
                      <tr key={item.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                        {/* Combined Member: Name, Username (no @), Email */}
                        <td className="px-4 py-3">
                          <div className="font-semibold text-xs text-[#0D1B2A] dark:text-white">
                            {item.recruit?.name || (item.recruit?.username ? item.recruit.username.replace(/^@/, "") : "Unknown")}
                          </div>
                          <div className="text-[10px] text-[#2F3E46]/60 dark:text-white/40 flex items-center gap-1.5 flex-wrap mt-0.5">
                            {item.recruit?.username && (
                              <span className="font-medium text-[#1F7A1F] dark:text-[#55f761]">
                                {item.recruit.username.replace(/^@/, "")}
                              </span>
                            )}
                            {item.recruit?.username && item.recruit?.email && <span>•</span>}
                            {item.recruit?.email && <span>{item.recruit.email}</span>}
                          </div>
                        </td>

                        {/* Referral Share */}
                        <td className="px-4 py-3 text-right font-black text-sm text-[#1F7A1F] dark:text-[#55f761]">
                          ₱
                          {item.amount.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-black/10 dark:border-white/10 flex items-center justify-between bg-black/5 dark:bg-white/5">
                  <span className="text-xs font-medium text-[#2F3E46]/70 dark:text-white/60">
                    Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, totalItems)} of {totalItems} entries
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1 || isLoading}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-black/10 dark:border-white/10 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-[#0D1B2A] dark:text-white cursor-pointer"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages || isLoading}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-black/10 dark:border-white/10 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-[#0D1B2A] dark:text-white cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
