/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { getSessionUser } from "@/app/actions/auth";
import { getReferralsAction, getPaginatedUsersAction, getFilteredUsersForExportAction, getGroupsListAction } from "@/app/actions/referrals";
import UserTable from "@/components/Recruite/UserTable";
import { getGamifiedRoleLabel } from "@/config/permissions";
import TableSkeleton from "@/components/Recruite/TableSkeleton";
import { getOnboardingStatus, getOnboardingStatusText } from "@/components/Onboarding/onboardingStatus";
import Pagination from "@/components/ui/Pagination";
import DateRangePicker from "@/components/ui/DateRangePicker";

import {
    Search,
    Users,
    UserCheck,
    Award,
    BookOpen,
    Filter,
    Calendar,
    Sparkles,
    Mail,
    Clock,
    ShieldCheck,
    UserX,
    Plus,
    X,
    ChevronDown,
    Check,
    Download
} from "lucide-react";

interface SystemUser {
    id: string;
    name: string;
    email: string;
    status: string;
    createdAt: Date;
    isRegistered: boolean;
    hasCompletedPreCourse: boolean;
    isDashboardCompleted: boolean;
    lastLogin: Date | null;
    refererEmail: string | null;
    labelerRefererEmail?: string | null;
    labelerRefererName?: string | null;
    onboardingProgress: any;
    isRulesAndGuidelinesCompleted: boolean;
    onRulesAndGuidelinesProgress: any;
    facebook?: string | null;
    gingerUsername?: string | null;
    trainings?: any[];
    referer?: {
        name: string;
        email: string;
    } | null;
    groupOrTeamName?: string | null;
}

interface Recruiter {
    email: string;
    name: string | null;
    username?: string | null;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

// The picked Date Started days as exact ISO times in this browser's timezone, so a picked
// "Oct 21" means the viewer's Oct 21. Only a start date means that one day; only an end
// date means everything up to it (same as the Guild Structure page).
function customDateRange(start: string, end: string): { createdFrom?: string; createdTo?: string } {
    const at = (key: string, endOfDay: boolean) => {
        const [y, m, d] = key.split("-").map(Number);
        return (endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d)).toISOString();
    };
    if (start && end) {
        const [first, last] = start <= end ? [start, end] : [end, start];
        return { createdFrom: at(first, false), createdTo: at(last, true) };
    }
    if (start) return { createdFrom: at(start, false), createdTo: at(start, true) };
    if (end) return { createdTo: at(end, true) };
    return {};
}

interface GroupOption {
    groupId: number;
    groupName: string;
}

