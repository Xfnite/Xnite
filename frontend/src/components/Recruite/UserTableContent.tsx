"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Globe, Mail, ArrowUpDown, ArrowUp, ArrowDown, Phone, MessageSquare, Send, X, ImagePlus, Trash2, Users, CheckSquare, UserPlus, UserMinus, UserCheck } from "lucide-react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { uploadFiles } from "@/utils/uploadthing";
import OnboardingProgressCell from "@/components/Onboarding/OnboardingProgressCell";
import { ActivityCell, ActivityHeader } from "@/components/Recruite/ActivityCell";
import { promoteUserToRecruiterAction, demoteRecruiterAction } from "@/app/actions/referrals";
import { activateUsersAction } from "@/app/actions/activation";

const Facebook = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

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
    labelerRefererFacebook?: string | null;
    resolvedRefererName?: string | null;
    resolvedRefererFacebook?: string | null;
    referer?: {
        name: string | null;
    } | null;
    onboardingProgress: any;
    isRulesAndGuidelinesCompleted: boolean;
    onRulesAndGuidelinesProgress: any;
    facebook?: string | null;
    trainings?: any[];
    groupOrTeamName?: string | null;
    checkerName?: string | null;
    checkerFacebook?: string | null;
    checkerPhone?: string | null;
    judgerName?: string | null;
    judgerFacebook?: string | null;
    judgerPhone?: string | null;
}

interface Recruiter {
    email: string;
    name: string | null;
    username?: string | null;
}
interface UserTableContentProps {
    users: SystemUser[];
    recruiters: Recruiter[];
    currentUserRole?: string;
    fetchAllMatchingUsers?: () => Promise<SystemUser[]>;
    onUserActivated?: (userId: string) => void;
}

const truncateFacebook = (url: string | null | undefined) => {
    if (!url) return "";
    let clean = url.trim().replace(/^(https?:\/\/)?(www\.)?(facebook\.com|fb\.com)\//i, "");
    clean = clean.split('?')[0].replace(/\/$/, "");
    if (clean.length <= 10) return clean;
    return clean.slice(0, 10) + "...";
};

const censorPhoneNumber = (phone: string | null | undefined) => {
    if (!phone) return "";
    const clean = phone.trim();
    if (clean.length <= 6) return "*****";
    return clean.slice(0, 4) + "*".repeat(clean.length - 6) + clean.slice(-2);
};

const renderContactLink = (
    label: string, 
    value: string, 
    openUrl: string | null, 
    isCensored: boolean, 
    colorClass: string
) => {
    const displayText = isCensored ? censorPhoneNumber(label) : label;

    if (!openUrl) {
        return (
            <span
                onClick={() => {
                    navigator.clipboard.writeText(value);
                    toast.success(`Copied: ${value}`);
                }}
                className={`font-semibold cursor-pointer hover:underline transition-all text-[10px] ${colorClass}`}
                title="Click to copy"
            >
                {displayText}
            </span>
        );
    }

    return (
        <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
                if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                    e.preventDefault();
                    navigator.clipboard.writeText(value);
                    toast.success(`Copied: ${value}`);
                }
            }}
            className={`font-semibold cursor-pointer hover:underline transition-all text-[10px] ${colorClass}`}
            title={`${value} (Click to copy, Scroll-wheel click to open)`}
        >
            {displayText}
        </a>
    );
};

