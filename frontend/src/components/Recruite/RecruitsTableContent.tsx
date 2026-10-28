"use client";

import { Fragment, useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Globe, Mail, ArrowUpDown, ArrowUp, ArrowDown, Phone, ChevronDown, MessageSquare, Send, X, ImagePlus, Trash2, CheckSquare, Users } from "lucide-react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { uploadFiles } from "@/utils/uploadthing";
import OnboardingProgressCell from "@/components/Onboarding/OnboardingProgressCell";
import { ActivityCell, ActivityHeader } from "@/components/Recruite/ActivityCell";

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
    resolvedRefererName?: string | null;
    referer?: {
        name: string | null;
    } | null;
    onboardingProgress: any;
    isRulesAndGuidelinesCompleted: boolean;
    onRulesAndGuidelinesProgress: any;
    facebook?: string | null;
    phone?: string | null;
    gingerUsername?: string | null;
    trainings?: any[];
}

interface WorkLog {
    id: number;
    ownerName: string;
    projectId: number;
    role: string;
    worktime: number;
    taskNum: number;
    features: number;
    log_date?: string | Date;
}

interface WorkLogWithImprovement extends WorkLog {
    absoluteImprovement?: number;
    improvementRate?: number;
}

interface RecruitsTableProps {
    users: SystemUser[];
    showRecruiter?: boolean;
    hasMore?: boolean;
    onLoadMore?: () => void;
    isFetchingMore?: boolean;
    currentUserRole?: string;
    workLogs?: WorkLog[];
    isLoadingWorkLogs?: boolean;
    selectedWorkLogProjectIds?: number[];
    selectedWorkLogRoles?: string[];
    globalProjectSummaries?: { projectId: number; role: string; overallSpeed: number; overallMinPerTask: number }[];
}

const FACEBOOK_DISPLAY_MAX_LENGTH = 20;

const truncateFacebook = (url: string) =>
    url.length > FACEBOOK_DISPLAY_MAX_LENGTH ? `${url.slice(0, FACEBOOK_DISPLAY_MAX_LENGTH)}...` : url;

const formatPhoneNumber = (phone: string | null | undefined) => {
    if (!phone) return "";
    const clean = phone.trim();
    if (clean.startsWith("639")) {
        return "639" + "*".repeat(Math.max(0, clean.length - 3));
    }
    if (clean.startsWith("+639")) {
        return "+639" + "*".repeat(Math.max(0, clean.length - 4));
    }
    if (clean.startsWith("09")) {
        return "09" + "*".repeat(Math.max(0, clean.length - 2));
    }
    return clean;
};

