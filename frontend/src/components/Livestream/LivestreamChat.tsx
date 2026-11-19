"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  CornerUpLeft,
  MessageSquare,
  PanelRightClose,
  Pencil,
  Send,
  Smile,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDeleteDialog } from "@/components/Attendance/ConfirmDeleteDialog";

const POPULAR_EMOJIS = [
  "😀", "😂", "🤣", "😊", "😍", "😎", "🤔", "😢", "😡",
  "👍", "👎", "🔥", "🚀", "👏", "🎉", "❤️", "✨", "💯",
  "👀", "🙌", "💡", "⚠️", "❌", "✅", "🌟", "🥳", "⚡",
  "💻", "🎯", "🤝",
];

const MAX_MESSAGE_LENGTH = 500;

const ALLOWED_DOMAINS_REGEX =
  /((?:https?:\/\/)?(?:www\.)?(?:facebook\.com|messenger\.com|m\.me|fb\.com|fb\.me|app\.xfnite\.cloud|bucket\.xfnite\.cloud|cdn\.xfnite\.cloud|r2\.dev|r2\.cloudflarestorage\.com|discord\.com|discord\.gg|t\.me|telegram\.org|wa\.me|whatsapp\.com|zoom\.us|skype\.com|meet\.google\.com|viber\.com|teams\.microsoft\.com|localhost)(?:\/[^\s]*)?)/gi;

