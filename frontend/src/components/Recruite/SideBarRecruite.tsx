"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { getSessionUser } from "@/app/actions/auth";
import { getInnerCouncilAccessAction } from "@/app/actions/user";
import { GATES, canEarnInnerCouncil } from "@/config/permissions";

export default function SidebarRecruite() {
    const pathname = usePathname();
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [userRole, setUserRole] = useState<string>("");
    const [hasInnerCouncilAccess, setHasInnerCouncilAccess] = useState(false);

    useEffect(() => {
        getSessionUser().then((user) => {
            if (user) {
                setUserRole(user.role || "");
                if (canEarnInnerCouncil(user.role || "")) {
                    getInnerCouncilAccessAction()
                        .then((res) => setHasInnerCouncilAccess(res.hasAccess))
                        .catch(() => setHasInnerCouncilAccess(false));
                }
            }
        });
    }, []);

    const isTabActive = (href: string) => {
        if (href === "/recruiter/applicants") return pathname === "/recruiter" || pathname === "/recruiter/applicants";
        return pathname.startsWith(href);
    };

    const ctx = { role: userRole, hasInnerCouncilAccess };
    const navItems = [];

    // Top Recruiters (admin, judger, checker, recruiter)
    if (GATES.canAccessRoute("/recruiter/ranking", ctx)) {
        navItems.push({
            label: "Top Mentors",
            href: "/recruiter/ranking",
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="7" />
                    <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
                </svg>
            ),
        });
    }

    // All Applicants (admin, judger, checker, recruiter)
    if (GATES.canAccessRoute("/recruiter/applicants", ctx)) {
        navItems.push({
            label: "All Challengers",
            href: "/recruiter/applicants",
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
            ),
        });
    }

    // My Own Recruits (admin, judger, checker, recruiter)
    if (GATES.canAccessRoute("/recruiter/recruits", ctx)) {
        navItems.push({
            label: "Apprentices",
            href: "/recruiter/recruits",
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <polyline points="16 11 18 13 22 9" />
                </svg>
            ),
        });
    }

    // My Own GS (admin, judger, checker only)
    if (GATES.canAccessRoute("/recruiter/group", ctx)) {
        navItems.push({
            label: "Guild Structure",
            href: "/recruiter/group",
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
            ),
        });
    }

    // Activate Users (admin, judger, checker, recruiter)
    if (GATES.canAccessRoute("/recruiter/activate", ctx)) {
        navItems.push({
            label: "Activate Users",
            href: "/recruiter/activate",
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <polyline points="16 11 18 13 22 9" />
                </svg>
            ),
        });
    }

    return (
        <>
            {/* Mobile Menu Toggle Button */}
            {!isMobileOpen && (
                <button
                    onClick={() => setIsMobileOpen(true)}
                    className="lg:hidden fixed top-20 left-4 z-50 bg-white/90 dark:bg-[#0D1B2A]/90 backdrop-blur-xl text-black/60 dark:text-white/60 hover:text-[#1F7A1F] dark:hover:text-[#55f761] p-2 rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center border border-black/10 dark:border-white/10"
                    aria-label="Open Mentor Menu"
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
                                    XNITE MENTOR
                                </span>
                            </div>
                            <button
                                onClick={() => setIsMobileOpen(false)}
                                className="p-1 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                aria-label="Close Mentor Menu"
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
            <aside className="w-64 shrink-0 hidden lg:flex flex-col h-full">
                <div className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm flex flex-col h-full p-4">

                    {/* Header Block */}
                    <div className="px-2 pt-2 pb-4 mb-4 border-b border-black/5 dark:border-white/5">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-black uppercase tracking-wider text-[#1F7A1F] dark:text-[#55f761]">
                                XNITE MENTOR
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
        </>
    );
}