export default function RecruitsTable({
    users,
    showRecruiter = false,
    currentUserRole,
    workLogs = [],
    isLoadingWorkLogs = false,
    selectedWorkLogProjectIds = [],
    selectedWorkLogRoles = [],
    globalProjectSummaries = []
}: RecruitsTableProps) {
    const canSeeContact = currentUserRole?.toLowerCase() === "judger" || currentUserRole?.toLowerCase() === "admin" || !showRecruiter;
    const canSeePhone = currentUserRole?.toLowerCase() === "judger" || currentUserRole?.toLowerCase() === "admin";

    const canMessageAtAll = currentUserRole?.toLowerCase() === "judger" || currentUserRole?.toLowerCase() === "admin" || currentUserRole?.toLowerCase() === "checker" || currentUserRole?.toLowerCase() === "recruiter";
    const canMessageUser = (user: SystemUser) => {
        const role = currentUserRole?.toLowerCase();
        if (role === "judger" || role === "admin" || role === "recruiter" || role === "checker") return true;
        return false;
    };
    const canBulkMessage = currentUserRole?.toLowerCase() === "judger" || currentUserRole?.toLowerCase() === "admin";

    // Messaging State
    const [usersToMessage, setUsersToMessage] = useState<SystemUser[]>([]);
    const [messageSubject, setMessageSubject] = useState("");
    const [messageText, setMessageText] = useState("");
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [uploadedPhotos, setUploadedPhotos] = useState<File[]>([]);
    const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
    const [sendingProgress, setSendingProgress] = useState({ current: 0, total: 0 });

    // Multi-select State
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const filesArray = Array.from(e.target.files);
            const totalPhotos = uploadedPhotos.length + filesArray.length;
            if (totalPhotos > 2) {
                toast.error("You can only upload a maximum of 2 photos.");
                const allowedNewFiles = filesArray.slice(0, Math.max(0, 2 - uploadedPhotos.length));
                if (allowedNewFiles.length === 0) return;
                const newPreviews = allowedNewFiles.map(f => URL.createObjectURL(f));
                setUploadedPhotos(prev => [...prev, ...allowedNewFiles]);
                setPhotoPreviewUrls(prev => [...prev, ...newPreviews]);
            } else {
                const newPreviews = filesArray.map(f => URL.createObjectURL(f));
                setUploadedPhotos(prev => [...prev, ...filesArray]);
                setPhotoPreviewUrls(prev => [...prev, ...newPreviews]);
            }
        }
    };

    const handleSendMessage = async () => {
        if (usersToMessage.length === 0 || !messageSubject || !messageText) {
            toast.error("Please fill in all fields");
            return;
        }
        setIsSendingMessage(true);
        try {
            let uploadedUrls: string[] = [];
            if (uploadedPhotos.length > 0) {
                toast.loading("Uploading images...", { id: "uploading-images" });
                try {
                    const res = await uploadFiles("directMessageAttachment", {
                        files: uploadedPhotos,
                    });
                    uploadedUrls = res.map((r) => r.ufsUrl);
                    toast.dismiss("uploading-images");
                } catch (err) {
                    toast.dismiss("uploading-images");
                    toast.error("Failed to upload images");
                    setIsSendingMessage(false);
                    return;
                }
            }
            const SOCKET_URL = process.env.NEXT_PUBLIC_SERVER_URL || process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";
            const token = document.cookie.match(new RegExp("(?:^|; )xnite_session=([^;]*)"))?.[1];

            const socket: Socket = io(SOCKET_URL, {
                auth: { token: token ? decodeURIComponent(token) : null, client: "tool" },
                autoConnect: true,
                transports: ["websocket", "polling"],
            });

            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    socket.disconnect();
                    reject(new Error("Connection timeout"));
                }, 8000);
                socket.on("connect", () => {
                    clearTimeout(timeout);
                    resolve(true);
                });
                socket.on("connect_error", (err) => {
                    console.warn("Socket connect_error:", err.message);
                });
            });

            const total = usersToMessage.length;
            const emails = usersToMessage.map(u => u.email);

            if (total === 1) {
                await new Promise((resolve, reject) => {
                    socket.emit("send_direct_message", {
                        toEmail: emails[0],
                        subject: messageSubject,
                        message: messageText,
                        imageUrls: uploadedUrls.length > 0 ? JSON.stringify(uploadedUrls) : null
                    });
                    const onSent = () => {
                        socket.off("direct_message_sent", onSent);
                        socket.off("error_message", onError);
                        resolve(true);
                    };
                    const onError = (err: string) => {
                        socket.off("direct_message_sent", onSent);
                        socket.off("error_message", onError);
                        reject(new Error(err));
                    };
                    socket.on("direct_message_sent", onSent);
                    socket.on("error_message", onError);
                    setTimeout(() => {
                        socket.off("direct_message_sent", onSent);
                        socket.off("error_message", onError);
                        reject(new Error("Timeout"));
                    }, 5000);
                });
                toast.success("Message sent successfully");
            } else {
                toast.loading(`Dispatching bulk message to ${total} users...`, { id: "bulk-message" });
                await new Promise((resolve, reject) => {
                    socket.emit("send_bulk_message", {
                        toEmails: emails,
                        subject: messageSubject,
                        message: messageText,
                        imageUrls: uploadedUrls.length > 0 ? JSON.stringify(uploadedUrls) : null
                    });
                    let timeoutId: NodeJS.Timeout;
                    const cleanup = () => {
                        clearTimeout(timeoutId);
                        socket.off("bulk_message_sent", onSent);
                        socket.off("error_message", onError);
                        socket.off("bulk_message_progress", onProgress);
                    };
                    const onSent = (data: any) => {
                        cleanup();
                        resolve(data);
                    };
                    const onError = (err: string) => {
                        cleanup();
                        reject(new Error(err));
                    };
                    const onProgress = (data: { current: number, total: number }) => {
                        setSendingProgress(data);
                        clearTimeout(timeoutId);
                        timeoutId = setTimeout(() => {
                            cleanup();
                            reject(new Error("Timeout (Stalled during bulk insertion)"));
                        }, 60000);
                    };
                    socket.on("bulk_message_sent", onSent);
                    socket.on("error_message", onError);
                    socket.on("bulk_message_progress", onProgress);
                    timeoutId = setTimeout(() => {
                        cleanup();
                        reject(new Error("Timeout (60s no response)"));
                    }, 60000);
                });
                toast.dismiss("bulk-message");
                toast.success(`Message sent to ${total} users successfully`);
            }

            setTimeout(() => socket.disconnect(), 1000);
            setUsersToMessage([]);
            setSelectedUserIds(new Set());
            setMessageSubject("");
            setMessageText("");
            setUploadedPhotos([]);
            photoPreviewUrls.forEach(url => URL.revokeObjectURL(url));
            setPhotoPreviewUrls([]);
            setSendingProgress({ current: 0, total: 0 });
        } catch (err: any) {
            console.error(err);
            toast.error(err.message || "An error occurred while sending the message");
        } finally {
            setIsSendingMessage(false);
        }
    };

    const toggleSelectUser = (userId: string) => {
        setSelectedUserIds(prev => {
            const next = new Set(prev);
            if (next.has(userId)) next.delete(userId);
            else next.add(userId);
            return next;
        });
    };

    const handleSelectAll = () => {
        const visibleIds = sortedUsers.map(u => u.id);
        const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedUserIds.has(id));
        if (allSelected) {
            setSelectedUserIds(prev => {
                const next = new Set(prev);
                visibleIds.forEach(id => next.delete(id));
                return next;
            });
        } else {
            setSelectedUserIds(prev => {
                const next = new Set(prev);
                visibleIds.forEach(id => next.add(id));
                return next;
            });
        }
    };

    const openMessageModal = (targets: SystemUser[]) => {
        setUsersToMessage(targets);
        setMessageSubject("");
        setMessageText("");
        setUploadedPhotos([]);
        setPhotoPreviewUrls([]);
    };

    const openMessageSelectedModal = async () => {
        if (selectedUserIds.size === 0) {
            toast.error("No users selected");
            return;
        }
        const selected = sortedUsers.filter(u => selectedUserIds.has(u.id));
        openMessageModal(selected);
    };

    const getInitials = (name: string) => {
        return name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
    };

    const [expandedWorkLogIds, setExpandedWorkLogIds] = useState<Set<string>>(new Set());
    const toggleWorkLogs = (userId: string) => {
        setExpandedWorkLogIds((prev) => {
            const next = new Set(prev);
            if (next.has(userId)) next.delete(userId);
            else next.add(userId);
            return next;
        });
    };

    const workLogsByOwner = useMemo(() => {
        const map = new Map<string, WorkLog[]>();
        workLogs?.forEach((log) => {
            if (!log.ownerName) return;
            const key = log.ownerName.trim().toLowerCase();
            let arr = map.get(key);
            if (!arr) {
                arr = [];
                map.set(key, arr);
            }
            arr.push(log);
        });
        return map;
    }, [workLogs]);

    // A user's work can be logged under multiple aliases (name, email, gingerUsername),
    // producing duplicate rows for the same project and role. Keep only the most recent one.
    const getUserWorkLogs = useCallback((user: SystemUser): WorkLogWithImprovement[] => {
        const names = [
            user.name?.trim().toLowerCase(),
            user.email?.trim().toLowerCase(),
            user.gingerUsername?.trim().toLowerCase(),
        ].filter(Boolean) as string[];
        if (names.length === 0) return [];

        const userLogs: WorkLog[] = [];
        names.forEach(name => {
            const arr = workLogsByOwner.get(name);
            if (arr) userLogs.push(...arr);
        });

        // deduplicate userLogs if a log was pushed multiple times
        const uniqueLogsMap = new Map<number, WorkLog>();
        userLogs.forEach(l => uniqueLogsMap.set(l.id, l));
        const uniqueLogs = Array.from(uniqueLogsMap.values());

        const filteredLogs = uniqueLogs.filter((log) => {
            const matchesProject = selectedWorkLogProjectIds.length === 0 || selectedWorkLogProjectIds.includes(log.projectId);
            const matchesRole = selectedWorkLogRoles.length === 0 || selectedWorkLogRoles.includes(log.role.trim().toLowerCase());
            return matchesProject && matchesRole;
        });

        const latestByProject = new Map<string, WorkLogWithImprovement>();
        filteredLogs.forEach((log) => {
            const key = `${log.projectId}_${log.role}`;
            const existing = latestByProject.get(key);
            if (!existing || log.id > existing.id) {
                latestByProject.set(key, { ...log });
            }
        });

        // Calculate improvement
        latestByProject.forEach((latestLog) => {
            if (!latestLog.log_date) return;
            const d = new Date(latestLog.log_date);
            d.setDate(d.getDate() - 1);
            const prevDateStr = d.toISOString().split('T')[0];

            let prevLog: WorkLog | undefined;
            filteredLogs.forEach(log => {
                if (log.projectId === latestLog.projectId && log.role === latestLog.role && log.log_date) {
                    const logDateStr = new Date(log.log_date).toISOString().split('T')[0];
                    if (logDateStr === prevDateStr) {
                        if (!prevLog || log.id > prevLog.id) {
                            prevLog = log;
                        }
                    }
                }
            });

            if (prevLog && prevLog.worktime > 0) {
                const mySpeed = latestLog.worktime > 0 ? latestLog.features / latestLog.worktime : 0;
                const prevSpeed = prevLog.features / prevLog.worktime;
                if (prevSpeed > 0) {
                    latestLog.improvementRate = ((mySpeed - prevSpeed) / prevSpeed) * 100;
                    latestLog.absoluteImprovement = mySpeed - prevSpeed;
                }
            }
        });

        return Array.from(latestByProject.values()).sort(
            (a, b) => a.projectId - b.projectId || a.role.localeCompare(b.role)
        );
    }, [workLogsByOwner, selectedWorkLogProjectIds, selectedWorkLogRoles]);

    // By default only a single worklog entry shows (not one row per project): the most
    // recent entry (highest id) matching the user's current role, falling back to the
    // most recent entry overall if none match. The rest are revealed on expand.
    const getPrimaryAndOtherLogs = (user: SystemUser, uLogs: WorkLogWithImprovement[]) => {
        if (uLogs.length === 0) return { primaryLog: null as WorkLogWithImprovement | null, otherLogs: [] as WorkLogWithImprovement[] };
        const userRoleStr = (user.role || "").trim().toLowerCase();
        const roleMatches = uLogs.filter((log) => log.role.trim().toLowerCase() === userRoleStr);
        const pool = roleMatches.length > 0 ? roleMatches : uLogs;
        const primaryLog = pool.reduce((latest, log) => (log.id > latest.id ? log : latest), pool[0]);
        const otherLogs = uLogs
            .filter((log) => log.id !== primaryLog.id)
            .sort((a, b) => a.projectId - b.projectId || a.role.localeCompare(b.role));
        return { primaryLog, otherLogs };
    };

    interface ProjectLogSummary {
        projectId: number;
        role: string;
        overallSpeed: number;
        overallMinPerTask: number;
    }

    const formatMinPerTask = (tasks: number, worktimeHours: number): string => {
        if (tasks <= 0) return "—";
        const minPerTask = (worktimeHours * 60) / tasks;
        return minPerTask.toFixed(1);
    };

    const getSpeedColorClasses = (speed: number, avgSpeed: number): string => {
        if (avgSpeed <= 0) return "text-[#0D1B2A] dark:text-white/90";
        const ratio = speed / avgSpeed;
        if (ratio >= 1.2) return "text-teal-500 dark:text-teal-400";
        if (ratio >= 0.9) return "text-[#1F7A1F] dark:text-[#55f761]";
        if (ratio >= 0.75) return "text-orange-500 dark:text-orange-400";
        if (ratio >= 0.5) return "text-red-500 dark:text-red-400";
        return "text-violet-500 dark:text-violet-400";
    };

    const getMinPerTaskColorClasses = (minPerTask: number, avgMinPerTask: number): string => {
        if (avgMinPerTask <= 0 || minPerTask <= 0) return "text-[#0D1B2A] dark:text-white/90";
        const ratio = avgMinPerTask / minPerTask;
        if (ratio >= 1.2) return "text-teal-500 dark:text-teal-400";
        if (ratio >= 0.9) return "text-[#1F7A1F] dark:text-[#55f761]";
        if (ratio >= 0.75) return "text-orange-500 dark:text-orange-400";
        if (ratio >= 0.5) return "text-red-500 dark:text-red-400";
        return "text-violet-500 dark:text-violet-400";
    };

    const renderWorkLogRow = (log: WorkLogWithImprovement) => {
        const entrySpeed = log.worktime > 0 ? log.features / log.worktime : 0;
        const entryMinPerTask = log.taskNum > 0 ? (log.worktime * 60) / log.taskNum : 0;
        const summary = globalProjectSummaries.find((s) => s.projectId === log.projectId && s.role === log.role);
        const overallSpeed = summary?.overallSpeed || 0;
        const overallMinPerTask = summary?.overallMinPerTask || 0;

        return (
            <tr key={log.id} className="border-b border-black/5 dark:border-white/5 last:border-0 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                <td className="py-2.5 px-4 text-left font-semibold">
                    <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center justify-center font-mono font-bold text-[10px] px-2 py-0.5 rounded bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 text-[#1F7A1F] dark:text-[#55f761]">
                            #{log.projectId}
                        </span>
                        <span className="inline-flex items-center justify-center font-mono font-bold text-[9px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 text-[#2F3E46]/80 dark:text-white/80 capitalize">
                            {log.role}
                        </span>
                    </div>
                </td>
                <td className="py-2.5 px-4 text-center font-mono font-medium">{log.worktime.toFixed(2)}h</td>
                <td className="py-2.5 px-4 text-center font-mono font-medium">{log.taskNum}</td>
                <td className="py-2.5 px-4 text-center font-mono font-semibold">{log.features}</td>
                <td className="py-2.5 px-4 text-center font-mono font-black">
                    <span className={getMinPerTaskColorClasses(entryMinPerTask, overallMinPerTask)}>
                        {formatMinPerTask(log.taskNum, log.worktime)}
                    </span>
                    <span className="text-[9px] text-gray-500 ml-0.5">min/task</span>
                </td>
                <td className="py-2.5 px-4 text-right font-mono font-black">
                    <div className={`flex flex-col items-end gap-1 ${getSpeedColorClasses(entrySpeed, overallSpeed)}`}>
                        <span>
                            {entrySpeed.toFixed(2)}{" "}
                            <span className="text-[9px] font-normal text-gray-500 font-sans">
                                F/hr
                            </span>
                        </span>
                        {log.absoluteImprovement !== undefined && log.improvementRate !== undefined && (
                            <span className={`flex items-center gap-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${log.absoluteImprovement > 0 ? 'bg-green-500/15 text-green-600 dark:text-green-400' : log.absoluteImprovement < 0 ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-gray-500/15 text-gray-600 dark:text-gray-400'}`}>
                                <span>{log.absoluteImprovement > 0 ? '+' : log.absoluteImprovement < 0 ? '' : ''}{log.absoluteImprovement.toFixed(2)} F/hr</span>
                                <span className="opacity-30">|</span>
                                <span>{log.improvementRate > 0 ? '↑' : log.improvementRate < 0 ? '↓' : ''}{Math.abs(log.improvementRate).toFixed(1)}%</span>
                            </span>
                        )}
                    </div>
                </td>
            </tr>
        );
    };

    const [sortField, setSortField] = useState<"name" | "recruiter" | "createdAt" | "lastLogin">("createdAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");



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


    const getRulesProgress = (user: SystemUser) => {
        if (user.isRulesAndGuidelinesCompleted) return 100;
        const progress = parseJson(user.onRulesAndGuidelinesProgress);
        if (!progress) return 0;
        const current = progress.currentStep || 1;
        return Math.min(100, Math.round((current / 65) * 100));
    };


    const getRulesStep = (user: SystemUser) => {
        if (user.isRulesAndGuidelinesCompleted) return 65;
        const progress = parseJson(user.onRulesAndGuidelinesProgress);
        if (!progress) return 1;
        return progress.currentStep || 1;
    };


    const getTrainingStats = (user: SystemUser, type: 'landcover' | '3d' | 'transpo' | 'roof') => {
        const trainings = user.trainings || [];
        let target = null;
        if (type === 'landcover') {
            target = trainings.find((t: any) => t.name?.toLowerCase().includes("landcover") || t.name?.toLowerCase().includes("land cover"));
        } else if (type === '3d') {
            target = trainings.find((t: any) => t.name?.toLowerCase().includes("3d_match") || t.name?.toLowerCase().includes("3d match"));
        } else if (type === 'transpo') {
            target = trainings.find((t: any) => t.name?.toLowerCase().includes("transportation") || t.name?.toLowerCase().includes("transport"));
        } else if (type === 'roof') {
            target = trainings.find((t: any) => t.name?.toLowerCase().includes("roof"));
        }

        const passed = target ? Number(target.passedTask || 0) : 0;
        let total = target ? Number(target.totalTask || 0) : 0;
        const isPassed = target ? target.trainingStatus === "STATUS_PASSED" : false;

        // Fallbacks for total tasks if missing or 0
        if (type === 'landcover' && total === 0) total = 18;
        if (type === '3d' && total === 0) total = 7;

        if (type === 'transpo' || type === 'roof') {
            return { passed: 0, total: 0, pct: isPassed ? 100 : 0 };
        }

        const pct = total > 0 ? Math.round((passed / total) * 100) : (isPassed ? 100 : 0);
        return { passed, total, pct };
    };

    const handleSort = (field: "name" | "recruiter" | "createdAt" | "lastLogin") => {
        if (sortField === field) {
            setSortOrder(sortOrder === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortOrder("desc");
        }
    };

    const sortedUsers = useMemo(() => {
        return [...users].sort((a, b) => {
            if (sortField === "name") {
                const comparison = a.name.localeCompare(b.name);
                return sortOrder === "asc" ? comparison : -comparison;
            }
            if (sortField === "recruiter") {
                const aRec = (a.labelerRefererEmail ? (a.labelerRefererName || a.labelerRefererEmail) : (a.resolvedRefererName || a.referer?.name || a.refererEmail || "")).toLowerCase();
                const bRec = (b.labelerRefererEmail ? (b.labelerRefererName || b.labelerRefererEmail) : (b.resolvedRefererName || b.referer?.name || b.refererEmail || "")).toLowerCase();
                const comparison = aRec.localeCompare(bRec);
                return sortOrder === "asc" ? comparison : -comparison;
            }
            if (sortField === "lastLogin") {
                const aTime = a.lastLogin ? a.lastLogin.getTime() : 0;
                const bTime = b.lastLogin ? b.lastLogin.getTime() : 0;
                const comparison = aTime - bTime;
                return sortOrder === "asc" ? comparison : -comparison;
            }
            const comparison = a.createdAt.getTime() - b.createdAt.getTime();
            return sortOrder === "asc" ? comparison : -comparison;
        });
    }, [users, sortField, sortOrder]);

    return (
        <div className="w-full">
            {/* Mobile Sort Controls */}
            <div className="flex md:hidden items-center justify-between gap-2 p-4 border-b border-black/10 dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.01]">
                <span className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">Sort Candidates</span>
                <div className="flex flex-wrap justify-end gap-2">
                    <button
                        onClick={() => handleSort("name")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1 hover:cursor-pointer ${sortField === "name"
                            ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                            : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70"
                            }`}
                    >
                        <span>Name</span>
                        {sortField === "name" && (sortOrder === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                    </button>
                    {showRecruiter && (
                        <button
                            onClick={() => handleSort("recruiter")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1 hover:cursor-pointer ${sortField === "recruiter"
                                ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70"
                                }`}
                        >
                            <span>Mentor</span>
                            {sortField === "recruiter" && (sortOrder === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                        </button>
                    )}
                    <button
                        onClick={() => handleSort("createdAt")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1 hover:cursor-pointer ${sortField === "createdAt"
                            ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                            : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70"
                            }`}
                    >
                        <span>Joined Date</span>
                        {sortField === "createdAt" && (sortOrder === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                    </button>
                    <button
                        onClick={() => handleSort("lastLogin")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1 hover:cursor-pointer ${sortField === "lastLogin"
                            ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                            : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70"
                            }`}
                    >
                        <span>Last Login</span>
                        {sortField === "lastLogin" && (sortOrder === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                    </button>
                </div>
            </div>

            {/* Bulk Message Action Bar */}
            {canBulkMessage && (
                <div className="hidden md:flex items-center justify-between gap-3 px-4 py-2.5 border-b border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleSelectAll}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 rounded-lg text-xs font-bold transition-all cursor-pointer text-[#2F3E46]/80 dark:text-white/80"
                        >
                            <CheckSquare className="w-3.5 h-3.5" />
                            Select All
                        </button>
                        {selectedUserIds.size > 0 && (
                            <span className="text-xs font-bold text-[#1F7A1F] dark:text-[#55f761] ml-2">
                                {selectedUserIds.size} selected
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {selectedUserIds.size > 0 ? (
                            <>
                                <button
                                    onClick={() => setSelectedUserIds(new Set())}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#2F3E46]/60 dark:text-white/50 hover:text-[#0D1B2A] dark:hover:text-white transition-colors cursor-pointer"
                                >
                                    <X className="w-3.5 h-3.5" />
                                    Clear
                                </button>
                                <button
                                    onClick={openMessageSelectedModal}
                                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1F7A1F] hover:bg-[#1A661A] text-white dark:text-[#55f761] dark:bg-[#55f761]/15 dark:hover:bg-[#55f761]/25 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer hover:scale-[1.02]"
                                >
                                    <CheckSquare className="w-3.5 h-3.5" />
                                    Message Selected ({selectedUserIds.size})
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => openMessageModal(sortedUsers)}
                                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1F7A1F] hover:bg-[#1A661A] text-white dark:text-[#55f761] dark:bg-[#55f761]/15 dark:hover:bg-[#55f761]/25 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer hover:scale-[1.02]"
                            >
                                <MessageSquare className="w-3.5 h-3.5" />
                                Message to All
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full border-collapse text-left">
                    <thead>
                        <tr className="border-b border-black/10 dark:border-white/10 text-xs font-bold uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40 bg-black/[0.02] dark:bg-white/[0.02]">
                            <th
                                className="px-3 py-3 lg:px-4 lg:py-4 cursor-pointer select-none group/col"
                                onClick={() => handleSort("name")}
                            >
                                <div className="flex items-center gap-1.5 hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-colors">
                                    <span>User Details</span>
                                    {sortField === "name" ? (
                                        sortOrder === "asc" ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                                    ) : (
                                        <ArrowUpDown className="w-3.5 h-3.5 opacity-0 group-hover/col:opacity-70 transition-opacity" />
                                    )}
                                </div>
                            </th>
                            {showRecruiter && (
                                <th
                                    className="px-3 py-3 lg:px-4 lg:py-4 cursor-pointer select-none group/col"
                                    onClick={() => handleSort("recruiter")}
                                >
                                    <div className="flex items-center gap-1.5 hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-colors">
                                        <span>Mentor</span>
                                        {sortField === "recruiter" ? (
                                            sortOrder === "asc" ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                                        ) : (
                                            <ArrowUpDown className="w-3.5 h-3.5 opacity-0 group-hover/col:opacity-70 transition-opacity" />
                                        )}
                                    </div>
                                </th>
                            )}
                            <th className="px-3 py-3 lg:px-4 lg:py-4">Status / Progress</th>
                            <th className="px-3 py-3 lg:px-4 lg:py-4">Training</th>
                            <th className="px-3 py-3 lg:px-4 lg:py-4">
                                <ActivityHeader sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
                            </th>
                            {canMessageAtAll && <th className="px-3 py-3 lg:px-4 lg:py-4 pr-6 lg:pr-8 text-right">Actions</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10 dark:divide-white/10 text-sm">
                        {sortedUsers.map((user) => {
                            const rulesPct = getRulesProgress(user);
                            const userWorkLogs = getUserWorkLogs(user);
                            const { primaryLog, otherLogs } = getPrimaryAndOtherLogs(user, userWorkLogs);
                            const isWorkLogsExpanded = expandedWorkLogIds.has(user.id);
                            const hasLogs = userWorkLogs.length > 0;

                            return (
                                <Fragment key={user.id}>
                                <tr
                                    className="hover:bg-black/[0.02] dark:hover:bg-white/5 transition-colors group"
                                >
                                    {/* User Profile */}
                                    <td className="px-3 py-3 lg:px-4 lg:py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-[#1F7A1F]/15 dark:bg-[#55f761]/15 text-[#1F7A1F] dark:text-[#55f761] flex items-center justify-center font-bold tracking-wider select-none shrink-0 group-hover:scale-105 transition-transform">
                                                {getInitials(user.name)}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-bold text-[#0D1B2A] dark:text-white truncate">
                                                        {user.name}
                                                    </span>
                                                    {!!currentUserRole && (
                                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold border shrink-0 ${
                                                            user.status === "Deactivated"
                                                                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800"
                                                                : "bg-[#1F7A1F]/10 text-[#1F7A1F] border-[#1F7A1F]/25 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800"
                                                        }`}>
                                                            {user.status || "Active"}
                                                        </span>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigator.clipboard.writeText(user.email);
                                                        toast.success("Email copied to clipboard");
                                                    }}
                                                    className="text-xs text-[#2F3E46]/60 dark:text-white/40 hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-colors truncate flex items-center gap-1 w-fit cursor-pointer"
                                                >
                                                    <Mail className="w-3 h-3 shrink-0" />
                                                    {user.email}
                                                </button>
                                                {canSeePhone && user.phone && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigator.clipboard.writeText(user.phone!);
                                                            toast.success("Phone number copied to clipboard");
                                                        }}
                                                        className="text-xs text-left text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 truncate flex items-center gap-1 w-fit cursor-pointer mt-0.5"
                                                    >
                                                        <Phone className="w-3 h-3 shrink-0" />
                                                        {formatPhoneNumber(user.phone)}
                                                    </button>
                                                )}
                                                {canSeeContact && user.facebook && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (e.button === 1) {
                                                                e.preventDefault();
                                                                const fbUrl = user.facebook!.startsWith("http") ? user.facebook! : `https://${user.facebook}`;
                                                                window.open(fbUrl, "_blank", "noopener,noreferrer");
                                                                return;
                                                            }
                                                            const fbUrl = user.facebook!.startsWith("http") ? user.facebook! : `https://${user.facebook}`;
                                                            navigator.clipboard.writeText(fbUrl);
                                                            toast.success("Facebook link copied to clipboard");
                                                        }}
                                                        onMouseDown={(e) => {
                                                            if (e.button === 1) {
                                                                e.stopPropagation();
                                                                e.preventDefault();
                                                            }
                                                        }}
                                                        onAuxClick={(e) => {
                                                            if (e.button === 1) {
                                                                e.stopPropagation();
                                                                e.preventDefault();
                                                                const fbUrl = user.facebook!.startsWith("http") ? user.facebook! : `https://${user.facebook}`;
                                                                window.open(fbUrl, "_blank", "noopener,noreferrer");
                                                            }
                                                        }}
                                                        title={user.facebook}
                                                        className="text-xs text-left text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 max-w-full mt-0.5 cursor-pointer"
                                                    >
                                                        <Globe className="w-3.5 h-3.5 shrink-0" />
                                                        <span>{truncateFacebook(user.facebook)}</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </td>

                                    {showRecruiter && (
                                        <td className="px-3 py-3 lg:px-4 lg:py-4 text-[#2F3E46]/80 dark:text-white/70 font-semibold max-w-[150px] break-words">
                                            {user.labelerRefererEmail ? (user.labelerRefererName || user.labelerRefererEmail) : (user.resolvedRefererName || user.referer?.name || user.refererEmail || "Direct")}
                                        </td>
                                    )}

                                    {/* Status / Progress */}
                                    <td className="px-3 py-3 lg:px-4 lg:py-4 whitespace-nowrap">
                                        <div className="flex flex-col gap-2.5 w-[200px]">
                                            {/* Onboarding Progress */}
                                            <OnboardingProgressCell onboardingProgress={user.onboardingProgress} isDashboardCompleted={user.isDashboardCompleted} traineeName={user.name} />

                                            {/* Rules & Guidelines Progress */}
                                            <div className="space-y-1">
                                                <div className="flex justify-between items-center text-xs gap-1.5">
                                                    <span className="font-semibold text-[#2F3E46]/80 dark:text-white/70 truncate" title={`Rules: Step ${getRulesStep(user)}/65`}>Rules: Step {getRulesStep(user)}/65</span>
                                                    <span className={`font-bold shrink-0 ${rulesPct === 100 ? "text-[#1F7A1F] dark:text-[#55f761]" : "text-[#2F3E46]/60 dark:text-white/40"}`}>
                                                        {rulesPct}%
                                                    </span>
                                                </div>
                                                <div className="w-full bg-black/10 dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${rulesPct === 100 ? "bg-[#1F7A1F] dark:bg-[#55f761]" : "bg-purple-500 dark:bg-purple-400"}`}
                                                        style={{ width: `${rulesPct}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Training */}
                                    <td className="px-3 py-3 lg:px-4 lg:py-4 whitespace-nowrap align-top">
                                        <div className="flex flex-col gap-1.5 text-xs w-[160px]">
                                            {[
                                                { id: 'landcover' as const, label: 'Landcover' },
                                                { id: '3d' as const, label: '3D Matching' },
                                                { id: 'transpo' as const, label: 'Transpo' },
                                                { id: 'roof' as const, label: 'Roof' }
                                            ].map(({ id, label }) => {
                                                const stats = getTrainingStats(user, id);
                                                return (
                                                    <div key={id} className="space-y-1">
                                                        <div className="flex justify-between items-center gap-2">
                                                            <span className="text-[#2F3E46]/80 dark:text-white/70 font-semibold">{label}</span>
                                                            <div className="flex items-center gap-2 text-right">
                                                                <span className="text-[#2F3E46]/60 dark:text-white/40">{stats.passed}/{stats.total}</span>
                                                                <span className={`font-bold w-9 text-right ${stats.pct === 100 ? "text-[#1F7A1F] dark:text-[#55f761]" : "text-[#2F3E46]/60 dark:text-white/40"}`}>{stats.pct}%</span>
                                                            </div>
                                                        </div>
                                                        <div className="w-full bg-black/10 dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full transition-all duration-500 ${stats.pct === 100 ? "bg-[#1F7A1F] dark:bg-[#55f761]" : "bg-teal-500 dark:bg-teal-400"}`}
                                                                style={{ width: `${stats.pct}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </td>

                                    {/* Activity (last login + joined) */}
                                    <td className={`px-3 py-3 lg:px-4 lg:py-4 whitespace-nowrap ${!canMessageAtAll ? "pr-6 lg:pr-8" : ""}`}>
                                        <ActivityCell createdAt={user.createdAt} lastLogin={user.lastLogin} />
                                    </td>
                                    {canMessageAtAll && (
                                        <td className="px-3 py-3 lg:px-4 lg:py-4 pr-6 lg:pr-8 whitespace-nowrap text-right">
                                            {canMessageUser(user) && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); openMessageModal([user]); }}
                                                    title={`Message ${user.name}`}
                                                    className="flex items-center justify-center px-2 py-1.5 bg-[#1F7A1F] hover:bg-[#1A661A] dark:bg-[#55f761]/10 dark:hover:bg-[#55f761]/20 text-white dark:text-[#55f761] rounded-md transition-colors shadow-sm cursor-pointer shrink-0 ml-auto"
                                                >
                                                    <MessageSquare className="w-4 h-4" />
                                                </button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                                {hasLogs && (
                                    <tr className="bg-black/[0.03] dark:bg-black/40">
                                        <td colSpan={showRecruiter ? (canMessageAtAll ? 6 : 5) : (canMessageAtAll ? 5 : 4)} className="px-3 py-3 lg:px-4 lg:py-3">
                                            <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                                                <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10 shadow-xs">
                                                    <table className="w-full text-xs text-left border-collapse bg-white/30 dark:bg-black/15">
                                                        <thead>
                                                            <tr className="border-b border-black/10 dark:border-white/10 text-[#2F3E46]/80 dark:text-white/60 bg-black/5 dark:bg-white/5 font-bold">
                                                                <th className="py-2.5 px-4 text-left">Project ID</th>
                                                                <th className="py-2.5 px-4 text-center">Worktime (Hours)</th>
                                                                <th className="py-2.5 px-4 text-center">Tasks Completed</th>
                                                                <th className="py-2.5 px-4 text-center">Features Mapped</th>
                                                                <th className="py-2.5 px-4 text-center">Min / Task</th>
                                                                <th className="py-2.5 px-4 text-right">
                                                                    <div className="flex items-center justify-end gap-1">
                                                                        <span>Computed Speed</span>
                                                                        {otherLogs.length > 0 && (
                                                                            <button
                                                                                onClick={() => toggleWorkLogs(user.id)}
                                                                                className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] font-bold transition-all cursor-pointer"
                                                                                title={isWorkLogsExpanded ? "Hide all worklogs" : "Show all worklogs"}
                                                                            >
                                                                                <span>{otherLogs.length}</span>
                                                                                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isWorkLogsExpanded ? "rotate-180" : ""}`} />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="text-[#0D1B2A] dark:text-white/90">
                                                            {primaryLog && renderWorkLogRow(primaryLog)}
                                                            {isWorkLogsExpanded && otherLogs.map((log) => renderWorkLogRow(log))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                </Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Mobile Bulk Actions */}
            {canBulkMessage && (
                <div className="flex md:hidden items-center justify-between gap-2 px-4 py-2.5 border-b border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleSelectAll}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 rounded-lg text-[11px] font-bold transition-all cursor-pointer text-[#2F3E46]/80 dark:text-white/80"
                        >
                            <CheckSquare className="w-3 h-3" />
                            Select All
                        </button>
                        <span className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40">
                            {selectedUserIds.size > 0 ? `${selectedUserIds.size} selected` : ""}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {selectedUserIds.size > 0 ? (
                            <button
                                onClick={openMessageSelectedModal}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-[#1F7A1F] hover:bg-[#1A661A] dark:bg-[#55f761]/15 dark:hover:bg-[#55f761]/25 text-white dark:text-[#55f761] rounded-lg text-[11px] font-bold transition-all shadow-sm cursor-pointer"
                            >
                                <MessageSquare className="w-3.5 h-3.5" />
                                Message ({selectedUserIds.size})
                            </button>
                        ) : (
                            <button
                                onClick={() => openMessageModal(sortedUsers)}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-[#1F7A1F] hover:bg-[#1A661A] dark:bg-[#55f761]/15 dark:hover:bg-[#55f761]/25 text-white dark:text-[#55f761] rounded-lg text-[11px] font-bold transition-all shadow-sm cursor-pointer"
                            >
                                <MessageSquare className="w-3.5 h-3.5" />
                                Message All
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Mobile Cards View */}
            <div className="block md:hidden divide-y divide-black/10 dark:divide-white/10">
                {sortedUsers.map((user) => {
                    const rulesPct = getRulesProgress(user);
                    const userWorkLogs = getUserWorkLogs(user);
                    const hasWorkLogs = userWorkLogs.length > 0;
                    const isWorkLogsExpanded = expandedWorkLogIds.has(user.id);
                    const { primaryLog, otherLogs } = getPrimaryAndOtherLogs(user, userWorkLogs);

                    return (
                        <div
                            key={user.id}
                            onClick={() => { if (canBulkMessage) toggleSelectUser(user.id); }}
                            className={`p-4 space-y-4 hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition-colors group ${selectedUserIds.has(user.id) ? "bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 outline outline-2 outline-[#1F7A1F] dark:outline-[#55f761] -outline-offset-2 z-10 relative" : ""} ${canBulkMessage ? "cursor-pointer" : ""}`}
                        >
                            {/* User details */}
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-[#1F7A1F]/15 dark:bg-[#55f761]/15 text-[#1F7A1F] dark:text-[#55f761] flex items-center justify-center font-bold tracking-wider select-none shrink-0">
                                    {getInitials(user.name)}
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="font-bold text-[#0D1B2A] dark:text-white truncate">
                                        {user.name}
                                    </span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            navigator.clipboard.writeText(user.email);
                                            toast.success("Email copied to clipboard");
                                        }}
                                        className="text-xs text-[#2F3E46]/60 dark:text-white/40 hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-colors truncate flex items-center gap-1 w-fit cursor-pointer"
                                    >
                                        <Mail className="w-3 h-3 shrink-0" />
                                        {user.email}
                                    </button>
                                    {canSeePhone && user.phone && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigator.clipboard.writeText(user.phone!);
                                                toast.success("Phone number copied to clipboard");
                                            }}
                                            className="text-xs text-left text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 truncate flex items-center gap-1 w-fit cursor-pointer mt-0.5"
                                        >
                                            <Phone className="w-3 h-3 shrink-0" />
                                            {formatPhoneNumber(user.phone)}
                                        </button>
                                    )}
                                    {canSeeContact && user.facebook && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (e.button === 1) {
                                                    e.preventDefault();
                                                    const fbUrl = user.facebook!.startsWith("http") ? user.facebook! : `https://${user.facebook}`;
                                                    window.open(fbUrl, "_blank", "noopener,noreferrer");
                                                    return;
                                                }
                                                const fbUrl = user.facebook!.startsWith("http") ? user.facebook! : `https://${user.facebook}`;
                                                navigator.clipboard.writeText(fbUrl);
                                                toast.success("Facebook link copied to clipboard");
                                            }}
                                            onMouseDown={(e) => {
                                                if (e.button === 1) {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                }
                                            }}
                                            onAuxClick={(e) => {
                                                if (e.button === 1) {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                    const fbUrl = user.facebook!.startsWith("http") ? user.facebook! : `https://${user.facebook}`;
                                                    window.open(fbUrl, "_blank", "noopener,noreferrer");
                                                }
                                            }}
                                            title={user.facebook}
                                            className="text-xs text-left text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 max-w-full mt-0.5 cursor-pointer"
                                        >
                                            <Globe className="w-3.5 h-3.5 shrink-0" />
                                            <span>{truncateFacebook(user.facebook)}</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Status / Progress bars */}
                            <div className="space-y-3">
                                {/* Onboarding */}
                                <OnboardingProgressCell onboardingProgress={user.onboardingProgress} isDashboardCompleted={user.isDashboardCompleted} traineeName={user.name} />

                                {/* Rules & Guidelines */}
                                <div className="space-y-1">
                                    <div className="flex justify-between items-center text-xs gap-1.5">
                                        <span className="font-semibold text-[#2F3E46]/80 dark:text-white/70 truncate" title={`Rules: Step ${getRulesStep(user)}/65`}>Rules: Step {getRulesStep(user)}/65</span>
                                        <span className={`font-bold shrink-0 ${rulesPct === 100 ? "text-[#1F7A1F] dark:text-[#55f761]" : "text-[#2F3E46]/60 dark:text-white/40"}`}>
                                            {rulesPct}%
                                        </span>
                                    </div>
                                    <div className="w-full bg-black/10 dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${rulesPct === 100 ? "bg-[#1F7A1F] dark:bg-[#55f761]" : "bg-purple-500 dark:bg-purple-400"}`}
                                            style={{ width: `${rulesPct}%` }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Training Section */}
                            <div className="space-y-1.5 pt-2 border-t border-black/5 dark:border-white/5">
                                <span className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">Training</span>
                                <div className="flex flex-col gap-1 text-xs">
                                    {[
                                        { id: 'landcover' as const, label: 'Landcover' },
                                        { id: '3d' as const, label: '3D Matching' },
                                        { id: 'transpo' as const, label: 'Transpo' },
                                        { id: 'roof' as const, label: 'Roof' }
                                    ].map(({ id, label }) => {
                                        const stats = getTrainingStats(user, id);
                                        return (
                                            <div key={id} className="space-y-1">
                                                <div className="flex justify-between items-center gap-2">
                                                    <span className="text-[#2F3E46]/80 dark:text-white/70 font-semibold">{label}</span>
                                                    <div className="flex items-center gap-2 text-right">
                                                        <span className="text-[#2F3E46]/60 dark:text-white/40">{stats.passed}/{stats.total}</span>
                                                        <span className={`font-bold w-9 text-right ${stats.pct === 100 ? "text-[#1F7A1F] dark:text-[#55f761]" : "text-[#2F3E46]/60 dark:text-white/40"}`}>{stats.pct}%</span>
                                                    </div>
                                                </div>
                                                <div className="w-full bg-black/10 dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${stats.pct === 100 ? "bg-[#1F7A1F] dark:bg-[#55f761]" : "bg-teal-500 dark:bg-teal-400"}`}
                                                        style={{ width: `${stats.pct}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Worklogs Section */}
                            {hasWorkLogs && (
                                <div className="space-y-2 pt-2 border-t border-black/5 dark:border-white/5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">Worklogs</span>
                                        {otherLogs.length > 0 && (
                                            <button
                                                onClick={() => toggleWorkLogs(user.id)}
                                                className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold transition-all cursor-pointer"
                                            >
                                                <span>{otherLogs.length}</span>
                                                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isWorkLogsExpanded ? "rotate-180" : ""}`} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        {[primaryLog, ...(isWorkLogsExpanded ? otherLogs : [])].filter((log): log is WorkLog => log !== null).map((log) => {
                                            const entrySpeed = log.worktime > 0 ? log.features / log.worktime : 0;
                                            const entryMinPerTask = log.taskNum > 0 ? (log.worktime * 60) / log.taskNum : 0;
                                            const summary = globalProjectSummaries.find((s) => s.projectId === log.projectId && s.role === log.role);
                                            return (
                                                <div key={log.id} className="bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-xl p-2.5 space-y-1.5 text-xs">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="inline-flex items-center justify-center font-mono font-bold text-[10px] px-2 py-0.5 rounded bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 text-[#1F7A1F] dark:text-[#55f761]">
                                                            #{log.projectId}
                                                        </span>
                                                        <span className="inline-flex items-center justify-center font-mono font-bold text-[9px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 text-[#2F3E46]/80 dark:text-white/80 capitalize">
                                                            {log.role}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between font-mono font-medium">
                                                        <span className="text-[#2F3E46]/70 dark:text-white/60">{log.worktime.toFixed(2)}h · {log.taskNum} tasks · {log.features} features</span>
                                                        <span className="flex items-center gap-2">
                                                            <span className={getMinPerTaskColorClasses(entryMinPerTask, summary?.overallMinPerTask || 0)}>
                                                                {formatMinPerTask(log.taskNum, log.worktime)} min/task
                                                            </span>
                                                            <span className={getSpeedColorClasses(entrySpeed, summary?.overallSpeed || 0)}>
                                                                {entrySpeed.toFixed(2)} F/hr
                                                            </span>
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Joined Date */}
                            {showRecruiter && (
                                <div className="flex items-center justify-between text-xs text-[#2F3E46]/60 dark:text-white/40 pt-1 border-t border-black/5 dark:border-white/5">
                                    <span>Mentor</span>
                                    <span className="font-semibold text-[#0D1B2A] dark:text-white">{user.labelerRefererName || user.referer?.name || user.refererEmail || "Direct"}</span>
                                </div>
                            )}

                            <div className="flex items-center justify-between gap-3 text-xs text-[#2F3E46]/60 dark:text-white/40 pt-1 border-t border-black/5 dark:border-white/5">
                                <span>Activity</span>
                                <ActivityCell createdAt={user.createdAt} lastLogin={user.lastLogin} align="right" />
                            </div>
                            
                            {/* Actions Mobile */}
                            {canMessageUser(user) && (
                                <div className="pt-3 border-t border-black/5 dark:border-white/5">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); openMessageModal([user]); }}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1F7A1F] hover:bg-[#1A661A] dark:bg-[#55f761]/10 dark:hover:bg-[#55f761]/20 text-white dark:text-[#55f761] text-xs font-bold rounded-xl transition-colors shadow-sm cursor-pointer"
                                    >
                                        <MessageSquare className="w-4 h-4" />
                                        <span>Send Message</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Direct Message Compose Modal */}
            <Dialog open={usersToMessage.length > 0} onOpenChange={(open) => !open && setUsersToMessage([])}>
                <DialogContent className="sm:max-w-2xl bg-white dark:bg-[#1A232C] border-black/10 dark:border-white/10 shadow-2xl z-[100] p-0 overflow-hidden">
                    <DialogHeader className="px-6 py-5 border-b border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02]">
                        <DialogTitle className="flex items-center gap-2.5 text-lg font-bold text-[#0D1B2A] dark:text-white">
                            <div className="w-8 h-8 rounded-full bg-[#1F7A1F]/15 dark:bg-[#55f761]/15 flex items-center justify-center">
                                {usersToMessage.length === 1 ? (
                                    <MessageSquare className="w-4 h-4 text-[#1F7A1F] dark:text-[#55f761]" />
                                ) : (
                                    <Users className="w-4 h-4 text-[#1F7A1F] dark:text-[#55f761]" />
                                )}
                            </div>
                            {usersToMessage.length === 1
                                ? `Message ${usersToMessage[0]?.name}`
                                : `Message ${usersToMessage.length} Users`
                            }
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex flex-col gap-5 p-6 max-h-[70vh] overflow-y-auto">
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-[#2F3E46]/60 dark:text-white/50 uppercase tracking-widest">To</label>
                            {usersToMessage.length === 1 ? (
                                <div className="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-xl text-sm font-semibold text-[#0D1B2A] dark:text-white flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-[#1F7A1F]/20 dark:bg-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] flex items-center justify-center text-[10px] tracking-wider">
                                        {usersToMessage[0]?.name ? getInitials(usersToMessage[0].name) : ""}
                                    </div>
                                    <div className="flex flex-col leading-tight">
                                        <span>{usersToMessage[0]?.name}</span>
                                        <span className="text-[10px] text-[#2F3E46]/60 dark:text-white/40 font-medium">{usersToMessage[0]?.email}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-xl overflow-hidden">
                                    <div className="px-4 py-2.5 flex items-center gap-2 border-b border-black/5 dark:border-white/5">
                                        <div className="w-6 h-6 rounded-full bg-[#1F7A1F]/20 dark:bg-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] flex items-center justify-center text-[10px] font-bold">
                                            {usersToMessage.length}
                                        </div>
                                        <span className="text-sm font-semibold text-[#0D1B2A] dark:text-white">
                                            {usersToMessage.length} recipients
                                        </span>
                                    </div>
                                    <div className="max-h-[120px] overflow-y-auto px-2 py-1.5">
                                        <div className="flex flex-wrap gap-1.5">
                                            {usersToMessage.map((u) => (
                                                <span
                                                    key={u.id}
                                                    className="inline-flex items-center gap-1 px-2 py-1 bg-[#1F7A1F]/8 dark:bg-[#55f761]/8 text-[#1F7A1F] dark:text-[#55f761] rounded-lg text-[10px] font-semibold"
                                                >
                                                    {u.name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-[#2F3E46]/60 dark:text-white/50 uppercase tracking-widest">Subject</label>
                            <input
                                type="text"
                                value={messageSubject}
                                onChange={(e) => setMessageSubject(e.target.value)}
                                placeholder="E.g., Important Announcement, Training Update..."
                                className="w-full px-4 py-3 bg-white dark:bg-[#1A232C] border border-black/10 dark:border-white/10 rounded-xl text-sm text-[#0D1B2A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1F7A1F]/50 dark:focus:ring-[#55f761]/50 focus:border-[#1F7A1F] dark:focus:border-[#55f761] transition-all placeholder:text-black/30 dark:placeholder:text-white/30"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-[#2F3E46]/60 dark:text-white/50 uppercase tracking-widest">Message</label>
                            <textarea
                                value={messageText}
                                onChange={(e) => setMessageText(e.target.value)}
                                placeholder="Write your message here..."
                                rows={6}
                                className="w-full px-4 py-3 bg-white dark:bg-[#1A232C] border border-black/10 dark:border-white/10 rounded-xl text-sm text-[#0D1B2A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1F7A1F]/50 dark:focus:ring-[#55f761]/50 focus:border-[#1F7A1F] dark:focus:border-[#55f761] transition-all placeholder:text-black/30 dark:placeholder:text-white/30 resize-none"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-[#2F3E46]/60 dark:text-white/50 uppercase tracking-widest">Photo Attachments (Optional)</label>

                            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-black/10 dark:border-white/10 hover:border-[#1F7A1F] dark:hover:border-[#55f761] bg-black/[0.02] dark:bg-white/[0.02] hover:bg-[#1F7A1F]/5 dark:hover:bg-[#55f761]/5 rounded-xl cursor-pointer transition-all group">
                                <div className="w-10 h-10 rounded-full bg-white dark:bg-[#1A232C] shadow-sm flex items-center justify-center mb-2 group-hover:scale-110 transition-transform text-[#2F3E46]/40 dark:text-white/40 group-hover:text-[#1F7A1F] dark:group-hover:text-[#55f761]">
                                    <ImagePlus className="w-5 h-5" />
                                </div>
                                <span className="text-xs font-semibold text-[#2F3E46]/60 dark:text-white/60 group-hover:text-[#1F7A1F] dark:group-hover:text-[#55f761] transition-colors">
                                    Click to upload images
                                </span>
                                <span className="text-[10px] font-medium text-[#2F3E46]/40 dark:text-white/40 mt-1">
                                    PNG, JPG, WEBP up to 5MB (Max 2)
                                </span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={handleFileSelect}
                                />
                            </label>

                            {photoPreviewUrls.length > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
                                    {photoPreviewUrls.map((url, index) => (
                                        <div key={url} className="relative w-full rounded-xl overflow-hidden border border-black/10 dark:border-white/10 shadow-sm group bg-black/5 dark:bg-white/5 flex items-center justify-center aspect-square">
                                            <img src={url} alt={`Preview ${index + 1}`} className="object-cover w-full h-full" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        const newPhotos = [...uploadedPhotos];
                                                        newPhotos.splice(index, 1);
                                                        setUploadedPhotos(newPhotos);

                                                        const newUrls = [...photoPreviewUrls];
                                                        URL.revokeObjectURL(newUrls[index]);
                                                        newUrls.splice(index, 1);
                                                        setPhotoPreviewUrls(newUrls);
                                                    }}
                                                    className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-[10px] font-bold transition-transform hover:scale-105 flex items-center gap-1.5 shadow-lg"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter className="px-6 py-4 border-t border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02]">
                        <button
                            onClick={() => setUsersToMessage([])}
                            disabled={isSendingMessage}
                            className="px-5 py-2.5 text-xs font-bold text-[#2F3E46]/70 dark:text-white/70 hover:text-[#0D1B2A] dark:hover:text-white transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSendMessage}
                            disabled={isSendingMessage || !messageSubject || !messageText}
                            className="px-6 py-2.5 bg-[#1F7A1F] text-white rounded-xl text-xs font-bold hover:bg-[#1A661A] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md hover:shadow-lg disabled:hover:shadow-md hover:-translate-y-0.5 disabled:hover:translate-y-0"
                        >
                            {isSendingMessage ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>
                                        {sendingProgress.total > 1
                                            ? `Sending ${sendingProgress.current}/${sendingProgress.total}...`
                                            : "Sending..."
                                        }
                                    </span>
                                </>
                            ) : (
                                <>
                                    <Send className="w-4 h-4" />
                                    <span>
                                        {usersToMessage.length === 1
                                            ? "Send Message"
                                            : `Send to ${usersToMessage.length} Users`
                                        }
                                    </span>
                                </>
                            )}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