function RecruiterDashboardContent() {
    const searchParams = useSearchParams();
    const pathname = usePathname();

    const isDev = process.env.NEXT_PUBLIC_APP_ENV === "development" || (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_APP_ENV !== "production");

    const [currentUser, setCurrentUser] = useState<any>(null);
    const [allUsers, setAllUsers] = useState<SystemUser[]>([]);
    const [totalUsers, setTotalUsers] = useState<number>(0);
    const [totalOnboarding, setTotalOnboarding] = useState<number>(0);
    const [totalRules, setTotalRules] = useState<number>(0);
    const [totalDeactivated, setTotalDeactivated] = useState<number>(0);
    const [totalActive, setTotalActive] = useState<number>(0);
    const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
    const [groups, setGroups] = useState<GroupOption[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [isExporting, setIsExporting] = useState(false);

    // Filter & Search State
    const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") || "");
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>(() => {
        const statusParam = searchParams.get("status");
        if (!statusParam) return [];
        const validStatuses = ["onboarding", "rules", "landcover_passed", "3d_passed", "transpo_passed", "roof_passed"];
        return statusParam.split(",").filter((s) => validStatuses.includes(s));
    });
    const [selectedRecruiters, setSelectedRecruiters] = useState<string[]>(() => {
        const recParam = searchParams.get("recruiters");
        if (!recParam) return [];
        return recParam.split(",");
    });
    const [selectedGroups, setSelectedGroups] = useState<number[]>(() => {
        const groupsParam = searchParams.get("groups");
        if (!groupsParam) return [];
        return groupsParam.split(",").map((g) => Number(g)).filter((g) => !isNaN(g));
    });
    const [dateFilter, setDateFilter] = useState<"all" | "today" | "yesterday" | "week" | "month" | "three_months" | "custom">((() => {
        const dateParam = searchParams.get("date");
        const validDates = ["today", "yesterday", "week", "month", "three_months", "custom"];
        if (dateParam && validDates.includes(dateParam)) {
            return dateParam as any;
        }
        return "all";
    })());
    // Date Started range ("YYYY-MM-DD"), used when dateFilter is "custom"
    const [customStartDate, setCustomStartDate] = useState(() => DATE_KEY.test(searchParams.get("from") || "") ? searchParams.get("from")! : "");
    const [customEndDate, setCustomEndDate] = useState(() => DATE_KEY.test(searchParams.get("to") || "") ? searchParams.get("to")! : "");
    const [recruiterSearch, setRecruiterSearch] = useState("");
    const [groupSearch, setGroupSearch] = useState("");
    const [selectedRoles, setSelectedRoles] = useState<string[]>(
        searchParams.get("roles") ? searchParams.get("roles")!.split(",") : []
    );
    const [missingQrCode, setMissingQrCode] = useState<boolean>(
        searchParams.get("noqr") === "true"
    );
    const [hasPaymentDetails, setHasPaymentDetails] = useState<boolean>(
        searchParams.get("hasPayment") === "true"
    );
    const [selectedUserStatuses, setSelectedUserStatuses] = useState<string[]>(() => {
        const userStatusParam = searchParams.get("userStatus");
        if (!userStatusParam) return [];
        const validUserStatuses = ["Active", "Deactivated"];
        return userStatusParam.split(",").filter((s) => validUserStatuses.includes(s));
    });

    // Sync states to URL params
    useEffect(() => {
        const params = new URLSearchParams();
        if (searchQuery) params.set("q", searchQuery);
        if (selectedStatuses.length > 0) params.set("status", selectedStatuses.join(","));
        if (selectedRecruiters.length > 0) params.set("recruiters", selectedRecruiters.join(","));
        if (selectedGroups.length > 0) params.set("groups", selectedGroups.join(","));
        if (dateFilter !== "all") params.set("date", dateFilter);
        if (dateFilter === "custom" && customStartDate) params.set("from", customStartDate);
        if (dateFilter === "custom" && customEndDate) params.set("to", customEndDate);
        if (selectedRoles.length > 0) params.set("roles", selectedRoles.join(","));
        if (missingQrCode) params.set("noqr", "true");
        if (hasPaymentDetails) params.set("hasPayment", "true");
        if (selectedUserStatuses.length > 0) params.set("userStatus", selectedUserStatuses.join(","));

        const newQuery = params.toString();
        const suffix = newQuery ? `?${newQuery}` : "";
        window.history.replaceState(null, "", `${pathname}${suffix}`);
    }, [searchQuery, selectedStatuses, selectedRecruiters, selectedGroups, dateFilter, customStartDate, customEndDate, selectedRoles, missingQrCode, hasPaymentDetails, selectedUserStatuses, pathname]);

    const toggleStatusFilter = (status: string) => {
        setSelectedStatuses((prev) =>
            prev.includes(status)
                ? prev.filter((s) => s !== status)
                : [...prev, status]
        );
    };

    const toggleRecruiterFilter = (email: string) => {
        setSelectedRecruiters((prev) =>
            prev.includes(email)
                ? prev.filter((e) => e !== email)
                : [...prev, email]
        );
    };

    const toggleGroupFilter = (groupId: number) => {
        setSelectedGroups((prev) =>
            prev.includes(groupId)
                ? prev.filter((g) => g !== groupId)
                : [...prev, groupId]
        );
    };

    const toggleRoleFilter = (role: string) => {
        setSelectedRoles((prev) =>
            prev.includes(role)
                ? prev.filter((r) => r !== role)
                : [...prev, role]
        );
    };

    const selectDatePreset = (preset: "today" | "yesterday" | "week" | "month" | "three_months") => {
        setDateFilter(dateFilter === preset ? "all" : preset);
        setCustomStartDate("");
        setCustomEndDate("");
    };

    const clearDateFilter = () => {
        setDateFilter("all");
        setCustomStartDate("");
        setCustomEndDate("");
    };

    const toggleUserStatusFilter = (status: string) => {
        setSelectedUserStatuses((prev) =>
            prev.includes(status)
                ? prev.filter((s) => s !== status)
                : [...prev, status]
        );
    };

    // Filter Dropdown popover state
    const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Click outside listener for the popover
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsFilterDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const loadData = async (currentPage = 1) => {
        setIsLoading(true);

        try {
            const session = await getSessionUser();
            if (!session) {
                toast.error("Failed to load user session.");
                setIsLoading(false);
                return;
            }
            const role = session.role?.toLowerCase();
            if (role !== "admin" && role !== "judger" && role !== "checker" && role !== "recruiter") {
                toast.error("Unauthorized access.");
                window.location.href = "/recruiter/recruits";
                return;
            }
            setCurrentUser(session);

            // Fetch all recruiters (only on initial load)
            if (recruiters.length === 0) {
                const recruitersRes = await getReferralsAction();
                if (recruitersRes.success && recruitersRes.data) {
                    setRecruiters(recruitersRes.data);
                }
            }

            // Fetch all groups (only on initial load)
            if (groups.length === 0) {
                const groupsRes = await getGroupsListAction();
                if (groupsRes.success && groupsRes.data) {
                    setGroups(groupsRes.data);
                }
            }

            // Fetch paginated users using DB filtering
            const usersRes = await getPaginatedUsersAction({
                page: currentPage,
                limit: 50,
                searchQuery: searchQuery || undefined,
                selectedStatuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
                selectedRecruiters: selectedRecruiters.length > 0 ? selectedRecruiters : undefined,
                selectedGroups: selectedGroups.length > 0 ? selectedGroups : undefined,
                selectedRoles: selectedRoles.length > 0 ? selectedRoles : undefined,
                missingQrCode: missingQrCode,
                hasPaymentDetails: hasPaymentDetails,
                dateFilter: dateFilter !== "all" ? dateFilter : undefined,
                ...(dateFilter === "custom" ? customDateRange(customStartDate, customEndDate) : {}),
                onlyMyRecruits: false, // Admins/recruiters viewing applicants see everyone matching filters
                currentUserEmail: session.email,
                currentUserRole: session.role,
                selectedUserStatuses: (session.role?.toLowerCase() === "admin" && selectedUserStatuses.length > 0) ? selectedUserStatuses : undefined
            });

            if (usersRes.success && usersRes.data) {
                const mappedUsers: SystemUser[] = usersRes.data.map((u: any) => ({
                    ...u,
                    createdAt: new Date(u.createdAt),
                    lastLogin: u.lastLogin ? new Date(u.lastLogin) : null
                }));

                setAllUsers(mappedUsers);

                const total = usersRes.total || 0;
                setTotalUsers(total);
                setTotalPages(Math.ceil(total / 50));
                
                setTotalOnboarding(usersRes.totalOnboarding || 0);
                setTotalRules(usersRes.totalRules || 0);
                setTotalDeactivated(usersRes.totalDeactivated || 0);
                setTotalActive(usersRes.totalActive || 0);
            } else {
                toast.error(usersRes.error || "Failed to load users list.");
            }
        } catch (err) {
            console.error("Error loading dashboard data:", err);
            toast.error("An unexpected error occurred while loading data.");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchAllMatchingUsers = async () => {
        const exportRes = await getFilteredUsersForExportAction({
            searchQuery: searchQuery || undefined,
            selectedStatuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
            selectedRecruiters: selectedRecruiters.length > 0 ? selectedRecruiters : undefined,
            selectedGroups: selectedGroups.length > 0 ? selectedGroups : undefined,
            selectedRoles: selectedRoles.length > 0 ? selectedRoles : undefined,
            missingQrCode: missingQrCode,
            hasPaymentDetails: hasPaymentDetails,
            dateFilter: dateFilter !== "all" ? dateFilter : undefined,
            ...(dateFilter === "custom" ? customDateRange(customStartDate, customEndDate) : {}),
            onlyMyRecruits: false,
            currentUserEmail: currentUser?.email,
            currentUserRole: currentUser?.role,
            selectedUserStatuses: (currentUser?.role?.toLowerCase() === "admin" && selectedUserStatuses.length > 0) ? selectedUserStatuses : undefined
        });

        if (!exportRes.success || !exportRes.data) {
            throw new Error(exportRes.error || "Failed to fetch users");
        }

        return (exportRes.data as any[]).map((u: any) => ({
            ...u,
            createdAt: new Date(u.createdAt),
            lastLogin: u.lastLogin ? new Date(u.lastLogin) : null
        }));
    };

    // Trigger loadData when filters change
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPage(1);
        loadData(1);
    }, [searchQuery, selectedStatuses, selectedRecruiters, selectedGroups, dateFilter, customStartDate, customEndDate, selectedRoles, missingQrCode, hasPaymentDetails, selectedUserStatuses]);

    // The server already filtered the users, so filteredUsers is just allUsers
    const filteredUsers = allUsers;

    // Sort and search recruiters list alphabetically ascending
    const filteredRecruiters = useMemo<Recruiter[]>(() => {
        const sorted = [...recruiters].sort((a, b) => {
            const nameA = a.name || a.username || a.email;
            const nameB = b.name || b.username || b.email;
            return nameA.localeCompare(nameB);
        });

        if (!recruiterSearch) return sorted;
        const searchTerms = recruiterSearch.trim().split(/\s+/).filter(Boolean);
        return sorted.filter((r: Recruiter) => {
            return (
                searchTerms.length === 0 ||
                searchTerms.some((term) => {
                    const query = term.toLowerCase();
                    return (
                        (r.name && r.name.toLowerCase().includes(query)) ||
                        (r.username && r.username.toLowerCase().includes(query)) ||
                        r.email.toLowerCase().includes(query)
                    );
                })
            );
        });
    }, [recruiters, recruiterSearch]);

    // Sort and search groups list alphabetically ascending
    const filteredGroups = useMemo<GroupOption[]>(() => {
        if (!groupSearch) return groups;
        const searchTerms = groupSearch.trim().split(/\s+/).filter(Boolean);
        return groups.filter((g) =>
            searchTerms.length === 0 ||
            searchTerms.some((term) => g.groupName.toLowerCase().includes(term.toLowerCase()))
        );
    }, [groups, groupSearch]);

    const stats = useMemo(() => {
        return {
            total: totalUsers || filteredUsers.length,
            onboarding: totalOnboarding || filteredUsers.filter((u) => u.isDashboardCompleted).length,
            rules: totalRules || filteredUsers.filter((u) => u.isRulesAndGuidelinesCompleted).length,
            // No fallback from the loaded page: after activating someone it would count their old status
            deactivated: totalDeactivated,
            active: totalActive,
        };
    }, [filteredUsers, totalUsers, totalOnboarding, totalRules, totalDeactivated, totalActive]);

    // Account status (Deactivated card, active count, Account Status filter) is admin-only;
    // the server also leaves it out for other roles.
    const isAdmin = currentUser?.role?.toLowerCase() === "admin";

    const getInitials = (name: string) => {
        return name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
    };

    const parseJson = (val: any) => {
        if (!val) return null;
        if (typeof val === "string") {
            try {
                return JSON.parse(val);
            } catch {
                return null;
            }
        }
        return val;
    };



    const getRulesStep = (user: SystemUser) => {
        if (user.isRulesAndGuidelinesCompleted) return 65;
        const progress = parseJson(user.onRulesAndGuidelinesProgress);
        if (!progress) return 1;
        return progress.currentStep || 1;
    };

    const getRulesProgress = (user: SystemUser) => {
        if (user.isRulesAndGuidelinesCompleted) return 100;
        const progress = parseJson(user.onRulesAndGuidelinesProgress);
        if (!progress) return 0;
        const current = progress.currentStep || 1;
        return Math.min(100, Math.round((current / 65) * 100));
    };

    const handleExportCSV = async () => {
        if (totalUsers === 0 && filteredUsers.length === 0) {
            toast.error("No data to export");
            return;
        }

        try {
            setIsExporting(true);
            toast.loading("Preparing CSV export...", { id: "export-csv" });

            const exportRes = await getFilteredUsersForExportAction({
                searchQuery: searchQuery || undefined,
                selectedStatuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
                selectedRecruiters: selectedRecruiters.length > 0 ? selectedRecruiters : undefined,
                selectedGroups: selectedGroups.length > 0 ? selectedGroups : undefined,
                dateFilter: dateFilter !== "all" ? dateFilter : undefined,
                ...(dateFilter === "custom" ? customDateRange(customStartDate, customEndDate) : {}),
                onlyMyRecruits: false,
                currentUserEmail: currentUser?.email,
                currentUserRole: currentUser?.role,
                selectedUserStatuses: (currentUser?.role?.toLowerCase() === "admin" && selectedUserStatuses.length > 0) ? selectedUserStatuses : undefined
            });

            if (!exportRes.success || !exportRes.data) {
                toast.error(exportRes.error || "Failed to fetch data for export", { id: "export-csv" });
                return;
            }

            const exportUsers = exportRes.data as unknown as SystemUser[];

            const headers = ["Name", "Username", "Facebook", "Recruiter", "Onboarding", "Rules & Guidelines", "Joined Date", "Last Login"];

            const rows = exportUsers.map((user) => {
                const onboardingStatus = getOnboardingStatus(user.onboardingProgress, user.isDashboardCompleted);
                const onboardingStep = `${getOnboardingStatusText(onboardingStatus)} (${onboardingStatus.percent}%)`
                    + (onboardingStatus.skipped.length ? ` | Skipped: ${onboardingStatus.skipped.map((x) => x.code).join(", ")}` : "");
                const rulesStep = `Step ${getRulesStep(user) ?? 1}/65`;
                const rulesPct = getRulesProgress(user);
                const joinedDate = new Date(user.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric"
                });
                const recruiter = user.referer?.name || user.refererEmail || "Direct";
                const username = user.email ? user.email.split("@")[0] : "";
                const lastLoginDate = user.lastLogin
                    ? new Date(user.lastLogin).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                    })
                    : "Never";

                const rowData = [
                    `"${(user.name || "").replace(/"/g, '""')}"`,
                    `"${username.replace(/"/g, '""')}"`,
                    `"${(user.facebook || "").replace(/"/g, '""')}"`,
                    `"${recruiter.replace(/"/g, '""')}"`,
                    `"${onboardingStep.replace(/"/g, '""')}"`,
                    `"${rulesStep} (${rulesPct}%)"`,
                    `"${joinedDate}"`,
                    `"${lastLoginDate.replace(/"/g, '""')}"`
                ];

                return rowData.join(",");
            });

            const csvContent = [headers.join(","), ...rows].join("\n");
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `recruits_export_${new Date().toISOString().slice(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast.success(`Successfully exported ${exportUsers.length} records`, { id: "export-csv" });
        } catch (error) {
            console.error("Export failed:", error);
            toast.error("An error occurred during export", { id: "export-csv" });
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">

            {/* Mesh Background */}
            <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute bg-[#55f761] filter blur-[100px] rounded-full opacity-30 dark:opacity-15" style={{ width: '40vw', height: '40vw', top: '-10%', left: '-10%' }}></div>
                <div className="absolute bg-[#1F7A1F] filter blur-[100px] rounded-full opacity-30 dark:opacity-15" style={{ width: '50vw', height: '50vw', top: '40%', right: '-20%' }}></div>
            </div>

            {/* Header Section */}
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight text-[#0D1B2A] dark:text-white">
                        All Challengers
                    </h1>
                    <p className="text-xs md:text-sm text-[#2F3E46]/70 dark:text-white/60 mt-1">
                        Monitor, filter, and track onboarding progress for all invited challengers.
                    </p>
                </div >
        <div className="flex gap-2">
            <button
                onClick={handleExportCSV}
                disabled={isExporting}
                className={`flex items-center gap-1.5 px-4 py-2 bg-[#1F7A1F] hover:bg-[#1F7A1F]/90 text-white rounded-xl text-xs font-bold transition-all shadow-md ${isExporting ? 'opacity-70 cursor-not-allowed' : 'hover:scale-[1.02] hover:cursor-pointer select-none'}`}
            >
                {isExporting ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Download className="w-3.5 h-3.5" />}
                <span>{isExporting ? "Exporting..." : "Export CSV"}</span>
            </button>
        </div>
            </div >

        {/* Stats Cards Section */ }
        < div className = {`grid grid-cols-1 gap-4 relative z-10 ${isAdmin ? "sm:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3"}`} >
            {/* Card 1: Total Recruits */ }
            < div className = "bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl p-5 shadow-lg backdrop-blur-md hover:scale-[1.02] hover:bg-white/60 dark:hover:bg-black/30 transition-all duration-300 group" >
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-[10px] md:text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">
                                Total Challengers
                            </p>
                            <h3 className="text-2xl md:text-3xl font-black text-[#0D1B2A] dark:text-white mt-1 group-hover:text-[#1F7A1F] dark:group-hover:text-[#55f761] transition-colors">
                                {stats.total}
                            </h3>
                        </div>
                        <div className="p-2.5 md:p-3 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 text-[#1F7A1F] dark:text-[#55f761] rounded-xl group-hover:scale-110 transition-transform">
                            <Users className="w-4 h-4 md:w-5 md:h-5" />
                        </div>
                    </div>
                    <div className="mt-4 flex items-center gap-1.5 text-[10px] md:text-xs text-[#2F3E46]/70 dark:text-white/50">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        {isAdmin
                            ? <span><span className="font-bold text-[#1F7A1F] dark:text-[#55f761]">{stats.active}</span> active accounts</span>
                            : <span>Active listing records</span>}
                    </div>
                </div >

        {/* Card 2: Onboarding Complete */ }
        < div className = "bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl p-5 shadow-lg backdrop-blur-md hover:scale-[1.02] hover:bg-white/60 dark:hover:bg-black/30 transition-all duration-300 group" >
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-[10px] md:text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">
                                Onboarding Done
                            </p>
                            <h3 className="text-2xl md:text-3xl font-black text-[#0D1B2A] dark:text-white mt-1 group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors">
                                {stats.onboarding}
                            </h3>
                        </div>
                        <div className="p-2.5 md:p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl group-hover:scale-110 transition-transform">
                            <Sparkles className="w-4 h-4 md:w-5 md:h-5" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <div className="flex justify-between text-[10px] font-semibold text-[#2F3E46]/60 dark:text-white/40 mb-1">
                            <span>Completion Rate</span>
                            <span>{stats.total > 0 ? Math.round((stats.onboarding / stats.total) * 100) : 0}%</span>
                        </div>
                        <div className="w-full bg-black/5 dark:bg-white/5 rounded-full h-1.5 overflow-hidden">
                            <div
                                className="h-full bg-amber-500 rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${stats.total > 0 ? (stats.onboarding / stats.total) * 100 : 0}%` }}
                            ></div>
                        </div>
                    </div>
                </div >

        {/* Card 3: Rules Accepted */ }
        < div className = "bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl p-5 shadow-lg backdrop-blur-md hover:scale-[1.02] hover:bg-white/60 dark:hover:bg-black/30 transition-all duration-300 group" >
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-[10px] md:text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">
                                Rules & Guidelines
                            </p>
                            <h3 className="text-2xl md:text-3xl font-black text-[#0D1B2A] dark:text-white mt-1 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                                {stats.rules}
                            </h3>
                        </div>
                        <div className="p-2.5 md:p-3 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-xl group-hover:scale-110 transition-transform">
                            <ShieldCheck className="w-4 h-4 md:w-5 md:h-5" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <div className="flex justify-between text-[10px] font-semibold text-[#2F3E46]/60 dark:text-white/40 mb-1">
                            <span>Acceptance Rate</span>
                            <span>{stats.total > 0 ? Math.round((stats.rules / stats.total) * 100) : 0}%</span>
                        </div>
                        <div className="w-full bg-black/5 dark:bg-white/5 rounded-full h-1.5 overflow-hidden">
                            <div
                                className="h-full bg-purple-500 rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${stats.total > 0 ? (stats.rules / stats.total) * 100 : 0}%` }}
                            ></div>
                        </div>
                    </div>
                </div >

        {/* Card 4: Deactivated Accounts (admin only) */ }
        {isAdmin && (
        < div className = "bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl p-5 shadow-lg backdrop-blur-md hover:scale-[1.02] hover:bg-white/60 dark:hover:bg-black/30 transition-all duration-300 group" >
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-[10px] md:text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">
                                Deactivated
                            </p>
                            <h3 className="text-2xl md:text-3xl font-black text-[#0D1B2A] dark:text-white mt-1 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
                                {stats.deactivated}
                            </h3>
                        </div>
                        <div className="p-2.5 md:p-3 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl group-hover:scale-110 transition-transform">
                            <UserX className="w-4 h-4 md:w-5 md:h-5" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <div className="flex justify-between text-[10px] font-semibold text-[#2F3E46]/60 dark:text-white/40 mb-1">
                            <span>Deactivation Rate</span>
                            <span>{stats.total > 0 ? Math.round((stats.deactivated / stats.total) * 100) : 0}%</span>
                        </div>
                        <div className="w-full bg-black/5 dark:bg-white/5 rounded-full h-1.5 overflow-hidden">
                            <div
                                className="h-full bg-rose-500 rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${stats.total > 0 ? (stats.deactivated / stats.total) * 100 : 0}%` }}
                            ></div>
                        </div>
                    </div>
                </div >
        )}
            </div >

        {/* Control Bar: Search, Add Filter Popover, Chips & Sort */ }
        < div className = "bg-white/50 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md relative z-10" >
            {/* Search, Add Filter Button, and Active Chips wrapper */ }
            < div className = "flex flex-wrap items-center justify-between gap-3 flex-1 min-w-0" >

                <div className="flex gap-2">
                    {/* Add Filter Button & Dropdown Popover */}
                    <div className="relative shrink-0" ref={dropdownRef}>
                        <button
                            onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 hover:bg-[#1F7A1F]/15 dark:hover:bg-[#55f761]/15 text-[#1F7A1F] dark:text-[#55f761] rounded-xl text-xs font-bold transition-all hover:scale-[1.02] hover:cursor-pointer select-none"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Filter</span>
                            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isFilterDropdownOpen ? "rotate-180" : ""}`} />
                        </button>

                        {isFilterDropdownOpen && (
                            <div className="absolute left-0 mt-2 z-30 w-72 md:w-[980px] bg-white dark:bg-[#0D1B2A] border border-black/10 dark:border-white/10 rounded-2xl shadow-xl p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                    {/* Column 1: Status & Date Started */}
                                    <div className="space-y-4">
                                        {/* Status Section */}
                                        <div className="space-y-2">
                                            <h4 className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">Status</h4>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    onClick={() => toggleStatusFilter("onboarding")}
                                                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${selectedStatuses.includes("onboarding")
                                                        ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                                        : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                        }`}
                                                >
                                                    {selectedStatuses.includes("onboarding") && <Check className="w-3 h-3" />}
                                                    Onboarding
                                                </button>
                                                <button
                                                    onClick={() => toggleStatusFilter("rules")}
                                                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${selectedStatuses.includes("rules")
                                                        ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                                        : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                        }`}
                                                >
                                                    {selectedStatuses.includes("rules") && <Check className="w-3 h-3" />}
                                                    Rules & Guidelines
                                                </button>
                                            </div>
                                        </div>

                                        {/* Training Section */}
                                        <div className="space-y-2">
                                            <h4 className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">Training Status</h4>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    onClick={() => toggleStatusFilter("landcover_passed")}
                                                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${selectedStatuses.includes("landcover_passed")
                                                        ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                                        : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                        }`}
                                                >
                                                    {selectedStatuses.includes("landcover_passed") && <Check className="w-3 h-3" />}
                                                    Landcover Passed
                                                </button>
                                                <button
                                                    onClick={() => toggleStatusFilter("3d_passed")}
                                                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${selectedStatuses.includes("3d_passed")
                                                        ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                                        : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                        }`}
                                                >
                                                    {selectedStatuses.includes("3d_passed") && <Check className="w-3 h-3" />}
                                                    3D Match Passed
                                                </button>
                                                <button
                                                    onClick={() => toggleStatusFilter("transpo_passed")}
                                                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${selectedStatuses.includes("transpo_passed")
                                                        ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                                        : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                        }`}
                                                >
                                                    {selectedStatuses.includes("transpo_passed") && <Check className="w-3 h-3" />}
                                                    Transpo Passed
                                                </button>
                                                <button
                                                    onClick={() => toggleStatusFilter("roof_passed")}
                                                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${selectedStatuses.includes("roof_passed")
                                                        ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                                        : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                        }`}
                                                >
                                                    {selectedStatuses.includes("roof_passed") && <Check className="w-3 h-3" />}
                                                    Roof Passed
                                                </button>
                                            </div>
                                        </div>

                                        {/* Date Started Section */}
                                        <div className="space-y-2">
                                            <h4 className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">Date Started</h4>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    onClick={() => selectDatePreset("today")}
                                                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${dateFilter === "today"
                                                        ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                                        : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                        }`}
                                                >
                                                    {dateFilter === "today" && <Check className="w-3 h-3" />}
                                                    Today
                                                </button>
                                                <button
                                                    onClick={() => selectDatePreset("yesterday")}
                                                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${dateFilter === "yesterday"
                                                        ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                                        : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                        }`}
                                                >
                                                    {dateFilter === "yesterday" && <Check className="w-3 h-3" />}
                                                    Yesterday
                                                </button>
                                                <button
                                                    onClick={() => selectDatePreset("week")}
                                                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${dateFilter === "week"
                                                        ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                                        : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                        }`}
                                                >
                                                    {dateFilter === "week" && <Check className="w-3 h-3" />}
                                                    1 Week
                                                </button>
                                                <button
                                                    onClick={() => selectDatePreset("month")}
                                                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${dateFilter === "month"
                                                        ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                                        : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                        }`}
                                                >
                                                    {dateFilter === "month" && <Check className="w-3 h-3" />}
                                                    1 Month
                                                </button>
                                                <button
                                                    onClick={() => selectDatePreset("three_months")}
                                                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${dateFilter === "three_months"
                                                        ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                                        : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                        }`}
                                                >
                                                    {dateFilter === "three_months" && <Check className="w-3 h-3" />}
                                                    3 Months
                                                </button>
                                            </div>
                                            <div className="pt-1">
                                                <DateRangePicker
                                                    start={customStartDate}
                                                    end={customEndDate}
                                                    align="left"
                                                    onChange={(start, end) => {
                                                        setCustomStartDate(start);
                                                        setCustomEndDate(end);
                                                        setDateFilter("custom");
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Column 2: Roles & Payment */}
                                    <div className="space-y-4 border-t md:border-t-0 md:border-l border-black/10 dark:border-white/10 md:pl-6 pt-4 md:pt-0">
                                        {/* Roles Section */}
                                        <div className="space-y-2">
                                            <h4 className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">Roles</h4>
                                            <div className="flex flex-col gap-2">
                                                {["applicant", "labeler", "old-labeler", "recruiter", "checker", "judger", "admin"].map((role) => (
                                                    <button
                                                        key={role}
                                                        onClick={() => toggleRoleFilter(role)}
                                                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-left transition-all hover:cursor-pointer ${selectedRoles.includes(role)
                                                            ? "bg-[#1F7A1F]/10 text-[#1F7A1F] dark:bg-[#55f761]/10 dark:text-[#55f761]"
                                                            : "text-[#2F3E46] dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/5"
                                                            }`}
                                                    >
                                                        <span className="capitalize">{getGamifiedRoleLabel(role)}</span>
                                                        {selectedRoles.includes(role) && <Check className="w-3.5 h-3.5 text-[#1F7A1F] dark:text-[#55f761]" />}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Payment Section */}
                                        <div className="space-y-2">
                                            <h4 className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">Payment</h4>
                                            <div className="flex flex-col gap-2">
                                                <button
                                                    onClick={() => setHasPaymentDetails(!hasPaymentDetails)}
                                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-left transition-all hover:cursor-pointer ${hasPaymentDetails
                                                        ? "bg-[#1F7A1F]/10 text-[#1F7A1F] dark:bg-[#55f761]/10 dark:text-[#55f761]"
                                                        : "text-[#2F3E46] dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/5"
                                                        }`}
                                                >
                                                    <span>Has Payment Details</span>
                                                    {hasPaymentDetails && <Check className="w-3.5 h-3.5 text-[#1F7A1F] dark:text-[#55f761]" />}
                                                </button>
                                                <button
                                                    onClick={() => setMissingQrCode(!missingQrCode)}
                                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-left transition-all hover:cursor-pointer ${missingQrCode
                                                        ? "bg-[#1F7A1F]/10 text-[#1F7A1F] dark:bg-[#55f761]/10 dark:text-[#55f761]"
                                                        : "text-[#2F3E46] dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/5"
                                                        }`}
                                                >
                                                    <span>No QR Image URL</span>
                                                    {missingQrCode && <Check className="w-3.5 h-3.5 text-[#1F7A1F] dark:text-[#55f761]" />}
                                                </button>
                                            </div>
                                        </div>

                                        {isAdmin && (
                                            <div className="space-y-2 pt-3 border-t border-black/5 dark:border-white/5">
                                                <h4 className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">Account Status</h4>
                                                <div className="flex flex-col gap-2">
                                                    {["Active", "Deactivated"].map((status) => (
                                                        <button
                                                            key={status}
                                                            onClick={() => toggleUserStatusFilter(status)}
                                                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-left transition-all hover:cursor-pointer ${selectedUserStatuses.includes(status)
                                                                ? "bg-[#1F7A1F]/10 text-[#1F7A1F] dark:bg-[#55f761]/10 dark:text-[#55f761]"
                                                                : "text-[#2F3E46] dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/5"
                                                                }`}
                                                        >
                                                            <span>{status}</span>
                                                            {selectedUserStatuses.includes(status) && <Check className="w-3.5 h-3.5 text-[#1F7A1F] dark:text-[#55f761]" />}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Column 3: Recruiter */}
                                    <div className="space-y-3 border-t md:border-t-0 md:border-l border-black/10 dark:border-white/10 md:pl-6 pt-4 md:pt-0">
                                        <div className="flex flex-col gap-1.5">
                                            <h4 className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">Recruiter</h4>
                                            <div className="relative">
                                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#2F3E46]/50 dark:text-white/40" />
                                                <input
                                                    type="text"
                                                    placeholder="Search recruiters..."
                                                    value={recruiterSearch}
                                                    onChange={(e) => setRecruiterSearch(e.target.value)}
                                                    className="w-full pl-8 pr-3 py-1.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] text-[#0D1B2A] dark:text-white placeholder:text-[#2F3E46]/40 dark:placeholder:text-white/30"
                                                />
                                            </div>
                                        </div>

                                        <div className="max-h-[220px] overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                                            {(!recruiterSearch || recruiterSearch.trim().split(/\s+/).some(t => "organic no recruiter".includes(t.toLowerCase()))) && (
                                                <button
                                                    onClick={() => toggleRecruiterFilter("organic")}
                                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-left transition-all hover:cursor-pointer ${selectedRecruiters.includes("organic")
                                                        ? "bg-[#1F7A1F]/10 text-[#1F7A1F] dark:bg-[#55f761]/10 dark:text-[#55f761]"
                                                        : "text-[#2F3E46] dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/5"
                                                        }`}
                                                >
                                                    <span>Organic (No Recruiter)</span>
                                                    {selectedRecruiters.includes("organic") && <Check className="w-3.5 h-3.5 text-[#1F7A1F] dark:text-[#55f761]" />}
                                                </button>
                                            )}

                                            {filteredRecruiters.map((r: Recruiter) => {
                                                const isSelected = selectedRecruiters.includes(r.email);
                                                return (
                                                    <button
                                                        key={r.email}
                                                        onClick={() => toggleRecruiterFilter(r.email)}
                                                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-left transition-all truncate hover:cursor-pointer ${isSelected
                                                            ? "bg-[#1F7A1F]/10 text-[#1F7A1F] dark:bg-[#55f761]/10 dark:text-[#55f761]"
                                                            : "text-[#2F3E46] dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/5"
                                                            }`}
                                                    >
                                                        <span className="truncate">{r.name || r.username || r.email}</span>
                                                        {isSelected && <Check className="w-3.5 h-3.5 text-[#1F7A1F] dark:text-[#55f761]" />}
                                                    </button>
                                                );
                                            })}

                                            {filteredRecruiters.length === 0 && recruiterSearch && (
                                                <div className="text-center py-4 text-xs text-[#2F3E46]/50 dark:text-white/30">
                                                    No recruiters found.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Column 4: Group */}
                                    <div className="space-y-3 border-t md:border-t-0 md:border-l border-black/10 dark:border-white/10 md:pl-6 pt-4 md:pt-0">
                                        <div className="flex flex-col gap-1.5">
                                            <h4 className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">Group</h4>
                                            <div className="relative">
                                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#2F3E46]/50 dark:text-white/40" />
                                                <input
                                                    type="text"
                                                    placeholder="Search groups..."
                                                    value={groupSearch}
                                                    onChange={(e) => setGroupSearch(e.target.value)}
                                                    className="w-full pl-8 pr-3 py-1.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] text-[#0D1B2A] dark:text-white placeholder:text-[#2F3E46]/40 dark:placeholder:text-white/30"
                                                />
                                            </div>
                                        </div>

                                        <div className="max-h-[220px] overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                                            {filteredGroups.map((g) => {
                                                const isSelected = selectedGroups.includes(g.groupId);
                                                return (
                                                    <button
                                                        key={g.groupId}
                                                        onClick={() => toggleGroupFilter(g.groupId)}
                                                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-left transition-all truncate hover:cursor-pointer ${isSelected
                                                            ? "bg-[#1F7A1F]/10 text-[#1F7A1F] dark:bg-[#55f761]/10 dark:text-[#55f761]"
                                                            : "text-[#2F3E46] dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/5"
                                                            }`}
                                                    >
                                                        <span className="truncate">{g.groupName}</span>
                                                        {isSelected && <Check className="w-3.5 h-3.5 text-[#1F7A1F] dark:text-[#55f761]" />}
                                                    </button>
                                                );
                                            })}

                                            {filteredGroups.length === 0 && (
                                                <div className="text-center py-4 text-xs text-[#2F3E46]/50 dark:text-white/30">
                                                    {groupSearch ? "No groups found." : "No groups available."}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        </div >

    {/* Active Filter Chips */ }
    < div className = "flex flex-wrap items-center gap-2" >
    {
        selectedStatuses.map((status) => {
            let label = status;
            if (status === "onboarding") label = "Onboarding Done";
            if (status === "rules") label = "Rules & Guidelines Done";
            if (status === "landcover_passed") label = "Landcover Passed";
            if (status === "3d_passed") label = "3D Match Passed";
            if (status === "transpo_passed") label = "Transpo Passed";
            if (status === "roof_passed") label = "Roof Passed";
            return (
                <div key={status} className="flex items-center gap-1.5 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all">
                    <span>Status: {label}</span>
                    <button
                        onClick={() => toggleStatusFilter(status)}
                        className="hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0"
                        aria-label={`Remove ${status} filter`}
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>
            );
        })
    }

{
    dateFilter !== "all" && (
        <div className="flex items-center gap-1.5 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all">
            <span>
                Started: {
                    dateFilter === "today" ? "Today" :
                        dateFilter === "yesterday" ? "Yesterday" :
                            dateFilter === "week" ? "1 Week" :
                                dateFilter === "month" ? "1 Month" :
                                    dateFilter === "three_months" ? "3 Months" :
                                        customStartDate && customEndDate && customStartDate !== customEndDate
                                            ? `${customStartDate} to ${customEndDate}`
                                            : customStartDate || (customEndDate ? `Until ${customEndDate}` : "Custom")
                }
            </span>
            <button
                onClick={clearDateFilter}
                className="hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0"
                aria-label="Remove date filter"
            >
                <X className="w-3 h-3" />
            </button>
        </div>
    )
}

{
    selectedRecruiters.map((recEmail) => {
        const displayName = recEmail === "organic"
            ? "Organic"
            : (recruiters.find((r: Recruiter) => r.email === recEmail)?.name || recEmail);
        return (
            <div key={recEmail} className="flex items-center gap-1.5 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all max-w-[220px] truncate">
                <span className="truncate">Recruiter: {displayName}</span>
                <button
                    onClick={() => toggleRecruiterFilter(recEmail)}
                    className="hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0"
                    aria-label={`Remove recruiter ${displayName} filter`}
                >
                    <X className="w-3 h-3" />
                </button>
            </div>
        );
    })
}

                            {selectedGroups.map((groupId) => {
                                const displayName = groups.find((g) => g.groupId === groupId)?.groupName || `Group #${groupId}`;
                                return (
                                    <div key={groupId} className="flex items-center gap-1.5 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all max-w-[220px] truncate">
                                        <span className="truncate">Group: {displayName}</span>
                                        <button
                                            onClick={() => toggleGroupFilter(groupId)}
                                            className="hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0"
                                            aria-label={`Remove group ${displayName} filter`}
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                );
                            })}
                            {selectedRoles.map((r) => (
                                <div key={r} className="flex items-center gap-1.5 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all">
                                    <span className="capitalize">Role: {getGamifiedRoleLabel(r)}</span>
                                    <button
                                        onClick={() => toggleRoleFilter(r)}
                                        className="hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0"
                                        aria-label={`Remove role ${r} filter`}
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}

                            {hasPaymentDetails && (
                                <div className="flex items-center gap-1.5 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all">
                                    <span>Has Payment Details</span>
                                    <button
                                        onClick={() => setHasPaymentDetails(false)}
                                        className="hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0"
                                        aria-label="Remove payment details filter"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            )}

                            {missingQrCode && (
                                <div className="flex items-center gap-1.5 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all">
                                    <span>No QR Image URL</span>
                                    <button
                                        onClick={() => setMissingQrCode(false)}
                                        className="hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0"
                                        aria-label="Remove QR code filter"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            )}

                            {isAdmin && selectedUserStatuses.map((status) => (
                                <div key={status} className="flex items-center gap-1.5 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all">
                                    <span>Account Status: {status}</span>
                                    <button
                                        onClick={() => toggleUserStatusFilter(status)}
                                        className="hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0"
                                        aria-label={`Remove ${status} filter`}
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

    {/* Search */ }
    < div className = "relative w-full sm:max-w-xs shrink-0" >
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2F3E46]/50 dark:text-white/40" />
                        <input
                            type="text"
                            placeholder="Search users..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-shadow text-[#0D1B2A] dark:text-white placeholder:text-[#2F3E46]/40 dark:placeholder:text-white/30"
                        />
                    </div >




                </div >
            </div >

    {/* Recruits List Container */ }
    < div className = "bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-3xl overflow-hidden shadow-xl backdrop-blur-md" >
        {
            isLoading?(
                    <TableSkeleton />
                ) : filteredUsers.length > 0 ? (
                    <div className="flex flex-col">
                        <UserTable
                            users={filteredUsers}
                            recruiters={recruiters as any}
                            currentUserRole={currentUser?.role}
                            fetchAllMatchingUsers={fetchAllMatchingUsers}
                            onUserActivated={() => setTotalDeactivated((n) => Math.max(0, n - 1))}
                        />
                        <Pagination 
                            currentPage={page} 
                            totalPages={totalPages} 
                            onPageChange={(p) => {
                                setPage(p);
                                loadData(p);
                            }} 
                        />
                    </div>
                ) : (
                    /* Empty State */
                    <div className="p-12 text-center flex flex-col items-center justify-center max-w-md mx-auto space-y-4">
                        <div className="w-16 h-16 rounded-full bg-black/5 dark:bg-white/5 text-[#2F3E46]/50 dark:text-white/40 flex items-center justify-center shadow-inner relative">
                            <Users className="w-8 h-8 animate-pulse" />
                            <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full animate-ping"></div>
                        </div>
                        <div>
                            <h3 className="text-base font-black text-[#0D1B2A] dark:text-white tracking-tight">
                                No Challengers Found
                            </h3>
                            <p className="text-xs text-[#2F3E46]/70 dark:text-white/50 mt-1.5">
                                {searchQuery || selectedStatuses.length > 0 || selectedRecruiters.length > 0 || selectedGroups.length > 0 || selectedRoles.length > 0 || missingQrCode || hasPaymentDetails || dateFilter !== "all"
                                    ? "Try resetting your search query, mentor selection, or filter tags to find other records."
                                    : "No challengers currently registered in the database."}
                            </p>
                        </div>
                        {(searchQuery || selectedStatuses.length > 0 || selectedRecruiters.length > 0 || selectedGroups.length > 0 || selectedRoles.length > 0 || missingQrCode || hasPaymentDetails || dateFilter !== "all") && (
                            <button
                                onClick={() => {
                                    setSearchQuery("");
                                    setSelectedStatuses([]);
                                    setSelectedRecruiters([]);
                                    setSelectedGroups([]);
                                    setSelectedRoles([]);
                                    setMissingQrCode(false);
                                    setHasPaymentDetails(false);
                                    clearDateFilter();
                                }}
                                className="px-4 py-2 border border-black/10 dark:border-white/10 rounded-xl text-xs font-bold uppercase tracking-wider text-[#1F7A1F] dark:text-[#55f761] hover:bg-[#1F7A1F]/10 dark:hover:bg-[#55f761]/10 transition-colors"
                            >
                                Reset Filters
                            </button>
                        )}
                    </div>
                )}
            </div >
        </div >
    );
}

export default function RecruiterDashboard() {
    return (
        <Suspense fallback={
            <div className="min-h-[80vh] flex flex-col items-center justify-center text-[#2F3E46] dark:text-white/60">
                <div className="w-10 h-10 border-4 border-[#1F7A1F] border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="font-medium animate-pulse">Loading recruiter panel...</p>
            </div>
        }>
            <RecruiterDashboardContent />
        </Suspense>
    );
}
