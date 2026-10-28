"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Mail, Calendar, Users, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

interface Recruiter {
    email: string;
    name: string | null;
    username?: string | null;
    code: string;
    howManyUse: number;
    createdAt: Date;
}

interface RecruiteTableProps {
    recruiters: Recruiter[];
}

function RecruiterRow({ recruiter }: { recruiter: Recruiter }) {
    const getInitials = (name: string | null, fallback: string) => {
        if (!name) return fallback.substring(0, 2).toUpperCase();
        return name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
    };

    return (
        <tr className="hover:bg-black/[0.02] dark:hover:bg-white/5 transition-colors group">
            {/* Profile */}
            <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#1F7A1F]/15 dark:bg-[#55f761]/15 text-[#1F7A1F] dark:text-[#55f761] flex items-center justify-center font-bold tracking-wider select-none shrink-0 group-hover:scale-105 transition-transform">
                        {getInitials(recruiter.name, recruiter.username || recruiter.email)}
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="font-bold text-[#0D1B2A] dark:text-white truncate">
                            {recruiter.name || recruiter.username || "Unnamed Mentor"}
                        </span>
                        <span className="text-xs text-[#2F3E46]/60 dark:text-white/40 truncate flex items-center gap-1">
                            <Mail className="w-3 h-3 shrink-0" />
                            {recruiter.email}
                        </span>
                    </div>
                </div>
            </td>

            {/* Uses */}
            <td className="px-6 py-4 whitespace-nowrap text-[#2F3E46] dark:text-white/80 font-bold">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs">
                    <Users className="w-3.5 h-3.5" />
                    {recruiter.howManyUse} apprentices
                </span>
            </td>

            {/* Created At */}
            <td className="px-6 py-4 whitespace-nowrap text-[#2F3E46]/60 dark:text-white/40">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <Calendar className="w-3.5 h-3.5 text-[#2F3E46]/40 dark:text-white/30" />
                    {recruiter.createdAt.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                    })}
                </div>
            </td>
        </tr>
    );
}

export default function RecruiteTable({ recruiters }: RecruiteTableProps) {
    const [sortField, setSortField] = useState<"name" | "uses" | "createdAt">("uses");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    const [visibleCount, setVisibleCount] = useState(20);
    const observerTarget = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setVisibleCount(20);
    }, [recruiters]);

    useEffect(() => {
        const target = observerTarget.current;
        if (!target) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleCount((prev) => Math.min(prev + 20, recruiters.length));
                }
            },
            { threshold: 0.1, rootMargin: "150px" }
        );

        observer.observe(target);
        return () => {
            if (target) observer.unobserve(target);
        };
    }, [recruiters.length]);

    const handleSort = (field: "name" | "uses" | "createdAt") => {
        if (sortField === field) {
            setSortOrder(sortOrder === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortOrder("desc");
        }
    };

    const sortedRecruiters = useMemo(() => {
        return [...recruiters].sort((a, b) => {
            if (sortField === "name") {
                const nameA = a.name || a.username || a.email;
                const nameB = b.name || b.username || b.email;
                const comparison = nameA.localeCompare(nameB);
                return sortOrder === "asc" ? comparison : -comparison;
            } else if (sortField === "uses") {
                const comparison = a.howManyUse - b.howManyUse;
                return sortOrder === "asc" ? comparison : -comparison;
            } else {
                const comparison = a.createdAt.getTime() - b.createdAt.getTime();
                return sortOrder === "asc" ? comparison : -comparison;
            }
        });
    }, [recruiters, sortField, sortOrder]);

    return (
        <div className="w-full">
            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                    <thead>
                        <tr className="border-b border-black/10 dark:border-white/10 text-xs font-bold uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40 bg-black/[0.02] dark:bg-white/[0.02]">
                            <th 
                                className="px-6 py-4 cursor-pointer select-none group/col"
                                onClick={() => handleSort("name")}
                            >
                                <div className="flex items-center gap-1.5 hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-colors">
                                    <span>Mentor Profile</span>
                                    {sortField === "name" ? (
                                        sortOrder === "asc" ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                                    ) : (
                                        <ArrowUpDown className="w-3.5 h-3.5 opacity-0 group-hover/col:opacity-70 transition-opacity" />
                                    )}
                                </div>
                            </th>
                            <th 
                                className="px-6 py-4 cursor-pointer select-none group/col"
                                onClick={() => handleSort("uses")}
                            >
                                <div className="flex items-center gap-1.5 hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-colors">
                                    <span>Total Uses</span>
                                    {sortField === "uses" ? (
                                        sortOrder === "asc" ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                                    ) : (
                                        <ArrowUpDown className="w-3.5 h-3.5 opacity-0 group-hover/col:opacity-70 transition-opacity" />
                                    )}
                                </div>
                            </th>
                            <th 
                                className="px-6 py-4 cursor-pointer select-none group/col"
                                onClick={() => handleSort("createdAt")}
                            >
                                <div className="flex items-center gap-1.5 hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-colors">
                                    <span>Date Created</span>
                                    {sortField === "createdAt" ? (
                                        sortOrder === "asc" ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                                    ) : (
                                        <ArrowUpDown className="w-3.5 h-3.5 opacity-0 group-hover/col:opacity-70 transition-opacity" />
                                    )}
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10 dark:divide-white/10 text-sm">
                        {sortedRecruiters.slice(0, visibleCount).map((recruiter) => (
                            <RecruiterRow key={recruiter.email} recruiter={recruiter} />
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Scroll Render Target */}
            {sortedRecruiters.length > visibleCount && (
                <div ref={observerTarget} className="h-14 flex items-center justify-center py-6 text-xs text-[#2F3E46]/50 dark:text-white/30 border-t border-black/10 dark:border-white/10">
                    <div className="w-4 h-4 border-2 border-[#1F7A1F] dark:border-[#55f761] border-t-transparent rounded-full animate-spin mr-2" />
                    Loading more mentors...
                </div>
            )}
        </div>
    );
}