const URL_LIKE_REGEX =
  /(\b(?:https?:\/\/|www\.)?(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?\b)/gi;

const BANNED_WORDS = ["bitmappro", "ryu", "glimmertech", "glim", "zybryx"];

export interface LivestreamChatMessage {
  id: string;
  chatType: string;
  sender: string;
  senderEmail?: string | null;
  senderRole?: string | null;
  senderFirstName?: string | null;
  senderLastName?: string | null;
  text: string;
  isEdited?: boolean;
  createdAt: Date | string;
  replyToId?: string | null;
  replyToSender?: string | null;
  replyToText?: string | null;
}

interface RoleStyle {
  badge: string;
  badgeClass: string;
  nameClass: string;
}

const ROLE_STYLES: Record<string, RoleStyle> = {
  admin: {
    badge: "Grandmaster",
    badgeClass: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25",
    nameClass: "text-red-600 dark:text-red-400",
  },
  checker: {
    badge: "Overseer",
    badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25",
    nameClass: "text-blue-600 dark:text-sky-400",
  },
  judger: {
    badge: "Arbiter",
    badgeClass: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/25",
    nameClass: "text-fuchsia-600 dark:text-fuchsia-400",
  },
  recruiter: {
    badge: "Mentor",
    badgeClass: "bg-[#1F7A1F]/15 text-[#1F7A1F] dark:text-[#55f761] border-[#1F7A1F]/25 dark:border-[#55f761]/25",
    nameClass: "text-[#1F7A1F] dark:text-[#55f761]",
  },
  old: {
    badge: "OGXF",
    badgeClass: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/25",
    nameClass: "text-violet-600 dark:text-violet-400",
  },
  "old-labeler": {
    badge: "OGXF",
    badgeClass: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/25",
    nameClass: "text-violet-600 dark:text-violet-400",
  },
  labeler: {
    badge: "Challenger",
    badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
    nameClass: "text-amber-700 dark:text-amber-400",
  },
  applicant: {
    badge: "Novice",
    badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
    nameClass: "text-emerald-700 dark:text-emerald-400",
  },
  moderator: {
    badge: "Moderator",
    badgeClass: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/25",
    nameClass: "text-cyan-700 dark:text-cyan-400",
  },
};

export function formatChatSenderName(msg: Pick<LivestreamChatMessage, "sender" | "senderFirstName" | "senderLastName">): string {
  if (msg.senderFirstName) {
    return msg.senderFirstName.charAt(0).toUpperCase() + msg.senderFirstName.slice(1).toLowerCase();
  }
  if (msg.senderLastName) {
    return msg.senderLastName.charAt(0).toUpperCase() + msg.senderLastName.slice(1).toLowerCase();
  }
  const sender = msg.sender;
  if (!sender) return "Anonymous";

  let name = sender;
  if (sender.includes("@")) {
    name = sender.split("@")[0].replace(/[\._\-]/g, " ");
  }

  const parts = name
    .trim()
    .split(/\s+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());

  if (parts.length <= 1) return parts[0] || "Anonymous";
  const firstName = parts.slice(0, -1).join(" ");
  return firstName || parts[parts.length - 1] || "Anonymous";
}

function decodeHTMLEntities(text: string): string {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function hasDisallowedDomain(text: string): boolean {
  const decoded = decodeHTMLEntities(text);
  const matches = decoded.match(URL_LIKE_REGEX);
  if (!matches) return false;
  return matches.some((m) => {
    ALLOWED_DOMAINS_REGEX.lastIndex = 0;
    const allowedMatch = m.match(ALLOWED_DOMAINS_REGEX);
    return !allowedMatch || allowedMatch[0].length !== m.length;
  });
}

function renderMessageText(text: string, isSenderPrivileged: boolean): React.ReactNode {
  const decoded = decodeHTMLEntities(text);
  if (!decoded) return null;

  const regexToUse = isSenderPrivileged ? URL_LIKE_REGEX : ALLOWED_DOMAINS_REGEX;
  const parts = decoded.split(regexToUse);

  return parts.map((part, index) => {
    if (part.match(regexToUse)) {
      const href = /^https?:\/\//i.test(part) ? part : `https://${part}`;
      return (
        <a
          key={index}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-[#1F7A1F] dark:text-[#55f761] font-semibold hover:opacity-80 break-all"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

export interface LivestreamChatUser {
  email?: string | null;
  name?: string | null;
  role?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

interface LivestreamChatProps {
  messages: LivestreamChatMessage[];
  currentUser: LivestreamChatUser | null;
  isConnected: boolean;
  isLive: boolean;
  presenceCount: number;
  onSendMessage: (payload: { text: string; replyTo?: LivestreamChatMessage | null }) => boolean;
  onEditMessage: (messageId: string, newText: string) => boolean;
  onDeleteMessage: (messageId: string, forceDelete: boolean) => void;
  onCollapse?: () => void;
  className?: string;
}

export function LivestreamChat({
  messages,
  currentUser,
  isConnected,
  isLive,
  presenceCount,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onCollapse,
  className,
}: LivestreamChatProps) {
  const [inputValue, setInputValue] = useState("");
  const [replyTo, setReplyTo] = useState<LivestreamChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<LivestreamChatMessage | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pausedAtLength, setPausedAtLength] = useState<number | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{
    type: "unsend" | "delete";
    messageId: string;
  } | null>(null);

  const feedRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiRef = useRef<HTMLDivElement | null>(null);

  const isPausedScroll = pausedAtLength !== null;
  const pendingScrollCount = pausedAtLength !== null ? Math.max(0, messages.length - pausedAtLength) : 0;

  const cleanRole = (currentUser?.role || "").trim().toLowerCase();
  const isStaffModerator = ["admin", "judger", "checker"].includes(cleanRole);
  const isAdminOrJudger = cleanRole === "admin" || cleanRole === "judger";

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const el = feedRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    setPausedAtLength(null);
  };

  // Auto-scroll DOM when new messages arrive unless user scrolled up
  useEffect(() => {
    const el = feedRef.current;
    if (!el || pausedAtLength !== null) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, pausedAtLength]);

  // Initial snap to bottom on mount
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Close emoji picker on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const handleFeedScroll = () => {
    const el = feedRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 48;
    if (atBottom) {
      if (pausedAtLength !== null) setPausedAtLength(null);
    } else if (pausedAtLength === null) {
      setPausedAtLength(messages.length);
    }
  };

  const handleJumpToQuote = (targetId: string) => {
    const targetEl = document.getElementById(`stream-msg-${targetId}`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedMsgId(targetId);
      setTimeout(() => setHighlightedMsgId(null), 1600);
    }
  };

  const isOwnMessage = (msg: LivestreamChatMessage): boolean => {
    if (!currentUser) return false;
    const myEmail = (currentUser.email || "").trim().toLowerCase();
    const myName = (currentUser.name || "").trim().toLowerCase();
    if (msg.senderEmail && myEmail && msg.senderEmail.trim().toLowerCase() === myEmail) {
      return true;
    }
    const senderLower = (msg.sender || "").trim().toLowerCase();
    return Boolean((myEmail && senderLower === myEmail) || (myName && senderLower === myName));
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    if (BANNED_WORDS.some((w) => trimmed.toLowerCase().includes(w))) {
      setInputValue("");
      return;
    }

    if (hasDisallowedDomain(trimmed) && !isAdminOrJudger) {
      setInputValue("");
      return;
    }

    if (editingMsg) {
      const ok = onEditMessage(editingMsg.id, trimmed);
      if (ok) {
        setEditingMsg(null);
        setInputValue("");
        if (inputRef.current) inputRef.current.style.height = "auto";
      }
      return;
    }

    const ok = onSendMessage({ text: trimmed, replyTo });
    if (ok) {
      setInputValue("");
      setReplyTo(null);
      setShowEmojiPicker(false);
      if (inputRef.current) inputRef.current.style.height = "auto";
      requestAnimationFrame(() => scrollToBottom("smooth"));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      setReplyTo(null);
      setEditingMsg(null);
    }
  };

  const startEdit = (msg: LivestreamChatMessage) => {
    setReplyTo(null);
    setEditingMsg(msg);
    setInputValue(decodeHTMLEntities(msg.text));
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const startReply = (msg: LivestreamChatMessage) => {
    setEditingMsg(null);
    setReplyTo(msg);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const confirmDialogConfig = useMemo(() => {
    if (!confirmState) return null;
    if (confirmState.type === "delete") {
      return {
        title: "Delete Message",
        description:
          "Permanently remove this message from Stream Chat for all viewers?",
      };
    }
    return {
      title: "Unsend Message",
      description: "Unsend this message? Its content will be replaced with 'Message unsent'.",
    };
  }, [confirmState]);

  const handleConfirmAction = () => {
    if (!confirmState) return;
    if (confirmState.type === "delete") {
      onDeleteMessage(confirmState.messageId, true);
    } else {
      onDeleteMessage(confirmState.messageId, false);
    }
    setConfirmState(null);
  };

  return (
    <aside
      className={cn(
        "flex flex-col w-full h-full bg-white/85 dark:bg-[#0B121B]/95 backdrop-blur-md rounded-2xl border border-black/10 dark:border-white/10 shadow-xl overflow-hidden",
        className
      )}
    >
      {/* Twitch-style Chat Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="hidden lg:flex p-1.5 rounded-lg text-[#2F3E46]/70 dark:text-white/60 hover:text-[#0D1B2A] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
              title="Collapse Chat"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={cn(
                "w-2 h-2 rounded-full shrink-0",
                !isConnected
                  ? "bg-amber-500 animate-pulse"
                  : isLive
                  ? "bg-red-500 animate-pulse"
                  : "bg-[#1F7A1F] dark:bg-[#55f761]"
              )}
              title={isConnected ? "Connected to real-time chat" : "Reconnecting..."}
            />
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#0D1B2A] dark:text-white truncate">
              Stream Chat
            </h2>
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide shrink-0",
                isLive
                  ? "bg-red-500/15 text-red-600 dark:text-red-400"
                  : "bg-black/5 dark:bg-white/10 text-[#2F3E46]/70 dark:text-white/50"
              )}
            >
              {isLive ? "Live" : "Lobby"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/5 dark:bg-white/5 text-[11px] font-semibold text-[#2F3E46]/80 dark:text-white/70"
            title="Users currently in Stream Chat"
          >
            <Users className="w-3 h-3 text-[#1F7A1F] dark:text-[#55f761]" />
            <span>{presenceCount}</span>
          </span>
        </div>
      </div>

      {/* Scrollable Chat Feed */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={feedRef}
          onScroll={handleFeedScroll}
          className="h-full overflow-y-auto px-2.5 py-2.5 space-y-1 scrollbar-thin scrollbar-thumb-black/15 dark:scrollbar-thumb-white/15"
        >
          {/* Welcome Notice */}
          <div className="px-2.5 py-2 mb-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 text-[11px] text-[#2F3E46]/70 dark:text-white/50 leading-snug">
            <span className="font-semibold text-[#0D1B2A] dark:text-white/80">Welcome to the chat room!</span>{" "}
            {isLive
              ? "Ask the checker questions in real time."
              : "Chat is open even while offline."}
          </div>

          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-12 px-4 space-y-2 opacity-70">
              <div className="w-10 h-10 rounded-xl bg-black/5 dark:bg-white/5 flex items-center justify-center text-[#1F7A1F] dark:text-[#55f761]">
                <MessageSquare className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-[#0D1B2A] dark:text-white">
                No messages yet
              </p>
              <p className="text-[11px] text-[#2F3E46]/70 dark:text-white/50 max-w-[220px]">
                Say hello or drop a question — chat works both during and before live checks.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isYou = isOwnMessage(msg);
              const isUnsent = msg.text === "Message unsent";
              const isTemp = msg.id.startsWith("temp-");
              const roleKey = (msg.senderRole || "").toLowerCase();
              const roleStyle = ROLE_STYLES[roleKey];
              const isSenderPrivileged = roleKey === "admin" || roleKey === "judger";
              const displayName = formatChatSenderName(msg);
              const timeLabel = msg.createdAt
                ? new Date(msg.createdAt).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "";

              return (
                <div
                  key={msg.id}
                  id={`stream-msg-${msg.id}`}
                  className={cn(
                    "group relative px-2 py-1.5 rounded-lg transition-colors text-[12.5px] leading-relaxed",
                    "hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
                    highlightedMsgId === msg.id && "bg-[#55f761]/20 dark:bg-[#55f761]/15",
                    isTemp && "opacity-70"
                  )}
                >
                  {/* Hover Action Pill (Twitch/Discord style) */}
                  {!isUnsent && !isTemp && (
                    <div className="hidden group-hover:flex items-center gap-0.5 absolute right-1.5 -top-2 z-20 px-1 py-0.5 rounded-lg bg-white dark:bg-[#15202E] border border-black/10 dark:border-white/15 shadow-md">
                      <button
                        type="button"
                        onClick={() => startReply(msg)}
                        className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-[#2F3E46]/70 dark:text-white/70 hover:text-[#1F7A1F] dark:hover:text-[#55f761] cursor-pointer"
                        title="Reply"
                      >
                        <CornerUpLeft className="w-3 h-3" />
                      </button>
                      {isYou && (
                        <button
                          type="button"
                          onClick={() => startEdit(msg)}
                          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-[#2F3E46]/70 dark:text-white/70 hover:text-blue-500 cursor-pointer"
                          title="Edit"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                      {isYou && (
                        <button
                          type="button"
                          onClick={() => setConfirmState({ type: "unsend", messageId: msg.id })}
                          className="p-1 rounded hover:bg-red-500/10 text-[#2F3E46]/70 dark:text-white/70 hover:text-red-500 cursor-pointer"
                          title="Unsend"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                      {isStaffModerator && (
                        <button
                          type="button"
                          onClick={() => setConfirmState({ type: "delete", messageId: msg.id })}
                          className="p-1 rounded hover:bg-red-500/10 text-[#2F3E46]/70 dark:text-white/70 hover:text-red-500 cursor-pointer"
                          title="Delete message"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Reply Context Strip */}
                  {msg.replyToId && msg.replyToText && (
                    <button
                      type="button"
                      onClick={() => handleJumpToQuote(msg.replyToId!)}
                      className="flex items-center gap-1 text-[10.5px] text-[#2F3E46]/65 dark:text-white/50 hover:text-[#0D1B2A] dark:hover:text-white mb-0.5 pl-1.5 border-l-2 border-[#1F7A1F]/60 dark:border-[#55f761]/60 max-w-full truncate cursor-pointer text-left"
                    >
                      <CornerUpLeft className="w-2.5 h-2.5 shrink-0 opacity-70" />
                      <span className="font-semibold shrink-0">@{msg.replyToSender || "User"}:</span>
                      <span className="truncate italic">{decodeHTMLEntities(msg.replyToText)}</span>
                    </button>
                  )}

                  {/* Twitch-style Inline Row: [Time] [Role Badge] Username: message */}
                  <div className="break-words">
                    {timeLabel && (
                      <span className="text-[10px] font-mono text-[#2F3E46]/45 dark:text-white/35 mr-1.5 select-none">
                        {timeLabel}
                      </span>
                    )}
                    {roleStyle && (
                      <span
                        className={cn(
                          "inline-flex items-center px-1.5 py-[1px] mr-1.5 rounded border text-[9px] font-extrabold uppercase tracking-wide align-middle select-none",
                          roleStyle.badgeClass
                        )}
                      >
                        {roleStyle.badge}
                      </span>
                    )}
                    <span
                      className={cn(
                        "font-bold mr-1",
                        roleStyle?.nameClass || "text-[#0D1B2A] dark:text-white"
                      )}
                    >
                      {displayName}
                      {isYou && (
                        <span className="ml-1 text-[9px] font-semibold opacity-60">(you)</span>
                      )}
                    </span>
                    <span className="text-[#2F3E46]/50 dark:text-white/40 mr-1.5">:</span>
                    {isUnsent ? (
                      <span className="italic text-[#2F3E46]/50 dark:text-white/40 text-xs">
                        Message unsent
                      </span>
                    ) : (
                      <span className="text-[#0D1B2A]/90 dark:text-white/90">
                        {renderMessageText(msg.text, isSenderPrivileged)}
                        {msg.isEdited && (
                          <span className="ml-1 text-[10px] text-[#2F3E46]/45 dark:text-white/35 italic">
                            (edited)
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Twitch-style "Chat paused due to scroll" pill */}
        {isPausedScroll && (
          <div className="absolute bottom-2.5 inset-x-0 flex justify-center pointer-events-none z-20">
            <button
              type="button"
              onClick={() => scrollToBottom("smooth")}
              className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0D1B2A]/90 dark:bg-[#1B263B]/95 text-white text-[11px] font-semibold shadow-lg border border-white/15 hover:scale-105 transition-all cursor-pointer backdrop-blur-md"
            >
              <ArrowDown className="w-3 h-3 text-[#55f761]" />
              <span>
                {pendingScrollCount > 0
                  ? `${pendingScrollCount} new message${pendingScrollCount > 1 ? "s" : ""} below`
                  : "Chat paused due to scroll"}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Reply / Edit Banner */}
      {(replyTo || editingMsg) && (
        <div className="px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.05] border-t border-black/10 dark:border-white/10 flex items-center justify-between gap-2 text-[11px] shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {editingMsg ? (
              <Pencil className="w-3 h-3 text-blue-500 shrink-0" />
            ) : (
              <CornerUpLeft className="w-3 h-3 text-[#1F7A1F] dark:text-[#55f761] shrink-0" />
            )}
            <span className="truncate text-[#2F3E46] dark:text-white/80">
              {editingMsg ? (
                <>Editing your message</>
              ) : (
                <>
                  Replying to{" "}
                  <strong className="text-[#0D1B2A] dark:text-white">
                    {formatChatSenderName(replyTo!)}
                  </strong>
                  : {decodeHTMLEntities(replyTo!.text)}
                </>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setReplyTo(null);
              setEditingMsg(null);
              if (editingMsg) setInputValue("");
            }}
            className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-[#2F3E46]/70 dark:text-white/60 cursor-pointer shrink-0"
            title="Cancel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Twitch-style Chat Input Footer */}
      <form
        onSubmit={handleSubmit}
        className="p-2.5 border-t border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] space-y-2 shrink-0"
      >
        <div className="relative flex items-end gap-1.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-[#1F7A1F]/60 dark:focus-within:ring-[#55f761]/60">
          {/* Emoji Picker */}
          <div className="relative shrink-0" ref={emojiRef}>
            <button
              type="button"
              onClick={() => setShowEmojiPicker((v) => !v)}
              className="p-1 rounded-lg text-[#2F3E46]/70 dark:text-white/60 hover:text-[#0D1B2A] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
              title="Insert emoji"
            >
              <Smile className="w-4 h-4" />
            </button>

            {showEmojiPicker && (
              <div className="absolute bottom-9 left-0 z-40 w-60 p-2 rounded-xl bg-white dark:bg-[#0D1B2A] border border-black/10 dark:border-white/15 shadow-2xl grid grid-cols-6 gap-1">
                {POPULAR_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      setInputValue((prev) => (prev + emoji).slice(0, MAX_MESSAGE_LENGTH));
                      inputRef.current?.focus();
                    }}
                    className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-base leading-none cursor-pointer transition-transform hover:scale-110"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <textarea
            ref={inputRef}
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 88)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              !isConnected
                ? "Connecting to stream chat..."
                : isLive
                ? "Send a message..."
                : "Chat in lobby..."
            }
            disabled={!isConnected}
            className="flex-1 bg-transparent resize-none text-xs text-[#0D1B2A] dark:text-white placeholder:text-[#2F3E46]/50 dark:placeholder:text-white/40 focus:outline-none py-1 max-h-[88px] leading-snug"
          />

          <button
            type="submit"
            disabled={!isConnected || !inputValue.trim()}
            className="px-2.5 py-1.5 rounded-lg bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] text-xs font-bold flex items-center gap-1 shadow-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            title={editingMsg ? "Save edit" : "Send message"}
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{editingMsg ? "Save" : "Chat"}</span>
          </button>
        </div>

        {inputValue.length > MAX_MESSAGE_LENGTH - 100 && (
          <div className="flex justify-end px-1">
            <span
              className={cn(
                "text-[10px] font-mono",
                inputValue.length >= MAX_MESSAGE_LENGTH
                  ? "text-red-500 font-bold"
                  : "text-[#2F3E46]/60 dark:text-white/45"
              )}
            >
              {inputValue.length}/{MAX_MESSAGE_LENGTH}
            </span>
          </div>
        )}
      </form>

      {/* Confirmation Dialog for Unsend / Delete / Clear Chat */}
      <ConfirmDeleteDialog
        isOpen={Boolean(confirmState)}
        onClose={() => setConfirmState(null)}
        onConfirm={handleConfirmAction}
        title={confirmDialogConfig?.title || "Confirm"}
        description={confirmDialogConfig?.description || ""}
      />
    </aside>
  );
}
