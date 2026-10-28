import { ThemeToggle } from '@/components/ThemeToggle';
import { useTheme } from '@/components/ThemeProvider';
import { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { io, Socket } from "socket.io-client";
import { Bell, X } from "lucide-react";
import { getMyProfileChangeRequestAction } from "@/app/actions/auth";

let headerSocket: Socket | null = null;

const SOCKET_URL =
    process.env.NEXT_PUBLIC_SERVER_URL ||
    process.env.NEXT_PUBLIC_SOCKET_URL ||
    "http://localhost:3001";

function getCookie(name: string): string | null {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(
        new RegExp("(?:^|; )" + name + "=([^;]*)"),
    );
    return match ? decodeURIComponent(match[1]) : null;
}

interface HeaderProps {
    userName: string;
    userEmail: string;
    isLoggingOut: boolean;
    onLogout: () => void | Promise<void>;
    onMenuToggle?: () => void;
    isDashboardCompleted?: boolean;
    isStandardBuildingPassed?: boolean;
    role?: string;
}

export default function Header({ userName, userEmail, isLoggingOut, onLogout, onMenuToggle, isDashboardCompleted, isStandardBuildingPassed, role }: HeaderProps) {
    const { theme, setTheme } = useTheme();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
    const [onlineUsers, setOnlineUsers] = useState<number>(0);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Notification State
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    const [messages, setMessages] = useState<any[]>([]);
    const [selectedMessage, setSelectedMessage] = useState<any>(null);
    const notificationsRef = useRef<HTMLDivElement>(null);

    // Profile change request status — rendered as a synthetic announcement.
    // It is never written to the Message/DirectMessage tables.
    const [profileRequest, setProfileRequest] = useState<any>(null);
    const [noticeReadVersion, setNoticeReadVersion] = useState(0);

    const loadProfileRequest = async () => {
        try {
            const res = await getMyProfileChangeRequestAction();
            setProfileRequest(res.success ? res.request : null);
        } catch (err) {
            console.error("Failed to load profile change request:", err);
        }
    };

    useEffect(() => {
        loadProfileRequest();
    }, []);

    const profileNotice = useMemo(() => {
        const req = profileRequest;
        if (!req || (req.status !== "PENDING" && req.status !== "REJECTED")) return null;

        const details = [
            (req.requestedFirstName || req.requestedLastName)
                ? `Requested Name: ${[req.requestedFirstName, req.requestedLastName].filter(Boolean).join(" ")}`
                : null,
            req.requestedFacebook ? `Requested Facebook: ${req.requestedFacebook}` : null,
        ].filter(Boolean).join("\n");

        let subject: string;
        let message: string;

        if (req.status === "PENDING") {
            subject = "Profile Change Request | Pending Approval";
            message = `Your profile change request is waiting for admin review.\n\n${details}\n\nThe result will appear here once an admin has reviewed it.`;
        } else {
            subject = "Profile Change Request | Rejected";
            const reason = req.rejectionReason || "No reason was provided by the admin. Please contact support if you need more details.";
            const reviewed = req.reviewedAt ? `\n\nReviewed on ${new Date(req.reviewedAt).toLocaleString()}` : "";
            message = `Your profile change request was rejected.\n\n${details}\n\nReason: ${reason}${reviewed}\n\nThis was your one-time change request, so these fields stay locked. Please contact support if this needs to be corrected.`;
        }

        // Re-keyed by status so a PENDING -> REJECTED transition shows as unread again
        const readKey = `pcr_read_${req.id}_${req.status}`;
        return {
            id: `pcr_${req.id}_${req.status}`,
            readKey,
            isVirtual: true,
            isBroadcast: false,
            fromName: "System",
            subject,
            message,
            imageUrls: null,
            isRead: typeof window !== "undefined" && localStorage.getItem(readKey) === "true",
            createdAt: req.reviewedAt || req.updatedAt || req.createdAt,
        };
    }, [profileRequest, noticeReadVersion]);

    const displayedMessages = useMemo(
        () => (profileNotice ? [profileNotice, ...messages] : messages),
        [profileNotice, messages]
    );

    // Opening the dropdown counts as seeing everything in it, read or not. The bell counts
    // only unread items newer than that. Server createdAt times are used, not this device's clock.
    const seenAtKey = userEmail ? `xfnite_notifications_seen_at:${userEmail.toLowerCase()}` : "";
    const seenAt = useMemo(() => {
        // While the dropdown is open, everything in it counts as seen
        if (isNotificationsOpen) return Infinity;
        if (!seenAtKey || typeof window === "undefined") return 0;
        // Read again when it closes, after the effect below saved what was shown
        return Number(localStorage.getItem(seenAtKey)) || 0;
    }, [seenAtKey, isNotificationsOpen]);
    const unseenCount = displayedMessages.filter(m => !m.isRead && new Date(m.createdAt).getTime() > seenAt).length;

    useEffect(() => {
        if (!isNotificationsOpen || !seenAtKey) return;
        const latest = Math.max(0, ...displayedMessages.map(m => new Date(m.createdAt).getTime() || 0));
        const saved = Number(localStorage.getItem(seenAtKey)) || 0;
        if (latest > saved) localStorage.setItem(seenAtKey, String(latest));
    }, [isNotificationsOpen, displayedMessages, seenAtKey]);

    const handleBellClick = () => {
        const nextState = !isNotificationsOpen;
        setIsNotificationsOpen(nextState);
        setIsDropdownOpen(false); // Close profile dropdown if open
        if (nextState) {
            if (headerSocket) headerSocket.emit("fetch_message_history");
            loadProfileRequest();
        }
    };

    const handleMessageClick = (msg: any) => {
        setSelectedMessage(msg);
        setIsNotificationsOpen(false);

        // Synthetic notices have no server-side row — track read state locally
        if (msg.isVirtual) {
            if (!msg.isRead && typeof window !== "undefined") {
                localStorage.setItem(msg.readKey, "true");
                setNoticeReadVersion(v => v + 1);
            }
            return;
        }

        // Mark as read locally and on server
        if (!msg.isRead && headerSocket) {
            headerSocket.emit("acknowledge_direct_message", { messageId: msg.id, isBroadcast: msg.isBroadcast });
            setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isRead: true } : m));
        }
    };

    useEffect(() => {
        if (!headerSocket) {
            headerSocket = io(SOCKET_URL, {
                auth: {
                    token: getCookie("xnite_session"),
                    client: "header",
                },
                transports: ["websocket"],
            });
        }

        const handleOnlineUsers = (count: number) => {
            setOnlineUsers(count);
        };

        const handleMessageHistory = (history: any[]) => {
            setMessages(history);
        };

        const handleReceiveDirectMessage = (msg: any) => {
            setMessages(prev => {
                // Prevent duplicates
                if (prev.some(m => m.id === msg.id)) return prev;
                return [{ ...msg, isRead: false }, ...prev];
            });
        };

        // Created by an API route, so it doesn't arrive over the socket until the next reconnect
        const handleWelcomeMessage = (e: Event) => {
            const msg = (e as CustomEvent).detail;
            if (msg?.id) handleReceiveDirectMessage(msg);
        };

        headerSocket.on("online_users_count", handleOnlineUsers);
        headerSocket.on("message_history", handleMessageHistory);
        headerSocket.on("receive_direct_message", handleReceiveDirectMessage);
        window.addEventListener("welcome_message_created", handleWelcomeMessage);

        return () => {
            headerSocket?.off("online_users_count", handleOnlineUsers);
            headerSocket?.off("message_history", handleMessageHistory);
            headerSocket?.off("receive_direct_message", handleReceiveDirectMessage);
            window.removeEventListener("welcome_message_created", handleWelcomeMessage);
        };
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
            if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
                setIsNotificationsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const displayInitial = (userName || userEmail || "U").charAt(0).toUpperCase();
    const bodyEncoded = encodeURIComponent(`Xfnite.cloud Email: ${userEmail || ''}\n\nFacebook Link: \n\nConcern: \n\n\n\nScreenshots: `);
    const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";
    const helpMailtoUrl = `mailto:${supportEmail}?subject=Support%20Ticket&body=${bodyEncoded}`;

    const handleHelpClick = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsDropdownOpen(false);

        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
            window.location.href = helpMailtoUrl;
        } else {
            const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(supportEmail)}&su=Support%20Ticket&body=${bodyEncoded}`;
            window.open(gmailUrl, '_blank', 'noopener,noreferrer');
        }
    };

    const renderMessageWithLinks = (text: string) => {
        if (!text) return null;
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const linkify = (segment: string) => segment.split(urlRegex).map((part, i) => {
            if (part.match(urlRegex)) {
                return (
                    <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-[#1F7A1F] dark:text-[#55f761] hover:underline break-all">
                        {part}
                    </a>
                );
            }
            return part;
        });
        // **text** renders bold (e.g. section titles in the welcome message)
        return text.split(/\*\*(.+?)\*\*/g).map((segment, i) =>
            i % 2 === 1
                ? <strong key={i} className="font-bold text-[#0D1B2A] dark:text-white">{linkify(segment)}</strong>
                : <span key={i}>{linkify(segment)}</span>
        );
    };

    return (
        <header className="h-14 bg-white dark:bg-[#0D1B2A] border-b border-[#1B263B]/10 dark:border-[#E0E1DD]/10 flex items-center justify-between px-6 sticky top-0 z-[9999] transition-colors duration-200">
            <div className="flex items-center gap-3">
                <button
                    onClick={onMenuToggle}
                    className="md:hidden p-1 -ml-2 text-[#2F3E46] dark:text-[#E0E1DD]/80 hover:text-[#0D1B2A] dark:hover:text-white transition-colors"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                </button>
                <img src="/logo/Logo-mobile.svg" alt="XFINITE" className="md:hidden h-8 w-auto" />
                <img src={theme === "light" ? "/logo/Logo-light.svg" : "/logo/Logo.svg"} alt="XFINITE" className="hidden md:block h-6 w-auto" />
            </div>
            <div className="flex items-center gap-4">
                {onlineUsers > 0 && (
                    <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold border border-[#1B263B]/10 dark:border-[#E0E1DD]/10 bg-black/5 dark:bg-white/5 text-[#1F7A1F] dark:text-[#55f761] shadow-sm">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                        </span>
                        {onlineUsers} <span className="text-[#2F3E46] dark:text-[#E0E1DD]/80 font-medium">Online</span>
                    </div>
                )}
                {isDashboardCompleted && (
                    <button
                        onClick={() => setIsDownloadModalOpen(true)}
                        className="hidden sm:flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium shadow-sm transition-all bg-[#1F7A1F] hover:bg-[#145214] text-white dark:bg-[#55f761] dark:hover:bg-[#3de34a] dark:text-[#0D1B2A] cursor-pointer focus:outline-none"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download Software
                    </button>
                )}

                {/* Notifications Bell */}
                <div className="relative border-l border-[#1B263B]/10 dark:border-[#E0E1DD]/10 pl-4" ref={notificationsRef}>
                    <button
                        onClick={handleBellClick}
                        className="relative p-2 rounded-full text-[#2F3E46] dark:text-[#E0E1DD]/80 hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none cursor-pointer"
                    >
                        <Bell className="w-5 h-5" />
                        {unseenCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 flex">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none border-2 border-white dark:border-[#0D1B2A]">
                                    {unseenCount > 99 ? "99+" : unseenCount}
                                </span>
                            </span>
                        )}
                    </button>

                    {isNotificationsOpen && (
                        <div className="absolute top-full right-0 mt-2 w-96 max-h-96 overflow-y-auto bg-white dark:bg-[#1B263B] border border-[#1B263B]/10 dark:border-[#E0E1DD]/10 rounded-xl shadow-xl pb-2 z-[100] animate-in fade-in slide-in-from-top-2 duration-200 scrollbar-thin scrollbar-thumb-black/10 dark:scrollbar-thumb-white/10">
                            <div className="px-4 py-2 border-b border-[#1B263B]/10 dark:border-[#E0E1DD]/10 font-bold text-sm text-[#0D1B2A] dark:text-[#E0E1DD] sticky top-0 bg-white/90 dark:bg-[#1B263B]/90 backdrop-blur-sm z-10 rounded-t-xl">
                                Announcements
                            </div>
                            {displayedMessages.length === 0 ? (
                                <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                                    No announcements yet.
                                </div>
                            ) : (
                                <div className="flex flex-col">
                                    {displayedMessages.map((msg, idx) => (
                                        <button
                                            key={msg.id || idx}
                                            onClick={() => handleMessageClick(msg)}
                                            className={`w-full text-left px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 border-b border-[#1B263B]/5 dark:border-[#E0E1DD]/5 last:border-0 transition-colors cursor-pointer ${!msg.isRead ? 'bg-[#1F7A1F]/5 dark:bg-[#55f761]/5' : ''}`}
                                        >
                                            <div className="flex justify-between items-start mb-0.5 gap-2">
                                                <span className={`font-semibold text-sm truncate ${!msg.isRead ? 'text-[#1F7A1F] dark:text-[#55f761]' : 'text-[#0D1B2A] dark:text-white'}`}>
                                                    {msg.subject || (msg.isBroadcast ? "Announcement" : "Direct Message")}
                                                </span>
                                                <span className="text-[10px] text-gray-500 shrink-0 mt-0.5 text-right whitespace-nowrap">
                                                    {new Date(msg.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                                </span>
                                            </div>
                                            <div className="text-[11px] text-[#1F7A1F] dark:text-[#55f761] font-medium mb-1 truncate">
                                                From: {msg.fromName || "Admin"}
                                            </div>
                                            <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed">
                                                {/* Bold markers only render in the full view */}
                                                {msg.message?.replace(/\*\*/g, "")}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-4 pl-2 relative" ref={dropdownRef}>
                    <button
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="flex items-center gap-2 group focus:outline-none cursor-pointer"
                    >
                        <div className="w-7 h-7 rounded-full bg-[#E0E1DD] dark:bg-[#1B263B] border border-[#1B263B]/10 dark:border-[#E0E1DD]/10 text-[#2F3E46] dark:text-[#E0E1DD]/80 flex items-center justify-center font-medium text-[11px] group-hover:bg-[#1B263B] dark:group-hover:bg-[#E0E1DD] group-hover:text-white dark:group-hover:text-[#0D1B2A] transition-colors">
                            {displayInitial}
                        </div>
                        <div className="flex flex-col items-start">
                            <span className="text-[13px] font-medium text-[#2F3E46] dark:text-[#E0E1DD]/80 group-hover:text-[#0D1B2A] dark:group-hover:text-[#E0E1DD] transition-colors leading-none">
                                {userName}
                            </span>
                            {userEmail && (
                                <span className="text-[11px] text-[#2F3E46]/60 dark:text-[#E0E1DD]/40 leading-none mt-0.5">
                                    {userEmail}
                                </span>
                            )}
                        </div>
                        <svg
                            className={`w-3.5 h-3.5 text-[#2F3E46] dark:text-[#E0E1DD]/80 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    {isDropdownOpen && (
                        <div className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-[#1B263B] border border-[#1B263B]/10 dark:border-[#E0E1DD]/10 rounded-md shadow-lg py-1 z-100 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="px-4 py-2.5 border-b border-[#1B263B]/10 dark:border-[#E0E1DD]/10">
                                <p className="text-sm font-medium text-[#0D1B2A] dark:text-[#E0E1DD] truncate">{userName}</p>
                                <p className="text-xs text-[#2F3E46]/60 dark:text-[#E0E1DD]/40 truncate mt-0.5">{userEmail}</p>
                            </div>
                            <button
                                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                                className="w-full text-left px-4 py-2 border-b border-[#1B263B]/10 dark:border-[#E0E1DD]/10 flex items-center justify-between hover:bg-black/5 dark:hover:bg-[#E0E1DD]/10 transition-colors cursor-pointer"
                            >
                                <span className="text-sm font-medium text-[#2F3E46] dark:text-[#E0E1DD]/80">Theme</span>
                                <div className="text-[#2F3E46] dark:text-[#E0E1DD]/80">
                                    {theme === "light" ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>
                                    )}
                                </div>
                            </button>
                            <Link
                                href="/settings"
                                onClick={() => setIsDropdownOpen(false)}
                                className="w-full text-left px-4 py-2 border-b border-[#1B263B]/10 dark:border-[#E0E1DD]/10 flex items-center justify-between hover:bg-black/5 dark:hover:bg-[#E0E1DD]/10 transition-colors cursor-pointer"
                            >
                                <span className="text-sm font-medium text-[#2F3E46] dark:text-[#E0E1DD]/80">Settings</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#2F3E46] dark:text-[#E0E1DD]/80"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l-.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
                            </Link>
                            {role?.toLowerCase() !== "labeler" && role?.toLowerCase() !== "applicant" && (
                                <div className="p-2 border-b border-[#1B263B]/10 dark:border-[#E0E1DD]/10">
                                    <a
                                        href={helpMailtoUrl}
                                        onClick={handleHelpClick}
                                        className="w-full px-3 py-2 bg-[#D81B60] hover:bg-[#b81550] dark:bg-[#D81B60] dark:hover:bg-[#E83E8C] text-white rounded-lg flex items-center justify-between transition-all cursor-pointer shadow-sm font-bold text-sm"
                                    >
                                        <span>Help & Support</span>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
                                    </a>
                                </div>
                            )}
                            <button
                                onClick={() => {
                                    setIsDropdownOpen(false);
                                    onLogout();
                                }}
                                disabled={isLoggingOut}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                                {isLoggingOut ? 'Logging out...' : 'Log out'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Selected Message Modal */}
            {selectedMessage && (
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-[#0D1B2A] border border-[#1B263B]/10 dark:border-[#E0E1DD]/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center p-5 border-b border-[#1B263B]/10 dark:border-[#E0E1DD]/10 bg-black/[0.02] dark:bg-white/[0.02]">
                            <div>
                                <h2 className="text-lg font-black text-[#0D1B2A] dark:text-white">{selectedMessage.subject || (selectedMessage.isBroadcast ? "Announcement" : "Direct Message")}</h2>
                                <p className="text-xs text-gray-500 mt-1">From: <span className="font-medium text-[#1F7A1F] dark:text-[#55f761]">{selectedMessage.fromName || "Admin"}</span> • {new Date(selectedMessage.createdAt).toLocaleString()}</p>
                            </div>
                            <button
                                onClick={() => setSelectedMessage(null)}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-full transition-colors self-start cursor-pointer focus:outline-none"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto text-sm text-[#2F3E46] dark:text-[#E0E1DD]/90 leading-relaxed whitespace-pre-wrap">
                            {renderMessageWithLinks(selectedMessage.message)}
                        </div>
                        {selectedMessage.imageUrls && (() => {
                            let urls: string[] = [];
                            try {
                                const parsed = JSON.parse(selectedMessage.imageUrls);
                                if (Array.isArray(parsed)) {
                                    urls = parsed.filter(u => typeof u === 'string' && u.trim().length > 0);
                                } else if (typeof parsed === 'string' && parsed.trim().length > 0) {
                                    urls = [parsed];
                                }
                            } catch {
                                if (typeof selectedMessage.imageUrls === 'string' && selectedMessage.imageUrls.trim().length > 0) {
                                    urls = [selectedMessage.imageUrls];
                                }
                            }
                            if (urls.length === 0) return null;
                            return (
                                <div className={`px-6 pb-6 pt-2 grid gap-3 ${urls.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                                    {urls.map((url, i) => (
                                        <img
                                            key={i}
                                            src={url.startsWith('http') || url.startsWith('data:') ? url : `data:image/jpeg;base64,${url}`}
                                            alt={`Attachment ${i + 1}`}
                                            className="max-w-full rounded-xl shadow-sm border border-black/5 dark:border-white/5"
                                        />
                                    ))}
                                </div>
                            );
                        })()}
                        <div className="p-4 border-t border-[#1B263B]/10 dark:border-[#E0E1DD]/10 bg-black/[0.02] dark:bg-white/[0.02] flex justify-end">
                            <button
                                onClick={() => setSelectedMessage(null)}
                                className="px-5 py-2 bg-[#1F7A1F] hover:bg-[#145214] text-white rounded-xl text-sm font-bold transition-all shadow-sm cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Download Software Selection Modal */}
            {isDownloadModalOpen && (
                <div 
                    onClick={() => setIsDownloadModalOpen(false)}
                    className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                >
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white dark:bg-[#0D1B2A] border border-[#1B263B]/10 dark:border-[#E0E1DD]/10 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200"
                    >
                        <div className="flex justify-between items-center p-5 border-b border-[#1B263B]/10 dark:border-[#E0E1DD]/10 bg-black/[0.02] dark:bg-white/[0.02]">
                            <div>
                                <h2 className="text-lg font-black text-[#0D1B2A] dark:text-white">Download Ginger Software</h2>
                                <p className="text-xs text-gray-500 mt-1">Select the software version suitable for your assigned tasks.</p>
                            </div>
                            <button
                                onClick={() => setIsDownloadModalOpen(false)}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-full transition-colors cursor-pointer focus:outline-none"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className={`p-6 overflow-y-auto grid grid-cols-1 gap-6 ${isStandardBuildingPassed ? "md:grid-cols-2" : ""}`}>
                            {/* 2D Ginger Software Card */}
                            <div className="flex flex-col justify-between p-5 rounded-2xl border border-[#1B263B]/10 dark:border-[#E0E1DD]/10 bg-gray-50 dark:bg-[#1B263B]/40 hover:border-[#1F7A1F]/30 dark:hover:border-[#55f761]/30 hover:shadow-md transition-all duration-300">
                                <div className="mb-6">
                                    <div className="w-12 h-12 rounded-xl bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 flex items-center justify-center mb-4">
                                        <svg className="w-6 h-6 text-[#1F7A1F] dark:text-[#55f761]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                        </svg>
                                    </div>
                                    <h3 className="text-base font-bold text-[#0D1B2A] dark:text-white mb-2">2D Ginger Software</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                                        Download 2D ginger software for Standard Building Repair, Landcover, Transportation, and Centerline tasks.
                                    </p>
                                </div>
                                <a
                                    href="https://www.mediafire.com/folder/giykm5tceipcr/Latest_Ginger"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setIsDownloadModalOpen(false)}
                                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold shadow-sm transition-all bg-[#1F7A1F] hover:bg-[#145214] text-white dark:bg-[#55f761] dark:hover:bg-[#3de34a] dark:text-[#0D1B2A] cursor-pointer"
                                >
                                    Download 2D Ginger Software
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                </a>
                            </div>

                            {/* 3D Ginger Software Card — passers only */}
                            {isStandardBuildingPassed && (
                            <div className="flex flex-col justify-between p-5 rounded-2xl border border-[#1B263B]/10 dark:border-[#E0E1DD]/10 bg-gray-50 dark:bg-[#1B263B]/40 hover:border-purple-500/30 dark:hover:border-purple-400/30 hover:shadow-md transition-all duration-300">
                                <div className="mb-6">
                                    <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-4">
                                        <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                        </svg>
                                    </div>
                                    <h3 className="text-base font-bold text-[#0D1B2A] dark:text-white mb-2">3D Ginger Software</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                                        Download 3D ginger software for 3D Matching, and 3dr roof tasks.
                                    </p>
                                </div>
                                <a
                                    href="https://drive.google.com/file/d/1rG_TOUxdzBr0-RymnPrttTpx-mDKGz8m/view?usp=sharing"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setIsDownloadModalOpen(false)}
                                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold shadow-sm transition-all bg-purple-600 hover:bg-purple-700 text-white dark:bg-purple-500 dark:hover:bg-purple-400 cursor-pointer"
                                >
                                    Download 3D Ginger Software
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                </a>
                            </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-[#1B263B]/10 dark:border-[#E0E1DD]/10 bg-black/[0.02] dark:bg-white/[0.02] flex justify-end">
                            <button
                                onClick={() => setIsDownloadModalOpen(false)}
                                className="px-5 py-2 border border-[#1B263B]/10 dark:border-[#E0E1DD]/10 hover:bg-black/5 dark:hover:bg-white/5 text-[#2F3E46] dark:text-[#E0E1DD]/80 rounded-xl text-sm font-bold transition-all cursor-pointer"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
}