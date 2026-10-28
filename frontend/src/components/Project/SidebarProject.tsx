"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { getProjectRulesStatus } from "@/app/actions/project";

export default function SidebarProject() {
    const searchParams = useSearchParams();
    const currentTab = searchParams.get("tab") || "active";

    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [isRulesCompleted, setIsRulesCompleted] = useState<boolean | null>(null);

    useEffect(() => {
        getProjectRulesStatus().then((res) => {
            setIsRulesCompleted(res.accepted);
        });
    }, [searchParams]);

    const isTabActive = (tabId: string) => {
        return currentTab === tabId;
    };

    const navItems = [
        {
            id: "active",
            label: "Active Projects",
            href: "/project?tab=active",
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="9" />
                    <rect x="14" y="3" width="7" height="5" />
                    <rect x="14" y="12" width="7" height="9" />
                    <rect x="3" y="16" width="7" height="5" />
                </svg>
            ),
        }
    ];

    if (isRulesCompleted) {
        navItems.push(
            {
                id: "performance",
                label: "Performance Query",
                href: "/project?tab=performance",
                icon: (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                ),
            },
            {
                id: "summary",
                label: "Overall Task Summary",
                href: "/project?tab=summary",
                icon: (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="8" y1="6" x2="21" y2="6" />
                        <line x1="8" y1="12" x2="21" y2="12" />
                        <line x1="8" y1="18" x2="21" y2="18" />
                        <line x1="3" y1="6" x2="3.01" y2="6" />
                        <line x1="3" y1="12" x2="3.01" y2="12" />
                        <line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                ),
            },
            {
                id: "rules",
                label: "Rules and Guidelines",
                href: "/project?tab=rules",
                icon: (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                ),
            }
        );
    }

    return (
        <>
            {/* Mobile Menu Toggle Button */}
            {!isMobileOpen && (
                <button
                    onClick={() => setIsMobileOpen(true)}
                    className="lg:hidden fixed top-20 left-4 z-50 bg-white/90 dark:bg-[#0D1B2A]/90 backdrop-blur-xl text-black/60 dark:text-white/60 hover:text-[#1F7A1F] dark:hover:text-[#55f761] p-2 rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center border border-black/10 dark:border-white/10"
                    aria-label="Open Project Menu"
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
                                    XNITE PROJECT
                                </span>
                            </div>
                            <button
                                onClick={() => setIsMobileOpen(false)}
                                className="p-1 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                aria-label="Close Project Menu"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Navigation List */}
                        <nav className="flex-1 space-y-1.5">
                            {navItems.map((item) => {
                                const active = isTabActive(item.id);

                                return (
                                    <Link
                                        key={item.id}
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
                                XNITE PROJECT
                            </span>
                        </div>
                    </div>

                    {/* Navigation List */}
                    <nav className="flex-1 space-y-1.5">
                        {navItems.map((item) => {
                            const active = isTabActive(item.id);

                            return (
                                <Link
                                    key={item.id}
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
