"use client";

import { Gem, Coins, ArrowDownToLine } from "lucide-react";

// TODO: hardcoded placeholder values — wire up to server/DB once XGP backend is implemented.
const XGP_MONTHLY_POOL = 10000;
const XGP_BALANCE = 455;
const XGP_MIN_WITHDRAW = 1500;

export default function XfniteGPPage() {
  const canWithdraw = XGP_BALANCE >= XGP_MIN_WITHDRAW;

  return (
    <div className="space-y-6 lg:space-y-10">
      {/* XGP Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Monthly Pool Card */}
        <div className="bg-gradient-to-br from-[#1F7A1F]/10 to-[#1F7A1F]/5 dark:from-[#55f761]/5 dark:to-transparent border border-[#1F7A1F]/20 dark:border-[#55f761]/10 rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 rounded-full blur-2xl -translate-y-12 translate-x-12"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-xs font-bold text-[#1F7A1F] dark:text-[#55f761] uppercase tracking-wider mb-4">
              <Gem className="w-4 h-4" />
              <span>XGP Monthly Pool</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl lg:text-5xl font-black text-[#0D1B2A] dark:text-white tracking-tighter">
                {XGP_MONTHLY_POOL.toLocaleString()}
              </span>
              <span className="text-sm font-bold text-[#1F7A1F] dark:text-[#55f761]">XGP</span>
            </div>
          </div>
        </div>

        {/* Balance Card */}
        <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 rounded-full blur-2xl -translate-y-12 translate-x-12"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-xs font-bold text-[#2F3E46] dark:text-white/60 uppercase tracking-wider mb-4">
              <Coins className="w-4 h-4 text-[#1F7A1F] dark:text-[#55f761]" />
              <span>Your XGP Balance</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl lg:text-5xl font-black text-[#0D1B2A] dark:text-white tracking-tighter">
                {XGP_BALANCE.toLocaleString()}
              </span>
              <span className="text-sm font-bold text-[#1F7A1F] dark:text-[#55f761]">XGP</span>
            </div>
          </div>
        </div>
      </div>

      {/* Withdraw Section */}
      <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 rounded-full blur-2xl -translate-y-12 translate-x-12"></div>
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-[#0D1B2A] dark:text-white mb-1">Withdraw XGP</h3>
            <p className="text-xs text-[#2F3E46] dark:text-white/50">
              Minimum withdrawal: <span className="font-bold text-[#1F7A1F] dark:text-[#55f761]">{XGP_MIN_WITHDRAW.toLocaleString()} XGP</span>
            </p>
          </div>
          <button
            type="button"
            disabled={!canWithdraw}
            className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 shrink-0 ${
              canWithdraw
                ? "bg-[#1F7A1F] hover:bg-[#1a6b1a] dark:bg-[#55f761] dark:hover:bg-[#4ee057] text-white dark:text-[#060D14] shadow-md shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20"
                : "bg-black/10 dark:bg-white/10 text-[#2F3E46]/40 dark:text-white/30 cursor-not-allowed"
            }`}
          >
            <ArrowDownToLine className="w-4 h-4" />
            Withdraw XGP
          </button>
        </div>
      </div>
    </div>
  );
}
