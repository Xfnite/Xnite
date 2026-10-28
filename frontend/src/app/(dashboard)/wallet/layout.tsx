"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Wallet, Lock, Trophy, Gem, Users } from "lucide-react";
import { getSessionUser } from "@/app/actions/auth";
import { isGamificationPreviewVisible } from "@/config/permissions";

export default function EarningsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [stakedBalance, setStakedBalance] = useState<number>(50000.0);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTeamManager, setIsTeamManager] = useState(false);
  const [userRole, setUserRole] = useState("");

  const tabs = [
    { name: "Overview", href: "/wallet", exact: true },
    { name: "Payment Method", href: "/wallet/payment-method", exact: false },
  ];

  // Load from local storage on mount to persist earnings across refreshes
  useEffect(() => {
    const savedStaked = localStorage.getItem("xfnite_stakedBalance_v3");
    if (savedStaked) setStakedBalance(parseFloat(savedStaked));

    getSessionUser().then((user) => {
      const role = user?.role?.toLowerCase() || "";
      setUserRole(role);
      if (role === "admin") {
        setIsAdmin(true);
      }
      if (["admin", "judger", "checker", "recruiter"].includes(role)) {
        setIsTeamManager(true);
      }
    }).catch(console.error);
  }, []);

  const isTabActive = (href: string) => {
    if (href === "/wallet") {
      return pathname === "/wallet" || pathname.startsWith("/wallet/payment-method");
    }
    return pathname.startsWith(href);
  };

  const navItems = [
    {
      label: "Wallet",
      href: "/wallet",
      icon: <Wallet className="w-[18px] h-[18px]" />,
    },
    {
      label: "Loyalty Points",
      href: "/wallet/loyalty-points",
      icon: <Trophy className="w-[18px] h-[18px]" />,
    },
    // Xfnite GP is unreleased — admin-only until it goes public.
    ...(isGamificationPreviewVisible(userRole) ? [{
      label: "Xfnite GP",
      href: "/wallet/xgp",
      icon: <Gem className="w-[18px] h-[18px]" />,
    }] : []),
    ...(isTeamManager ? [{
      label: "Team Payout",
      href: "/wallet/team",
      icon: <Users className="w-[18px] h-[18px]" />,
    }] : []),
    ...(isAdmin ? [{
      label: "Restrict",
      href: "/wallet/restrict",
      icon: <Lock className="w-[18px] h-[18px]" />,
    }] : [])
  ];

  return (
    <div className="flex gap-6 h-full w-full overflow-hidden relative">
      {/* Custom Style for Breathing Animation */}
      <style>{`
        @keyframes breathing {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(139, 92, 246, 0);
          }
          50% {
            transform: scale(1.04);
            box-shadow: 0 0 16px 3px rgba(139, 92, 246, 0.25);
          }
        }
        .animate-breathing {
          animation: breathing 2.5s ease-in-out infinite;
        }
      `}</style>

      {/* Mesh Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div
          className="absolute bg-[#55f761] filter blur-[100px] rounded-full opacity-30 dark:opacity-15"
          style={{ width: "40vw", height: "40vw", top: "-10%", left: "-10%" }}
        ></div>
        <div
          className="absolute bg-[#1F7A1F] filter blur-[100px] rounded-full opacity-30 dark:opacity-15"
          style={{ width: "50vw", height: "50vw", top: "40%", right: "-20%" }}
        ></div>
      </div>

      {/* Mobile Menu Toggle Button */}
      {!isMobileOpen && (
        <button
          onClick={() => setIsMobileOpen(true)}
          className="lg:hidden fixed top-20 left-4 z-50 bg-white/90 dark:bg-[#0D1B2A]/90 backdrop-blur-xl text-black/60 dark:text-white/60 hover:text-[#1F7A1F] dark:hover:text-[#55f761] p-2 rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center border border-black/10 dark:border-white/10"
          aria-label="Open Wallet Menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      {/* Mobile Drawer */}
      {isMobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity animate-in fade-in duration-200"
            onClick={() => setIsMobileOpen(false)}
          />
          {/* Drawer Panel */}
          <aside className="lg:hidden fixed inset-y-0 left-0 w-64 bg-white/60 dark:bg-black/40 backdrop-blur-xl border-r border-black/10 dark:border-white/10 z-45 shadow-2xl flex flex-col p-4 animate-in slide-in-from-left duration-250">
            {/* Header Block */}
            <div className="px-2 pt-2 pb-4 mb-4 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#1F7A1F] dark:text-[#55f761]">
                  XNITE WALLET
                </span>
              </div>
              <button
                onClick={() => setIsMobileOpen(false)}
                className="p-1 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Close Wallet Menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation List */}
            <nav className="flex-1 space-y-1.5">
              {navItems.map((item) => {
                const active = isTabActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${active
                      ? "bg-[#1F7A1F] text-white dark:bg-[#55f761] dark:text-[#060D14] shadow-md shadow-[#1F7A1F]/10 dark:shadow-[#55f761]/10"
                      : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-black dark:hover:text-white"
                      }`}
                  >
                    <span className={`shrink-0 ${active ? "text-white dark:text-[#060D14]" : "text-gray-500 dark:text-gray-400"}`}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        </>
      )}

      {/* Desktop Sidebar */}
      <aside className="w-64 shrink-0 hidden lg:flex flex-col h-full z-10">
        <div className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm flex flex-col h-full p-4">
          {/* Header Block */}
          <div className="px-2 pt-2 pb-4 mb-4 border-b border-black/5 dark:border-white/5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-[#1F7A1F] dark:text-[#55f761]">
                XFNITE WALLET
              </span>
            </div>
          </div>

          {/* Navigation List */}
          <nav className="flex-1 space-y-1.5">
            {navItems.map((item) => {
              const active = isTabActive(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${active
                    ? "bg-[#1F7A1F] text-white dark:bg-[#55f761] dark:text-[#060D14] shadow-md shadow-[#1F7A1F]/10 dark:shadow-[#55f761]/10"
                    : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-black dark:hover:text-white"
                    }`}
                >
                  <span className={`shrink-0 ${active ? "text-white dark:text-[#060D14]" : "text-gray-500 dark:text-gray-400"}`}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto pr-1 z-10">
        <div className="space-y-6 lg:space-y-10 w-full max-w-[1400px] mx-auto pt-4 pb-12">
          <section>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#0D1B2A] dark:text-white mb-1">
              {pathname.startsWith("/wallet/loyalty-points")
                ? "Loyalty Points"
                : pathname.startsWith("/wallet/xgp")
                ? "Xfnite GP"
                : pathname.startsWith("/wallet/restrict")
                ? "Restrict"
                : "Earnings & Payments"}
            </h1>
            <p className="text-sm text-[#2F3E46] dark:text-white/60">
              {pathname.startsWith("/wallet/loyalty-points")
                ? "Earn LXP through daily quests and track your rewards history."
                : pathname.startsWith("/wallet/xgp")
                ? "Track the monthly XGP pool and manage your withdrawable balance."
                : pathname.startsWith("/wallet/restrict")
                ? "Manage user restriction settings and security controls."
                : "Manage your payout methods and view your income history."}
            </p>
          </section>

          <section className="w-full space-y-6 lg:space-y-10">
            <div className="relative bg-white dark:bg-[#0D1B2A] border border-black/10 dark:border-white/10 rounded-tr-3xl rounded-bl-3xl shadow-xl overflow-hidden transition-colors duration-300">
              {/* Localized Green Mesh Background */}
              <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute bg-[#1F7A1F] filter blur-[80px] rounded-full opacity-10 dark:opacity-10" style={{ width: "300px", height: "300px", top: "-50px", right: "-50px" }}></div>
                <div className="absolute bg-[#55f761] filter blur-[80px] rounded-full opacity-5 dark:opacity-5" style={{ width: "250px", height: "250px", bottom: "-50px", left: "-50px" }}></div>
              </div>

              {/* Tabs */}
              {(pathname === "/wallet" || pathname.startsWith("/wallet/payment-method")) && (
                <div className="relative z-10 p-6 lg:px-8 lg:pt-8 pb-0 border-b border-black/10 dark:border-white/10">
                  <div className="flex gap-2 mb-6 overflow-x-auto hide-scrollbar">
                    {tabs.map((tab) => {
                      const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
                      return (
                        <Link
                          key={tab.href}
                          href={tab.href}
                          id={tab.name === "Payment Method" ? "wallet-tour-payment-tab" : undefined}
                          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-full transition-all duration-300 ${isActive
                            ? "bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] shadow-md shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20"
                            : "bg-black/5 dark:bg-white/5 text-[#2F3E46] dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                            }`}
                        >
                          {tab.name}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="relative z-10 p-6 lg:p-8">
                {children}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
