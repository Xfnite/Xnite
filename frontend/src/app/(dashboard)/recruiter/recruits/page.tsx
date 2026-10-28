/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { getSessionUser, getWorkLogsForUsernamesAction } from "@/app/actions/auth";
import { getPaginatedUsersAction, getFilteredUsersForExportAction, getReferralsAction } from "@/app/actions/referrals";
import { getMyPerformanceLogsAction } from "@/app/actions/project";
import { downloadXlsx, type CellValue } from "@/lib/xlsx";
import RecruitsTable from "@/components/Recruite/RecruitsTable";
import TableSkeleton from "@/components/Recruite/TableSkeleton";
import Pagination from "@/components/ui/Pagination";

import {
    Search,
    Users,
    Sparkles,
    ShieldCheck,
    UserX,
    Plus,
    X,
    ChevronDown,
    ChevronUp,
    Check,
    Download,
    Clock,
    Zap
} from "lucide-react";

interface SystemUser {
    id: string;
    name: string;
    email: string;
    status: string;
    role?: string;
    createdAt: Date;
    isRegistered: boolean;
    hasCompletedPreCourse: boolean;
    isDashboardCompleted: boolean;
    lastLogin: Date | null;
    refererEmail: string | null;
    labelerRefererEmail?: string | null;
    labelerRefererName?: string | null;
    referer?: {
        name: string | null;
    } | null;
    onboardingProgress: any;
    isRulesAndGuidelinesCompleted: boolean;
    onRulesAndGuidelinesProgress: any;
    facebook?: string | null;
    phone?: string | null;
    gingerUsername?: string | null;
    group_id?: number | null;
    team_id?: number | null;
    resolvedRefererName?: string | null;
    trainings?: any[];
}

interface Recruiter {
    email: string;
    name: string | null;
    username?: string | null;
}

interface WorkLog {
    id: number;
    ownerName: string;
    projectId: number;
    role: string;
    worktime: number;
    taskNum: number;
    features: number;
}

// Everyone on this page sees account status for the list they see here
const canSeeAccountStatusFor = (role?: string) => !!role;

