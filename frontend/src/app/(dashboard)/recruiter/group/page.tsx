"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { getSessionUser, logCliErrorAction, getExistingGingerUsernames, getGroupLinksAction, getGroupLinksMultipleAction, updateGroupLinkAction, getWorkLogsForUsernamesAction, getGroupMembersDetailsAction, syncGroupAndMembersAction, syncMultipleGroupsAndMembersAction, getGroupMembersFromDbAction, forceGingerLoginAction, getGroupStaffNamesAction } from "@/app/actions/auth";
import { getActiveProjectIdsAction } from "@/app/actions/project";
import { updateGroupLogoAction } from "@/app/actions/chat";
import { uploadFilesChat } from "@/utils/uploadthing";
import { getGingerToken } from "@/lib/ginger";
import { downloadXlsx, type CellValue } from "@/lib/xlsx";
import {
    Users,
    Search,
    Award,
    Mail,
    Phone,
    Shield,
    Plus,
    ChevronDown,
    ChevronUp,
    Check,
    X,
    Globe,
    Calendar,
    Clock,
    Zap,
    Pencil,
    Loader2,
    Download,
    SquareArrowOutUpRight,
    MessageSquare,
    Send,
    ImagePlus,
    Trash2,
    CheckSquare
} from "lucide-react";
import Pagination from "@/components/ui/Pagination";
import DateRangePicker from "@/components/ui/DateRangePicker";
import { io, Socket } from "socket.io-client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { uploadFiles } from "@/utils/uploadthing";

const GINGER_BASE = process.env.NEXT_PUBLIC_GINGER_API_URL || "https://ginger.bitmappro.com";
const WORKTIME_PENDING_KEY = "xnite_worktime_pending_task";
import { toast } from "sonner";

type AuthorityLevel =
    | "nda"
    | "multi_level_building"
    | "3d_match"
    | "landcover"
    | "transportation"
    | "3d_roof";

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

const getOnboardingProgress = (user: any) => {
    if (!user) return 0;
    if (user.isDashboardCompleted) return 100;
    const progress = parseJson(user.onboardingProgress);
    if (!progress) return 0;
    let count = 0;
    if (progress.modulesComplete?.download && progress.modulesComplete?.install) count++;
    if (progress.modulesComplete?.["videos-basic"]) count++;
    if (progress.modulesComplete?.["videos-3d"]) count++;
    if (progress.modulesComplete?.["answer-key"]) count++;
    if (progress.modulesComplete?.["answer-key-lib"]) count++;
    return Math.round((count / 5) * 100);
};

const getRulesProgress = (user: any) => {
    if (!user) return 0;
    if (user.isRulesAndGuidelinesCompleted) return 100;
    const progress = parseJson(user.onRulesAndGuidelinesProgress);
    if (!progress) return 0;
    const current = progress.currentStep || 1;
    return Math.min(100, Math.round((current / 65) * 100));
};

const getTrainingStats = (user: any, type: 'landcover' | '3d' | 'transpo' | 'roof') => {
    if (!user) return { passed: 0, total: 0, pct: 0 };
    const trainings = user.trainings?.trainings || [];
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

    if (type === 'landcover' && total === 0) total = 18;
    if (type === '3d' && total === 0) total = 7;

    if (type === 'transpo' || type === 'roof') {
        return { passed: 0, total: 0, pct: isPassed ? 100 : 0 };
    }

    const pct = total > 0 ? Math.round((passed / total) * 100) : (isPassed ? 100 : 0);
    return { passed, total, pct };
};

const FACEBOOK_DISPLAY_MAX_LENGTH = 20;

const truncateFacebook = (url: string) =>
    url.length > FACEBOOK_DISPLAY_MAX_LENGTH ? `${url.slice(0, FACEBOOK_DISPLAY_MAX_LENGTH)}...` : url;