export default function UserTableContent({ users, recruiters, currentUserRole, fetchAllMatchingUsers, onUserActivated }: UserTableContentProps) {
    const canMessageAtAll = currentUserRole?.toLowerCase() === "judger" || currentUserRole?.toLowerCase() === "admin" || currentUserRole?.toLowerCase() === "checker";
    const canMessageUser = (user: SystemUser) => {
        const role = currentUserRole?.toLowerCase();
        if (role === "judger" || role === "admin") return true;
        if (role === "checker") {
            const targetRole = user.role?.toLowerCase() || user.status?.toLowerCase() || "";
            return targetRole === "labeler" || targetRole === "old-labeler";
        }
        return false;
    };
    const canBulkMessage = currentUserRole?.toLowerCase() === "judger" || currentUserRole?.toLowerCase() === "admin";
    const [sortField, setSortField] = useState<"name" | "recruiter" | "group" | "createdAt" | "lastLogin">("createdAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    // Messaging State
    const [usersToMessage, setUsersToMessage] = useState<SystemUser[]>([]);
    const [messageSubject, setMessageSubject] = useState("");
    const [messageText, setMessageText] = useState("");
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [uploadedPhotos, setUploadedPhotos] = useState<File[]>([]);
    const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
    const [sendingProgress, setSendingProgress] = useState({ current: 0, total: 0 });

    // Promote to Recruiter (admin only)
    const isAdmin = currentUserRole?.toLowerCase() === "admin";
    const [userToPromote, setUserToPromote] = useState<SystemUser | null>(null);
    const [isPromoting, setIsPromoting] = useState(false);
    // Roles changed on this page, so the buttons flip without a refetch
    const [roleOverrides, setRoleOverrides] = useState<Record<string, string>>({});
    const [userToDemote, setUserToDemote] = useState<SystemUser | null>(null);
    const [demoteRole, setDemoteRole] = useState<string>("");
    const [isDemoting, setIsDemoting] = useState(false);

    const getUserRole = (user: SystemUser) => (roleOverrides[user.id] || user.role || "applicant").toLowerCase();

    // Activate a deactivated account (admin only). Same server action as the Activate Users page.
    const [userToActivate, setUserToActivate] = useState<SystemUser | null>(null);
    const [isActivating, setIsActivating] = useState(false);
    // Statuses changed on this page, so the badge and buttons flip without a refetch
    const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
    const getUserStatus = (user: SystemUser) => statusOverrides[user.id] || user.status || "Active";
    const canActivateUser = (user: SystemUser) => isAdmin && getUserStatus(user) === "Deactivated";

    const handleActivate = async () => {
        if (!userToActivate) return;
        setIsActivating(true);
        try {
            const res = await activateUsersAction([userToActivate.email]);
            const result = res.success ? res.results[0] : null;
            if (result && (result.outcome === "activated" || result.outcome === "new_ginger_account" || result.outcome === "already_active")) {
                setStatusOverrides(prev => ({ ...prev, [userToActivate.id]: "Active" }));
                // A new Ginger account also sends them back to applicant
                if (result.outcome === "new_ginger_account") setRoleOverrides(prev => ({ ...prev, [userToActivate.id]: "applicant" }));
                if (result.outcome !== "already_active") onUserActivated?.(userToActivate.id);
                toast.success(result.outcome === "activated" ? `${userToActivate.name} is active again` : `${userToActivate.name}: ${result.message}`);
                setUserToActivate(null);
            } else {
                toast.error(res.success ? result?.message || "Failed to activate user" : res.error);
            }
        } catch (err) {
            console.error("Activate user failed:", err);
            toast.error("Failed to activate user");
        } finally {
            setIsActivating(false);
        }
    };

    const canPromoteUser = (user: SystemUser) => {
        if (!isAdmin || getUserStatus(user) === "Deactivated") return false;
        const targetRole = getUserRole(user);
        return targetRole === "applicant" || targetRole === "labeler" || targetRole === "old-labeler";
    };

    const handlePromote = async () => {
        if (!userToPromote) return;
        setIsPromoting(true);
        try {
            const res = await promoteUserToRecruiterAction(userToPromote.id);
            if (res.success) {
                setRoleOverrides(prev => ({ ...prev, [userToPromote.id]: "recruiter" }));
                toast.success(`${userToPromote.name} is now a recruiter`);
                setUserToPromote(null);
            } else {
                toast.error(res.error || "Failed to promote user");
            }
        } catch (err) {
            console.error("Promote to recruiter failed:", err);
            toast.error("Failed to promote user");
        } finally {
            setIsPromoting(false);
        }
    };

    const canDemoteUser = (user: SystemUser) => isAdmin && getUserRole(user) === "recruiter";

    const openDemoteModal = (user: SystemUser) => {
        setDemoteRole("");
        setUserToDemote(user);
    };

    const handleDemote = async () => {
        if (!userToDemote || !demoteRole) return;
        setIsDemoting(true);
        try {
            const res = await demoteRecruiterAction(userToDemote.id, demoteRole);
            if (res.success) {
                setRoleOverrides(prev => ({ ...prev, [userToDemote.id]: demoteRole }));
                toast.success(`${userToDemote.name} is now ${demoteRole === "applicant" ? "an" : "a"} ${demoteRole}`);
                setUserToDemote(null);
            } else {
                toast.error(res.error || "Failed to demote user");
            }
        } catch (err) {
            console.error("Demote recruiter failed:", err);
            toast.error("Failed to demote user");
        } finally {
            setIsDemoting(false);
        }
    };

    // Multi-select State
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const filesArray = Array.from(e.target.files);

            // Limit to 2 photos total
            const totalPhotos = uploadedPhotos.length + filesArray.length;
            if (totalPhotos > 2) {
                toast.error("You can only upload a maximum of 2 photos.");
                // Only take enough to fill the 2 slots
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
                        // Reset the timeout as long as we keep receiving progress
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

    const getInitials = (name: string) => {
        return name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
    };

    const getRecruiterName = (user: SystemUser) => {
        if (user.labelerRefererName) return user.labelerRefererName;
        if (user.resolvedRefererName) return user.resolvedRefererName;
        if (user.labelerRefererEmail) return "Labeler";
        if (!user.refererEmail) return "Organic";
        const recruiter = recruiters?.find((r) => r.email === user.refererEmail);
        if (recruiter && (recruiter.name || recruiter.username)) {
            return recruiter.name || recruiter.username;
        }
        if (user.referer?.name) return user.referer.name;
        return "Mentor";
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

    const handleSort = (field: "name" | "recruiter" | "group" | "createdAt" | "lastLogin") => {
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
                const comparison = (getRecruiterName(a) || "").localeCompare(getRecruiterName(b) || "");
                return sortOrder === "asc" ? comparison : -comparison;
            }
            if (sortField === "group") {
                const comparison = (a.groupOrTeamName || "").localeCompare(b.groupOrTeamName || "");
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

    const isAllVisibleSelected = useMemo(() => {
        return sortedUsers.length > 0 && sortedUsers.every(u => selectedUserIds.has(u.id));
    }, [sortedUsers, selectedUserIds]);

    const toggleSelectUser = (userId: string) => {
        setSelectedUserIds(prev => {
            const next = new Set(prev);
            if (next.has(userId)) next.delete(userId);
            else next.add(userId);
            return next;
        });
    };

    const handleSelectAll = async () => {
        if (fetchAllMatchingUsers) {
            toast.loading("Selecting all users...", { id: "select-all" });
            try {
                const allUsers = await fetchAllMatchingUsers();
                setSelectedUserIds(new Set(allUsers.map(u => u.id)));
                toast.dismiss("select-all");
                toast.success(`${allUsers.length} users selected`);
            } catch (err) {
                toast.dismiss("select-all");
                toast.error("Failed to fetch all users");
            }
        } else {
            setSelectedUserIds(new Set(sortedUsers.map(u => u.id)));
        }
    };

    const openMessageModal = (targets: SystemUser[]) => {
        setUsersToMessage(targets);
        setMessageSubject("");
        setMessageText("");
        setUploadedPhotos([]);
        photoPreviewUrls.forEach(url => URL.revokeObjectURL(url));
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

    return (
        <div className="w-full relative">
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
                                onClick={async () => {
                                    if (fetchAllMatchingUsers) {
                                        toast.loading("Loading all users...", { id: "load-all" });
                                        try {
                                            const allUsers = await fetchAllMatchingUsers();
                                            toast.dismiss("load-all");
                                            openMessageModal(allUsers);
                                        } catch (err) {
                                            toast.dismiss("load-all");
                                            toast.error("Failed to load users");
                                        }
                                    } else {
                                        openMessageModal(sortedUsers);
                                    }
                                }}
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
                                className="px-3 py-3 lg:py-4 cursor-pointer select-none group/col"
                                onClick={() => handleSort("name")}
                            >
                                <div className="flex items-center gap-1.5 hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-colors">
                                    <span>User</span>
                                    {sortField === "name" ? (
                                        sortOrder === "asc" ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                                    ) : (
                                        <ArrowUpDown className="w-3.5 h-3.5 opacity-0 group-hover/col:opacity-70 transition-opacity" />
                                    )}
                                </div>
                            </th>
                            <th className="px-3 py-3 lg:py-4">Status / Progress</th>
                            <th className="px-3 py-3 lg:py-4">Training</th>
                            <th
                                className="px-3 py-3 lg:py-4 cursor-pointer select-none group/col"
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
                            <th
                                className="px-3 py-3 lg:py-4 cursor-pointer select-none group/col"
                                onClick={() => handleSort("group")}
                            >
                                <div className="flex items-center gap-1.5 hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-colors">
                                    <span>Guild</span>
                                    {sortField === "group" ? (
                                        sortOrder === "asc" ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                                    ) : (
                                        <ArrowUpDown className="w-3.5 h-3.5 opacity-0 group-hover/col:opacity-70 transition-opacity" />
                                    )}
                                </div>
                            </th>
                            <th className="px-3 py-3 lg:py-4">
                                <ActivityHeader sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
                            </th>
                            {canMessageAtAll && <th className="px-2 py-3 lg:py-4 pr-4 text-right">Actions</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10 dark:divide-white/10 text-sm">
                        {sortedUsers.map((user) => {
                            const rulesPct = getRulesProgress(user);

                            return (
                                <tr
                                    key={user.id}
                                    onClick={() => { if (canBulkMessage) toggleSelectUser(user.id); }}
                                    className={`hover:bg-black/[0.02] dark:hover:bg-white/5 transition-colors group ${selectedUserIds.has(user.id) ? "bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 outline outline-2 outline-[#1F7A1F] dark:outline-[#55f761] -outline-offset-2 z-10 relative" : ""} ${canBulkMessage ? "cursor-pointer" : ""}`}
                                >

                                    {/* User Profile */}
                                    <td className="px-3 py-3 lg:py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-[#1F7A1F]/15 dark:bg-[#55f761]/15 text-[#1F7A1F] dark:text-[#55f761] flex items-center justify-center font-bold tracking-wider select-none shrink-0 group-hover:scale-105 transition-transform">
                                                {getInitials(user.name)}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <div className="flex flex-col items-start gap-1">
                                                    <span className="font-bold text-[#0D1B2A] dark:text-white truncate max-w-[150px]" title={user.name}>
                                                        {user.name}
                                                    </span>
                                                    {currentUserRole?.toLowerCase() === "admin" && (
                                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold border shrink-0 ${
                                                            getUserStatus(user) === "Deactivated"
                                                                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800"
                                                                : "bg-[#1F7A1F]/10 text-[#1F7A1F] border-[#1F7A1F]/25 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800"
                                                        }`}>
                                                            {getUserStatus(user)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Status / Progress */}
                                    <td className="px-3 py-3 lg:py-4 whitespace-nowrap">
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
                                    <td className="px-3 py-3 lg:py-4 whitespace-nowrap align-top">
                                        <div className="flex flex-col gap-1.5 text-xs w-[150px]">
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

                                    {/* Recruiter */}
                                    <td className="px-3 py-3 lg:py-4 text-[#2F3E46]/60 dark:text-white/40">
                                        <div className="flex flex-col min-w-0 gap-0.5">
                                            {user.labelerRefererEmail || user.refererEmail ? (
                                                <>
                                                    <span className="font-bold text-[#0D1B2A] dark:text-white text-xs break-words leading-tight">
                                                        {getRecruiterName(user)}
                                                    </span>
                                                    {(() => {
                                                        const fb = user.labelerRefererFacebook || user.resolvedRefererFacebook;
                                                        if (!fb) return null;
                                                        const displayFb = truncateFacebook(fb);
                                                        return (
                                                            <a
                                                                href={fb}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={(e) => {
                                                                    if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                                                                        e.preventDefault();
                                                                        navigator.clipboard.writeText(fb);
                                                                        toast.success("Copied Mentor Facebook link!");
                                                                    }
                                                                }}
                                                                className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer flex items-center gap-1 w-fit"
                                                                title={`${fb} (Left-click to copy, Scroll-wheel click to open)`}
                                                            >
                                                                <Facebook className="w-3 h-3 shrink-0" />
                                                                <span>{displayFb}</span>
                                                            </a>
                                                        );
                                                    })()}
                                                </>
                                            ) : (
                                                <span className="text-xs font-semibold px-2 py-1 bg-black/5 dark:bg-white/5 text-[#2F3E46]/60 dark:text-white/40 rounded-lg w-fit">
                                                    Organic
                                                </span>
                                            )}
                                        </div>
                                    </td>

                                    {/* Group / Team */}
                                    <td className="px-3 py-3 lg:py-4 text-[#2F3E46]/60 dark:text-white/40">
                                        <div className="flex flex-col gap-1.5 max-w-[130px] break-words">
                                            <span className="text-xs font-semibold text-[#0D1B2A] dark:text-white">
                                                {user.groupOrTeamName || <span className="text-[#2F3E46]/30 dark:text-white/20 italic">—</span>}
                                            </span>
                                            {(user.checkerName || user.judgerName) && (
                                                <div className="flex flex-col gap-1 text-[10px]">
                                                    {user.checkerName && (
                                                        <div className="flex flex-col">
                                                            <span className="text-[#2F3E46]/60 dark:text-white/40 font-semibold">Checker:</span>
                                                            <div className="flex items-center gap-1">
                                                                {renderContactLink(user.checkerName, user.checkerName, user.checkerFacebook || null, false, "text-blue-600 dark:text-blue-400")}
                                                                {user.checkerFacebook && (
                                                                    <a
                                                                        href={user.checkerFacebook}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        onClick={(e) => {
                                                                            if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                                                                                e.preventDefault();
                                                                                navigator.clipboard.writeText(user.checkerFacebook || "");
                                                                                toast.success("Copied Checker Facebook link!");
                                                                            }
                                                                        }}
                                                                        className="p-0.5 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                                                                        title="Left-click to copy Facebook link, Scroll-wheel click to open"
                                                                    >
                                                                        <Facebook className="w-3.5 h-3.5" />
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {user.judgerName && (
                                                        <div className="flex flex-col mt-0.5">
                                                            <span className="text-[#2F3E46]/60 dark:text-white/40 font-semibold">Judger:</span>
                                                            <div className="flex items-center gap-1">
                                                                {renderContactLink(user.judgerName, user.judgerName, user.judgerFacebook || null, false, "text-fuchsia-600 dark:text-fuchsia-400")}
                                                                {user.judgerFacebook && (
                                                                    <a
                                                                        href={user.judgerFacebook}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        onClick={(e) => {
                                                                            if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                                                                                e.preventDefault();
                                                                                navigator.clipboard.writeText(user.judgerFacebook || "");
                                                                                toast.success("Copied Judger Facebook link!");
                                                                            }
                                                                        }}
                                                                        className="p-0.5 text-fuchsia-600 dark:text-fuchsia-400 hover:bg-fuchsia-500/10 rounded transition-colors"
                                                                        title="Left-click to copy Facebook link, Scroll-wheel click to open"
                                                                    >
                                                                        <Facebook className="w-3.5 h-3.5" />
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </td>

                                    {/* Activity (last login + joined) */}
                                    <td className={`px-3 py-3 lg:py-4 whitespace-nowrap ${!canMessageAtAll ? "pr-6 lg:pr-8" : ""}`}>
                                        <ActivityCell createdAt={user.createdAt} lastLogin={user.lastLogin} />
                                    </td>

                                    {/* Action */}
                                    {canMessageAtAll && (
                                        <td className="px-2 py-3 lg:py-4 pr-4 whitespace-nowrap">
                                            <div className="flex flex-col items-end gap-2">
                                            {canActivateUser(user) && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setUserToActivate(user); }}
                                                title={`Activate ${user.name}`}
                                                className="flex items-center justify-center px-2 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-md transition-colors shadow-sm cursor-pointer shrink-0"
                                            >
                                                <UserCheck className="w-4 h-4" />
                                            </button>
                                            )}
                                            {canPromoteUser(user) && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setUserToPromote(user); }}
                                                title={`Promote ${user.name} to recruiter`}
                                                className="flex items-center justify-center px-2 py-1.5 bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 text-[#2F3E46] dark:text-white/80 rounded-md transition-colors shadow-sm cursor-pointer shrink-0"
                                            >
                                                <UserPlus className="w-4 h-4" />
                                            </button>
                                            )}
                                            {canDemoteUser(user) && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); openDemoteModal(user); }}
                                                title={`Demote ${user.name} from recruiter`}
                                                className="flex items-center justify-center px-2 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 rounded-md transition-colors shadow-sm cursor-pointer shrink-0"
                                            >
                                                <UserMinus className="w-4 h-4" />
                                            </button>
                                            )}
                                            {canMessageUser(user) && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); openMessageModal([user]); }}
                                                title={`Message ${user.name}`}
                                                className="flex items-center justify-center px-2 py-1.5 bg-[#1F7A1F] hover:bg-[#1A661A] dark:bg-[#55f761]/10 dark:hover:bg-[#55f761]/20 text-white dark:text-[#55f761] rounded-md transition-colors shadow-sm cursor-pointer shrink-0"
                                            >
                                                <MessageSquare className="w-4 h-4" />
                                            </button>
                                            )}
                                            </div>
                                        </td>
                                    )}
                                </tr>
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
                                <MessageSquare className="w-3 h-3" />
                                Message ({selectedUserIds.size})
                            </button>
                        ) : (
                            <button
                                onClick={async () => {
                                    if (fetchAllMatchingUsers) {
                                        toast.loading("Loading all users...", { id: "load-all-mobile" });
                                        try {
                                            const allUsers = await fetchAllMatchingUsers();
                                            toast.dismiss("load-all-mobile");
                                            openMessageModal(allUsers);
                                        } catch (err) {
                                            toast.dismiss("load-all-mobile");
                                            toast.error("Failed to load users");
                                        }
                                    } else {
                                        openMessageModal(sortedUsers);
                                    }
                                }}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-[#1F7A1F] hover:bg-[#1A661A] dark:bg-[#55f761]/15 dark:hover:bg-[#55f761]/25 text-white dark:text-[#55f761] rounded-lg text-[11px] font-bold transition-all shadow-sm cursor-pointer"
                            >
                                <MessageSquare className="w-3 h-3" />
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

                    return (
                        <div
                            key={user.id}
                            onClick={() => { if (canBulkMessage) toggleSelectUser(user.id); }}
                            className={`p-4 space-y-4 hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition-colors group ${selectedUserIds.has(user.id) ? "bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 outline outline-2 outline-[#1F7A1F] dark:outline-[#55f761] -outline-offset-2 z-10 relative" : ""} ${canBulkMessage ? "cursor-pointer" : ""}`}
                        >
                            {/* User details */}
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-[#1F7A1F]/15 dark:bg-[#55f761]/15 text-[#1F7A1F] dark:text-[#55f761] flex items-center justify-center font-bold tracking-wider select-none shrink-0 group-hover:scale-105 transition-transform">
                                    {getInitials(user.name)}
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="font-bold text-[#0D1B2A] dark:text-white truncate">
                                        {user.name}
                                    </span>
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
                                        { id: 'landcover', label: 'Landcover' },
                                        { id: '3d', label: '3D Matching' },
                                        { id: 'transpo', label: 'Transpo' },
                                        { id: 'roof', label: 'Roof' }
                                    ].map(({ id, label }) => {
                                        const stats = getTrainingStats(user, id as any);
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

                            {/* Recruiter */}
                            <div className="flex items-center justify-between text-xs text-[#2F3E46]/60 dark:text-white/40 pt-1 border-t border-black/5 dark:border-white/5">
                                <span>Mentor</span>
                                <div className="flex flex-col items-end min-w-0 gap-0.5">
                                    <span className="font-semibold text-[#0D1B2A] dark:text-white truncate max-w-[180px]">
                                        {getRecruiterName(user)}
                                    </span>
                                    {(() => {
                                        const fb = user.labelerRefererFacebook || user.resolvedRefererFacebook;
                                        if (!fb) return null;
                                        const displayFb = truncateFacebook(fb);
                                        return (
                                            <a
                                                href={fb}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => {
                                                    if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                                                        e.preventDefault();
                                                        navigator.clipboard.writeText(fb);
                                                        toast.success("Copied Mentor Facebook link!");
                                                    }
                                                }}
                                                className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer flex items-center gap-1 w-fit"
                                                title={`${fb} (Left-click to copy, Scroll-wheel click to open)`}
                                            >
                                                <Facebook className="w-3 h-3 shrink-0" />
                                                <span>{displayFb}</span>
                                            </a>
                                        );
                                    })()}
                                </div>
                            </div>

                            {/* Group */}
                            <div className="flex flex-col gap-1 text-xs text-[#2F3E46]/60 dark:text-white/40 pt-1 border-t border-black/5 dark:border-white/5">
                                <div className="flex items-center justify-between">
                                    <span>Guild</span>
                                    <span className="font-semibold text-[#0D1B2A] dark:text-white truncate max-w-[180px]">
                                        {user.groupOrTeamName || "—"}
                                    </span>
                                </div>
                                {(user.checkerName || user.judgerName) && (
                                    <div className="flex flex-col items-end gap-1.5 mt-0.5 text-[10px]">
                                        {user.checkerName && (
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[#2F3E46]/60 dark:text-white/40 font-semibold">Checker:</span>
                                                <div className="flex items-center gap-1">
                                                    {renderContactLink(user.checkerName, user.checkerName, user.checkerFacebook || null, false, "text-blue-600 dark:text-blue-400")}
                                                    {user.checkerFacebook && (
                                                        <a
                                                            href={user.checkerFacebook}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => {
                                                                if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                                                                    e.preventDefault();
                                                                    navigator.clipboard.writeText(user.checkerFacebook || "");
                                                                    toast.success("Copied Checker Facebook link!");
                                                                }
                                                            }}
                                                            className="p-0.5 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                                                            title="Left-click to copy Facebook link, Scroll-wheel click to open"
                                                        >
                                                            <Facebook className="w-3 h-3" />
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        {user.judgerName && (
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className="text-[#2F3E46]/60 dark:text-white/40 font-semibold">Judger:</span>
                                                <div className="flex items-center gap-1">
                                                    {renderContactLink(user.judgerName, user.judgerName, user.judgerFacebook || null, false, "text-fuchsia-600 dark:text-fuchsia-400")}
                                                    {user.judgerFacebook && (
                                                        <a
                                                            href={user.judgerFacebook}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => {
                                                                if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                                                                    e.preventDefault();
                                                                    navigator.clipboard.writeText(user.judgerFacebook || "");
                                                                    toast.success("Copied Judger Facebook link!");
                                                                }
                                                            }}
                                                            className="p-0.5 text-fuchsia-600 dark:text-fuchsia-400 hover:bg-fuchsia-500/10 rounded transition-colors"
                                                            title="Left-click to copy Facebook link, Scroll-wheel click to open"
                                                        >
                                                            <Facebook className="w-3 h-3" />
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Joined Date */}
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
                            {canActivateUser(user) && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setUserToActivate(user); }}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                                >
                                    <UserCheck className="w-4 h-4" />
                                    <span>Activate Account</span>
                                </button>
                            )}
                            {canPromoteUser(user) && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setUserToPromote(user); }}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 text-[#2F3E46] dark:text-white/80 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                                >
                                    <UserPlus className="w-4 h-4" />
                                    <span>Promote to Recruiter</span>
                                </button>
                            )}
                            {canDemoteUser(user) && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); openDemoteModal(user); }}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                                >
                                    <UserMinus className="w-4 h-4" />
                                    <span>Demote from Recruiter</span>
                                </button>
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

            {/* Activate Account Confirm Modal */}
            <Dialog open={!!userToActivate} onOpenChange={(open) => { if (!open && !isActivating) setUserToActivate(null); }}>
                <DialogContent className="sm:max-w-md bg-white dark:bg-[#1A232C] border-black/10 dark:border-white/10 shadow-2xl z-[100]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2.5 text-lg font-bold text-[#0D1B2A] dark:text-white">
                            <UserCheck className="w-5 h-5 text-[#1F7A1F] dark:text-[#55f761]" />
                            Activate Account
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-[#2F3E46]/80 dark:text-white/70">
                        Activate <span className="font-bold text-[#0D1B2A] dark:text-white">{userToActivate?.name}</span> ({userToActivate?.email})? They can log in and work again. As on the Activate Users page, a paid labeler who only passed Standard Building gets a new Ginger account and goes back to applicant.
                    </p>
                    <DialogFooter className="gap-2">
                        <button
                            onClick={() => setUserToActivate(null)}
                            disabled={isActivating}
                            className="px-4 py-2 text-sm font-bold rounded-xl bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 text-[#2F3E46] dark:text-white/80 transition-colors cursor-pointer disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleActivate}
                            disabled={isActivating}
                            className="px-4 py-2 text-sm font-bold rounded-xl bg-[#1F7A1F] hover:bg-[#1A661A] text-white transition-colors cursor-pointer disabled:opacity-50"
                        >
                            {isActivating ? "Activating..." : "Activate"}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Promote to Recruiter Confirm Modal */}
            <Dialog open={!!userToPromote} onOpenChange={(open) => { if (!open && !isPromoting) setUserToPromote(null); }}>
                <DialogContent className="sm:max-w-md bg-white dark:bg-[#1A232C] border-black/10 dark:border-white/10 shadow-2xl z-[100]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2.5 text-lg font-bold text-[#0D1B2A] dark:text-white">
                            <UserPlus className="w-5 h-5 text-[#1F7A1F] dark:text-[#55f761]" />
                            Promote to Recruiter
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-[#2F3E46]/80 dark:text-white/70">
                        Promote <span className="font-bold text-[#0D1B2A] dark:text-white">{userToPromote?.name}</span> ({userToPromote?.email}) to recruiter? They will get access to the recruiter pages.
                    </p>
                    <DialogFooter className="gap-2">
                        <button
                            onClick={() => setUserToPromote(null)}
                            disabled={isPromoting}
                            className="px-4 py-2 text-sm font-bold rounded-xl bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 text-[#2F3E46] dark:text-white/80 transition-colors cursor-pointer disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handlePromote}
                            disabled={isPromoting}
                            className="px-4 py-2 text-sm font-bold rounded-xl bg-[#1F7A1F] hover:bg-[#1A661A] text-white transition-colors cursor-pointer disabled:opacity-50"
                        >
                            {isPromoting ? "Promoting..." : "Promote"}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Demote Recruiter Confirm Modal */}
            <Dialog open={!!userToDemote} onOpenChange={(open) => { if (!open && !isDemoting) setUserToDemote(null); }}>
                <DialogContent className="sm:max-w-md bg-white dark:bg-[#1A232C] border-black/10 dark:border-white/10 shadow-2xl z-[100]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2.5 text-lg font-bold text-[#0D1B2A] dark:text-white">
                            <UserMinus className="w-5 h-5 text-red-600 dark:text-red-400" />
                            Demote from Recruiter
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-[#2F3E46]/80 dark:text-white/70">
                        Remove the recruiter role from <span className="font-bold text-[#0D1B2A] dark:text-white">{userToDemote?.name}</span> ({userToDemote?.email})? They will lose access to the recruiter pages. Choose the role to give them back.
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                        {["applicant", "labeler", "old-labeler"].map((role) => (
                            <button
                                key={role}
                                onClick={() => setDemoteRole(role)}
                                disabled={isDemoting}
                                className={`px-3 py-2 text-xs font-bold rounded-xl border capitalize transition-colors cursor-pointer disabled:opacity-50 ${demoteRole === role
                                    ? "bg-[#1F7A1F]/15 dark:bg-[#55f761]/15 border-[#1F7A1F] dark:border-[#55f761] text-[#1F7A1F] dark:text-[#55f761]"
                                    : "bg-black/5 dark:bg-white/5 border-transparent text-[#2F3E46] dark:text-white/80 hover:bg-black/10 dark:hover:bg-white/10"
                                }`}
                            >
                                {role}
                            </button>
                        ))}
                    </div>
                    <DialogFooter className="gap-2">
                        <button
                            onClick={() => setUserToDemote(null)}
                            disabled={isDemoting}
                            className="px-4 py-2 text-sm font-bold rounded-xl bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 text-[#2F3E46] dark:text-white/80 transition-colors cursor-pointer disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleDemote}
                            disabled={isDemoting || !demoteRole}
                            className="px-4 py-2 text-sm font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isDemoting ? "Demoting..." : "Demote"}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
}