function RecruitsDashboardContent() {
    const searchParams = useSearchParams();
    const pathname = usePathname();

    const [currentUser, setCurrentUser] = useState<any>(null);
    const [allUsers, setAllUsers] = useState<SystemUser[]>([]);
    const [totalUsers, setTotalUsers] = useState<number>(0);
    const [totalOnboarding, setTotalOnboarding] = useState<number>(0);
    const [totalRules, setTotalRules] = useState<number>(0);
    const [totalDeactivated, setTotalDeactivated] = useState<number>(0);
    const [totalActive, setTotalActive] = useState<number>(0);
    const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
    const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
    const [globalWorkLogs, setGlobalWorkLogs] = useState<WorkLog[]>([]);
    const [isLoadingWorkLogs, setIsLoadingWorkLogs] = useState(false);
    const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);
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
    const [selectedWorkLogProjectIds, setSelectedWorkLogProjectIds] = useState<number[]>(() => {
        const pParam = searchParams.get("projects");
        if (!pParam) return [];
        return pParam.split(",").map(Number).filter((n) => !isNaN(n));
    });
    const [selectedWorkLogRoles, setSelectedWorkLogRoles] = useState<string[]>(() => {
        const rParam = searchParams.get("worklog_roles");
        if (!rParam) return [];
        return rParam.split(",");
    });
    const [selectedRoles, setSelectedRoles] = useState<string[]>(() => {
        const rolesParam = searchParams.get("roles");
        if (!rolesParam) return [];
        return rolesParam.split(",");
    });
    const [missingQrCode, setMissingQrCode] = useState<boolean>(() => {
        const qrParam = searchParams.get("noqr");
        return qrParam === "true";
    });
    const [hasPaymentDetails, setHasPaymentDetails] = useState<boolean>(() => {
        const payParam = searchParams.get("haspay");
        return payParam === "true";
    });
    const [selectedUserStatuses, setSelectedUserStatuses] = useState<string[]>(() => {
        const userStatusParam = searchParams.get("userStatus");
        if (!userStatusParam) return [];
        const validUserStatuses = ["Active", "Deactivated"];
        return userStatusParam.split(",").filter((s) => validUserStatuses.includes(s));
    });
    const [dateFilter, setDateFilter] = useState<"all" | "today" | "yesterday" | "week" | "month" | "three_months">((() => {
        const dateParam = searchParams.get("date");
        const validDates = ["today", "yesterday", "week", "month", "three_months"];
        if (dateParam && validDates.includes(dateParam)) {
            return dateParam as any;
        }
        return "all";
    })());
    const [recruiterSearch, setRecruiterSearch] = useState("");

    // Sync states to URL params
    useEffect(() => {
        const params = new URLSearchParams();
        if (searchQuery) params.set("q", searchQuery);
        if (selectedStatuses.length > 0) params.set("status", selectedStatuses.join(","));
        if (selectedRecruiters.length > 0) params.set("recruiters", selectedRecruiters.join(","));
        if (selectedWorkLogProjectIds.length > 0) params.set("projects", selectedWorkLogProjectIds.join(","));
        if (selectedWorkLogRoles.length > 0) params.set("worklog_roles", selectedWorkLogRoles.join(","));
        if (selectedRoles.length > 0) params.set("roles", selectedRoles.join(","));
        if (missingQrCode) params.set("noqr", "true");
        if (hasPaymentDetails) params.set("haspay", "true");
        if (dateFilter !== "all") params.set("date", dateFilter);
        if (selectedUserStatuses.length > 0) params.set("userStatus", selectedUserStatuses.join(","));

        const newQuery = params.toString();
        const suffix = newQuery ? `?${newQuery}` : "";
        window.history.replaceState(null, "", `${pathname}${suffix}`);
    }, [searchQuery, selectedStatuses, selectedRecruiters, selectedWorkLogProjectIds, selectedWorkLogRoles, selectedRoles, missingQrCode, hasPaymentDetails, dateFilter, selectedUserStatuses, pathname]);

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

    const filteredRecruiters = useMemo(() => {
        if (!recruiterSearch) return recruiters;
        const searchTerms = recruiterSearch.trim().split(/\s+/).filter(Boolean);
        return recruiters.filter((r) =>
            searchTerms.length === 0 ||
            searchTerms.some((term) => {
                const searchLower = term.toLowerCase();
                return (
                    (r.name || "").toLowerCase().includes(searchLower) ||
                    (r.username || "").toLowerCase().includes(searchLower) ||
                    r.email.toLowerCase().includes(searchLower)
                );
            })
        );
    }, [recruiters, recruiterSearch]);

    const toggleWorkLogProjectFilter = (id: number) => {
        setSelectedWorkLogProjectIds((prev) =>
            prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
        );
    };

    const toggleWorkLogRoleFilter = (role: string) => {
        setSelectedWorkLogRoles((prev) =>
            prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
        );
    };

    const toggleRoleFilter = (role: string) => {
        setSelectedRoles((prev) =>
            prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
        );
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

    // Fetches worklogs for a batch of users in the background and merges them into
    // state (deduped by log id) so the performance overview can aggregate them.
    const fetchWorkLogsForUsers = async (usersToFetch: SystemUser[]) => {
        const names = new Set<string>();
        usersToFetch.forEach((u) => {
            if (u.name) names.add(u.name);
            if (u.email) names.add(u.email);
            if (u.gingerUsername) names.add(u.gingerUsername);
        });
        if (names.size === 0) return;

        setIsLoadingWorkLogs(true);
        try {
            const CHUNK_SIZE = 50;
            const nameList = Array.from(names);
            let fetched: WorkLog[] = [];
            for (let i = 0; i < nameList.length; i += CHUNK_SIZE) {
                const chunk = nameList.slice(i, i + CHUNK_SIZE);
                const res = await getWorkLogsForUsernamesAction(chunk);
                if (res.success && res.data) fetched = [...fetched, ...res.data];
            }
            setWorkLogs((prev) => {
                const map = new Map(prev.map((l) => [l.id, l]));
                fetched.forEach((l) => map.set(l.id, l));
                return Array.from(map.values());
            });
        } catch (err) {
            console.error("Failed to fetch work logs for recruits:", err);
        } finally {
            setIsLoadingWorkLogs(false);
        }
    };

    const loadData = async (currentPage = 1) => {
        setIsLoading(true);

        try {
            const session = await getSessionUser();
            if (!session) {
                toast.error("Failed to load user session.");
                setIsLoading(false);
                return;
            }
            setCurrentUser(session);

            const targetEmail = session.linkedRecruiterEmail || session.email;

            // Fetch all recruiters and global worklogs (only on initial load)
            if (recruiters.length === 0) {
                let cachedLogs: WorkLog[] | null = null;
                try {
                    const cachedStr = localStorage.getItem("xnite_perf_logs_cache");
                    if (cachedStr) {
                        const parsed = JSON.parse(cachedStr);
                        // Expire after 1 day (86400000 ms)
                        if (Date.now() - parsed.timestamp < 86400000) {
                            cachedLogs = parsed.logs;
                        }
                    }
                } catch (e) {
                    // Ignore cache error
                }

                if (cachedLogs) {
                    setGlobalWorkLogs(cachedLogs);
                    const recruitersRes = await getReferralsAction();
                    if (recruitersRes.success && recruitersRes.data) {
                        setRecruiters(recruitersRes.data);
                    }
                } else {
                    const [recruitersRes, logsRes] = await Promise.all([
                        getReferralsAction(),
                        getMyPerformanceLogsAction()
                    ]);
                    if (recruitersRes.success && recruitersRes.data) {
                        setRecruiters(recruitersRes.data);
                    }
                    if (logsRes.success && logsRes.allLogs) {
                        // Keep only newest log entry per user/project/role
                        const allMap: Record<string, WorkLog> = {};
                        logsRes.allLogs.forEach((log: any) => {
                            if (log.projectId >= 1 && log.projectId <= 5) return;
                            const key = `${log.ownerName}_${log.projectId}_${log.role}`;
                            const existing = allMap[key];
                            if (!existing || log.id > existing.id) {
                                allMap[key] = log;
                            }
                        });
                        const processedLogs = Object.values(allMap);
                        setGlobalWorkLogs(processedLogs);
                        try {
                            localStorage.setItem("xnite_perf_logs_cache", JSON.stringify({
                                timestamp: Date.now(),
                                logs: processedLogs
                            }));
                        } catch (e) {
                            // Ignore
                        }
                    }
                }
            }

            // Fetch paginated users using DB filtering
            const limit = 50;
            const usersRes = await getPaginatedUsersAction({
                page: currentPage,
                limit,
                searchQuery: searchQuery || undefined,
                selectedStatuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
                selectedRecruiters: selectedRecruiters.length > 0 ? selectedRecruiters : undefined,
                selectedRoles: selectedRoles.length > 0 ? selectedRoles : undefined,
                missingQrCode: missingQrCode || undefined,
                hasPaymentDetails: hasPaymentDetails || undefined,
                dateFilter: dateFilter !== "all" ? dateFilter : undefined,
                onlyMyRecruits: session.role !== "admin", // If admin, show all (including organic)
                currentUserEmail: targetEmail,
                currentUserRole: session.role,
                selectedUserStatuses: (canSeeAccountStatusFor(session.role) && selectedUserStatuses.length > 0) ? selectedUserStatuses : undefined
            });

            if (usersRes.success && usersRes.data) {
                const mappedUsers: SystemUser[] = usersRes.data.map((u: any) => ({
                    ...u,
                    createdAt: new Date(u.createdAt),
                    lastLogin: u.lastLogin ? new Date(u.lastLogin) : null
                }));

                setAllUsers(mappedUsers);
                setWorkLogs([]);
                
                const total = usersRes.total || 0;
                setTotalUsers(total);
                setTotalPages(Math.ceil(total / limit));
                setTotalOnboarding(usersRes.totalOnboarding || 0);
                setTotalRules(usersRes.totalRules || 0);
                setTotalDeactivated(usersRes.totalDeactivated || 0);
                setTotalActive(usersRes.totalActive || 0);
                
                fetchWorkLogsForUsers(mappedUsers);
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

    // Trigger loadData when filters change
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPage(1);
        loadData(1);
    }, [searchQuery, selectedStatuses, selectedRecruiters, selectedWorkLogProjectIds, selectedWorkLogRoles, selectedRoles, missingQrCode, hasPaymentDetails, dateFilter, selectedUserStatuses]);

    // Filter and sort computation
    // Server handles most filtering, but we filter by project ID and role locally since worklogs are fetched separately
    const filteredUsers = useMemo(() => {
        if (selectedWorkLogProjectIds.length === 0 && selectedWorkLogRoles.length === 0) return allUsers;

        return allUsers.filter(user => {
            const names = [
                user.name?.trim().toLowerCase(),
                user.email?.trim().toLowerCase(),
                user.gingerUsername?.trim().toLowerCase(),
            ].filter(Boolean) as string[];

            const userLogs = workLogs.filter(log => log.ownerName && names.includes(log.ownerName.trim().toLowerCase()));
            const matchesProject = selectedWorkLogProjectIds.length === 0 || userLogs.some(log => selectedWorkLogProjectIds.includes(log.projectId));
            const matchesRole = selectedWorkLogRoles.length === 0 || userLogs.some(log => selectedWorkLogRoles.includes(log.role.trim().toLowerCase()));
            return matchesProject && matchesRole;
        });
    }, [allUsers, workLogs, selectedWorkLogProjectIds, selectedWorkLogRoles]);

    // Aggregates all global worklogs into a per-project/role performance summary.
    const projectSummaries = useMemo(() => {
        if (globalWorkLogs.length === 0) return [];
        const pairs = globalWorkLogs.map((log) => ({ projectId: log.projectId, role: log.role }));
        const uniquePairs = pairs.filter(
            (pair, index, self) =>
                index === self.findIndex((p) => p.projectId === pair.projectId && p.role === pair.role)
        );
        uniquePairs.sort((a, b) => {
            if (a.projectId !== b.projectId) return a.projectId - b.projectId;
            return a.role.localeCompare(b.role);
        });

        return uniquePairs.map(({ projectId, role }) => {
            const logs = globalWorkLogs.filter((log) => log.projectId === projectId && log.role === role);

            const sortedLogs = logs.slice().sort((a, b) => {
                const speedA = a.worktime > 0 ? a.features / a.worktime : 0;
                const speedB = b.worktime > 0 ? b.features / b.worktime : 0;
                return speedA - speedB;
            });
            const trimCount = Math.min(10, Math.floor(sortedLogs.length * 0.1));
            const filteredLogs = trimCount > 0 ? sortedLogs.slice(trimCount, -trimCount) : sortedLogs;

            const totalWorktime = filteredLogs.reduce((acc, log) => acc + log.worktime, 0);
            const totalFeatures = filteredLogs.reduce((acc, log) => acc + log.features, 0);
            const totalTasks = filteredLogs.reduce((acc, log) => acc + log.taskNum, 0);
            const overallSpeed = totalWorktime > 0 ? totalFeatures / totalWorktime : 0;
            const tpm = totalWorktime > 0 && totalTasks > 0 ? (totalWorktime * 60) / totalTasks : 0;
            return { projectId, role, overallSpeed, overallMinPerTask: tpm };
        });
    }, [globalWorkLogs]);

    const availableWorkLogProjectIds = useMemo(() => {
        const ids = new Set(projectSummaries.map((p) => p.projectId));
        return Array.from(ids).sort((a, b) => a - b);
    }, [projectSummaries]);

    const availableWorkLogRoles = useMemo(() => {
        const roles = new Set(projectSummaries.map((p) => p.role.trim().toLowerCase()));
        return Array.from(roles).sort();
    }, [projectSummaries]);

    const availableRoles = useMemo(() => {
        const rolesSet = new Set<string>();
        allUsers.forEach((u) => {
            const r = u.role;
            if (r) {
                rolesSet.add(r.trim().toLowerCase());
            }
        });
        // Ensure standard fallback roles are populated
        ["checker", "judger", "labeler"].forEach(r => rolesSet.add(r));
        return Array.from(rolesSet).sort();
    }, [allUsers]);

    // Calculate statistics based on current filtered users list
    const stats = useMemo(() => {
        return {
            total: totalUsers || filteredUsers.length,
            onboarding: totalOnboarding || filteredUsers.filter((u) => u.isDashboardCompleted).length,
            rules: totalRules || filteredUsers.filter((u) => u.isRulesAndGuidelinesCompleted).length,
            deactivated: totalDeactivated,
            active: totalActive,
        };
    }, [filteredUsers, totalUsers, totalOnboarding, totalRules, totalDeactivated, totalActive]);

    // Account status (Deactivated card, active count, Account Status filter) for the list shown here.
    // The server applies the same rule.
    const canSeeAccountStatus = canSeeAccountStatusFor(currentUser?.role);

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

    const getOnboardingProgress = (user: SystemUser) => {
        if (user.isDashboardCompleted) return 100;
        const progress = parseJson(user.onboardingProgress);
        if (!progress) return 0;
        let completedSteps = 0;
        if (progress.stage1Complete) completedSteps++;
        const modules = ["download", "install", "videos-basic", "videos-3d", "answer-key", "answer-key-lib"];
        modules.forEach((m) => {
            if (progress.modulesComplete?.[m]) {
                completedSteps++;
            }
        });
        return Math.round((completedSteps / 7) * 100);
    };

    const getRulesProgress = (user: SystemUser) => {
        if (user.isRulesAndGuidelinesCompleted) return 100;
        const progress = parseJson(user.onRulesAndGuidelinesProgress);
        if (!progress) return 0;
        const current = progress.currentStep || 1;
        return Math.min(100, Math.round((current / 65) * 100));
    };

    const getOnboardingStepText = (user: SystemUser) => {
        if (user.isDashboardCompleted) return "Mod 5 out of 5";
        const progress = parseJson(user.onboardingProgress);
        if (!progress) return "Mod 0 out of 5";

        let count = 0;
        if (progress.modulesComplete?.download && progress.modulesComplete?.install) count++;
        if (progress.modulesComplete?.["videos-basic"]) count++;
        if (progress.modulesComplete?.["videos-3d"]) count++;
        if (progress.modulesComplete?.["answer-key"]) count++;
        if (progress.modulesComplete?.["answer-key-lib"]) count++;

        return `Mod ${count} out of 5`;
    };

    const getRulesStep = (user: SystemUser) => {
        if (user.isRulesAndGuidelinesCompleted) return 65;
        const progress = parseJson(user.onRulesAndGuidelinesProgress);
        if (!progress) return 1;
        return progress.currentStep || 1;
    };

    const handleExportCSV = async () => {
        if (totalUsers === 0 && filteredUsers.length === 0) {
            toast.error("No data to export");
            return;
        }

        try {
            setIsExporting(true);
            toast.loading("Preparing CSV export...", { id: "export-csv" });

            const targetEmail = currentUser?.linkedRecruiterEmail || currentUser?.email;

            const exportRes = await getFilteredUsersForExportAction({
                searchQuery: searchQuery || undefined,
                selectedStatuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
                selectedRecruiters: selectedRecruiters.length > 0 ? selectedRecruiters : undefined,
                selectedRoles: selectedRoles.length > 0 ? selectedRoles : undefined,
                missingQrCode: missingQrCode || undefined,
                hasPaymentDetails: hasPaymentDetails || undefined,
                dateFilter: dateFilter !== "all" ? dateFilter : undefined,
                onlyMyRecruits: currentUser?.role !== "admin",
                currentUserEmail: targetEmail,
                currentUserRole: currentUser?.role,
                selectedUserStatuses: (canSeeAccountStatusFor(currentUser?.role) && selectedUserStatuses.length > 0) ? selectedUserStatuses : undefined
            });

            if (!exportRes.success || !exportRes.data) {
                toast.error(exportRes.error || "Failed to fetch data for export", { id: "export-csv" });
                return;
            }

            const exportUsers = exportRes.data as unknown as SystemUser[];

            const validId = (id: number | null | undefined): id is number =>
                typeof id === "number" && !isNaN(id) && id !== 0 && id !== -1;

            // Worklogs and staff names are resolved server-side alongside the users, so
            // the whole export costs a single request no matter how many rows it covers.
            const { checkerByGroupId, judgerByGroupId, judgerByTeamId } = exportRes.staffNames
                ?? { checkerByGroupId: {}, judgerByGroupId: {}, judgerByTeamId: {} };

            const logsByOwner = new Map<string, WorkLog[]>();
            (exportRes.workLogs ?? []).forEach((log) => {
                if (!log.ownerName) return;
                const key = log.ownerName.trim().toLowerCase();
                const bucket = logsByOwner.get(key);
                if (bucket) bucket.push(log);
                else logsByOwner.set(key, [log]);
            });

            // The same person can log work under several aliases, which duplicates a
            // project/role pair; keep only the most recent (highest id) of each.
            const getUserLogs = (user: SystemUser) => {
                const aliases = [user.name, user.email, user.gingerUsername]
                    .filter(Boolean)
                    .map((n) => n!.trim().toLowerCase());
                const latestByProject = new Map<string, WorkLog>();
                Array.from(new Set(aliases)).forEach((alias) => {
                    (logsByOwner.get(alias) || []).forEach((log) => {
                        const key = `${log.projectId}_${log.role}`;
                        const existing = latestByProject.get(key);
                        if (!existing || log.id > existing.id) latestByProject.set(key, log);
                    });
                });
                return Array.from(latestByProject.values()).filter((log) => {
                    const matchesRole = selectedWorkLogRoles.length === 0 || selectedWorkLogRoles.includes(log.role.trim().toLowerCase());
                    const matchesProject = selectedWorkLogProjectIds.length === 0 || selectedWorkLogProjectIds.includes(log.projectId);
                    return matchesRole && matchesProject;
                });
            };

            const formatMinPerTask = (tasks: number, worktimeHours: number) =>
                tasks <= 0 ? "" : ((worktimeHours * 60) / tasks).toFixed(1);

            // Staff columns sit last in both tabs, after the worklog block.
            const coreHeaders = ["Sitename", "Name", "Username", "Facebook", "Group ID", "Team ID", "Onboarding", "Rules & Guidelines", "Joined Date", "Last Login"];
            const staffHeaders = ["Recruiter", "Checker Name", "Judger Name"];
            const worklogHeaders = ["Project ID", "Worklog Role", "Worktime (Hours)", "Tasks Completed", "Features Mapped", "Min / Task", "Computed Speed (F/hr)"];

            const userRows: CellValue[][] = [[...coreHeaders, ...staffHeaders]];
            const performanceRows: CellValue[][] = [[...coreHeaders, ...worklogHeaders, ...staffHeaders]];

            exportUsers.forEach((user) => {
                const onboardingStep = getOnboardingStepText(user);
                const rulesStep = `Step ${getRulesStep(user)}/65`;
                const rulesPct = getRulesProgress(user);
                const joinedDate = new Date(user.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric"
                });
                const username = user.email ? user.email.split("@")[0] : "";
                const sitename = user.gingerUsername || "";
                const facebook = user.facebook || "";
                const lastLoginDate = user.lastLogin
                    ? new Date(user.lastLogin).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                    })
                    : "Never";

                const groupIdStr = validId(user.group_id) ? String(user.group_id) : "";
                const teamIdStr = validId(user.team_id) ? String(user.team_id) : "";

                // Same fallback chain the Recruiter column uses in the table.
                const recruiterName = user.labelerRefererName || user.referer?.name || user.resolvedRefererName || user.refererEmail || "Direct";
                const checkerName = validId(user.group_id) ? (checkerByGroupId[user.group_id] || "") : "";
                // A group's judger lives on its parent team; fall back to the user's own team.
                const judgerName =
                    (validId(user.group_id) ? judgerByGroupId[user.group_id] : "") ||
                    (validId(user.team_id) ? judgerByTeamId[user.team_id] : "") ||
                    "";

                const coreCells: CellValue[] = [
                    sitename,
                    user.name || "",
                    username,
                    facebook,
                    groupIdStr,
                    teamIdStr,
                    onboardingStep,
                    `${rulesStep} (${rulesPct}%)`,
                    joinedDate,
                    lastLoginDate,
                ];
                const staffCells: CellValue[] = [recruiterName, checkerName, judgerName];

                userRows.push([...coreCells, ...staffCells]);

                const uLogs = getUserLogs(user);
                if (uLogs.length === 0) {
                    performanceRows.push([...coreCells, "N/A", "", "", "", "", "", "", ...staffCells]);
                    return;
                }

                uLogs.forEach((log) => {
                    const entrySpeed = log.worktime > 0 ? log.features / log.worktime : 0;
                    performanceRows.push([
                        ...coreCells,
                        `#${log.projectId}`,
                        log.role,
                        Number(log.worktime.toFixed(2)),
                        log.taskNum,
                        log.features,
                        formatMinPerTask(log.taskNum, log.worktime),
                        Number(entrySpeed.toFixed(2)),
                        ...staffCells,
                    ]);
                });
            });

            downloadXlsx(
                `recruits_export_${new Date().toISOString().slice(0, 10)}.xlsx`,
                [
                    { name: "User", rows: userRows },
                    { name: "Performance Query", rows: performanceRows },
                ]
            );

            toast.success(`Successfully exported ${exportUsers.length} records (${performanceRows.length - 1} worklog rows)`, { id: "export-csv" });
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
                        My Apprentices
                    </h1>
                    <p className="text-xs md:text-sm text-[#2F3E46]/70 dark:text-white/60 mt-1">
                        Monitor, filter, and track onboarding progress for your invited apprentices.
                    </p>
                </div>
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
            </div>

            {/* Stats Cards Section */}
            <div className={`grid grid-cols-1 gap-4 relative z-10 ${canSeeAccountStatus ? "sm:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3"}`}>
                {/* Card 1: Total Recruits */}
                <div className="bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl p-5 shadow-lg backdrop-blur-md hover:scale-[1.02] hover:bg-white/60 dark:hover:bg-black/30 transition-all duration-300 group">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-[10px] md:text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">
                                Total Apprentices
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
                        {canSeeAccountStatus
                            ? <span><span className="font-bold text-[#1F7A1F] dark:text-[#55f761]">{stats.active}</span> active accounts</span>
                            : <span>Active listing records</span>}
                    </div>
                </div>

                {/* Card 2: Onboarding Complete */}
                <div className="bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl p-5 shadow-lg backdrop-blur-md hover:scale-[1.02] hover:bg-white/60 dark:hover:bg-black/30 transition-all duration-300 group">
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
                </div>

                {/* Card 3: Rules Accepted */}
                <div className="bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl p-5 shadow-lg backdrop-blur-md hover:scale-[1.02] hover:bg-white/60 dark:hover:bg-black/30 transition-all duration-300 group">
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
                </div>

                {/* Card 4: Deactivated Accounts (admins, and recruiters for their own recruits) */}
                {canSeeAccountStatus && (
                <div className="bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl p-5 shadow-lg backdrop-blur-md hover:scale-[1.02] hover:bg-white/60 dark:hover:bg-black/30 transition-all duration-300 group">
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
                </div>
                )}
            </div>

            {/* Projects Performance Overview */}
            {(globalWorkLogs.length > 0 || (isLoading && recruiters.length === 0)) && (
                <div className="bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-3xl p-6 shadow-xl backdrop-blur-md relative z-10 space-y-4">
                    <div>
                        <h3 className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">
                            Projects Performance Overview
                        </h3>
                    </div>

                    {isLoadingWorkLogs && projectSummaries.length === 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-in fade-in duration-200">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="bg-white/50 dark:bg-black/30 border border-black/5 dark:border-white/5 rounded-2xl p-4 shadow-sm space-y-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="h-4 w-20 bg-black/10 dark:bg-white/10 rounded animate-pulse"></div>
                                        <div className="h-4 w-12 bg-black/10 dark:bg-white/10 rounded animate-pulse"></div>
                                    </div>
                                    <div className="space-y-2 pt-1">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 bg-black/10 dark:bg-white/10 rounded-full animate-pulse"></div>
                                            <div className="h-3 w-16 bg-black/10 dark:bg-white/10 rounded animate-pulse"></div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 bg-black/10 dark:bg-white/10 rounded-full animate-pulse"></div>
                                            <div className="h-3 w-16 bg-black/10 dark:bg-white/10 rounded animate-pulse"></div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : projectSummaries.length === 0 ? (
                        <p className="text-xs text-[#2F3E46]/50 dark:text-white/30 italic">
                            No projects available.
                        </p>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {(isOverviewExpanded ? projectSummaries : projectSummaries.slice(0, 4)).map((p) => (
                                    <div key={`${p.projectId}_${p.role}`} className="bg-white/50 dark:bg-black/30 border border-black/5 dark:border-white/5 rounded-2xl p-4 shadow-sm hover:scale-[1.01] transition-transform duration-255 space-y-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs font-extrabold text-[#0D1B2A] dark:text-white truncate">Project #{p.projectId}</span>
                                            <span className="inline-flex items-center justify-center font-mono font-bold text-[9px] px-2 py-0.5 rounded bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 text-[#1F7A1F] dark:text-[#55f761] capitalize shrink-0">
                                                {p.role}
                                            </span>
                                        </div>
                                        <div className="space-y-1.5 text-xs">
                                            <div className="flex items-center gap-1.5">
                                                <Clock className="w-3 h-3 text-[#2F3E46]/40 dark:text-white/30 shrink-0" />
                                                <span className="font-bold text-[#1F7A1F] dark:text-[#55f761]">{p.overallMinPerTask > 0 ? `${p.overallMinPerTask.toFixed(1)} min/task` : "0 min/task"}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <Zap className="w-3 h-3 text-[#2F3E46]/40 dark:text-white/30 shrink-0" />
                                                <span className="font-mono font-bold text-[#1F7A1F] dark:text-[#55f761]">{p.overallSpeed.toFixed(2)} F/hr</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {projectSummaries.length > 4 && (
                                <div className="flex justify-center pt-2">
                                    <button
                                        onClick={() => setIsOverviewExpanded(!isOverviewExpanded)}
                                        className="flex items-center gap-1.5 px-4 py-2 border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-800 dark:text-white/60 dark:hover:text-white transition-all cursor-pointer select-none"
                                    >
                                        {isOverviewExpanded ? (
                                            <>
                                                <span>Show Less</span>
                                                <ChevronUp className="w-3.5 h-3.5" />
                                            </>
                                        ) : (
                                            <>
                                                <span>Show All ({projectSummaries.length})</span>
                                                <ChevronDown className="w-3.5 h-3.5" />
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Control Bar: Search, Add Filter Popover, Chips */}
            <div className="bg-white/50 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md relative z-20">
                {/* Search, Add Filter Button, and Active Chips wrapper */}
                <div className="flex flex-wrap items-center justify-between gap-3 flex-1 min-w-0">

                    <div className="flex items-center gap-2 flex-wrap">
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
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        {/* Column 1: Status & Date Started */}
                                        <div className="space-y-4">
                                            {/* Role Section */}
                                            <div className="space-y-2">
                                                <h4 className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">Role</h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {availableRoles.map((r) => (
                                                        <button
                                                            key={`role_filter_${r}`}
                                                            onClick={() => toggleRoleFilter(r)}
                                                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${selectedRoles.includes(r)
                                                                ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                                                : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                                }`}
                                                        >
                                                            {selectedRoles.includes(r) && <Check className="w-3 h-3" />}
                                                            <span className="capitalize">{r}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

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
                                                        onClick={() => setDateFilter(dateFilter === "today" ? "all" : "today")}
                                                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${dateFilter === "today"
                                                            ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                                            : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                            }`}
                                                    >
                                                        {dateFilter === "today" && <Check className="w-3 h-3" />}
                                                        Today
                                                    </button>
                                                    <button
                                                        onClick={() => setDateFilter(dateFilter === "yesterday" ? "all" : "yesterday")}
                                                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${dateFilter === "yesterday"
                                                            ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                                            : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                            }`}
                                                    >
                                                        {dateFilter === "yesterday" && <Check className="w-3 h-3" />}
                                                        Yesterday
                                                    </button>
                                                    <button
                                                        onClick={() => setDateFilter(dateFilter === "week" ? "all" : "week")}
                                                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${dateFilter === "week"
                                                            ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                                            : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                            }`}
                                                    >
                                                        {dateFilter === "week" && <Check className="w-3 h-3" />}
                                                        1 Week
                                                    </button>
                                                    <button
                                                        onClick={() => setDateFilter(dateFilter === "month" ? "all" : "month")}
                                                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${dateFilter === "month"
                                                            ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                                            : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                            }`}
                                                    >
                                                        {dateFilter === "month" && <Check className="w-3 h-3" />}
                                                        1 Month
                                                    </button>
                                                    <button
                                                        onClick={() => setDateFilter(dateFilter === "three_months" ? "all" : "three_months")}
                                                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${dateFilter === "three_months"
                                                            ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                                            : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                            }`}
                                                    >
                                                        {dateFilter === "three_months" && <Check className="w-3 h-3" />}
                                                        3 Months
                                                    </button>
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

                                            {canSeeAccountStatus && (
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

                                        {/* Column 2: Mentor */}
                                        <div className="space-y-3 border-t md:border-t-0 md:border-l border-black/10 dark:border-white/10 md:pl-6 pt-4 md:pt-0">
                                            <div className="flex flex-col gap-1.5">
                                                <h4 className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">Mentor</h4>
                                                <div className="relative">
                                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#2F3E46]/50 dark:text-white/40" />
                                                    <input
                                                        type="text"
                                                        placeholder="Search mentors..."
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
                                                        <span>Organic (No Mentor)</span>
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
                                                        No mentors found.
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Column 3: Work Logs */}
                                        <div className="space-y-3 border-t md:border-t-0 md:border-l border-black/10 dark:border-white/10 md:pl-6 pt-4 md:pt-0">
                                            <div className="space-y-2">
                                                <h4 className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">Project ID</h4>
                                                <div className="flex flex-wrap gap-2 max-h-[220px] overflow-y-auto scrollbar-thin pr-1">
                                                    {availableWorkLogProjectIds.length === 0 ? (
                                                        <span className="text-xs text-[#2F3E46]/50 dark:text-white/30 italic">No projects found</span>
                                                    ) : (
                                                        availableWorkLogProjectIds.map((id) => (
                                                            <button
                                                                key={id}
                                                                onClick={() => toggleWorkLogProjectFilter(id)}
                                                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${selectedWorkLogProjectIds.includes(id)
                                                                    ? "bg-amber-500/10 border-amber-500 text-amber-600 dark:bg-amber-400/10 dark:border-amber-400 dark:text-amber-400"
                                                                    : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                                    }`}
                                                            >
                                                                {selectedWorkLogProjectIds.includes(id) && <Check className="w-3 h-3" />}
                                                                #{id}
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                            </div>

                                            {availableWorkLogRoles.length > 0 && (
                                                <div className="space-y-2">
                                                    <h4 className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">Worklog Role</h4>
                                                    <div className="flex flex-wrap gap-2 max-h-[140px] overflow-y-auto scrollbar-thin pr-1">
                                                        {availableWorkLogRoles.map((r) => (
                                                            <button
                                                                key={r}
                                                                onClick={() => toggleWorkLogRoleFilter(r)}
                                                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${selectedWorkLogRoles.includes(r)
                                                                    ? "bg-amber-500/10 border-amber-500 text-amber-600 dark:bg-amber-400/10 dark:border-amber-400 dark:text-amber-400"
                                                                    : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                                    }`}
                                                            >
                                                                {selectedWorkLogRoles.includes(r) && <Check className="w-3 h-3" />}
                                                                <span className="capitalize">{r}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Active Filter Chips */}
                        <div className="flex flex-wrap items-center gap-2">
                            {selectedStatuses.map((status) => {
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
                            })}

                            {selectedRecruiters.map((email) => {
                                const recruiter = recruiters.find((r) => r.email === email);
                                const label = email === "organic" ? "Organic" : (recruiter?.name || recruiter?.username || email);
                                return (
                                    <div key={email} className="flex items-center gap-1.5 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all">
                                        <span>Mentor: {label}</span>
                                        <button
                                            onClick={() => toggleRecruiterFilter(email)}
                                            className="hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0"
                                            aria-label={`Remove mentor ${label} filter`}
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                );
                            })}

                            {dateFilter !== "all" && (
                                <div className="flex items-center gap-1.5 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all">
                                    <span>
                                        Started: {
                                            dateFilter === "today" ? "Today" :
                                                dateFilter === "yesterday" ? "Yesterday" :
                                                    dateFilter === "week" ? "1 Week" :
                                                        dateFilter === "month" ? "1 Month" : "3 Months"
                                        }
                                    </span>
                                    <button
                                        onClick={() => setDateFilter("all")}
                                        className="hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0"
                                        aria-label="Remove date filter"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            )}

                            {selectedWorkLogProjectIds.map((id) => (
                                <div key={id} className="flex items-center gap-1.5 bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 dark:border-amber-400/20 text-amber-600 dark:text-amber-400 text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all">
                                    <span>Project: #{id}</span>
                                    <button
                                        onClick={() => toggleWorkLogProjectFilter(id)}
                                        className="hover:bg-amber-500/20 dark:hover:bg-amber-400/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0"
                                        aria-label={`Remove project ${id} filter`}
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}

                            {selectedWorkLogRoles.map((r) => (
                                <div key={r} className="flex items-center gap-1.5 bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 dark:border-amber-400/20 text-amber-600 dark:text-amber-400 text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all">
                                    <span className="capitalize">Worklog Role: {r}</span>
                                    <button
                                        onClick={() => toggleWorkLogRoleFilter(r)}
                                        className="hover:bg-amber-500/20 dark:hover:bg-amber-400/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0"
                                        aria-label={`Remove worklog role ${r} filter`}
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                            {selectedRoles.map((r) => (
                                <div key={r} className="flex items-center gap-1.5 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all">
                                    <span className="capitalize">Role: {r}</span>
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

                            {canSeeAccountStatus && selectedUserStatuses.map((status) => (
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
                            {/* Clear spacer */}
                        </div>
                    </div>

                    {/* Search */}
                    <div className="relative w-full sm:max-w-xs shrink-0">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2F3E46]/50 dark:text-white/40" />
                        <input
                            type="text"
                            placeholder="Search users..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-shadow text-[#0D1B2A] dark:text-white placeholder:text-[#2F3E46]/40 dark:placeholder:text-white/30"
                        />
                    </div>

                </div>
            </div>

            {/* Recruits List Container */}
            <div className="relative z-10 bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-3xl overflow-hidden shadow-xl backdrop-blur-md">
                {isLoading ? (
                    <TableSkeleton showRecruiter={currentUser?.role === "admin"} />
                ) : filteredUsers.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <div className="text-center flex flex-col items-center justify-center max-w-md mx-auto space-y-4 py-4">
                            <div className="w-16 h-16 rounded-full bg-black/5 dark:bg-white/5 text-[#2F3E46]/50 dark:text-white/40 flex items-center justify-center shadow-inner relative">
                                <Users className="w-8 h-8 animate-pulse" />
                                <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full animate-ping"></div>
                            </div>
                            <div>
                                <h3 className="text-base font-black text-[#0D1B2A] dark:text-white tracking-tight">
                                    No Apprentices Found
                                </h3>
                                <p className="text-xs text-[#2F3E46]/70 dark:text-white/50 mt-1.5">
                                    {searchQuery || selectedStatuses.length > 0 || selectedRecruiters.length > 0 || dateFilter !== "all" || selectedWorkLogProjectIds.length > 0
                                        ? "Try resetting your search query or filter options to find other records."
                                        : "You haven't invited any apprentices yet."}
                                </p>
                            </div>
                            {(searchQuery || selectedStatuses.length > 0 || selectedRecruiters.length > 0 || dateFilter !== "all" || selectedWorkLogProjectIds.length > 0 || selectedWorkLogRoles.length > 0 || selectedRoles.length > 0 || missingQrCode || hasPaymentDetails) && (
                                <button
                                    onClick={() => {
                                        setSearchQuery("");
                                        setSelectedStatuses([]);
                                        setSelectedRecruiters([]);
                                        setSelectedWorkLogProjectIds([]);
                                        setSelectedWorkLogRoles([]);
                                        setSelectedRoles([]);
                                        setMissingQrCode(false);
                                        setHasPaymentDetails(false);
                                        setDateFilter("all");
                                    }}
                                    className="px-4 py-2 border border-black/10 dark:border-white/10 rounded-xl text-xs font-bold uppercase tracking-wider text-[#1F7A1F] dark:text-[#55f761] hover:bg-[#1F7A1F]/10 dark:hover:bg-[#55f761]/10 transition-colors cursor-pointer"
                                >
                                    Reset Filters
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        <RecruitsTable
                            users={filteredUsers}
                            showRecruiter={currentUser?.role === "admin"}
                            currentUserRole={currentUser?.role}
                            workLogs={workLogs}
                            isLoadingWorkLogs={isLoadingWorkLogs}
                            selectedWorkLogProjectIds={selectedWorkLogProjectIds}
                            selectedWorkLogRoles={selectedWorkLogRoles}
                            globalProjectSummaries={projectSummaries}
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
                )}
            </div>
        </div>
    );
}

export default function RecruitsDashboard() {
    return (
        <Suspense fallback={
            <div className="min-h-[80vh] flex flex-col items-center justify-center text-[#2F3E46] dark:text-white/60">
                <div className="w-10 h-10 border-4 border-[#1F7A1F] border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="font-medium animate-pulse">Loading mentor panel...</p>
            </div>
        }>
            <RecruitsDashboardContent />
        </Suspense>
    );
}