const formatMinPerTask = (tasks: number, worktimeHours: number): string => {
    if (tasks <= 0) return "â€”";
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

// Lower minutes/task is faster, so the ratio (and its color bands) is inverted relative to speed
const getMinPerTaskColorClasses = (minPerTask: number, avgMinPerTask: number): string => {
    if (avgMinPerTask <= 0 || minPerTask <= 0) return "text-[#0D1B2A] dark:text-white/90";
    const ratio = avgMinPerTask / minPerTask;
    if (ratio >= 1.2) return "text-teal-500 dark:text-teal-400";
    if (ratio >= 0.9) return "text-[#1F7A1F] dark:text-[#55f761]";
    if (ratio >= 0.75) return "text-orange-500 dark:text-orange-400";
    if (ratio >= 0.5) return "text-red-500 dark:text-red-400";
    return "text-violet-500 dark:text-violet-400";
};

interface ProjectLogSummary {
    projectId: number;
    role: string;
    overallSpeed: number;
    overallMinPerTask: number;
}

// Renders a single worklog entry (one project/role pair) as a table row.
const WorkLogRow = ({ log, projectSummaries }: { log: WorkLog; projectSummaries: ProjectLogSummary[] }) => {
    const entrySpeed = log.worktime > 0 ? log.features / log.worktime : 0;
    const entryMinPerTask = log.taskNum > 0 ? (log.worktime * 60) / log.taskNum : 0;
    const pSummary = projectSummaries.find((p) => p.projectId === log.projectId && p.role === log.role);
    const overallSpeed = pSummary?.overallSpeed || 0;
    const overallMinPerTask = pSummary?.overallMinPerTask || 0;

    return (
        <tr className="border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
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

const ProgressPill = ({ label, pct, detail }: { label: string; pct: number; detail?: string }) => {
    if (pct <= 0) return null;
    const isCompleted = pct === 100;

    if (isCompleted) {
        return (
            <div className="relative inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1F7A1F]/15 dark:bg-[#55f761]/15 text-[#1F7A1F] dark:text-[#55f761] border border-[#1F7A1F]/25 dark:border-[#55f761]/25 text-xs font-bold shadow-2xs select-none shrink-0" title={`${label}: Completed`}>
                <Check className="w-3 h-3 shrink-0" />
                <span>{label}</span>
            </div>
        );
    }

    return (
        <div className="relative overflow-hidden inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-black/10 dark:border-white/10 text-gray-700 dark:text-white/80 text-xs font-bold bg-black/5 dark:bg-white/5 select-none shrink-0" title={`${label}: ${pct}%`}>
            {/* Background progress fill */}
            <div className="absolute left-0 top-0 bottom-0 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 transition-all duration-300 pointer-events-none" style={{ width: `${pct}%` }} />
            <span className="relative z-10">{label}</span>
            <span className="relative z-10 text-[9px] text-gray-500 font-semibold">{detail || `${pct}%`}</span>
        </div>
    );
};

interface WorkLog {
    id: number;
    uuid: string;
    ownerName: string;
    projectId: number;
    role: string;
    worktime: number;
    taskNum: number;
    features: number;
    createdAt: Date;
    updatedAt: Date;
    periodStart: Date | null;
    periodEnd: Date | null;
    log_date?: string | Date;
    absoluteImprovement?: number;
    improvementRate?: number;
}

type UserRole = "checker" | "judger" | "labeler" | string;

interface KoalaUser {
    uid?: number;
    region?: string;
    user_name: string;
    user_email?: string;
    phone_number?: string;
    disable?: boolean;
    group_id?: number | null;
    group_name?: string;
    team_id?: number | null;
    is_group_manager?: boolean;
    is_team_director?: boolean;
    default_role?: number;
    role?: string;
    user_role?: string;
    full_time?: number;
    user?: number;
    accounts?: unknown | null;
    authority_level?: AuthorityLevel[];
    authority_level_list?: AuthorityLevel[];
    avatar_src?: string;
    ts_create?: string;
    ts_created?: string;
    recruit_interview_status?: string;
    interview_status?: string;
    need_face_verify?: boolean;
    origin_group_id?: number;
    origin_team_id?: number;
    user_face_relation_details?: unknown | null;
}

interface Group {
    group_id: number;
    group_name?: string;
    group_type?: string;
    origin_group_id?: number;
    manager_uid?: number;
    owner_uid?: number;
    manager_name?: string;
    manager_email?: string | null;
    member_num?: number;
    member_num_max?: number;
    region?: string;
    team_id?: number;
    is_dismiss?: boolean;
    ts_create?: string;
    ts_created?: string;
    ts_updated?: string;
    credit_score?: number;
}

interface KoalaApiResponse {
    errcode?: number;
    code?: number;
    users?: KoalaUser[];
    group?: Group;
    data?: {
        group?: Group;
        users?: KoalaUser[];
    };
    msg?: string;
    origin_group_id?: number;
    collective_team?: unknown | null;
}

interface MessageTarget {
    id: string;
    name: string;
    email: string;
}

export default function MyOwnGSPage() {
    const [userRole, setUserRole] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(true);
    const [fetching, setFetching] = useState<boolean>(false);
    const [isSyncingData, setIsSyncingData] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState<boolean>(false);
    const [showWorktimeMenu, setShowWorktimeMenu] = useState<boolean>(false);
    const [isDownloadingWorktime, setIsDownloadingWorktime] = useState<boolean>(false);
    // Bitmap can't report on future dates, so default to the last full month.
    const toDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const todayKey = toDateKey(new Date());
    const [worktimeStart, setWorktimeStart] = useState<string>(() => {
        const d = new Date();
        return toDateKey(new Date(d.getFullYear(), d.getMonth() - 1, 1));
    });
    const [worktimeEnd, setWorktimeEnd] = useState<string>(() => {
        const d = new Date();
        return toDateKey(new Date(d.getFullYear(), d.getMonth(), 0));
    });

    const [userGroupId, setUserGroupId] = useState<number | null>(null);
    const [userTeamId, setUserTeamId] = useState<number | null>(null);

    const [groupIdInput, setGroupIdInput] = useState<string>("");
    const [hasGroupId, setHasGroupId] = useState<boolean>(true);
    const [group, setGroup] = useState<Group | null>(null);
    const [users, setUsers] = useState<KoalaUser[]>([]);
    const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
    const [dbUserDetails, setDbUserDetails] = useState<any[]>([]);

    // Index dbUserDetails once so member lookups don't rescan the whole list.
    // Keeps the original .find() semantics: the earliest record (array order)
    // matching gingerUsername / gingerEmail / name / email wins.
    const dbUserIndex = useMemo(() => {
        const byGingerUsername = new Map<string, number>();
        const byGingerEmail = new Map<string, number>();
        const byName = new Map<string, number>();
        const byEmail = new Map<string, number>();
        const add = (map: Map<string, number>, value: unknown, i: number) => {
            if (!value || typeof value !== "string") return;
            const key = value.trim().toLowerCase();
            if (!map.has(key)) map.set(key, i);
        };
        dbUserDetails.forEach((db, i) => {
            add(byGingerUsername, db.gingerUsername, i);
            add(byGingerEmail, db.gingerEmail, i);
            add(byName, db.name, i);
            add(byEmail, db.email, i);
        });
        return { byGingerUsername, byGingerEmail, byName, byEmail };
    }, [dbUserDetails]);

    const lookupDbUser = useCallback((userName?: string | null, userEmail?: string | null) => {
        const name = userName?.trim().toLowerCase();
        const email = userEmail?.trim().toLowerCase();
        let best = -1;
        const consider = (map: Map<string, number>, key: string | undefined) => {
            if (key === undefined) return;
            const i = map.get(key);
            if (i !== undefined && (best === -1 || i < best)) best = i;
        };
        consider(dbUserIndex.byGingerUsername, name);
        consider(dbUserIndex.byGingerEmail, email);
        consider(dbUserIndex.byName, name);
        consider(dbUserIndex.byEmail, email);
        return best === -1 ? undefined : dbUserDetails[best];
    }, [dbUserIndex, dbUserDetails]);
    const [groupLinks, setGroupLinks] = useState<{ checkerLink: string | null; judgerLink: string | null; checkerName: string | null; judgerName: string | null; logoUrl: string | null }>({ checkerLink: null, judgerLink: null, checkerName: null, judgerName: null, logoUrl: null });
    const logoInputRef = useRef<HTMLInputElement>(null);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [isConfirmLogoDeleteOpen, setIsConfirmLogoDeleteOpen] = useState(false);
    const [checkerGroupLinks, setCheckerGroupLinks] = useState<{ groupId: number; groupName: string; checkerLink: string | null }[]>([]);
    const [isCheckerLinksDialogOpen, setIsCheckerLinksDialogOpen] = useState(false);
    const [editingLinkRole, setEditingLinkRole] = useState<"checker" | "judger" | null>(null);
    const [linkDraft, setLinkDraft] = useState("");
    const [isSavingLink, setIsSavingLink] = useState(false);

    // Messaging State
    const [usersToMessage, setUsersToMessage] = useState<MessageTarget[]>([]);
    const [messageSubject, setMessageSubject] = useState("");
    const [messageText, setMessageText] = useState("");
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [uploadedPhotos, setUploadedPhotos] = useState<File[]>([]);
    const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
    const [sendingProgress, setSendingProgress] = useState({ current: 0, total: 0 });

    // Multi-select State
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

    const toggleSelectUser = (userId: string) => {
        setSelectedUserIds(prev => {
            const next = new Set(prev);
            if (next.has(userId)) next.delete(userId);
            else next.add(userId);
            return next;
        });
    };

    const handleSelectAll = () => {
        const visibleIds = sortedUsers.map(u => u.uid?.toString() || u.user_name);
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

    const openMessageSelectedModal = () => {
        if (selectedUserIds.size === 0) {
            toast.error("No users selected");
            return;
        }

        const selectedTargets: MessageTarget[] = sortedUsers
            .filter(u => selectedUserIds.has(u.uid?.toString() || u.user_name))
            .map(u => {
                const dbUser = lookupDbUser(u.user_name, u.user_email);
                const displayName = dbUser?.name || u.user_name || "Unnamed User";
                const displayEmail = dbUser?.email || u.user_email || "";
                return {
                    id: dbUser?.id || u.uid?.toString() || displayEmail,
                    name: displayName,
                    email: displayEmail
                };
            })
            .filter(t => !!t.email);

        if (selectedTargets.length === 0) {
            toast.error("None of the selected users have a valid email address");
            return;
        }

        openMessageModal(selectedTargets);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const filesArray = Array.from(e.target.files);

            // Limit to 2 photos total
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

    const openMessageModal = (targets: MessageTarget[]) => {
        setUsersToMessage(targets);
        setMessageSubject("");
        setMessageText("");
        setUploadedPhotos([]);
        setPhotoPreviewUrls([]);
        setSendingProgress({ current: 0, total: 0 });
    };

    // Judgers may only edit the judger link, checkers only the checker link; admin edits both.
    const canEditGroupLink = (linkRole: "checker" | "judger") => {
        const role = userRole.toLowerCase();
        if (role === "admin") return true;
        return role === linkRole;
    };

    // Only checker, judger, and admin can send messages.
    const canMessage = ["checker", "judger", "admin"].includes(userRole.toLowerCase());

    const startEditingLink = (linkRole: "checker" | "judger") => {
        setEditingLinkRole(linkRole);
        setLinkDraft((linkRole === "checker" ? groupLinks.checkerLink : groupLinks.judgerLink) || "");
    };

    const cancelEditingLink = () => {
        setEditingLinkRole(null);
        setLinkDraft("");
    };

    const normalizeLink = (link: string) => {
        const trimmed = link.trim();
        if (!trimmed) return "";
        return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    };

    const saveGroupLink = async () => {
        if (!editingLinkRole || !group?.group_id) return;
        setIsSavingLink(true);
        try {
            const res = await updateGroupLinkAction(group.group_id, editingLinkRole, linkDraft);
            if (res.success) {
                const normalizedLink = normalizeLink(linkDraft);
                setGroupLinks((prev) => ({
                    ...prev,
                    [editingLinkRole === "checker" ? "checkerLink" : "judgerLink"]: normalizedLink || null,
                }));
                toast.success("Group link updated");
                setEditingLinkRole(null);
                setLinkDraft("");
            } else {
                toast.error(res.error || "Failed to update group link");
            }
        } catch (err) {
            console.error("Failed to save group link:", err);
            toast.error("Failed to update group link");
        } finally {
            setIsSavingLink(false);
        }
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !group?.group_id) return;

        if (file.size > 2 * 1024 * 1024) {
            toast.error("Image must be smaller than 2MB");
            return;
        }

        toast.loading("Uploading logo...", { id: "logo-upload" });
        setIsUploadingLogo(true);

        try {
            const res = await uploadFilesChat("channelLogoUploader", {
                files: [file],
            });
            const uploadedUrl = res?.[0]?.ufsUrl;
            if (!uploadedUrl) {
                throw new Error("No URL returned from upload");
            }

            const dbRes = await updateGroupLogoAction(group.group_id, uploadedUrl);
            if (dbRes.success) {
                setGroupLinks((prev) => ({ ...prev, logoUrl: uploadedUrl }));
                toast.success("Guild logo updated successfully", { id: "logo-upload" });
            } else {
                toast.error(dbRes.error || "Failed to save logo to database", { id: "logo-upload" });
            }
        } catch (err) {
            console.error("Logo upload error:", err);
            toast.error("Failed to upload image", { id: "logo-upload" });
        } finally {
            setIsUploadingLogo(false);
            if (logoInputRef.current) logoInputRef.current.value = "";
        }
    };

    const handleLogoRemoveClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsConfirmLogoDeleteOpen(true);
    };

    const confirmLogoRemove = async () => {
        if (!group?.group_id) return;
        setIsConfirmLogoDeleteOpen(false);
        toast.loading("Removing logo...", { id: "logo-remove" });
        try {
            const dbRes = await updateGroupLogoAction(group.group_id, null);
            if (dbRes.success) {
                setGroupLinks((prev) => ({ ...prev, logoUrl: null }));
                toast.success("Guild logo removed", { id: "logo-remove" });
            } else {
                toast.error(dbRes.error || "Failed to remove logo", { id: "logo-remove" });
            }
        } catch (err) {
            console.error("Logo remove error:", err);
            toast.error("Failed to remove logo", { id: "logo-remove" });
        }
    };

    const renderGroupLinkRow = (linkRole: "checker" | "judger", label: string) => {
        const currentLink = linkRole === "checker" ? groupLinks.checkerLink : groupLinks.judgerLink;
        const canEdit = canEditGroupLink(linkRole);

        return (
            <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[#2F3E46]/60 dark:text-white/40">{label}:</span>
                <div className="flex items-center gap-1.5">
                    {currentLink ? (
                        <a
                            href={currentLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-bold text-[#1F7A1F] dark:text-[#55f761] hover:underline truncate max-w-[120px] bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 px-2 py-0.5 rounded-lg"
                            title={currentLink}
                        >
                            Open Link
                            <SquareArrowOutUpRight className="w-3 h-3 shrink-0" />
                        </a>
                    ) : (
                        <span className="text-gray-400 italic">Not set</span>
                    )}
                    {canEdit && (
                        <button
                            onClick={() => startEditingLink(linkRole)}
                            className="p-1 rounded-lg bg-black/5 dark:bg-white/5 text-gray-500 hover:text-[#1F7A1F] dark:hover:text-[#55f761] hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                            title={`Edit ${label} link`}
                        >
                            <Pencil className="w-3 h-3" />
                        </button>
                    )}
                </div>
            </div>
        );
    };

    // Filters
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
    const [selectedWorkLogRoles, setSelectedWorkLogRoles] = useState<string[]>([]);
    const [selectedWorkLogProjectIds, setSelectedWorkLogProjectIds] = useState<number[]>([]);
    const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
    const [selectedRecruiters, setSelectedRecruiters] = useState<string[]>([]);
    const [dateFilter, setDateFilter] = useState<"all" | "today" | "yesterday" | "week" | "month" | "three_months" | "custom">("all");
    const [customStartDate, setCustomStartDate] = useState<string>("");
    const [customEndDate, setCustomEndDate] = useState<string>("");
    const [recruiterSearch, setRecruiterSearch] = useState("");
    const [groupSearch, setGroupSearch] = useState("");
    const [projectSearch, setProjectSearch] = useState("");
    const [workLogProjectTab, setWorkLogProjectTab] = useState<"active" | "all">("active");
    const [knownActiveProjectIds, setKnownActiveProjectIds] = useState<number[]>([]);
    const [selectedProjects, setSelectedProjects] = useState<number[]>([]);
    const [missingQrCode, setMissingQrCode] = useState<boolean>(false);
    const [hasPaymentDetails, setHasPaymentDetails] = useState<boolean>(false);
    const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
    const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);
    const [sortColumn, setSortColumn] = useState<"name" | "recruiter" | "joined" | null>(null);
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Load actual active / ongoing project deployments
    useEffect(() => {
        if (typeof window !== "undefined") {
            try {
                const stored = localStorage.getItem("xnite_active_project_ids");
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        setKnownActiveProjectIds(parsed.map(Number).filter((n) => !isNaN(n) && n > 0));
                    }
                }
            } catch (e) {
                console.error("Failed to parse cached active projects from localStorage", e);
            }
        }

        getActiveProjectIdsAction().then((res) => {
            if (res.success && res.data && res.data.length > 0) {
                setKnownActiveProjectIds(res.data);
                if (typeof window !== "undefined") {
                    try {
                        localStorage.setItem("xnite_active_project_ids", JSON.stringify(res.data));
                    } catch {}
                }
            }
        }).catch((err) => {
            console.error("Failed to load active project IDs:", err);
        });
    }, []);

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

    useEffect(() => {
        const init = async () => {
            try {
                const user = await getSessionUser();
                if (user) {
                    const role = user.role?.toLowerCase() || "";
                    setUserRole(role);
                    const myGroupId = user.group_id;
                    const myTeamId = user.team_id;

                    if (myGroupId != null && myGroupId !== 0 && myGroupId !== -1) {
                        setUserGroupId(myGroupId);
                    }
                    if (myTeamId != null && myTeamId !== 0 && myTeamId !== -1) {
                        setUserTeamId(myTeamId);
                    }

                    // Judgers only see their team, checkers only see their group.
                    // Other roles fall back to group first, then team.
                    const validGroupId = (myGroupId != null && myGroupId !== 0 && myGroupId !== -1) ? myGroupId : null;
                    const validTeamId = (myTeamId != null && myTeamId !== 0 && myTeamId !== -1) ? myTeamId : null;
                    const activeId = role === "judger"
                        ? validTeamId
                        : role === "checker"
                            ? validGroupId
                            : (validGroupId ?? validTeamId);
                    if (activeId != null) {
                        setGroupIdInput(activeId.toString());
                        await fetchGroupData(activeId, role);
                    } else {
                        // Check in Bitmap (Ginger API / localStorage) if not found in PostgreSQL
                        let bitmapGroupId: number | null = null;
                        let bitmapTeamId: number | null = null;
                        try {
                            const saved = localStorage.getItem("scrapedGingerData");
                            if (saved) {
                                const parsed = JSON.parse(saved);
                                const gId = parsed?.koala_user_details?.group_id || parsed?.group_id || parsed?.data?.koala_user_details?.group_id || parsed?.data?.group_id;
                                const tId = parsed?.koala_user_details?.team_id || parsed?.team_id || parsed?.data?.koala_user_details?.team_id || parsed?.data?.team_id;
                                if (gId != null && gId !== 0 && gId !== -1 && !isNaN(Number(gId))) {
                                    bitmapGroupId = Number(gId);
                                    setUserGroupId(Number(gId));
                                }
                                if (tId != null && tId !== 0 && tId !== -1 && !isNaN(Number(tId))) {
                                    bitmapTeamId = Number(tId);
                                    setUserTeamId(Number(tId));
                                }
                            }
                        } catch (err) {
                            console.error("Error reading scrapedGingerData from localStorage:", err);
                        }

                        if (!bitmapGroupId && !bitmapTeamId) {
                            try {
                                const res = await fetch("/api/account", { method: "POST" });
                                if (res.ok) {
                                    const accData = await res.json();
                                    const details = accData?.koala_user_details || accData?.data?.koala_user_details || accData?.data || accData;
                                    const gId = details?.group_id || details?.db_groupId;
                                    const tId = details?.team_id || details?.db_teamId;
                                    if (gId != null && gId !== 0 && gId !== -1 && !isNaN(Number(gId))) {
                                        bitmapGroupId = Number(gId);
                                        setUserGroupId(Number(gId));
                                    }
                                    if (tId != null && tId !== 0 && tId !== -1 && !isNaN(Number(tId))) {
                                        bitmapTeamId = Number(tId);
                                        setUserTeamId(Number(tId));
                                    }
                                }
                            } catch (err) {
                                console.error("Error fetching /api/account for bitmap group_id/team_id:", err);
                            }
                        }

                        const activeBitmapId = role === "judger"
                            ? bitmapTeamId
                            : role === "checker"
                                ? bitmapGroupId
                                : (bitmapGroupId ?? bitmapTeamId);
                        if (activeBitmapId != null && activeBitmapId !== 0 && activeBitmapId !== -1) {
                            setGroupIdInput(activeBitmapId.toString());
                            await fetchGroupData(activeBitmapId, role);
                        } else {
                            setHasGroupId(false);
                            const errMsg = "User account is not assigned to any group or team.";
                            logCliErrorAction(errMsg).catch(() => { });
                        }
                    }
                } else {
                    setHasGroupId(false);
                    const errMsg = "Not authenticated or user not found.";
                    logCliErrorAction(errMsg).catch(() => { });
                }
            } catch (e: any) {
                logCliErrorAction(`Failed to initialize group page: ${e?.message || e}`).catch(() => { });
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

    const fetchGroupData = async (targetGroupId?: number | string, roleOverride?: string) => {
        const effectiveRole = (roleOverride ?? userRole).toLowerCase();
        const idToFetch = Number(targetGroupId ?? groupIdInput);
        if (!idToFetch || isNaN(idToFetch)) {
            setHasGroupId(false);
            const errMsg = "[MyOwnGS] Cannot fetch group data: No group_id provided or found.";
            console.error(errMsg);
            logCliErrorAction(errMsg).catch(() => { });
            return;
        }

        // withDetails=false only renders members + links; the Ginger path below
        // loads details/worklogs itself, so the pre-load doesn't block on them.
        const loadFromDbFallback = async (withDetails: boolean = true) => {
            try {
                const groupType = effectiveRole === "judger" ? "team" : "group";
                const dbRes = await getGroupMembersFromDbAction(idToFetch, groupType);
                if (dbRes.success && dbRes.data && dbRes.data.users && dbRes.data.users.length > 0) {
                    const fallbackGroup = dbRes.data.group;
                    const fallbackUsers = dbRes.data.users;

                    setGroup(fallbackGroup);
                    setUsers(fallbackUsers);

                    const links = await getGroupLinksAction(idToFetch);
                    setGroupLinks(links);

                    if (!withDetails) {
                        setFetching(false);
                        return true;
                    }

                    const namesToCheck: string[] = [];
                    fallbackUsers.forEach((u: any) => {
                        if (u.user_name) namesToCheck.push(u.user_name);
                        if (u.user_email) namesToCheck.push(u.user_email);
                    });

                    const CHUNK_SIZE = 500;
                    let activeDbUsers: any[] = [];
                    for (let i = 0; i < namesToCheck.length; i += CHUNK_SIZE) {
                        const chunk = namesToCheck.slice(i, i + CHUNK_SIZE);
                        const dbDetailsRes = await getGroupMembersDetailsAction(chunk);
                        if (dbDetailsRes.success && dbDetailsRes.data) {
                            activeDbUsers = [...activeDbUsers, ...dbDetailsRes.data];
                        }
                    }
                    setDbUserDetails([...activeDbUsers]);

                    const usernamesList: string[] = [];
                    namesToCheck.forEach((n) => usernamesList.push(n));
                    activeDbUsers.forEach((db) => {
                        if (db.gingerUsername) usernamesList.push(db.gingerUsername);
                        if (db.gingerEmail) usernamesList.push(db.gingerEmail);
                        if (db.name) usernamesList.push(db.name);
                        if (db.email) usernamesList.push(db.email);
                    });

                    const uniqueUsernamesList = Array.from(new Set(usernamesList));
                    let allLogs: any[] = [];
                    for (let i = 0; i < uniqueUsernamesList.length; i += CHUNK_SIZE) {
                        const chunk = uniqueUsernamesList.slice(i, i + CHUNK_SIZE);
                        const logsRes = await getWorkLogsForUsernamesAction(chunk);
                        if (logsRes.success && logsRes.data) {
                            allLogs = [...allLogs, ...logsRes.data];
                        }
                    }
                    setWorkLogs([...allLogs]);

                    setFetching(false);
                    setIsSyncingData(false);
                    return true;
                }
            } catch (err) {
                console.error("Database fallback error:", err);
            }
            return false;
        };

        // Pre-load from local DB fallback to render UI immediately (SWR)
        setFetching(true);
        setError(null);
        let fallbackLoaded = false;
        try {
            fallbackLoaded = await loadFromDbFallback(false);
        } catch (dbErr) {
            console.error("Database pre-load failed:", dbErr);
        }

        let token = getGingerToken();
        if (!token) {
            try {
                const autoLoginRes = await forceGingerLoginAction();
                if (autoLoginRes.success && autoLoginRes.token) {
                    token = autoLoginRes.token;
                }
            } catch (autoLoginErr) {
                console.warn("Auto Ginger re-login failed, falling back to local database:", autoLoginErr);
            }
        }

        if (!token) {
            // The pre-load skipped details/worklogs, so load them from the DB now.
            if (!fallbackLoaded) setFetching(true);
            const fallbackSuccess = await loadFromDbFallback();
            if (!fallbackSuccess) {
                setError("No group assigned or found in local database.");
                setFetching(false);
            }
            return;
        }

        if (!fallbackLoaded) {
            setFetching(true);
        }
        setError(null);
        try {
            const res = await fetch(`${GINGER_BASE}/bac/eam/koala/koala-group/group/detail`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ group_id: idToFetch })
            });

            if (!res.ok) {
                throw new Error(`HTTP error ${res.status}`);
            }

            const data: KoalaApiResponse = await res.json();
            const errCode = data.errcode ?? data.code ?? 0;
            if (errCode !== 0) {
                throw new Error(`Ginger API returned error code ${errCode}: ${data.msg || "Unknown error"}`);
            }

            const groupObj = data.group || data.data?.group || null;
            const usersList = data.users || data.data?.users || [];

            // Collect all identifiers from the full Ginger members list to look up
            // who among them is already registered in the Xnite PostgreSQL database.
            const namesToCheck: string[] = [];
            usersList.forEach(u => {
                if (u.user_name) namesToCheck.push(u.user_name);
                if (u.user_email) namesToCheck.push(u.user_email);
            });

            // We still look up which users exist in our DB (for DB-supplemented details)
            // but we no longer filter out unregistered members — all Ginger members are shown.
            // existingNames is kept for reference but matchedUsers is only used for worklogs.
            const existingNames = await getExistingGingerUsernames(namesToCheck);
            const matchedUsers = usersList.filter(u => {
                const nameMatch = u.user_name && existingNames.includes(u.user_name.trim().toLowerCase());
                const emailMatch = u.user_email && existingNames.includes(u.user_email.trim().toLowerCase());
                return nameMatch || emailMatch;
            });

            const links = await getGroupLinksAction(idToFetch);
            setGroupLinks(links);

            const groupsToSync: any[] = [];
            const groupType = groupObj?.group_type || (effectiveRole === "judger" ? "team" : "group");
            const derivedGroupName = groupObj?.group_name
                || usersList.find(u => {
                    if (effectiveRole === "judger") return u.team_id === idToFetch;
                    return u.group_id === idToFetch;
                })?.group_name
                || `Group #${idToFetch}`;
            const derivedManagerEmail = groupObj?.manager_email
                || usersList.find(u => u.is_group_manager || u.is_team_director)?.user_email
                || undefined;

            const simplifiedUsers = usersList.map(u => ({ user_name: u.user_name || null, user_email: u.user_email || null }));

            groupsToSync.push({
                groupId: idToFetch,
                groupType: groupType,
                usersList: simplifiedUsers,
                groupInfo: {
                    groupName: derivedGroupName,
                    managerEmail: derivedManagerEmail
                }
            });

            // A judger's "team" is made up of members spread across several checker
            // groups, so surface every one of those groups' checker chat links here
            // instead of only the (usually unset) link on the team entity itself.
            if (effectiveRole === "judger") {
                const checkerGroupsMap = new Map<number, string>();
                usersList.forEach((u) => {
                    if (u.group_id != null && u.group_id !== 0 && u.group_id !== -1) {
                        if (!checkerGroupsMap.has(u.group_id)) {
                            checkerGroupsMap.set(u.group_id, u.group_name || `Group #${u.group_id}`);
                        }
                    }
                });
                const checkerGroupIds = Array.from(checkerGroupsMap.keys());
                const checkerLinksResults = await getGroupLinksMultipleAction(checkerGroupIds);
                setCheckerGroupLinks(
                    checkerGroupIds.map((gid) => {
                        const subLinks = checkerLinksResults[gid] || { checkerLink: null, judgerLink: null };
                        return {
                            groupId: gid,
                            groupName: checkerGroupsMap.get(gid) || `Group #${gid}`,
                            checkerLink: subLinks.checkerLink,
                        };
                    }).sort((a, b) => a.groupName.localeCompare(b.groupName))
                );

                // Also prep syncing for each individual checker sub-group
                checkerGroupIds.forEach((gid) => {
                    const gName = checkerGroupsMap.get(gid) || `Group #${gid}`;
                    const groupMembers = usersList
                        .filter(u => u.group_id === gid)
                        .map(u => ({ user_name: u.user_name || null, user_email: u.user_email || null }));
                    groupsToSync.push({
                        groupId: gid,
                        groupType: "group",
                        usersList: groupMembers,
                        groupInfo: { groupName: gName }
                    });
                });
            } else {
                setCheckerGroupLinks([]);
            }

            // Show ALL members from Ginger (registered or not). DB details will
            // only populate for those who have a Xnite account, but we no longer
            // hide unregistered members from the group view.
            setGroup(groupObj);
            setUsers(usersList);

            // Stop the main loading spinner immediately so the UI renders!
            setFetching(false);
            setIsSyncingData(true);

            // Fetch DB details and WorkLogs progressively in the background
            (async () => {
                try {
                    // Fetch DB details for matched users in chunks of 500
                    const CHUNK_SIZE = 500;
                    let activeDbUsers: any[] = [];
                    for (let i = 0; i < namesToCheck.length; i += CHUNK_SIZE) {
                        const chunk = namesToCheck.slice(i, i + CHUNK_SIZE);
                        const dbDetailsRes = await getGroupMembersDetailsAction(chunk);
                        if (dbDetailsRes.success && dbDetailsRes.data) {
                            activeDbUsers = [...activeDbUsers, ...dbDetailsRes.data];
                        }
                    }
                    setDbUserDetails([...activeDbUsers]); // Batch update to prevent UI shaking


                    // Fetch WorkLogs for matched users in chunks of 500
                    const usernamesList: string[] = [];
                    matchedUsers.forEach((u) => {
                        if (u.user_name) usernamesList.push(u.user_name);
                        if (u.user_email) usernamesList.push(u.user_email);
                    });
                    activeDbUsers.forEach((db) => {
                        if (db.gingerUsername) usernamesList.push(db.gingerUsername);
                        if (db.gingerEmail) usernamesList.push(db.gingerEmail);
                        if (db.name) usernamesList.push(db.name);
                        if (db.email) usernamesList.push(db.email);
                    });

                    // Deduplicate usernamesList to reduce DB load further
                    const uniqueUsernamesList = Array.from(new Set(usernamesList));

                    let allLogs: any[] = [];
                    for (let i = 0; i < uniqueUsernamesList.length; i += CHUNK_SIZE) {
                        const chunk = uniqueUsernamesList.slice(i, i + CHUNK_SIZE);
                        const logsRes = await getWorkLogsForUsernamesAction(chunk);
                        if (logsRes.success && logsRes.data) {
                            allLogs = [...allLogs, ...logsRes.data];
                        }
                    }
                    setWorkLogs([...allLogs]); // Batch update to prevent UI shaking
                } catch (backgroundErr) {
                    console.error("Progressive loading failed:", backgroundErr);
                } finally {
                    setIsSyncingData(false);
                    // Background DB sync of group/member assignments. Started after the
                    // details/worklogs load because Next.js runs server actions one at a
                    // time, so starting it first made those loads wait behind it.
                    syncMultipleGroupsAndMembersAction(groupsToSync).catch((err) => {
                        console.error("Failed to run background group member sync:", err);
                    });
                }
            })();

        } catch (e: any) {
            console.warn("Ginger API error, attempting re-login before database fallback:", e);
            try {
                const reloginRes = await forceGingerLoginAction();
                if (reloginRes.success && reloginRes.token) {
                    const retryRes = await fetch(`${GINGER_BASE}/bac/eam/koala/koala-group/group/detail`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${reloginRes.token}`
                        },
                        body: JSON.stringify({ group_id: idToFetch })
                    });
                    if (retryRes.ok) {
                        const retryData: KoalaApiResponse = await retryRes.json();
                        if ((retryData.errcode ?? retryData.code ?? 0) === 0) {
                            window.location.reload();
                            return;
                        }
                    }
                }
            } catch (reloginErr) {
                console.warn("Ginger re-login retry failed:", reloginErr);
            }

            const fallbackLoaded = await loadFromDbFallback();
            if (!fallbackLoaded) {
                setError(e.message || "Failed to fetch group details");
                setWorkLogs([]);
                setDbUserDetails([]);
                setFetching(false);
                setIsSyncingData(false);
            }
        }
    };

    const groupProjectSummaries = useMemo(() => {
        if (workLogs.length === 0) return [];
        const projectRolePairs = workLogs.map((log) => ({
            projectId: log.projectId,
            role: log.role,
        }));
        const uniquePairs = projectRolePairs.filter(
            (pair, index, self) =>
                index === self.findIndex((p) => p.projectId === pair.projectId && p.role === pair.role)
        );
        uniquePairs.sort((a, b) => {
            if (a.projectId !== b.projectId) {
                return a.projectId - b.projectId;
            }
            return a.role.localeCompare(b.role);
        });

        return uniquePairs.map(({ projectId: pId, role }) => {
            const pLogs = workLogs.filter((log) => log.projectId === pId && log.role === role);
            const sortedLogs = pLogs.slice().sort((a, b) => {
                const speedA = a.worktime > 0 ? a.features / a.worktime : 0;
                const speedB = b.worktime > 0 ? b.features / b.worktime : 0;
                return speedA - speedB;
            });
            const filteredLogs = sortedLogs.length > 20 ? sortedLogs.slice(10, -10) : sortedLogs;

            const totalWorktime = filteredLogs.reduce((acc, log) => acc + log.worktime, 0);
            const totalFeatures = filteredLogs.reduce((acc, log) => acc + log.features, 0);
            const totalTasks = filteredLogs.reduce((acc, log) => acc + log.taskNum, 0);
            const overallSpeed = totalWorktime > 0 ? totalFeatures / totalWorktime : 0;
            const tpm = totalWorktime > 0 && totalTasks > 0 ? (totalWorktime * 60) / totalTasks : 0;
            return {
                projectId: pId,
                role,
                projectName: "Project",
                overallSpeed,
                tpm
            };
        });
    }, [workLogs]);

    const isAuthorized = ["admin", "checker", "judger"].includes(userRole);

    const toggleWorkLogProjectId = (id: number) => {
        setSelectedWorkLogProjectIds((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
    };

    const toggleWorkLogRole = (role: string) => {
        setSelectedWorkLogRoles((prev) => prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]);
    };

    const toggleRoleFilter = (role: string) => {
        setSelectedRoles((prev) =>
            prev.includes(role)
                ? prev.filter((r) => r !== role)
                : [...prev, role]
        );
    };

    const toggleGroupFilter = (groupId: number) => {
        setSelectedGroups((prev) =>
            prev.includes(groupId)
                ? prev.filter((g) => g !== groupId)
                : [...prev, groupId]
        );
    };

    const toggleProjectFilter = (projectId: number) => {
        setSelectedProjects((prev) =>
            prev.includes(projectId)
                ? prev.filter((p) => p !== projectId)
                : [...prev, projectId]
        );
    };

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

    // Bitmap generates the worktime report asynchronously: start a task, poll
    // get_result until it hands back an S3 link, then download that file.
    const handleDownloadWorktime = async () => {
        const endDate = worktimeEnd > todayKey ? todayKey : worktimeEnd;
        if (!worktimeStart || !endDate || worktimeStart > endDate) {
            toast.error("Please select a valid date range");
            return;
        }
        setIsDownloadingWorktime(true);
        try {
            const startTask = async (token: string) => {
                const res = await fetch(`${GINGER_BASE}/bac/mapping/annotate/performance/async_download_work_time_table`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                    body: JSON.stringify({ start_date: worktimeStart, end_date: endDate })
                });
                const text = await res.text().catch(() => "");
                let data: { task_id?: string; data?: { task_id?: string }; msg?: string; errmsg?: string; err_msg?: string; message?: string; detail?: string; error?: string } | null = null;
                try { data = JSON.parse(text); } catch { }
                const taskId: string | null = data?.task_id || data?.data?.task_id || null;
                // Bitmap's error field name varies; fall back to the raw body so the real reason is shown.
                const message: string = data?.msg || data?.errmsg || data?.err_msg || data?.message || data?.detail || data?.error
                    || (res.ok ? "" : (text.trim().slice(0, 200) || `HTTP ${res.status}`));
                return { taskId, authFailed: res.status === 401 || res.status === 403, message };
            };

            // Bitmap allows one report per account at a time and can take several
            // minutes, so remember the task and resume it instead of starting another.
            let pending: { taskId: string; start: string; end: string; at: number } | null = null;
            try {
                const raw = localStorage.getItem(WORKTIME_PENDING_KEY);
                const p = raw ? JSON.parse(raw) : null;
                if (p?.taskId && Date.now() - p.at < 30 * 60 * 1000) pending = p;
            } catch { }

            let token = getGingerToken();
            if (!token) {
                const relogin = await forceGingerLoginAction();
                if (relogin.success && relogin.token) token = relogin.token;
            }
            if (!token) throw new Error("Could not log in to Bitmap");

            let taskId: string;
            let reportStart = worktimeStart;
            let reportEnd = endDate;
            if (pending) {
                taskId = pending.taskId;
                reportStart = pending.start;
                reportEnd = pending.end;
                toast.info(`Resuming the ${reportStart} → ${reportEnd} report Bitmap is already generating`);
            } else {
                let started = await startTask(token);
                // Only re-login for auth problems; Bitmap business errors (e.g. a
                // previous report still running) won't be fixed by a new token.
                if (started.authFailed) {
                    const relogin = await forceGingerLoginAction();
                    if (relogin.success && relogin.token) {
                        token = relogin.token;
                        started = await startTask(relogin.token);
                    }
                }
                if (!started.taskId) {
                    if (/not finished async/i.test(started.message)) {
                        throw new Error("Bitmap is still generating a previous report for your account. Please wait a few minutes and try again.");
                    }
                    throw new Error(started.message ? `Bitmap: ${started.message}` : "Bitmap rejected the request. Your account may not have access to worktime reports.");
                }
                taskId = started.taskId;
                try {
                    localStorage.setItem(WORKTIME_PENDING_KEY, JSON.stringify({ taskId, start: reportStart, end: reportEnd, at: Date.now() }));
                } catch { }
            }
            const clearPending = () => { try { localStorage.removeItem(WORKTIME_PENDING_KEY); } catch { } };

            const pollStartedAt = Date.now();
            const deadline = pollStartedAt + 15 * 60 * 1000;
            while (Date.now() < deadline) {
                await new Promise((r) => setTimeout(r, 3000));
                const res = await fetch(`${GINGER_BASE}/bac/async_task/api_request/get_result`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                    body: JSON.stringify({ task_id: taskId })
                });
                if (!res.ok) throw new Error(`Bitmap returned HTTP ${res.status}`);
                const data = await res.json();
                const result = data?.data ?? data;
                if (result?.error_message) {
                    clearPending();
                    throw new Error(result.error_message);
                }
                if (["failed", "failure", "error"].includes(String(result?.status).toLowerCase())) {
                    clearPending();
                    throw new Error("Bitmap failed to generate the worktime report");
                }
                if (result?.s3_presigned_url) {
                    clearPending();
                    const csvRes = await fetch("/api/worktime-report", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ url: result.s3_presigned_url })
                    });
                    const csvData = await csvRes.json();
                    if (!csvData.success) throw new Error(csvData.error || "Failed to fetch worktime report");

                    // CSV columns: user_name, default_role, work_time (hours), group_id, team_id — one row per user
                    const [headerLine, ...lines] = (csvData.csv as string).trim().split(/\r?\n/);
                    const headers = headerLine.split(",").map((h) => h.trim());
                    const nameIdx = headers.indexOf("user_name");
                    const timeIdx = headers.indexOf("work_time");
                    const groupIdx = headers.indexOf("group_id");
                    if (nameIdx === -1 || timeIdx === -1) throw new Error("Unexpected worktime report format");
                    // Bitmap's report uses its own group numbering, so keep its group_id alongside the hours.
                    const reportByUsername = new Map<string, { worktime: number; groupId: string }>();
                    lines.forEach((line) => {
                        const cols = line.split(",");
                        const name = cols[nameIdx]?.trim().toLowerCase();
                        if (!name) return;
                        const prev = reportByUsername.get(name);
                        reportByUsername.set(name, {
                            worktime: (prev?.worktime || 0) + (parseFloat(cols[timeIdx]) || 0),
                            groupId: groupIdx !== -1 ? (cols[groupIdx]?.trim() ?? "") : "",
                        });
                    });

                    // Follows the page's active filters (incl. old/new labeler); members with no Bitmap row get 0.
                    const rows = sortedUsers.map((u) => {
                        const dbUser = findDbUser(u);
                        const gingerUsername = dbUser?.gingerUsername || u.user_name || "";
                        const report = reportByUsername.get(gingerUsername.trim().toLowerCase())
                            ?? reportByUsername.get((u.user_name || "").trim().toLowerCase());
                        const worktime = report?.worktime ?? 0;
                        const cats = getUserRoleCategories(u, dbUser);
                        const labelerType = cats.includes("old labeler") ? "Old" : cats.includes("new labeler") ? "New" : "";
                        return {
                            worktime,
                            cells: [
                                dbUser?.name || u.user_name || "Unnamed User",
                                gingerUsername,
                                dbUser?.email || u.user_email || "",
                                dbUser?.role || u.role || u.user_role || "",
                                labelerType,
                                report?.groupId && !isNaN(Number(report.groupId)) ? Number(report.groupId) : (report?.groupId ?? ""),
                                worktime,
                            ] as CellValue[]
                        };
                    }).sort((a, b) => b.worktime - a.worktime);

                    downloadXlsx(
                        `worktime_${group?.group_id || "group"}_${reportStart}_to_${reportEnd}.xlsx`,
                        [{
                            name: "Worktime",
                            rows: [
                                ["Name", "Ginger Username", "Email", "Role", "Labeler Type", "Group ID", "Total Worktime (Hours)"],
                                ...rows.map((r) => r.cells)
                            ]
                        }]
                    );
                    toast.success(`Worktime exported for ${rows.length} members`);
                    setShowWorktimeMenu(false);
                    return;
                }
            }
            // The task stays remembered, so the next click resumes it.
            throw new Error("Bitmap is still generating the report. Click Download again later to pick it up.");
        } catch (e: unknown) {
            console.error("Worktime download failed:", e);
            toast.error((e instanceof Error && e.message) || "Failed to download worktime");
        } finally {
            setIsDownloadingWorktime(false);
        }
    };

    const toggleSort = (column: "name" | "recruiter" | "joined") => {
        if (sortColumn === column) {
            setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortColumn(column);
            setSortDirection("asc");
        }
    };

    const recruiters = useMemo(() => {
        const list: { email: string; name: string | null }[] = [];
        const emails = new Set<string>();
        dbUserDetails.forEach((u) => {
            if (u.refererEmail) {
                const email = u.refererEmail.trim().toLowerCase();
                if (!emails.has(email)) {
                    emails.add(email);
                    list.push({
                        email: u.refererEmail,
                        name: u.referer?.name || null
                    });
                }
            }
        });
        return list;
    }, [dbUserDetails]);

    const filteredRecruiters = useMemo(() => {
        if (!recruiterSearch) return recruiters;
        const searchTerms = recruiterSearch.trim().split(/\s+/).filter(Boolean);
        return recruiters.filter((r) =>
            searchTerms.length === 0 ||
            searchTerms.some((term) => {
                const searchLower = term.toLowerCase();
                return (
                    (r.name || "").toLowerCase().includes(searchLower) ||
                    r.email.toLowerCase().includes(searchLower)
                );
            })
        );
    }, [recruiters, recruiterSearch]);

    const getUserRoleCategories = useCallback((u: KoalaUser, dbUser?: any): string[] => {
        const categories: string[] = [];
        const dbRole = (dbUser?.role || "").toLowerCase();
        const gingerRole = (u.role || u.user_role || "").toLowerCase();

        if (u.is_group_manager || u.is_team_director || dbRole.includes("manager") || gingerRole.includes("manager")) {
            categories.push("manager");
        }
        if (dbRole.includes("reviewer") || gingerRole.includes("reviewer")) {
            categories.push("reviewer checker");
        }
        if (dbRole.includes("checker") || gingerRole.includes("checker")) {
            categories.push("checker");
        }
        if (dbRole.includes("judger") || gingerRole.includes("judger")) {
            categories.push("judger");
        }
        // "old-labeler" only exists as a DB role (Ginger reports them as plain labelers)
        const isOldLabeler = /^old[\s-]?lab/.test(dbRole.trim());
        if (isOldLabeler || dbRole.includes("labeler") || gingerRole.includes("labeler")) {
            categories.push("labeler");
            categories.push(isOldLabeler ? "old labeler" : "new labeler");
        }
        if (categories.length === 0) {
            categories.push("other");
        }
        return categories;
    }, []);

    const roleCounts = useMemo(() => {
        let labelers = 0;
        let checkers = 0;
        let judgers = 0;
        let reviewerCheckers = 0;
        let managers = 0;
        let others = 0;

        users.forEach(u => {
            const dbUser = lookupDbUser(u.user_name, u.user_email);
            const cats = getUserRoleCategories(u, dbUser);
            if (cats.includes("manager")) managers++;
            if (cats.includes("reviewer checker")) reviewerCheckers++;
            if (cats.includes("checker")) checkers++;
            if (cats.includes("judger")) judgers++;
            if (cats.includes("labeler")) labelers++;
            if (cats.includes("other")) others++;
        });
        return { labelers, checkers, judgers, reviewerCheckers, managers, others };
    }, [users, lookupDbUser, getUserRoleCategories]);

    const availableRoles = useMemo(() => {
        const rolesSet = new Set<string>();
        users.forEach((u) => {
            const r = u.role || u.user_role;
            if (r) {
                rolesSet.add(r.trim().toLowerCase());
            }
            if (u.is_group_manager || u.is_team_director) {
                rolesSet.add("manager");
            }
        });
        // Ensure standard fallback roles are populated
        ["checker", "judger", "labeler", "old labeler", "new labeler"].forEach(r => rolesSet.add(r));
        return Array.from(rolesSet).sort();
    }, [users]);

    const availableWorkLogRoles = useMemo(() => {
        const rolesSet = new Set<string>();
        workLogs.forEach((log) => {
            if (log.role) {
                rolesSet.add(log.role.trim().toLowerCase());
            }
        });
        return Array.from(rolesSet).sort();
    }, [workLogs]);

    const { activeWorkLogProjects, allWorkLogProjects } = useMemo(() => {
        if (workLogs.length === 0) return { activeWorkLogProjects: [], allWorkLogProjects: [] };

        const projectMeta = new Map<number, { latestTime: number; latestId: number; totalWorktime: number }>();
        let maxTime = 0;

        workLogs.forEach((log) => {
            if (log.projectId == null) return;
            const t = log.log_date ? new Date(log.log_date).getTime() :
                      log.periodEnd ? new Date(log.periodEnd).getTime() :
                      log.createdAt ? new Date(log.createdAt).getTime() : 0;

            if (t > maxTime) maxTime = t;

            const existing = projectMeta.get(log.projectId);
            if (!existing) {
                projectMeta.set(log.projectId, {
                    latestTime: t,
                    latestId: log.id,
                    totalWorktime: log.worktime || 0
                });
            } else {
                if (t > existing.latestTime) existing.latestTime = t;
                if (log.id > existing.latestId) existing.latestId = log.id;
                existing.totalWorktime += (log.worktime || 0);
            }
        });

        // Ensure known active/ongoing project deployments are accounted for
        knownActiveProjectIds.forEach((pId) => {
            if (!projectMeta.has(pId)) {
                projectMeta.set(pId, {
                    latestTime: Date.now(),
                    latestId: 0,
                    totalWorktime: 0
                });
            }
        });

        const activeSet = new Set<number>(knownActiveProjectIds);

        // Sort all projects: known active projects come first (sorted by recency), then remaining projects sorted by recency
        const allSorted = Array.from(projectMeta.entries())
            .sort((a, b) => {
                const aActive = activeSet.has(a[0]);
                const bActive = activeSet.has(b[0]);
                if (aActive && !bActive) return -1;
                if (!aActive && bActive) return 1;
                return b[1].latestTime - a[1].latestTime || b[1].latestId - a[1].latestId || a[0] - b[0];
            })
            .map(([pId]) => pId);

        // Active projects tab: strictly the known active projects
        const activeList = allSorted.filter((pId) => activeSet.has(pId));

        return {
            activeWorkLogProjects: activeList,
            allWorkLogProjects: allSorted
        };
    }, [workLogs, knownActiveProjectIds]);

    const displayedWorkLogProjects = useMemo(() => {
        if (projectSearch.trim()) {
            const query = projectSearch.trim().toLowerCase().replace("#", "");
            return allWorkLogProjects.filter((id) => id.toString().includes(query));
        }

        const baseList = workLogProjectTab === "active" ? activeWorkLogProjects : allWorkLogProjects;
        
        // Always include any currently selected project IDs so they remain visible and toggleable
        const combined = Array.from(new Set([
            ...selectedWorkLogProjectIds.filter(id => allWorkLogProjects.includes(id)),
            ...baseList
        ]));

        return combined;
    }, [workLogProjectTab, activeWorkLogProjects, allWorkLogProjects, selectedWorkLogProjectIds, projectSearch]);

    // Members of a team can each belong to a different sub-group, so surface
    // those groups as a filter (mainly useful when viewing a team as a judger).
    const availableGroups = useMemo(() => {
        const groupsMap = new Map<number, string>();
        users.forEach((u) => {
            if (u.group_id != null && u.group_id !== 0 && u.group_id !== -1) {
                if (!groupsMap.has(u.group_id)) {
                    groupsMap.set(u.group_id, u.group_name || `Group #${u.group_id}`);
                }
            }
        });
        return Array.from(groupsMap.entries())
            .map(([groupId, groupName]) => ({ groupId, groupName }))
            .sort((a, b) => a.groupName.localeCompare(b.groupName));
    }, [users]);

    const filteredGroups = useMemo(() => {
        if (!groupSearch) return availableGroups;
        const searchTerms = groupSearch.trim().split(/\s+/).filter(Boolean);
        return availableGroups.filter((g) =>
            searchTerms.length === 0 ||
            searchTerms.some((term) => {
                const searchLower = term.toLowerCase();
                return (
                    g.groupName.toLowerCase().includes(searchLower) ||
                    g.groupId.toString().includes(searchLower)
                );
            })
        );
    }, [availableGroups, groupSearch]);

    const availableProjects = useMemo(() => {
        const ids = Array.from(new Set(workLogs.map((log) => log.projectId)));
        return ids.sort((a, b) => a - b);
    }, [workLogs]);

    const filteredProjects = useMemo(() => {
        if (!projectSearch) return availableProjects;
        const searchTerms = projectSearch.trim().split(/\s+/).filter(Boolean);
        return availableProjects.filter((id) =>
            searchTerms.length === 0 ||
            searchTerms.some((term) => id.toString().includes(term))
        );
    }, [availableProjects, projectSearch]);

    const filteredUsers = useMemo(() => {
        return users.filter((u) => {
            const dbUser = lookupDbUser(u.user_name, u.user_email);

            const searchTerms = searchQuery.trim().split(/\s+/).filter(Boolean);
            const matchesSearch =
                searchTerms.length === 0 ||
                searchTerms.some((term) => {
                    const t = term.toLowerCase();
                    return (
                        u.user_name?.toLowerCase().includes(t) ||
                        u.user_email?.toLowerCase().includes(t) ||
                        (u.uid?.toString() || "").includes(t) ||
                        dbUser?.facebook?.toLowerCase().includes(t) ||
                        dbUser?.name?.toLowerCase().includes(t) ||
                        dbUser?.email?.toLowerCase().includes(t) ||
                        dbUser?.gingerUsername?.toLowerCase().includes(t)
                    );
                });

            const matchesRole =
                selectedRoles.length === 0 ||
                selectedRoles.some(role => getUserRoleCategories(u, dbUser).includes(role));

            const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.every((status) => {
                if (!dbUser) return false;
                if (status === "onboarding") return getOnboardingProgress(dbUser) === 100;
                if (status === "rules") return getRulesProgress(dbUser) === 100;
                if (status === "landcover_passed") return getTrainingStats(dbUser, "landcover").pct === 100;
                if (status === "3d_passed") return getTrainingStats(dbUser, "3d").pct === 100;
                if (status === "transpo_passed") return getTrainingStats(dbUser, "transpo").pct === 100;
                if (status === "roof_passed") return getTrainingStats(dbUser, "roof").pct === 100;
                return true;
            });

            const matchesDate = (() => {
                if (dateFilter === "all") return true;
                const rawDateStr = dbUser?.createdAt || u.ts_created || u.ts_create;
                if (!rawDateStr) return false;
                const userDate = new Date(rawDateStr);
                if (isNaN(userDate.getTime())) return false;
                const userTime = userDate.getTime();
                const now = new Date().getTime();
                const oneDay = 24 * 60 * 60 * 1000;

                if (dateFilter === "today") {
                    const startOfToday = new Date();
                    startOfToday.setHours(0, 0, 0, 0);
                    return userTime >= startOfToday.getTime();
                }
                if (dateFilter === "yesterday") {
                    const startOfYesterday = new Date();
                    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
                    startOfYesterday.setHours(0, 0, 0, 0);
                    return userTime >= startOfYesterday.getTime();
                }
                if (dateFilter === "week") {
                    return now - userTime <= 7 * oneDay;
                }
                if (dateFilter === "month") {
                    return now - userTime <= 30 * oneDay;
                }
                if (dateFilter === "three_months") {
                    return now - userTime <= 90 * oneDay;
                }
                if (dateFilter === "custom") {
                    if (!customStartDate && !customEndDate) return true;

                    if (customStartDate && customEndDate) {
                        const [sY, sM, sD] = customStartDate.split("-").map(Number);
                        const [eY, eM, eD] = customEndDate.split("-").map(Number);
                        const sTime = Math.min(
                            new Date(sY, sM - 1, sD, 0, 0, 0, 0).getTime(),
                            new Date(eY, eM - 1, eD, 0, 0, 0, 0).getTime()
                        );
                        const eTime = Math.max(
                            new Date(sY, sM - 1, sD, 23, 59, 59, 999).getTime(),
                            new Date(eY, eM - 1, eD, 23, 59, 59, 999).getTime()
                        );
                        return userTime >= sTime && userTime <= eTime;
                    } else if (customStartDate) {
                        const [sY, sM, sD] = customStartDate.split("-").map(Number);
                        const startTime = new Date(sY, sM - 1, sD, 0, 0, 0, 0).getTime();
                        const endTime = new Date(sY, sM - 1, sD, 23, 59, 59, 999).getTime();
                        return userTime >= startTime && userTime <= endTime;
                    } else if (customEndDate) {
                        const [eY, eM, eD] = customEndDate.split("-").map(Number);
                        const endTime = new Date(eY, eM - 1, eD, 23, 59, 59, 999).getTime();
                        return userTime <= endTime;
                    }
                }
                return true;
            })();

            const matchesRecruiter = (() => {
                if (selectedRecruiters.length === 0) return true;
                if (!dbUser) return false;
                const refEmail = dbUser.refererEmail?.trim().toLowerCase() || "organic";
                return selectedRecruiters.includes(refEmail);
            })();

            const matchesGroup = selectedGroups.length === 0 || (u.group_id != null && selectedGroups.includes(u.group_id));

            const matchesQrCode = !missingQrCode || (() => {
                if (!dbUser) return true;
                const pd = dbUser.paymentDetails;
                return !pd || !pd.qrImageUrl || pd.qrImageUrl.trim() === "";
            })();

            const matchesPaymentDetails = !hasPaymentDetails || (() => {
                if (!dbUser) return false;
                return dbUser.paymentDetails != null;
            })();

            return matchesSearch && matchesRole && matchesStatus && matchesDate && matchesRecruiter && matchesGroup && matchesQrCode && matchesPaymentDetails;
        });
    }, [users, searchQuery, selectedRoles, dbUserDetails, lookupDbUser, selectedStatuses, dateFilter, customStartDate, customEndDate, selectedRecruiters, selectedGroups, missingQrCode, hasPaymentDetails]);

    const findDbUser = useCallback((u: KoalaUser) => {
        return lookupDbUser(u.user_name, u.user_email);
    }, [lookupDbUser]);

    const sortedUsers = useMemo(() => {
        if (!sortColumn) return filteredUsers;
        const dir = sortDirection === "asc" ? 1 : -1;
        return [...filteredUsers].sort((a, b) => {
            if (sortColumn === "name") {
                const aName = (findDbUser(a)?.name || a.user_name || "").toLowerCase();
                const bName = (findDbUser(b)?.name || b.user_name || "").toLowerCase();
                return aName.localeCompare(bName) * dir;
            }
            if (sortColumn === "recruiter") {
                const aDb = findDbUser(a);
                const bDb = findDbUser(b);
                const aRec = (aDb?.labelerRefererName || aDb?.referer?.name || aDb?.refererEmail || "").toLowerCase();
                const bRec = (bDb?.labelerRefererName || bDb?.referer?.name || bDb?.refererEmail || "").toLowerCase();
                return aRec.localeCompare(bRec) * dir;
            }
            if (sortColumn === "joined") {
                const aCreatedAt = findDbUser(a)?.createdAt;
                const bCreatedAt = findDbUser(b)?.createdAt;
                const aTime = aCreatedAt ? new Date(aCreatedAt).getTime() : 0;
                const bTime = bCreatedAt ? new Date(bCreatedAt).getTime() : 0;
                return (aTime - bTime) * dir;
            }
            return 0;
        });
    }, [filteredUsers, sortColumn, sortDirection, findDbUser]);

    const [page, setPage] = useState(1);

    useEffect(() => {
        setPage(1);
        setSelectedUserIds(new Set());
    }, [searchQuery, selectedRoles, selectedGroups, selectedProjects, users, missingQrCode, hasPaymentDetails]);

    const totalPages = Math.ceil(sortedUsers.length / 50);

    const paginatedUsers = useMemo(() => {
        const start = (page - 1) * 50;
        return sortedUsers.slice(start, start + 50);
    }, [sortedUsers, page]);

    const getInitials = (name?: string) => {
        if (!name) return "U";
        return name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
    };

    const getRoleBadge = (role?: string, isManager?: boolean) => {
        const r = role?.toLowerCase() || "";
        return (
            <div className="flex flex-wrap items-center gap-1">
                {r === "checker" && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 uppercase">
                        Checker
                    </span>
                )}
                {r === "judger" && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 uppercase">
                        Judger
                    </span>
                )}
                {r === "labeler" && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-500/10 text-gray-600 dark:text-gray-400 border border-gray-500/20 uppercase">
                        Labeler
                    </span>
                )}
                {(r.includes("reviewer") || r.includes("reviewer checker")) && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 uppercase">
                        Reviewer Checker
                    </span>
                )}
                {r !== "checker" && r !== "judger" && r !== "labeler" && !r.includes("reviewer") && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 uppercase">
                        {role || "Member"}
                    </span>
                )}
                {isManager && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 uppercase flex items-center gap-1">
                        <Shield className="w-3 h-3" /> Manager
                    </span>
                )}
            </div>
        );
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

    const getUserWorkLogs = useCallback((userName?: string, userEmail?: string) => {
        const dbUser = lookupDbUser(userName, userEmail);

        const names = [
            userName?.trim().toLowerCase(),
            userEmail?.trim().toLowerCase(),
            dbUser?.gingerUsername?.trim().toLowerCase(),
            dbUser?.gingerEmail?.trim().toLowerCase(),
            dbUser?.name?.trim().toLowerCase(),
            dbUser?.email?.trim().toLowerCase(),
        ].filter(Boolean) as string[];

        const userLogs: WorkLog[] = [];
        names.forEach(name => {
            const arr = workLogsByOwner.get(name);
            if (arr) userLogs.push(...arr);
        });

        // deduplicate userLogs if a log was pushed multiple times
        const uniqueLogsMap = new Map<number, WorkLog>();
        userLogs.forEach(l => uniqueLogsMap.set(l.id, l));
        const uniqueLogs = Array.from(uniqueLogsMap.values());

        const filteredLogs = uniqueLogs.filter((log) =>
            (selectedProjects.length === 0 || selectedProjects.includes(log.projectId))
        );

        // The same user's work can be logged under multiple aliases (name, email,
        // gingerUsername, gingerEmail), producing duplicate rows for the same
        // project and role. Keep only the most recent one (highest id) per project and role.
        const latestByProject = new Map<string, WorkLog>();
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

        return Array.from(latestByProject.values());
    }, [workLogsByOwner, lookupDbUser, selectedProjects]);

    const handleExportCSV = async () => {
        if (sortedUsers.length === 0) {
            toast.error("No data to export");
            return;
        }

        try {
            setIsExporting(true);

            // Shared member columns, identical in both tabs so rows line up.
            const memberHeaders = [
                "Name",
                "Username",
                "Ginger Username",
                "Email",
                "Facebook",
                "Role",
                "Group ID",
            ];
            // Staff columns sit last in both tabs, after the worklog block.
            const staffHeaders = [
                "Recruiter",
                "Checker Name",
            ];
            const worklogHeaders = [
                "Project ID",
                "Worklog Role",
                "Worktime (Hours)",
                "Tasks Completed",
                "Features Mapped",
                "Min / Task",
                "Computed Speed (F/hr)",
            ];

            // A member's (checker) group: the live Ginger value first, since the DB copy is
            // only synced after the page loads and can still be the -1 / 0 placeholder.
            const realId = (id: number | null | undefined) =>
                typeof id === "number" && !isNaN(id) && id !== 0 && id !== -1 ? id : null;
            const memberGroupId = (u: KoalaUser) => realId(u.group_id) ?? realId(findDbUser(u)?.group_id);

            // Each member's checker comes from their own group, not the group being viewed,
            // so collect every group represented here and resolve their checkers in one call.
            const memberGroupIds = Array.from(new Set(
                sortedUsers.map(memberGroupId).filter((id): id is number => id !== null)
            ));
            const { checkerByGroupId: checkerNameByGroupId } = await getGroupStaffNamesAction(memberGroupIds);

            // "Performance Query" carries the worklog detail; "User" is the plain member list.
            const performanceRows: CellValue[][] = [[...memberHeaders, ...worklogHeaders, ...staffHeaders]];
            const userRows: CellValue[][] = [[...memberHeaders, ...staffHeaders]];

            sortedUsers.forEach((u) => {
                const dbUser = findDbUser(u);
                const displayName = dbUser?.name || u.user_name || "Unnamed User";
                const displayEmail = dbUser?.email || u.user_email || "";
                const username = displayEmail ? displayEmail.split("@")[0] : "";

                const gingerUsername = dbUser?.gingerUsername || u.user_name || "";
                const gingerEmail = dbUser?.gingerEmail || u.user_email || "";
                const userRole = dbUser?.role || u.role || u.user_role || "";
                const groupId = memberGroupId(u);

                // Same fallback chain the Recruiter column uses in the table.
                const recruiterName = dbUser?.labelerRefererName || dbUser?.referer?.name || dbUser?.refererEmail || "Direct";

                const checkerName = groupId !== null ? (checkerNameByGroupId[groupId] || "") : "";

                const memberCells: CellValue[] = [
                    displayName,
                    username,
                    gingerUsername,
                    gingerEmail,
                    dbUser?.facebook || "",
                    userRole,
                    groupId ?? "",
                ];
                const staffCells: CellValue[] = [recruiterName, checkerName];

                userRows.push([...memberCells, ...staffCells]);

                const rawULogs = getUserWorkLogs(u.user_name, u.user_email);
                const uLogs = rawULogs.filter(log => {
                    const matchesRole = selectedWorkLogRoles.length === 0 || selectedWorkLogRoles.includes(log.role.trim().toLowerCase());
                    const matchesProject = selectedWorkLogProjectIds.length === 0 || selectedWorkLogProjectIds.includes(log.projectId);
                    return matchesRole && matchesProject;
                });

                if (uLogs.length === 0) {
                    performanceRows.push([...memberCells, "N/A", "", "", "", "", "", "", ...staffCells]);
                    return;
                }

                uLogs.forEach((log) => {
                    const entrySpeed = log.worktime > 0 ? log.features / log.worktime : 0;
                    performanceRows.push([
                        ...memberCells,
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
                `group_${group?.group_id || "export"}_${new Date().toISOString().slice(0, 10)}.xlsx`,
                [
                    { name: "User", rows: userRows },
                    { name: "Performance Query", rows: performanceRows },
                ]
            );

            toast.success(`Successfully exported ${sortedUsers.length} members (${performanceRows.length - 1} worklog rows)`);
        } catch (error) {
            console.error("Export failed:", error);
            // toast.error("An error occurred during export");
        } finally {
            setIsExporting(false);
        }
    };


    const MemberRow = ({ u, uLogs, hasLogs, isSyncingData }: { u: KoalaUser; uLogs: WorkLog[]; hasLogs: boolean; isSyncingData: boolean }) => {
        const dbUser = useMemo(() => {
            return lookupDbUser(u.user_name, u.user_email);
        }, [u.user_name, u.user_email]);

        const displayName = dbUser?.name || u.user_name || "Unnamed User";
        const displayEmail = dbUser?.email || u.user_email || "";
        const canSeeContact = ["admin", "judger"].includes(userRole.toLowerCase());
        const showRecruiter = userRole.toLowerCase() === "admin";



        const onboardingPct = getOnboardingProgress(dbUser);
        const rulesPct = getRulesProgress(dbUser);

        // Group logs by project
        const projectSummaries = useMemo(() => {
            if (!hasLogs) return [];
            const projectRolePairs = uLogs.map((log) => ({
                projectId: log.projectId,
                role: log.role,
            }));
            const uniquePairs = projectRolePairs.filter(
                (pair, index, self) =>
                    index === self.findIndex((p) => p.projectId === pair.projectId && p.role === pair.role)
            );
            uniquePairs.sort((a, b) => {
                if (a.projectId !== b.projectId) {
                    return a.projectId - b.projectId;
                }
                return a.role.localeCompare(b.role);
            });

            return uniquePairs.map(({ projectId: pId, role }) => {
                const pLogs = uLogs.filter((log) => log.projectId === pId && log.role === role);
                const totalWorktime = pLogs.reduce((acc, log) => acc + log.worktime, 0);
                const totalFeatures = pLogs.reduce((acc, log) => acc + log.features, 0);
                const totalTasks = pLogs.reduce((acc, log) => acc + log.taskNum, 0);
                const overallSpeed = totalWorktime > 0 ? totalFeatures / totalWorktime : 0;
                const overallMinPerTask = totalTasks > 0 ? (totalWorktime * 60) / totalTasks : 0;
                return {
                    projectId: pId,
                    projectName: "Project",
                    role,
                    overallSpeed,
                    overallMinPerTask,
                    logs: pLogs,
                };
            });
        }, [uLogs, hasLogs]);

        // By default only a single worklog entry shows (not one row per project): the most
        // recent entry (highest id) matching the member's current role, falling back to the
        // most recent entry overall if none match. The rest are revealed on expand.
        const userRoleStr = (u.role || u.user_role || "").trim().toLowerCase();

        const primaryLog = useMemo(() => {
            if (uLogs.length === 0) return null;
            const roleMatches = uLogs.filter((log) => log.role.trim().toLowerCase() === userRoleStr);
            const pool = roleMatches.length > 0 ? roleMatches : uLogs;
            return pool.reduce((latest, log) => (log.id > latest.id ? log : latest), pool[0]);
        }, [uLogs, userRoleStr]);

        const otherLogs = useMemo(() => {
            if (!primaryLog) return [];
            return uLogs
                .filter((log) => log.id !== primaryLog.id)
                .sort((a, b) => a.projectId - b.projectId || a.role.localeCompare(b.role));
        }, [uLogs, primaryLog]);

        const [isLogsExpanded, setIsLogsExpanded] = useState(false);
        const totalExtraLogs = otherLogs.length;
        const hasMultiRoleProjects = totalExtraLogs > 0;

        return (
            <>
                <tr
                    onClick={() => { if (canMessage) toggleSelectUser(u.uid?.toString() || u.user_name); }}
                    className={`hover:bg-black/[0.02] dark:hover:bg-white/5 transition-colors group ${selectedUserIds.has(u.uid?.toString() || u.user_name) ? "bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 outline outline-2 outline-[#1F7A1F] dark:outline-[#55f761] -outline-offset-2 z-10 relative" : ""} ${canMessage ? "cursor-pointer" : ""}`}
                >
                    {/* User Details */}
                    <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#1F7A1F]/15 dark:bg-[#55f761]/15 text-[#1F7A1F] dark:text-[#55f761] flex items-center justify-center font-bold tracking-wider select-none shrink-0 group-hover:scale-105 transition-transform">
                                {u.avatar_src ? (
                                    <img src={u.avatar_src} alt={displayName} loading="lazy" decoding="async" className="h-full w-full object-cover rounded-full" />
                                ) : (
                                    getInitials(displayName)
                                )}
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="font-bold text-[#0D1B2A] dark:text-white flex items-center gap-1.5 truncate">
                                    {displayName}
                                    {getRoleBadge(dbUser?.role || u.role || u.user_role, u.is_group_manager || u.is_team_director)}
                                </span>
                                {canSeeContact && dbUser?.phone && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            navigator.clipboard.writeText(dbUser.phone!);
                                            toast.success("Phone number copied to clipboard");
                                        }}
                                        className="text-xs text-left text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 truncate flex items-center gap-1 w-fit cursor-pointer mt-0.5"
                                    >
                                        <Phone className="w-3 h-3 shrink-0" />
                                        {dbUser.phone}
                                    </button>
                                )}
                                {dbUser?.facebook && (
                                    <a
                                        href={dbUser.facebook!.startsWith("http") ? dbUser.facebook! : `https://${dbUser.facebook}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        title={dbUser.facebook}
                                        className="text-xs text-left text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 max-w-full cursor-pointer mt-0.5"
                                    >
                                        <Globe className="w-3.5 h-3.5 shrink-0" />
                                        <span>{truncateFacebook(dbUser.facebook)}</span>
                                    </a>
                                )}
                            </div>
                        </div>
                    </td>

                    {/* Recruiter */}
                    {showRecruiter && (
                        <td className="px-6 py-4 whitespace-nowrap text-[#2F3E46]/80 dark:text-white/70 font-semibold">
                            {dbUser?.labelerRefererName || dbUser?.referer?.name || dbUser?.refererEmail || "Direct"}
                        </td>
                    )}

                    {/* Progress */}
                    <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1.5 max-w-[320px]">
                            <ProgressPill label="Landcover" pct={getTrainingStats(dbUser, "landcover").pct} detail={`${getTrainingStats(dbUser, "landcover").passed}/${getTrainingStats(dbUser, "landcover").total}`} />
                            <ProgressPill label="3D Match" pct={getTrainingStats(dbUser, "3d").pct} detail={`${getTrainingStats(dbUser, "3d").passed}/${getTrainingStats(dbUser, "3d").total}`} />
                            <ProgressPill label="Transpo" pct={getTrainingStats(dbUser, "transpo").pct} />
                            <ProgressPill label="Roof" pct={getTrainingStats(dbUser, "roof").pct} />
                            {onboardingPct === 0 && rulesPct === 0 &&
                                getTrainingStats(dbUser, "landcover").pct === 0 &&
                                getTrainingStats(dbUser, "3d").pct === 0 &&
                                getTrainingStats(dbUser, "transpo").pct === 0 &&
                                getTrainingStats(dbUser, "roof").pct === 0 ? (
                                <span className="text-xs text-gray-400 dark:text-white/20 select-none font-medium">Not Started</span>
                            ) : null}
                        </div>
                    </td>

                    {/* Joined Date */}
                    <td className="px-6 py-4 whitespace-nowrap text-[#2F3E46]/60 dark:text-white/40">
                        <div className="flex items-center justify-between gap-3 text-xs font-semibold">
                            <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-[#2F3E46]/40 dark:text-white/30" />
                                {dbUser?.createdAt ? new Date(dbUser.createdAt).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric"
                                }) : ((u.ts_created || u.ts_create) ? (u.ts_created || u.ts_create)!.split(" ")[0] : "N/A")}
                            </div>
                        </div>
                    </td>

                    {canMessage && (
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const target: MessageTarget = {
                                        id: dbUser?.id || u.uid?.toString() || displayEmail,
                                        name: displayName,
                                        email: displayEmail
                                    };
                                    openMessageModal([target]);
                                }}
                                title={`Message ${displayName}`}
                                className="inline-flex items-center justify-center p-2 bg-[#1F7A1F] hover:bg-[#1A661A] dark:bg-[#55f761]/10 dark:hover:bg-[#55f761]/20 text-white dark:text-[#55f761] rounded-xl transition-all hover:scale-[1.02] shadow-sm cursor-pointer shrink-0"
                            >
                                <MessageSquare className="w-4 h-4" />
                            </button>
                        </td>
                    )}
                </tr>

                {/* Performance sub-row */}
                {hasLogs && (
                    <tr className="bg-black/[0.03] dark:bg-black/40">
                        <td colSpan={showRecruiter ? (canMessage ? 6 : 5) : (canMessage ? 5 : 4)} className="px-6 py-4">
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
                                                        {hasMultiRoleProjects && (
                                                            <button
                                                                onClick={() => setIsLogsExpanded((v) => !v)}
                                                                className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] font-bold transition-all cursor-pointer"
                                                                title={isLogsExpanded ? "Hide all worklogs" : "Show all worklogs"}
                                                            >
                                                                <span>{totalExtraLogs}</span>
                                                                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isLogsExpanded ? "rotate-180" : ""}`} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-[#0D1B2A] dark:text-white/90">
                                            {primaryLog && <WorkLogRow key={primaryLog.id} log={primaryLog} projectSummaries={projectSummaries} />}
                                            {isLogsExpanded && otherLogs.map((log) => (
                                                <WorkLogRow key={log.id} log={log} projectSummaries={projectSummaries} />
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </td>
                    </tr>
                )}
                {/* Work Logs Skeleton */}
                {!hasLogs && isSyncingData && (
                    <tr className="bg-black/[0.03] dark:bg-black/40">
                        <td colSpan={showRecruiter ? (canMessage ? 6 : 5) : (canMessage ? 5 : 4)} className="px-6 py-4">
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
                                                <th className="py-2.5 px-4 text-right">Computed Speed</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-[#0D1B2A] dark:text-white/90">
                                            {[...Array(2)].map((_, i) => (
                                                <tr key={i} className="border-b border-black/5 dark:border-white/5 last:border-0">
                                                    <td className="py-3 px-4"><div className="h-4 w-16 bg-black/10 dark:bg-white/10 rounded animate-pulse"></div></td>
                                                    <td className="py-3 px-4 text-center"><div className="h-4 w-12 bg-black/10 dark:bg-white/10 rounded animate-pulse mx-auto"></div></td>
                                                    <td className="py-3 px-4 text-center"><div className="h-4 w-10 bg-black/10 dark:bg-white/10 rounded animate-pulse mx-auto"></div></td>
                                                    <td className="py-3 px-4 text-center"><div className="h-4 w-14 bg-black/10 dark:bg-white/10 rounded animate-pulse mx-auto"></div></td>
                                                    <td className="py-3 px-4 text-center"><div className="h-4 w-12 bg-black/10 dark:bg-white/10 rounded animate-pulse mx-auto"></div></td>
                                                    <td className="py-3 px-4 text-right"><div className="h-4 w-20 bg-black/10 dark:bg-white/10 rounded animate-pulse ml-auto"></div></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </td>
                    </tr>
                )}
            </>
        );
    };

    const MemberCard = ({ u, uLogs, hasLogs, isSyncingData }: { u: KoalaUser; uLogs: WorkLog[]; hasLogs: boolean; isSyncingData: boolean }) => {
        // Find database user record to fetch extra progress details (onboarding, rules, training, contacts)
        const dbUser = useMemo(() => {
            return lookupDbUser(u.user_name, u.user_email);
        }, [u.user_name, u.user_email]);

        const displayName = dbUser?.name || u.user_name || "Unnamed User";
        const displayEmail = dbUser?.email || u.user_email || "";
        const canSeeContact = ["admin", "judger"].includes(userRole.toLowerCase());



        const onboardingPct = getOnboardingProgress(dbUser);
        const rulesPct = getRulesProgress(dbUser);

        // Group logs by project
        const projectSummaries = useMemo(() => {
            if (!hasLogs) return [];
            const projectRolePairs = uLogs.map((log) => ({
                projectId: log.projectId,
                role: log.role,
            }));
            const uniquePairs = projectRolePairs.filter(
                (pair, index, self) =>
                    index === self.findIndex((p) => p.projectId === pair.projectId && p.role === pair.role)
            );
            uniquePairs.sort((a, b) => {
                if (a.projectId !== b.projectId) {
                    return a.projectId - b.projectId;
                }
                return a.role.localeCompare(b.role);
            });

            return uniquePairs.map(({ projectId: pId, role }) => {
                const pLogs = uLogs.filter((log) => log.projectId === pId && log.role === role);
                const totalWorktime = pLogs.reduce((acc, log) => acc + log.worktime, 0);
                const totalFeatures = pLogs.reduce((acc, log) => acc + log.features, 0);
                const totalTasks = pLogs.reduce((acc, log) => acc + log.taskNum, 0);
                const overallSpeed = totalWorktime > 0 ? totalFeatures / totalWorktime : 0;
                const overallMinPerTask = totalTasks > 0 ? (totalWorktime * 60) / totalTasks : 0;
                return {
                    projectId: pId,
                    projectName: "Project",
                    role,
                    overallSpeed,
                    overallMinPerTask,
                    logs: pLogs,
                };
            });
        }, [uLogs, hasLogs]);

        const formatMinPerTask = (tasks: number, worktimeHours: number): string => {
            if (tasks <= 0) return "â€”";
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

        return (
            <div
                onClick={() => { if (canMessage) toggleSelectUser(u.uid?.toString() || u.user_name); }}
                className={`bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl p-5 shadow-lg backdrop-blur-md transition-all duration-300 space-y-4 ${selectedUserIds.has(u.uid?.toString() || u.user_name) ? "bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 outline outline-2 outline-[#1F7A1F] dark:outline-[#55f761] -outline-offset-2 z-10 relative" : ""} ${canMessage ? "cursor-pointer" : ""}`}
            >
                {/* Header / Info Row */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-full bg-[#1F7A1F]/15 dark:bg-[#55f761]/15 text-[#1F7A1F] dark:text-[#55f761] border border-[#1F7A1F]/20 dark:border-[#55f761]/20 flex items-center justify-center text-sm font-black overflow-hidden shrink-0 select-none">
                            {u.avatar_src ? (
                                <img src={u.avatar_src} alt={displayName} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                            ) : (
                                getInitials(displayName)
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-extrabold text-[#0D1B2A] dark:text-white flex flex-wrap items-center gap-2">
                                <span className="truncate">{displayName}</span>
                                {getRoleBadge(dbUser?.role || u.role || u.user_role, u.is_group_manager || u.is_team_director)}
                            </div>
                            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 flex flex-col gap-1 mt-1">
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            navigator.clipboard.writeText(displayEmail);
                                            toast.success("Email copied to clipboard");
                                        }}
                                        className="hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-colors truncate flex items-center gap-1 cursor-pointer"
                                    >
                                        <Mail className="w-3 h-3 shrink-0" />
                                        {displayEmail}
                                    </button>
                                </div>
                                {canSeeContact && dbUser?.phone && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            navigator.clipboard.writeText(dbUser.phone!);
                                            toast.success("Phone number copied to clipboard");
                                        }}
                                        className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 truncate flex items-center gap-1 w-fit cursor-pointer animate-in fade-in duration-200"
                                    >
                                        <Phone className="w-3 h-3 shrink-0" />
                                        {dbUser.phone}
                                    </button>
                                )}
                                {canSeeContact && dbUser?.facebook && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (e.button === 1) {
                                                e.preventDefault();
                                                const fbUrl = dbUser.facebook!.startsWith("http") ? dbUser.facebook! : `https://${dbUser.facebook}`;
                                                window.open(fbUrl, "_blank", "noopener,noreferrer");
                                                return;
                                            }
                                            const fbUrl = dbUser.facebook!.startsWith("http") ? dbUser.facebook! : `https://${dbUser.facebook}`;
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
                                                const fbUrl = dbUser.facebook!.startsWith("http") ? dbUser.facebook! : `https://${dbUser.facebook}`;
                                                window.open(fbUrl, "_blank", "noopener,noreferrer");
                                            }
                                        }}
                                        title={dbUser.facebook}
                                        className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 text-left flex items-center gap-1 max-w-full cursor-pointer animate-in fade-in duration-200"
                                    >
                                        <Globe className="w-3.5 h-3.5 shrink-0" />
                                        <span>{truncateFacebook(dbUser.facebook)}</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-4 text-xs font-semibold text-gray-500 dark:text-gray-400 self-stretch md:self-auto pt-2 md:pt-0 border-t md:border-t-0 border-black/5 dark:border-white/5">
                        <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-[#2F3E46]/40 dark:text-white/30" />
                            <span>
                                {dbUser?.createdAt ? new Date(dbUser.createdAt).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric"
                                }) : ((u.ts_created || u.ts_create) ? (u.ts_created || u.ts_create)!.split(" ")[0] : "N/A")}
                            </span>
                        </div>
                        {canMessage && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const target: MessageTarget = {
                                        id: dbUser?.id || u.uid?.toString() || displayEmail,
                                        name: displayName,
                                        email: displayEmail
                                    };
                                    openMessageModal([target]);
                                }}
                                title={`Message ${displayName}`}
                                className="inline-flex items-center justify-center px-3 py-1.5 bg-[#1F7A1F] hover:bg-[#1A661A] dark:bg-[#55f761]/10 dark:hover:bg-[#55f761]/20 text-white dark:text-[#55f761] rounded-xl transition-all hover:scale-[1.02] shadow-sm cursor-pointer shrink-0 text-xs font-bold gap-1.5"
                            >
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>Message</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Progress Pills */}
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-black/5 dark:border-white/5">
                    <ProgressPill label="Landcover" pct={getTrainingStats(dbUser, "landcover").pct} detail={`${getTrainingStats(dbUser, "landcover").passed}/${getTrainingStats(dbUser, "landcover").total}`} />
                    <ProgressPill label="3D Match" pct={getTrainingStats(dbUser, "3d").pct} detail={`${getTrainingStats(dbUser, "3d").passed}/${getTrainingStats(dbUser, "3d").total}`} />
                    <ProgressPill label="Transpo" pct={getTrainingStats(dbUser, "transpo").pct} />
                    <ProgressPill label="Roof" pct={getTrainingStats(dbUser, "roof").pct} />
                    {onboardingPct === 0 && rulesPct === 0 &&
                        getTrainingStats(dbUser, "landcover").pct === 0 &&
                        getTrainingStats(dbUser, "3d").pct === 0 &&
                        getTrainingStats(dbUser, "transpo").pct === 0 &&
                        getTrainingStats(dbUser, "roof").pct === 0 ? (
                        <span className="text-xs text-gray-400 dark:text-white/20 select-none font-medium">Not Started</span>
                    ) : null}
                </div>


            </div>
        );
    };

    if (loading) {
        return (
            <div className="w-full p-8 flex justify-center items-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1F7A1F] dark:border-[#55f761]"></div>
            </div>
        );
    }

    if (!isAuthorized && userRole !== "") {
        return (
            <div className="w-full p-8 text-center bg-white dark:bg-[#0D1B2A]/60 border border-red-500/20 rounded-2xl max-w-lg mx-auto mt-12 shadow-sm">
                <h2 className="text-xl font-bold text-red-600 dark:text-red-400">Access Denied</h2>
                <p className="text-sm text-[#2F3E46] dark:text-white/60 mt-2">
                    You do not have permission to view Guild Structure. Allowed roles: Overseer, Arbiter, Grandmaster.
                </p>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Mesh Background */}
            <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute bg-[#55f761] filter blur-[100px] rounded-full opacity-30 dark:opacity-15" style={{ width: '40vw', height: '40vw', top: '-10%', left: '-10%' }}></div>
                <div className="absolute bg-[#1F7A1F] filter blur-[100px] rounded-full opacity-30 dark:opacity-15" style={{ width: '50vw', height: '50vw', top: '40%', right: '-20%' }}></div>
            </div>

            {/* Header Section */}
            <div className="relative z-20 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight text-[#0D1B2A] dark:text-white">
                        Guild Structure
                    </h1>
                    <p className="text-xs md:text-sm text-[#2F3E46]/70 dark:text-white/60 mt-1">
                        Manage your team members, check guild capacity, and access grading links.
                    </p>
                </div>
                <div className="flex gap-2">
                    {canMessage && (
                        <button
                            onClick={() => {
                                const targets: MessageTarget[] = filteredUsers.map((u) => {
                                    const dbUser = lookupDbUser(u.user_name, u.user_email);
                                    const displayName = dbUser?.name || u.user_name || "Unnamed User";
                                    const displayEmail = dbUser?.email || u.user_email || "";
                                    return {
                                        id: dbUser?.id || u.uid?.toString() || displayEmail,
                                        name: displayName,
                                        email: displayEmail
                                    };
                                }).filter(t => !!t.email);

                                if (targets.length === 0) {
                                    toast.error("No users to message");
                                    return;
                                }
                                openMessageModal(targets);
                            }}
                            className="flex items-center gap-1.5 px-4 py-2 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 hover:bg-[#1F7A1F]/15 dark:hover:bg-[#55f761]/15 text-[#1F7A1F] dark:text-[#55f761] rounded-xl text-xs font-bold transition-all hover:scale-[1.02] hover:cursor-pointer select-none"
                        >
                            <Mail className="w-3.5 h-3.5" />
                            <span>Message All ({filteredUsers.length})</span>
                        </button>
                    )}
                    <div className="relative">
                        <button
                            onClick={() => setShowWorktimeMenu((v) => !v)}
                            className="flex items-center gap-1.5 px-4 py-2 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 hover:bg-[#1F7A1F]/15 dark:hover:bg-[#55f761]/15 text-[#1F7A1F] dark:text-[#55f761] rounded-xl text-xs font-bold transition-all hover:scale-[1.02] hover:cursor-pointer select-none"
                        >
                            <Clock className="w-3.5 h-3.5" />
                            <span>Worktime</span>
                            {showWorktimeMenu ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                        {showWorktimeMenu && (
                            <div className="absolute right-0 mt-2 z-30 w-72 bg-white dark:bg-[#0D1B2A] border border-black/10 dark:border-white/10 rounded-2xl shadow-xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                <h4 className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">Worktime Report</h4>
                                <DateRangePicker
                                    start={worktimeStart}
                                    end={worktimeEnd}
                                    maxDate={todayKey}
                                    onChange={(s, e) => {
                                        setWorktimeStart(s);
                                        setWorktimeEnd(e);
                                    }}
                                />
                                <button
                                    onClick={handleDownloadWorktime}
                                    disabled={isDownloadingWorktime}
                                    className={`w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-[#1F7A1F] hover:bg-[#1F7A1F]/90 text-white rounded-xl text-xs font-bold transition-all ${isDownloadingWorktime ? "opacity-70 cursor-not-allowed" : "hover:cursor-pointer"}`}
                                >
                                    {isDownloadingWorktime ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                    <span>{isDownloadingWorktime ? "Generating..." : "Download"}</span>
                                </button>
                            </div>
                        )}
                    </div>
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

            {/* No group assigned fallback (also shown if the group fetch failed) */}
            {(!hasGroupId || error) && (
                <div className="w-full py-16 px-6 text-center bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-3xl shadow-xl backdrop-blur-md max-w-2xl mx-auto my-8 relative z-10">
                    <div className="w-16 h-16 rounded-2xl bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 flex items-center justify-center mx-auto mb-5 shadow-inner">
                        <Users className="w-8 h-8 text-[#1F7A1F] dark:text-[#55f761]" />
                    </div>
                    <h2 className="text-xl font-extrabold text-[#0D1B2A] dark:text-white tracking-tight">
                        No Guild Assigned Yet
                    </h2>
                    <p className="text-sm text-[#2F3E46]/80 dark:text-white/60 mt-2 max-w-md mx-auto leading-relaxed">
                        Your account hasn&apos;t been linked to a team or guild yet. Once your guild leader or grandmaster assigns you to a guild, your guild members and performance metrics will appear here automatically.
                    </p>
                </div>
            )}

            {/* Group Overview Cards */}
            {hasGroupId && group && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch relative z-10">
                    {/* Card 1: Group Name & ID */}
                    <div className="h-full flex flex-col justify-between bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl p-5 shadow-lg backdrop-blur-md hover:scale-[1.02] hover:bg-white/60 dark:hover:bg-black/30 transition-all duration-300 group">
                        <div className="flex justify-between items-start">
                            <div className="min-w-0 flex-1 pr-2 flex flex-col">
                                <p className="text-[10px] md:text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">
                                    Guild Name & ID
                                </p>
                                <h3 className="text-xl md:text-2xl font-black text-[#0D1B2A] dark:text-white mt-1 group-hover:text-[#1F7A1F] dark:group-hover:text-[#55f761] transition-colors truncate">
                                    {group.group_name || "Unnamed Guild"}
                                </h3>
                                {["admin", "checker", "judger", "recruiter"].includes(userRole.toLowerCase()) && (
                                    <button
                                        onClick={() => logoInputRef.current?.click()}
                                        disabled={isUploadingLogo}
                                        className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#1F7A1F]/10 hover:bg-[#1F7A1F]/20 dark:bg-[#55f761]/10 dark:hover:bg-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] rounded-lg text-[10px] font-black uppercase tracking-wider transition-all select-none cursor-pointer w-fit"
                                    >
                                        {isUploadingLogo ? (
                                            <>
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                <span>Uploading...</span>
                                            </>
                                        ) : (
                                            <>
                                                <ImagePlus className="w-3.5 h-3.5 shrink-0" />
                                                <span>{groupLinks.logoUrl ? "Change Logo" : "Upload Logo"}</span>
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                            {groupLinks.logoUrl ? (
                                <div className="relative group/logo w-10 h-10 md:w-12 md:h-12 shrink-0 cursor-pointer" onClick={() => ["admin", "checker", "judger", "recruiter"].includes(userRole.toLowerCase()) && logoInputRef.current?.click()}>
                                    <img src={groupLinks.logoUrl} alt="Guild Logo" className="w-full h-full rounded-xl object-cover border border-black/10 dark:border-white/10" />
                                    {["admin", "checker", "judger", "recruiter"].includes(userRole.toLowerCase()) && (
                                        <div className="absolute inset-0 bg-black/50 rounded-xl opacity-0 group-hover/logo:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold">
                                            <Pencil className="w-3.5 h-3.5" />
                                        </div>
                                    )}
                                    {["admin", "checker", "judger", "recruiter"].includes(userRole.toLowerCase()) && (
                                        <button
                                            onClick={handleLogoRemoveClick}
                                            className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 shadow-md border border-white dark:border-[#0B1520] transition-colors scale-75 cursor-pointer"
                                            title="Remove logo"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div
                                    onClick={() => ["admin", "checker", "judger", "recruiter"].includes(userRole.toLowerCase()) && logoInputRef.current?.click()}
                                    className={`p-2.5 md:p-3 bg-[#1F7A1F]/10 text-[#1F7A1F] dark:text-[#55f761] dark:bg-[#55f761]/10 rounded-xl transition-all shrink-0 ${["admin", "checker", "judger", "recruiter"].includes(userRole.toLowerCase()) ? "cursor-pointer hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 hover:scale-105" : ""}`}
                                    title={["admin", "checker", "judger", "recruiter"].includes(userRole.toLowerCase()) ? "Click to upload custom logo" : undefined}
                                >
                                    <Users className="w-4 h-4 md:w-5 md:h-5" />
                                </div>
                            )}
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-1.5 text-[10px] md:text-xs font-semibold text-[#1F7A1F] dark:text-[#55f761] truncate">
                            <span>ID: #{group.group_id} ({group.group_type || "Team"})</span>
                            <input
                                type="file"
                                ref={logoInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={handleLogoUpload}
                                disabled={isUploadingLogo}
                            />
                        </div>
                    </div>

                    {/* Card 2: Group Manager */}
                    <div className="h-full flex flex-col justify-between bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl p-5 shadow-lg backdrop-blur-md hover:scale-[1.02] hover:bg-white/60 dark:hover:bg-black/30 transition-all duration-300 group">
                        <div className="flex justify-between items-start">
                            <div className="min-w-0 flex-1 pr-2">
                                <p className="text-[10px] md:text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">
                                    Guild Manager
                                </p>
                                <h3 className="text-xl md:text-2xl font-black text-[#0D1B2A] dark:text-white mt-1 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors truncate">
                                    {group.manager_name || "N/A"}
                                </h3>
                            </div>
                            <div className="p-2.5 md:p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl group-hover:scale-110 transition-transform shrink-0">
                                <Shield className="w-4 h-4 md:w-5 md:h-5" />
                            </div>
                        </div>
                        <div className="mt-4 flex items-center gap-1.5 text-[10px] md:text-xs text-[#2F3E46]/70 dark:text-white/50 truncate">
                            <Mail className="w-3 h-3 shrink-0" />
                            <span className="truncate">{group.manager_email || "No email"}</span>
                        </div>
                    </div>

                    {/* Card 3: Members Breakdown */}
                    <div className="h-full flex flex-col justify-between bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl p-5 shadow-lg backdrop-blur-md hover:scale-[1.02] hover:bg-white/60 dark:hover:bg-black/30 transition-all duration-300 group">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-[10px] md:text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">
                                    Members Breakdown
                                </p>
                                <div className="flex items-baseline gap-1 mt-1">
                                    <h3 className="text-2xl md:text-3xl font-black text-[#0D1B2A] dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                                        {users.length}
                                    </h3>
                                </div>
                            </div>
                            <div className="p-2.5 md:p-3 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-xl group-hover:scale-110 transition-transform shrink-0">
                                <Award className="w-4 h-4 md:w-5 md:h-5" />
                            </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-black/5 dark:border-white/5 space-y-1.5 text-xs font-semibold">
                            {roleCounts.managers > 0 && (
                                <div className="flex justify-between items-center text-amber-600 dark:text-amber-400">
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-amber-500" /> Leaders/Managers
                                    </span>
                                    <span>{roleCounts.managers}</span>
                                </div>
                            )}
                            {roleCounts.labelers > 0 && (
                                <div className="flex justify-between items-center text-gray-600 dark:text-white/70">
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-gray-400" /> Challengers
                                    </span>
                                    <span>{roleCounts.labelers}</span>
                                </div>
                            )}
                            {roleCounts.reviewerCheckers > 0 && (
                                <div className="flex justify-between items-center text-teal-600 dark:text-teal-400">
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-gray-500" /> Veterans
                                    </span>
                                    <span>{roleCounts.reviewerCheckers}</span>
                                </div>
                            )}
                            {roleCounts.checkers > 0 && (
                                <div className="flex justify-between items-center text-green-600 dark:text-green-400">
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-green-500" /> Overseers
                                    </span>
                                    <span>{roleCounts.checkers}</span>
                                </div>
                            )}
                            {roleCounts.judgers > 0 && (
                                <div className="flex justify-between items-center text-blue-600 dark:text-blue-400">
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-blue-500" /> Arbiters
                                    </span>
                                    <span>{roleCounts.judgers}</span>
                                </div>
                            )}
                            {roleCounts.others > 0 && (
                                <div className="flex justify-between items-center text-purple-600 dark:text-purple-400">
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-purple-500" /> Others
                                    </span>
                                    <span>{roleCounts.others}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Card 4: Group Links */}
                    <div className="h-full bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl p-5 shadow-lg backdrop-blur-md hover:scale-[1.02] hover:bg-white/60 dark:hover:bg-black/30 transition-all duration-300 group flex flex-col justify-between">
                        <div className="flex justify-between items-start">
                            <div>
                                {/* <p className="text-[10px] md:text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">
                                    Group Links
                                </p> */}
                                <h3 className="text-sm md:text-base font-black text-[#0D1B2A] dark:text-white mt-1 group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors">
                                    Guild Chat Links
                                </h3>
                            </div>
                            <div className="p-2.5 md:p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl group-hover:scale-110 transition-transform shrink-0">
                                <Award className="w-4 h-4 md:w-5 md:h-5" />
                            </div>
                        </div>
                        <div className="mt-3 space-y-1.5 text-xs">
                            {userRole.toLowerCase() === "judger" ? (
                                <>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-semibold text-[#2F3E46]/60 dark:text-white/40">Checker GC Guilds:</span>
                                        {checkerGroupLinks.length > 0 ? (
                                            <button
                                                onClick={() => setIsCheckerLinksDialogOpen(true)}
                                                className="font-bold text-[#1F7A1F] dark:text-[#55f761] hover:underline bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 px-2 py-0.5 rounded-lg shrink-0 cursor-pointer"
                                            >
                                                View All ({checkerGroupLinks.length})
                                            </button>
                                        ) : (
                                            <span className="text-gray-400 italic shrink-0">None found</span>
                                        )}
                                    </div>
                                    {renderGroupLinkRow("judger", "Judger GC")}
                                </>
                            ) : (
                                <>
                                    {renderGroupLinkRow("checker", "Checker GC")}
                                    {renderGroupLinkRow("judger", "Judger GC")}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* View All Checker GC Group Links Dialog */}
            {isCheckerLinksDialogOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
                    <div className="relative w-full max-w-md bg-white dark:bg-[#0B1520] border border-black/10 dark:border-white/10 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold text-[#0D1B2A] dark:text-white">
                                Checker GC Guild Chat Links
                            </h3>
                            <button
                                onClick={() => setIsCheckerLinksDialogOpen(false)}
                                className="text-[#2F3E46] dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 p-1 rounded-lg transition-colors cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
                            {checkerGroupLinks.length > 0 ? (
                                checkerGroupLinks.map((cg) => (
                                    <div key={cg.groupId} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 text-xs">
                                        <span className="font-semibold text-[#2F3E46]/80 dark:text-white/70 truncate" title={cg.groupName}>
                                            {cg.groupName}
                                        </span>
                                        {cg.checkerLink ? (
                                            <a
                                                href={cg.checkerLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 font-bold text-[#1F7A1F] dark:text-[#55f761] hover:underline truncate max-w-[140px] bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 px-2 py-0.5 rounded-lg shrink-0"
                                                title={cg.checkerLink}
                                            >
                                                Open Link
                                                <SquareArrowOutUpRight className="w-3 h-3 shrink-0" />
                                            </a>
                                        ) : (
                                            <span className="text-gray-400 italic shrink-0">Not set</span>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-6 text-xs text-[#2F3E46]/50 dark:text-white/30">
                                    No Checker GC guilds found.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Group Chat Link Dialog */}
            {editingLinkRole && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
                    <div className="relative w-full max-w-sm bg-white dark:bg-[#0B1520] border border-black/10 dark:border-white/10 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold text-[#0D1B2A] dark:text-white capitalize">
                                Edit {editingLinkRole === "checker" ? "Checker GC" : "Judger GC"} Guild Chat Link
                            </h3>
                            <button
                                onClick={cancelEditingLink}
                                disabled={isSavingLink}
                                className="text-[#2F3E46] dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 p-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-[#2F3E46]/60 dark:text-white/40">Link</label>
                                <input
                                    type="text"
                                    autoFocus
                                    value={linkDraft}
                                    onChange={(e) => setLinkDraft(e.target.value)}
                                    placeholder="https://..."
                                    disabled={isSavingLink}
                                    className="w-full px-3 py-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] text-[#0D1B2A] dark:text-white placeholder:text-[#2F3E46]/40 dark:placeholder:text-white/30"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    onClick={cancelEditingLink}
                                    disabled={isSavingLink}
                                    className="px-4 py-2 border border-black/10 dark:border-white/10 rounded-xl text-xs font-bold uppercase tracking-wider text-[#2F3E46] dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={saveGroupLink}
                                    disabled={isSavingLink}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-[#1F7A1F] hover:bg-[#1F7A1F]/90 text-white rounded-xl text-xs font-bold transition-all shadow-md disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                                >
                                    {isSavingLink && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                    <span>{isSavingLink ? "Saving..." : "Save Link"}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Projects Performance Calculations Container */}
            {hasGroupId && group && (groupProjectSummaries.length > 0 || isSyncingData) && (
                <div className="bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-3xl p-6 shadow-xl backdrop-blur-md relative z-10 space-y-4">
                    <div>
                        <h3 className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">
                            Projects Performance Overview
                        </h3>

                    </div>

                    {isSyncingData && groupProjectSummaries.length === 0 ? (
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
                    ) : (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {(isOverviewExpanded ? groupProjectSummaries : groupProjectSummaries.slice(0, 4)).map((p) => (
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
                                                <span className="font-mono font-bold text-[#1F7A1F] dark:text-[#55f761]">{p.tpm > 0 ? `${p.tpm.toFixed(1)} min/task` : "â€”"}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <Zap className="w-3 h-3 text-[#2F3E46]/40 dark:text-white/30 shrink-0" />
                                                <span className="font-mono font-bold text-[#1F7A1F] dark:text-[#55f761]">{p.overallSpeed.toFixed(2)} F/hr</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {groupProjectSummaries.length > 4 && (
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
                                                <span>Show All ({groupProjectSummaries.length})</span>
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
            {hasGroupId && !error && (
                <div className="bg-white/50 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md relative z-20">
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
                                                                key={r}
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



                                                {/* Group Section */}
                                                {userRole.toLowerCase() !== "checker" && availableGroups.length > 0 && (
                                                    <div className="space-y-2">
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
                                                        <div className="max-h-[220px] overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                                                            {filteredGroups.map(({ groupId, groupName }) => {
                                                                const isSelected = selectedGroups.includes(groupId);
                                                                return (
                                                                    <button
                                                                        key={groupId}
                                                                        onClick={() => toggleGroupFilter(groupId)}
                                                                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-left transition-all truncate hover:cursor-pointer ${isSelected
                                                                            ? "bg-[#1F7A1F]/10 text-[#1F7A1F] dark:bg-[#55f761]/10 dark:text-[#55f761]"
                                                                            : "text-[#2F3E46] dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/5"
                                                                            }`}
                                                                    >
                                                                        <span className="truncate">{groupName}</span>
                                                                        {isSelected && <Check className="w-3.5 h-3.5 text-[#1F7A1F] dark:text-[#55f761]" />}
                                                                    </button>
                                                                );
                                                            })}

                                                            {filteredGroups.length === 0 && groupSearch && (
                                                                <div className="text-center py-4 text-xs text-[#2F3E46]/50 dark:text-white/30">
                                                                    No groups found.
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

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
                                                    <div className="flex items-center justify-between">
                                                        <h4 className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">Date Started</h4>
                                                        {(dateFilter !== "all" || customStartDate || customEndDate) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setDateFilter("all");
                                                                    setCustomStartDate("");
                                                                    setCustomEndDate("");
                                                                }}
                                                                className="text-[10px] font-semibold text-[#1F7A1F] dark:text-[#55f761] hover:underline cursor-pointer"
                                                            >
                                                                Clear
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        <button
                                                            onClick={() => {
                                                                setDateFilter(dateFilter === "today" ? "all" : "today");
                                                                setCustomStartDate("");
                                                                setCustomEndDate("");
                                                            }}
                                                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${dateFilter === "today"
                                                                ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                                                : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                                }`}
                                                        >
                                                            {dateFilter === "today" && <Check className="w-3 h-3" />}
                                                            Today
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setDateFilter(dateFilter === "yesterday" ? "all" : "yesterday");
                                                                setCustomStartDate("");
                                                                setCustomEndDate("");
                                                            }}
                                                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${dateFilter === "yesterday"
                                                                ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                                                : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                                }`}
                                                        >
                                                            {dateFilter === "yesterday" && <Check className="w-3 h-3" />}
                                                            Yesterday
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setDateFilter(dateFilter === "week" ? "all" : "week");
                                                                setCustomStartDate("");
                                                                setCustomEndDate("");
                                                            }}
                                                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${dateFilter === "week"
                                                                ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                                                : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                                }`}
                                                        >
                                                            {dateFilter === "week" && <Check className="w-3 h-3" />}
                                                            1 Week
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setDateFilter(dateFilter === "month" ? "all" : "month");
                                                                setCustomStartDate("");
                                                                setCustomEndDate("");
                                                            }}
                                                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${dateFilter === "month"
                                                                ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                                                : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                                }`}
                                                        >
                                                            {dateFilter === "month" && <Check className="w-3 h-3" />}
                                                            1 Month
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setDateFilter(dateFilter === "three_months" ? "all" : "three_months");
                                                                setCustomStartDate("");
                                                                setCustomEndDate("");
                                                            }}
                                                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${dateFilter === "three_months"
                                                                ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                                                : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                                }`}
                                                        >
                                                            {dateFilter === "three_months" && <Check className="w-3 h-3" />}
                                                            3 Months
                                                        </button>
                                                    </div>

                                                    {/* Worktime-style Custom Date Picker */}
                                                    <div className="pt-1">
                                                        <DateRangePicker
                                                            start={customStartDate}
                                                            end={customEndDate}
                                                            align="left"
                                                            onChange={(s, e) => {
                                                                setCustomStartDate(s);
                                                                setCustomEndDate(e);
                                                                setDateFilter("custom");
                                                            }}
                                                        />
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
                                            </div>

                                            {/* Column 2: Recruiter */}
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

                                                <div className="max-h-[160px] overflow-y-auto space-y-1 pr-1 scrollbar-thin">
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

                                                    {filteredRecruiters.map((r) => {
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
                                                                <span className="truncate">{r.name || r.email}</span>
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

                                            {/* Column 3: Work Logs */}
                                            <div className="space-y-3 border-t md:border-t-0 md:border-l border-black/10 dark:border-white/10 md:pl-6 pt-4 md:pt-0">
                                                {/* Worklog Role Section */}
                                                {availableWorkLogRoles.length > 0 && (
                                                    <div className="space-y-2">
                                                        <h4 className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">Worklog Role</h4>
                                                        <div className="flex flex-wrap gap-2">
                                                            {availableWorkLogRoles.map((r) => (
                                                                <button
                                                                    key={`wlrole_filter_${r}`}
                                                                    onClick={() => toggleWorkLogRole(r)}
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

                                                {/* Worklog Project Section */}
                                                {allWorkLogProjects.length > 0 && (
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <h4 className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">Worklog Project</h4>
                                                            {selectedWorkLogProjectIds.length > 0 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setSelectedWorkLogProjectIds([])}
                                                                    className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                                                                >
                                                                    Clear ({selectedWorkLogProjectIds.length})
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* Project Search Bar */}
                                                        <div className="relative">
                                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#2F3E46]/50 dark:text-white/40" />
                                                            <input
                                                                type="text"
                                                                placeholder="Search project #..."
                                                                value={projectSearch}
                                                                onChange={(e) => setProjectSearch(e.target.value)}
                                                                className="w-full pl-8 pr-3 py-1.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-[#0D1B2A] dark:text-white placeholder:text-[#2F3E46]/40 dark:placeholder:text-white/30"
                                                            />
                                                        </div>

                                                        {/* Active vs All Tabs */}
                                                        {!projectSearch && (
                                                            <div className="flex items-center gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setWorkLogProjectTab("active")}
                                                                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${workLogProjectTab === "active"
                                                                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                                                                        : "text-[#2F3E46]/60 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5 border border-transparent"
                                                                    }`}
                                                                >
                                                                    Active ({activeWorkLogProjects.length})
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setWorkLogProjectTab("all")}
                                                                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${workLogProjectTab === "all"
                                                                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                                                                        : "text-[#2F3E46]/60 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5 border border-transparent"
                                                                    }`}
                                                                >
                                                                    All ({allWorkLogProjects.length})
                                                                </button>
                                                            </div>
                                                        )}

                                                        {/* Scrollable Project Badges */}
                                                        <div className="max-h-[220px] overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                                                            <div className="flex flex-wrap gap-2">
                                                                {displayedWorkLogProjects.map((id) => {
                                                                    const isSelected = selectedWorkLogProjectIds.includes(id);
                                                                    const isActive = activeWorkLogProjects.includes(id);
                                                                    return (
                                                                        <button
                                                                            key={`wlproj_filter_${id}`}
                                                                            onClick={() => toggleWorkLogProjectId(id)}
                                                                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${isSelected
                                                                                ? "bg-amber-500/10 border-amber-500 text-amber-600 dark:bg-amber-400/10 dark:border-amber-400 dark:text-amber-400"
                                                                                : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                                                            }`}
                                                                        >
                                                                            {isSelected && <Check className="w-3 h-3" />}
                                                                            <span>#{id}</span>
                                                                            {isActive && workLogProjectTab === "all" && !projectSearch && (
                                                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" title="Active Project" />
                                                                            )}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>

                                                            {displayedWorkLogProjects.length === 0 && (
                                                                <div className="text-center py-4 text-xs text-[#2F3E46]/50 dark:text-white/30">
                                                                    {projectSearch ? `No projects found for "${projectSearch}".` : "No projects found."}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Active Chips */}
                            <div className="flex flex-wrap items-center gap-2">
                                {selectedRoles.map((r) => (
                                    <div key={r} className="flex items-center gap-1.5 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all animate-in fade-in zoom-in-95 duration-150">
                                        <span className="capitalize">Role: {r}</span>
                                        <button
                                            onClick={() => toggleRoleFilter(r)}
                                            className="hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}

                                {selectedWorkLogRoles.map((r) => (
                                    <div key={`wlrole_${r}`} className="flex items-center gap-1.5 bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 dark:border-amber-400/20 text-amber-600 dark:text-amber-400 text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all animate-in fade-in zoom-in-95 duration-150">
                                        <span className="capitalize">WL Role: {r}</span>
                                        <button
                                            onClick={() => toggleWorkLogRole(r)}
                                            className="hover:bg-amber-500/20 dark:hover:bg-amber-400/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}

                                {selectedWorkLogProjectIds.map((id) => (
                                    <div key={`wlp_${id}`} className="flex items-center gap-1.5 bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 dark:border-amber-400/20 text-amber-600 dark:text-amber-400 text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all animate-in fade-in zoom-in-95 duration-150">
                                        <span>Project: {id}</span>
                                        <button
                                            onClick={() => toggleWorkLogProjectId(id)}
                                            className="hover:bg-amber-500/20 dark:hover:bg-amber-400/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}

                                {selectedGroups.map((groupId) => {
                                    const groupObj = availableGroups.find((g) => g.groupId === groupId);
                                    return (
                                        <div key={groupId} className="flex items-center gap-1.5 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all animate-in fade-in zoom-in-95 duration-150">
                                            <span>Group: {groupObj?.groupName || `Group #${groupId}`}</span>
                                            <button
                                                onClick={() => toggleGroupFilter(groupId)}
                                                className="hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    );
                                })}

                                {selectedStatuses.map((status) => {
                                    let label = status;
                                    if (status === "onboarding") label = "Onboarding Done";
                                    if (status === "rules") label = "Rules & Guidelines Done";
                                    if (status === "landcover_passed") label = "Landcover Passed";
                                    if (status === "3d_passed") label = "3D Match Passed";
                                    if (status === "transpo_passed") label = "Transpo Passed";
                                    if (status === "roof_passed") label = "Roof Passed";
                                    return (
                                        <div key={status} className="flex items-center gap-1.5 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all animate-in fade-in zoom-in-95 duration-150">
                                            <span>Status: {label}</span>
                                            <button
                                                onClick={() => toggleStatusFilter(status)}
                                                className="hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    );
                                })}

                                {selectedRecruiters.map((email) => {
                                    const recruiterObj = recruiters.find((rec) => rec.email === email);
                                    const label = email === "organic" ? "Organic" : (recruiterObj?.name || email);
                                    return (
                                        <div key={email} className="flex items-center gap-1.5 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all animate-in fade-in zoom-in-95 duration-150">
                                            <span>Recruiter: {label}</span>
                                            <button
                                                onClick={() => toggleRecruiterFilter(email)}
                                                className="hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    );
                                })}

                                {selectedProjects.map((projectId) => (
                                    <div key={projectId} className="flex items-center gap-1.5 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all animate-in fade-in zoom-in-95 duration-150">
                                        <span>Project: #{projectId}</span>
                                        <button
                                            onClick={() => toggleProjectFilter(projectId)}
                                            className="hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}

                                {dateFilter !== "all" && (
                                    <div className="flex items-center gap-1.5 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all animate-in fade-in zoom-in-95 duration-150">
                                        <span>
                                            Started: {
                                                dateFilter === "today" ? "Today" :
                                                    dateFilter === "yesterday" ? "Yesterday" :
                                                        dateFilter === "week" ? "1 Week" :
                                                            dateFilter === "month" ? "1 Month" :
                                                                dateFilter === "three_months" ? "3 Months" :
                                                                    customStartDate && customEndDate
                                                                        ? `${customStartDate} to ${customEndDate}`
                                                                        : customStartDate
                                                                            ? `${customStartDate}`
                                                                            : customEndDate
                                                                                ? `Until ${customEndDate}`
                                                                                : "Custom"
                                            }
                                        </span>
                                        <button
                                            onClick={() => {
                                                setDateFilter("all");
                                                setCustomStartDate("");
                                                setCustomEndDate("");
                                            }}
                                            className="hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                )}

                                {hasPaymentDetails && (
                                    <div className="flex items-center gap-1.5 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all animate-in fade-in zoom-in-95 duration-150">
                                        <span>Has Payment Details</span>
                                        <button
                                            onClick={() => setHasPaymentDetails(false)}
                                            className="hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                )}

                                {missingQrCode && (
                                    <div className="flex items-center gap-1.5 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all animate-in fade-in zoom-in-95 duration-150">
                                        <span>No QR Image URL</span>
                                        <button
                                            onClick={() => setMissingQrCode(false)}
                                            className="hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Search */}
                        <div className="relative w-full sm:max-w-xs shrink-0">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2F3E46]/50 dark:text-white/40" />
                            <input
                                type="text"
                                placeholder="Search by name, email, or UID..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-shadow text-[#0D1B2A] dark:text-white placeholder:text-[#2F3E46]/40 dark:placeholder:text-white/30"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Members List Container (Desktop Table / Mobile Card Grid) */}
            {hasGroupId && !error && (
                <div className="bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-3xl overflow-hidden shadow-xl backdrop-blur-md relative z-10">
                    {fetching && users.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">
                            <div className="flex flex-col items-center justify-center gap-2">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#1F7A1F] dark:border-[#55f761]"></div>
                                <span className="text-xs font-semibold">Fetching group members from Ginger...</span>
                            </div>
                        </div>
                    ) : filteredUsers.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">
                            <div className="text-center flex flex-col items-center justify-center max-w-md mx-auto space-y-4 py-4">
                                <div className="w-16 h-16 rounded-full bg-black/5 dark:bg-white/5 text-[#2F3E46]/50 dark:text-white/40 flex items-center justify-center shadow-inner relative">
                                    <Users className="w-8 h-8 animate-pulse" />
                                    <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full animate-ping"></div>
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-[#0D1B2A] dark:text-white tracking-tight">
                                        No Members Found
                                    </h3>
                                    <p className="text-xs text-[#2F3E46]/70 dark:text-white/50 mt-1.5">
                                        {searchQuery || selectedRoles.length > 0 || selectedGroups.length > 0 || selectedProjects.length > 0 || selectedStatuses.length > 0 || selectedRecruiters.length > 0 || dateFilter !== "all" || missingQrCode || hasPaymentDetails
                                            ? "Try resetting your search query or filter options to find other records."
                                            : "No members registered in this group yet."}
                                    </p>
                                </div>
                                {(searchQuery || selectedRoles.length > 0 || selectedGroups.length > 0 || selectedProjects.length > 0 || selectedStatuses.length > 0 || selectedRecruiters.length > 0 || dateFilter !== "all" || missingQrCode || hasPaymentDetails) && (
                                    <button
                                        onClick={() => {
                                            setSearchQuery("");
                                            setSelectedRoles([]);
                                            setSelectedWorkLogRoles([]);
                                            setSelectedWorkLogProjectIds([]);
                                            setSelectedGroups([]);
                                            setSelectedProjects([]);
                                            setSelectedStatuses([]);
                                            setSelectedRecruiters([]);
                                            setMissingQrCode(false);
                                            setHasPaymentDetails(false);
                                            setDateFilter("all");
                                            setCustomStartDate("");
                                            setCustomEndDate("");
                                            setProjectSearch("");
                                            setWorkLogProjectTab("active");
                                        }}
                                        className="px-4 py-2 border border-black/10 dark:border-white/10 rounded-xl text-xs font-bold uppercase tracking-wider text-[#1F7A1F] dark:text-[#55f761] hover:bg-[#1F7A1F]/10 dark:hover:bg-[#55f761]/10 transition-colors cursor-pointer"
                                    >
                                        Reset Filters
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="w-full">
                            {/* Bulk Message Action Bar */}
                            {canMessage && selectedUserIds.size > 0 && (
                                <div className="sticky top-0 z-20 flex items-center justify-between gap-3 px-6 py-3 border-b border-black/10 dark:border-white/10 bg-white/90 dark:bg-black/90 backdrop-blur-md shadow-md animate-in slide-in-from-top-2 duration-200">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={handleSelectAll}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 rounded-lg text-xs font-bold transition-all cursor-pointer text-[#2F3E46]/80 dark:text-white/80"
                                        >
                                            <CheckSquare className="w-3.5 h-3.5" />
                                            <span>
                                                {sortedUsers.length > 0 && sortedUsers.every(u => selectedUserIds.has(u.uid?.toString() || u.user_name)) ? "Deselect All" : "Select All"}
                                            </span>
                                        </button>
                                        <span className="text-xs font-bold text-[#1F7A1F] dark:text-[#55f761] ml-2">
                                            {selectedUserIds.size} selected
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
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
                                            <MessageSquare className="w-3.5 h-3.5" />
                                            Message Selected ({selectedUserIds.size})
                                        </button>
                                    </div>
                                </div>
                            )}
                            {/* Desktop view */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full border-collapse text-left">
                                    <thead>
                                        <tr className="border-b border-black/10 dark:border-white/10 text-xs font-bold uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40 bg-black/[0.02] dark:bg-white/[0.02]">
                                            <th className="px-6 py-4">
                                                <button onClick={() => toggleSort("name")} className="flex items-center gap-1 hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-colors cursor-pointer">
                                                    User Details
                                                    {sortColumn === "name" ? (sortDirection === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronDown className="w-3 h-3 opacity-30" />}
                                                </button>
                                            </th>
                                            {userRole.toLowerCase() === "admin" && (
                                                <th className="px-6 py-4">
                                                    <button onClick={() => toggleSort("recruiter")} className="flex items-center gap-1 hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-colors cursor-pointer">
                                                        Recruiter
                                                        {sortColumn === "recruiter" ? (sortDirection === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronDown className="w-3 h-3 opacity-30" />}
                                                    </button>
                                                </th>
                                            )}
                                            <th className="px-6 py-4">Progress</th>
                                            <th className="px-6 py-4">
                                                <button onClick={() => toggleSort("joined")} className="flex items-center gap-1 hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-colors cursor-pointer">
                                                    Joined Date
                                                    {sortColumn === "joined" ? (sortDirection === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronDown className="w-3 h-3 opacity-30" />}
                                                </button>
                                            </th>
                                            {canMessage && (
                                                <th className="px-6 py-4 text-right">Actions</th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-black/10 dark:divide-white/10 text-sm">
                                        {paginatedUsers.map((u) => {
                                            const rawULogs = getUserWorkLogs(u.user_name, u.user_email);
                                            const uLogs = rawULogs.filter(log => {
                                                const matchesRole = selectedWorkLogRoles.length === 0 || selectedWorkLogRoles.includes(log.role.trim().toLowerCase());
                                                const matchesProject = selectedWorkLogProjectIds.length === 0 || selectedWorkLogProjectIds.includes(log.projectId);
                                                return matchesRole && matchesProject;
                                            });
                                            const hasLogs = uLogs.length > 0;
                                            return (
                                                <MemberRow key={u.uid ?? u.user_name} u={u} uLogs={uLogs} hasLogs={hasLogs} isSyncingData={isSyncingData} />
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Cards View */}
                            <div className="block md:hidden divide-y divide-black/10 dark:divide-white/10">
                                {paginatedUsers.map((u) => {
                                    const rawULogs = getUserWorkLogs(u.user_name, u.user_email);
                                    const uLogs = rawULogs.filter(log => {
                                        const matchesRole = selectedWorkLogRoles.length === 0 || selectedWorkLogRoles.includes(log.role.trim().toLowerCase());
                                        const matchesProject = selectedWorkLogProjectIds.length === 0 || selectedWorkLogProjectIds.includes(log.projectId);
                                        return matchesRole && matchesProject;
                                    });
                                    const hasLogs = uLogs.length > 0;
                                    return (
                                        <MemberCard key={u.uid ?? u.user_name} u={u} uLogs={uLogs} hasLogs={hasLogs} isSyncingData={isSyncingData} />
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    
                    <Pagination 
                        currentPage={page} 
                        totalPages={totalPages} 
                        onPageChange={(p) => setPage(p)} 
                    />
                </div>
            )}

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

            <Dialog open={isConfirmLogoDeleteOpen} onOpenChange={setIsConfirmLogoDeleteOpen}>
                <DialogContent className="sm:max-w-md bg-white dark:bg-[#1A232C] border border-black/10 dark:border-white/10 shadow-2xl z-[100] p-6 text-slate-900 dark:text-white">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-red-500 flex items-center gap-2">
                            Remove Guild Logo
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-4 text-sm text-[#2F3E46]/80 dark:text-white/70">
                        Are you sure you want to remove the guild logo? This will revert the logo back to the default icon.
                    </div>
                    <DialogFooter className="flex items-center justify-end gap-2.5">
                        <button
                            type="button"
                            onClick={() => setIsConfirmLogoDeleteOpen(false)}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-800 dark:text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={confirmLogoRemove}
                            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
                        >
                            Confirm Delete
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
