"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  Maximize2,
  Minimize2,
  MessageSquare,
  Award,
  History,
  Send,
  Smile,
  Lock,
  Trash2,
  MoreVertical,
  CornerUpLeft,
  User,
  Clock,
  Users,
  ChevronDown,
  Search,
  Check,
  Image as ImageIcon,
  Loader2,
  Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getUserDetailsAction, getChatRoomsListAction, getUserGroupNamesAction } from "@/app/actions/chat";
import { io, Socket } from "socket.io-client";
import { GATES, getGamifiedRoleLabel, getNormalizedRole } from "@/config/permissions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const POPULAR_EMOJIS = [
  "😀",
  "😂",
  "🤣",
  "😊",
  "😍",
  "🥰",
  "😘",
  "😜",
  "😎",
  "🤔",
  "😢",
  "😡",
  "👍",
  "👎",
  "🔥",
  "🚀",
  "👏",
  "🎉",
  "❤️",
  "✨",
  "💯",
  "👀",
  "🙌",
  "💡",
  "⚠️",
  "❌",
  "✅",
  "🌟",
  "🎈",
  "🥳",
  "⚡",
  "💻",
  "🎨",
  "🎮",
  "🎵",
  "🤝",
];

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ||
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  "http://localhost:3001";

interface Message {
  id: string;
  chatType: string;
  sender: string;
  senderRole?: string | null;
  senderFirstName?: string | null;
  senderLastName?: string | null;
  text: string;
  imageUrl?: string | null;
  isEdited?: boolean;
  createdAt: Date;
  replyToId?: string | null;
  replyToSender?: string | null;
  replyToText?: string | null;
}

interface ChatWidgetProps {
  currentUser: {
    email?: string;
    role?: string;
    name?: string;
    groupId?: number | null;
    teamId?: number | null;
  };
  isStandardBuildingPassed: boolean;
}

const formatSenderName = (msg: Message): string => {
  if (msg.senderFirstName) {
    return (
      msg.senderFirstName.charAt(0).toUpperCase() +
      msg.senderFirstName.slice(1).toLowerCase()
    );
  }
  if (msg.senderLastName) {
    return (
      msg.senderLastName.charAt(0).toUpperCase() +
      msg.senderLastName.slice(1).toLowerCase()
    );
  }

  const sender = msg.sender;
  if (!sender) return "Anonymous";

  let name = sender;
  // If it's an email, extract the username part and convert separators to spaces
  if (sender.includes("@")) {
    name = sender.split("@")[0].replace(/[\._\-]/g, " ");
  }

  // Split the name by spaces and capitalize each word
  const parts = name
    .trim()
    .split(/\s+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());

  if (parts.length <= 1) {
    return parts[0] || "Anonymous";
  }

  // Remove the last item (last name) and combine the rest
  const firstNameParts = parts.slice(0, -1);
  const firstName = firstNameParts.join(" ");

  if (firstName) {
    return firstName;
  }

  // Fallback to the last item (last name) if firstName is empty
  return parts[parts.length - 1] || "Anonymous";
};

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name + "=([^;]*)"),
  );
  return match ? decodeURIComponent(match[1]) : null;
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

const ALLOWED_DOMAINS_REGEX = /((?:https?:\/\/)?(?:www\.)?(?:facebook\.com|messenger\.com|m\.me|fb\.com|fb\.me|app\.xfnite\.cloud|bucket\.xfnite\.cloud|cdn\.xfnite\.cloud|r2\.dev|r2\.cloudflarestorage\.com|discord\.com|discord\.gg|t\.me|telegram\.org|wa\.me|whatsapp\.com|zoom\.us|skype\.com|meet\.google\.com|viber\.com|teams\.microsoft\.com|localhost)(?:\/[^\s]*)?)/gi;

// Matches anything that looks like a URL/domain (not just the whitelisted ones),
// so we can silently block messages linking to domains that aren't allowed.
const URL_LIKE_REGEX =
  /(\b(?:https?:\/\/|www\.)?(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?\b)/gi;

function renderMessageText(text: string, isSenderAdminOrJudger: boolean = false): React.ReactNode {
  const decoded = decodeHTMLEntities(text);
  if (!decoded) return null;

  const regexToUse = isSenderAdminOrJudger ? URL_LIKE_REGEX : ALLOWED_DOMAINS_REGEX;
  const parts = decoded.split(regexToUse);

  return parts.map((part, index) => {
    if (part.match(regexToUse)) {
      let href = part;
      if (!/^https?:\/\//i.test(href)) {
        href = "https://" + href;
      }
      return (
        <a
          key={index}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-emerald-600 dark:text-emerald-400 font-bold hover:opacity-85 break-all"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

// Announcement popup only: **text** renders bold. Chat messages stay plain text.
function renderAnnouncementText(text: string): React.ReactNode {
  return text.split(/\*\*(.+?)\*\*/g).map((segment, index) =>
    index % 2 === 1
      ? <strong key={index} className="font-bold text-[#0D1B2A] dark:text-white">{renderMessageText(segment, true)}</strong>
      : <span key={index}>{renderMessageText(segment, true)}</span>
  );
}

function hasDisallowedDomain(text: string): boolean {
  const decoded = decodeHTMLEntities(text);
  const matches = decoded.match(URL_LIKE_REGEX);
  if (!matches) return false;

  return matches.some((m) => {
    ALLOWED_DOMAINS_REGEX.lastIndex = 0;
    const allowedMatch = m.match(ALLOWED_DOMAINS_REGEX);
    // Disallowed unless the whole URL-like match is covered by an allowed domain
    return !allowedMatch || allowedMatch[0].length !== m.length;
  });
}

interface MessageItemProps {
  msg: Message;
  isYou: boolean;
  currentUser: any;
  isPasserTab: boolean;
  isOldTab: boolean;
  activeMenuMessageId: string | null;
  setActiveMenuMessageId: (id: string | null) => void;
  handleAvatarClick: (nameOrEmail: string) => void;
  isFetchingUserDetails: boolean;
  handleStartEdit: (msg: Message) => void;
  setConfirmAction: (val: { messageId: string; type: "unsend" | "delete" } | null) => void;
  onReply: (msg: Message) => void;
  onQuoteClick: (replyToId: string) => void;
  highlightedMessageId: string | null;
  onImageClick: (url: string) => void;
  isLast?: boolean;
  isSecondLast?: boolean;
}

function MessageItem({
  msg,
  isYou,
  currentUser,
  isPasserTab,
  isOldTab,
  activeMenuMessageId,
  setActiveMenuMessageId,
  handleAvatarClick,
  isFetchingUserDetails,
  handleStartEdit,
  setConfirmAction,
  onReply,
  onQuoteClick,
  highlightedMessageId,
  onImageClick,
  isLast = false,
  isSecondLast = false,
}: MessageItemProps) {
  const [showImage, setShowImage] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const startXRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (msg.text === "Message unsent" || msg.id.startsWith("temp-")) return;

    const target = e.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("a") ||
      target.closest(".message-actions-menu")
    ) {
      return;
    }

    startXRef.current = e.clientX;
    isDraggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || startXRef.current === null) return;
    const deltaX = e.clientX - startXRef.current;

    if (deltaX > 0) {
      const offset = deltaX > 75 ? 75 + (deltaX - 75) * 0.15 : deltaX;
      setDragOffset(Math.min(offset, 90));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    startXRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);

    if (dragOffset > 45) {
      onReply(msg);
    }
    setDragOffset(0);
  };

  const handlePointerCancel = () => {
    isDraggingRef.current = false;
    startXRef.current = null;
    setDragOffset(0);
  };

  const isHighlighted = highlightedMessageId === msg.id;

  return (
    <div
      id={`msg-${msg.id}`}
      className={cn(
        "flex gap-2 relative transition-colors duration-500 rounded-xl p-1",
        isYou
          ? "flex-row-reverse text-right items-start"
          : "flex-row text-left items-start",
        activeMenuMessageId === msg.id ? "z-30" : "z-10",
        isHighlighted && "bg-emerald-500/10 dark:bg-emerald-500/20"
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerCancel}
      onLostPointerCapture={handlePointerCancel}
      style={{ touchAction: "none" }}
    >
      {/* Swipe to Reply Indicator */}
      {dragOffset > 0 && (
        <div
          className="absolute left-1 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none transition-all"
          style={{
            opacity: Math.min(dragOffset / 40, 1),
            transform: `scale(${Math.min(dragOffset / 40, 1)})`,
          }}
        >
          <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center shadow-sm">
            <CornerUpLeft className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
        </div>
      )}

      {/* Actual Message elements wrapped with transform */}
      <div
        className="flex-1 flex gap-2 min-w-0"
        style={{
          transform: `translateX(${dragOffset}px)`,
          transition: dragOffset === 0 ? "transform 0.2s ease-out" : "none",
        }}
      >
        {/* Avatar - don't render own user icon */}
        {!isYou && (
          <button
            onClick={() => !isYou && handleAvatarClick(msg.sender)}
            disabled={
              isYou ||
              currentUser?.role?.toLowerCase() !== "admin" ||
              isFetchingUserDetails
            }
            className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white select-none shrink-0 border border-black/10 dark:border-white/10 shadow-sm mt-0.5",
              !isYou && currentUser?.role?.toLowerCase() === "admin"
                ? "cursor-pointer hover:scale-105 active:scale-95 transition-transform"
                : "cursor-default",
              msg.senderRole === "admin"
                ? "bg-red-500"
                : msg.senderRole === "checker"
                  ? "bg-blue-500"
                  : msg.senderRole === "old"
                    ? "bg-violet-500"
                    : msg.senderRole === "labeler"
                      ? "bg-yellow-500"
                      : msg.senderRole === "applicant"
                        ? "bg-emerald-500"
                        : msg.senderRole === "moderator"
                          ? "bg-cyan-500"
                          : "bg-[#1F7A1F]"
            )}
            title={
              !isYou && currentUser?.role?.toLowerCase() === "admin"
                ? "Click to view profile"
                : ""
            }
          >
            {formatSenderName(msg).charAt(0).toUpperCase()}
          </button>
        )}

        {/* Content Area */}
        <div
          className={cn(
            "flex flex-col flex-1 min-w-0",
            isYou ? "items-end" : "items-start"
          )}
        >
          {/* Header (Name, Role, Time) */}
          <div className="flex items-center gap-1.5 mb-1 select-none">
            <span className="text-[10px] font-bold text-slate-500 dark:text-white/50">
              {formatSenderName(msg)}
            </span>
            {msg.senderRole === "admin" && (
              <span className="text-[8px] font-black uppercase bg-red-500/10 text-red-500 dark:bg-red-500/20 dark:text-red-400 px-1 py-0.25 rounded">
                Grandmaster
              </span>
            )}
            {msg.senderRole === "checker" && (
              <span className="text-[8px] font-black uppercase bg-blue-500/10 text-blue-500 dark:bg-blue-500/20 dark:text-blue-400 px-1 py-0.25 rounded">
                Overseer
              </span>
            )}
            {msg.senderRole === "judger" && (
              <span className="text-[8px] font-black uppercase bg-fuchsia-500/10 text-fuchsia-500 dark:bg-fuchsia-500/20 dark:text-fuchsia-400 px-1 py-0.25 rounded">
                Arbiter
              </span>
            )}
            {msg.senderRole === "recruiter" && (
              <span className="text-[8px] font-black uppercase bg-[#1F7A1F]/10 text-[#1F7A1F] dark:bg-[#1F7A1F]/20 dark:text-[#55f761] px-1 py-0.25 rounded">
                Mentor
              </span>
            )}
            {(msg.senderRole === "old" || msg.senderRole === "old-labeler") && (
              <span className="text-[8px] font-black uppercase bg-violet-500/10 text-violet-500 dark:bg-violet-500/20 dark:text-violet-400 px-1 py-0.25 rounded">
                OGXF
              </span>
            )}
            {msg.senderRole === "labeler" && (
              <span className="text-[8px] font-black uppercase bg-yellow-500/10 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-400 px-1 py-0.25 rounded">
                Challenger
              </span>
            )}
            {msg.senderRole === "applicant" && (
              <span className="text-[8px] font-black uppercase bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 px-1 py-0.25 rounded">
                Novice
              </span>
            )}
            {msg.senderRole === "moderator" && (
              <span className="text-[8px] font-black uppercase bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-400 px-1 py-0.25 rounded">
                Moderator
              </span>
            )}
            <span className="text-[8px] text-slate-400 dark:text-white/30 font-medium">
              {msg.createdAt
                ? new Date(msg.createdAt).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })
                : ""}
            </span>
          </div>

          {/* Replied Message Preview (Outside and separate from the bubble container) */}
          {msg.replyToId && (msg.replyToText || msg.imageUrl) && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onQuoteClick(msg.replyToId!);
              }}
              className={cn(
                "px-2.5 py-1.5 rounded-xl text-[11px] max-w-[85%] cursor-pointer transition-all text-left mb-1 shadow-xs border flex flex-col gap-0.5",
                "bg-slate-200/90 dark:bg-[#16202e] border-black/10 dark:border-white/10 hover:bg-slate-300 dark:hover:bg-[#1e2a3c]",
                isYou
                  ? "border-l-4 border-l-emerald-500 self-end"
                  : "border-l-4 border-l-amber-500 self-start"
              )}
            >
              <div className="flex items-center gap-1">
                <CornerUpLeft className="w-3 h-3 text-emerald-600 dark:text-emerald-400 opacity-80 shrink-0" />
                <span className="font-bold block text-[10px] text-slate-700 dark:text-white/80 truncate">
                  Replying to {msg.replyToSender || "User"}
                </span>
              </div>
              <span className="line-clamp-2 break-all italic text-slate-600 dark:text-white/60 text-[10px]">
                {msg.replyToText ? decodeHTMLEntities(msg.replyToText) : "[Photo]"}
              </span>
            </div>
          )}

          {/* Message Bubble & Actions */}
          <div className="flex items-center gap-1.5 max-w-[90%] group relative">
            {/* Hover Actions Strip (Reply + 3-Dots Menu) */}
            {msg.text !== "Message unsent" && !msg.id.startsWith("temp-") && (
              <div
                className={cn(
                  "flex items-center gap-0.5 relative flex-shrink-0 transition-opacity",
                  activeMenuMessageId === msg.id
                    ? "opacity-100 z-50"
                    : "opacity-0 group-hover:opacity-100",
                  isYou ? "order-first" : "order-last"
                )}
              >
                {/* Reply Icon Button */}
                {!isYou && (
                  <button
                    type="button"
                    onClick={() => onReply(msg)}
                    className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:text-white/40 dark:hover:text-white transition-colors cursor-pointer"
                    title="Reply to message"
                  >
                    <CornerUpLeft className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* 3-Dots Actions Trigger & Menu */}
                {(isYou || currentUser?.role?.trim()?.toLowerCase() === "admin") && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveMenuMessageId(
                          activeMenuMessageId === msg.id ? null : msg.id
                        );
                      }}
                      className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:text-white/40 dark:hover:text-white transition-colors cursor-pointer message-actions-trigger"
                      title="More options"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>

                    {/* Dropdown Menu */}
                    {activeMenuMessageId === msg.id && (
                      <div className={cn(
                        "absolute z-50 bg-white dark:bg-[#0d1520] border border-black/10 dark:border-white/10 rounded-xl py-1 shadow-xl w-28 text-left pointer-events-auto message-actions-menu",
                        (isLast || isSecondLast) ? "bottom-full mb-1" : "top-full mt-1",
                        isYou ? "left-0" : "right-0"
                      )}>
                        <button
                          type="button"
                          onClick={() => {
                            onReply(msg);
                            setActiveMenuMessageId(null);
                          }}
                          className="w-full px-3 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          Reply
                        </button>
                        {isYou && (
                          <button
                            type="button"
                            onClick={() => {
                              handleStartEdit(msg);
                              setActiveMenuMessageId(null);
                            }}
                            className="w-full px-3 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            Edit message
                          </button>
                        )}
                        {isYou && (
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmAction({
                                messageId: msg.id,
                                type: "unsend",
                              });
                              setActiveMenuMessageId(null);
                            }}
                            className="w-full px-3 py-1.5 text-[11px] font-semibold text-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            Unsend
                          </button>
                        )}
                        {(currentUser?.role?.trim()?.toLowerCase() === "admin" ||
                          currentUser?.role?.trim()?.toLowerCase() === "judger") && (
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmAction({
                                  messageId: msg.id,
                                  type: "delete",
                                });
                                setActiveMenuMessageId(null);
                              }}
                              className="w-full px-3 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-600/10 transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                              Delete message
                            </button>
                          )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Message Bubble itself */}
            <div
              onDoubleClick={() => onReply(msg)}
              className={cn(
                "px-3 py-2 rounded-2xl text-xs leading-relaxed shadow-sm transition-colors flex flex-col gap-1.5 select-text cursor-default",
                isYou
                  ? msg.text === "Message unsent"
                    ? "bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 text-slate-400 dark:text-white/40 rounded-tr-none"
                    : isPasserTab
                      ? "bg-amber-500 text-white rounded-tr-none font-medium"
                      : isOldTab
                        ? "bg-violet-500 text-white rounded-tr-none font-medium"
                        : "bg-[#1F7A1F] text-white rounded-tr-none font-medium"
                  : "bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 text-slate-800 dark:text-white/90 rounded-tl-none"
              )}
            >
              {/* Attached Image with on-demand click-to-render */}
              {msg.imageUrl && msg.text !== "Message unsent" && (
                showImage ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onImageClick(msg.imageUrl!);
                    }}
                    className="rounded-xl overflow-hidden max-w-full sm:max-w-xs cursor-zoom-in border border-black/10 dark:border-white/10 shadow-sm hover:opacity-95 transition-opacity my-0.5 block text-left"
                  >
                    <img
                      src={msg.imageUrl}
                      alt="Chat attachment"
                      className="w-full max-h-64 object-contain rounded-xl bg-black/5 dark:bg-black/20"
                      loading="lazy"
                    />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowImage(true);
                    }}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all duration-200 cursor-pointer my-0.5 group select-none",
                      isYou
                        ? "bg-black/15 hover:bg-black/25 dark:bg-white/15 dark:hover:bg-white/25 border-white/20 text-white"
                        : "bg-slate-200/80 hover:bg-slate-300 dark:bg-white/10 dark:hover:bg-white/15 border-black/10 dark:border-white/10 text-slate-800 dark:text-white"
                    )}
                    title="Click to view image"
                  >
                    <ImageIcon className="w-3.5 h-3.5 shrink-0 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-transform" />
                    <span>Show Image</span>
                  </button>
                )
              )}

              {/* Text Content */}
              {msg.text && (
                <span
                  className={cn(
                    "whitespace-pre-wrap break-words",
                    msg.text === "Message unsent" && "italic opacity-60"
                  )}
                >
                  {msg.text === "Message unsent"
                    ? decodeHTMLEntities(msg.text)
                    : renderMessageText(msg.text, msg.senderRole?.toLowerCase() === "admin" || msg.senderRole?.toLowerCase() === "judger")}
                  {msg.isEdited && msg.text !== "Message unsent" && (
                    <span className="text-[9px] opacity-45 ml-1 select-none">
                      (edited)
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChatWidget({
  currentUser,
  isStandardBuildingPassed,
}: ChatWidgetProps) {
  const userEmail = currentUser?.email;
  const userRole = currentUser?.role;
  const userGroupId = currentUser?.groupId;
  const userTeamId = currentUser?.teamId;
  const roleNorm = getNormalizedRole(userRole);

  const [availableRooms, setAvailableRooms] = useState<{ groupId: number; groupName: string; groupType: string; logoUrl?: string | null; }[]>([]);
  const [adminSelectedGroupId, setAdminSelectedGroupId] = useState<number | null>(null);
  const [adminSelectedTeamId, setAdminSelectedTeamId] = useState<number | null>(null);
  const [userGroupName, setUserGroupName] = useState<string | null>(null);
  const [userTeamName, setUserTeamName] = useState<string | null>(null);
  const [userGroupLogoUrl, setUserGroupLogoUrl] = useState<string | null>(null);
  const [userTeamLogoUrl, setUserTeamLogoUrl] = useState<string | null>(null);
  const [userTeamIdResolved, setUserTeamIdResolved] = useState<number | null>(null);

  const [groupSearchQuery, setGroupSearchQuery] = useState("");
  const [teamSearchQuery, setTeamSearchQuery] = useState("");
  const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(false);
  const [isTeamDropdownOpen, setIsTeamDropdownOpen] = useState(false);
  const groupDropdownRef = useRef<HTMLDivElement>(null);
  const teamDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (userRole?.toLowerCase() === "admin" || roleNorm === "judger") {
      getChatRoomsListAction().then((res) => {
        if (res.success && res.rooms) {
          setAvailableRooms(res.rooms);
          const firstGroup = res.rooms.find(r => r.groupType === "group");
          const firstTeam = res.rooms.find(r => r.groupType === "team");
          if (firstGroup) setAdminSelectedGroupId(firstGroup.groupId);
          if (firstTeam) setAdminSelectedTeamId(firstTeam.groupId);
        }
      });
    }
    if (userGroupId || userTeamId) {
      getUserGroupNamesAction(userGroupId || null, userTeamId || null).then((res) => {
        if (res.success) {
          if (res.groupName) setUserGroupName(res.groupName);
          if (res.groupLogoUrl) setUserGroupLogoUrl(res.groupLogoUrl);
          if (res.teamName) setUserTeamName(res.teamName);
          if (res.teamLogoUrl) setUserTeamLogoUrl(res.teamLogoUrl);
          if (res.teamId) setUserTeamIdResolved(res.teamId);
        }
      });
    }
  }, [userRole, userGroupId, userTeamId, roleNorm]);

  useEffect(() => {
    if (socketRef.current && roleNorm === "judger" && userRole?.toLowerCase() !== "admin") {
      availableRooms
        .filter((r) => r.groupType === "group")
        .forEach((r) => {
          socketRef.current?.emit("join_room", { chatType: `group-${r.groupId}` });
        });
    }
  }, [availableRooms, roleNorm, userRole]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (groupDropdownRef.current && !groupDropdownRef.current.contains(event.target as Node)) {
        setIsGroupDropdownOpen(false);
      }
      if (teamDropdownRef.current && !teamDropdownRef.current.contains(event.target as Node)) {
        setIsTeamDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const activeGroupId = (currentUser?.role?.toLowerCase() === "admin" || roleNorm === "judger") ? adminSelectedGroupId : userGroupId;
  const activeTeamId = (currentUser?.role?.toLowerCase() === "admin" || roleNorm === "judger") ? adminSelectedTeamId : (userTeamId || userTeamIdResolved);

  const activeGroupLogoUrl = (currentUser?.role?.toLowerCase() === "admin" || roleNorm === "judger")
    ? (availableRooms.find(r => r.groupId === activeGroupId)?.logoUrl || null)
    : userGroupLogoUrl;

  const activeTeamLogoUrl = (currentUser?.role?.toLowerCase() === "admin" || roleNorm === "judger")
    ? (availableRooms.find(r => r.groupId === activeTeamId)?.logoUrl || null)
    : userTeamLogoUrl;

  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(
    "applicants",
  );
  const [selectedUserDetails, setSelectedUserDetails] = useState<any | null>(
    null,
  );
  const [isFetchingUserDetails, setIsFetchingUserDetails] = useState(false);
  const [directMessages, setDirectMessages] = useState<{ id: string; subject: string; message: string; fromName: string; imageUrls?: string | null; isBroadcast?: boolean; createdAt?: Date | string }[]>([]);
  const directMessage = directMessages.length > 0 ? directMessages[0] : null;
  const [acknowledgeTimer, setAcknowledgeTimer] = useState(0);
  const [hasCheckedUnderstanding, setHasCheckedUnderstanding] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<{ applicants: number, passers: number, old: number, checker: number, judger: number, innerCouncil: number }>({ applicants: 0, passers: 0, old: 0, checker: 0, judger: 0, innerCouncil: 0 });

  // Image upload state for Admin and Judger
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (selectedImagePreview && selectedImagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(selectedImagePreview);
      }
    };
  }, [selectedImagePreview]);

  const handleImageSelect = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files can be attached.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image file size must be less than 10MB.");
      return;
    }
    if (selectedImagePreview && selectedImagePreview.startsWith("blob:")) {
      URL.revokeObjectURL(selectedImagePreview);
    }
    const previewUrl = URL.createObjectURL(file);
    setSelectedImageFile(file);
    setSelectedImagePreview(previewUrl);
  };

  const handleRemoveSelectedImage = () => {
    if (selectedImagePreview && selectedImagePreview.startsWith("blob:")) {
      URL.revokeObjectURL(selectedImagePreview);
    }
    setSelectedImageFile(null);
    setSelectedImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    if (!isImageAllowedInActiveTab) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDraggingOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!isImageAllowedInActiveTab) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!isImageAllowedInActiveTab) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setIsDraggingOver(false);
      dragCounter.current = 0;
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!isImageAllowedInActiveTab) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    dragCounter.current = 0;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const imageFile = files.find((f) => f.type.startsWith("image/"));
      if (imageFile) {
        handleImageSelect(imageFile);
      }
    }
  };

  useEffect(() => {
    if (directMessage) {
      setHasCheckedUnderstanding(false);
      setAcknowledgeTimer(10);
    }
  }, [directMessage]);

  // The welcome message is created by an API route, so it doesn't arrive as
  // receive_direct_message until the next reconnect — WelcomeTermsModal hands it over.
  useEffect(() => {
    const handleWelcomeMessage = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (!msg?.id) return;
      setDirectMessages((prev) => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, {
          id: msg.id,
          subject: msg.subject,
          message: msg.message,
          fromName: msg.fromName,
          imageUrls: msg.imageUrls,
          isBroadcast: false,
          createdAt: msg.createdAt
        }];
      });
    };
    window.addEventListener("welcome_message_created", handleWelcomeMessage);
    return () => window.removeEventListener("welcome_message_created", handleWelcomeMessage);
  }, []);

  useEffect(() => {
    if (hasCheckedUnderstanding && acknowledgeTimer > 0) {
      const timer = setTimeout(() => setAcknowledgeTimer(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [hasCheckedUnderstanding, acknowledgeTimer]);

  const handleAvatarClick = async (senderNameOrEmail: string) => {
    const role = currentUser?.role?.toLowerCase();
    if (role !== "admin") return;

    setIsFetchingUserDetails(true);
    try {
      const res = await getUserDetailsAction(senderNameOrEmail);
      if (res.success && res.user) {
        setSelectedUserDetails(res.user);
      } else {
        toast.error(res.error || "Failed to load user details");
      }
    } catch (err) {
      console.error("Error fetching user details:", err);
      toast.error("An error occurred while loading user details");
    } finally {
      setIsFetchingUserDetails(false);
    }
  };

  // Chat messages state loaded from server
  const [applicantMessages, setApplicantMessages] = useState<Message[]>([]);
  const [passerMessages, setPasserMessages] = useState<Message[]>([]);
  const [oldMessages, setOldMessages] = useState<Message[]>([]);
  const [checkerMessages, setCheckerMessages] = useState<Message[]>([]);
  const [judgerMessages, setJudgerMessages] = useState<Message[]>([]);
  const [innerCouncilMessages, setInnerCouncilMessages] = useState<Message[]>([]);
  const [groupMessages, setGroupMessages] = useState<Message[]>([]);
  const [teamMessages, setTeamMessages] = useState<Message[]>([]);

  // Unread message counts
  const [unreadApplicants, setUnreadApplicants] = useState(0);
  const [unreadPassers, setUnreadPassers] = useState(0);
  const [unreadOld, setUnreadOld] = useState(0);
  const [unreadChecker, setUnreadChecker] = useState(0);
  const [unreadJudger, setUnreadJudger] = useState(0);
  const [unreadInnerCouncil, setUnreadInnerCouncil] = useState(0);
  const [unreadGroup, setUnreadGroup] = useState(0);
  const [groupUnreads, setGroupUnreads] = useState<Record<number, number>>({});
  const [unreadTeam, setUnreadTeam] = useState(0);

  // Tracking last seen message IDs to calculate unread counts (persisted in localStorage)
  const [lastSeenApplicantId, setLastSeenApplicantId] = useState<string | null>(
    () => {
      if (typeof window !== "undefined") {
        return localStorage.getItem("chat_last_seen_applicant");
      }
      return null;
    },
  );
  const [lastSeenPasserId, setLastSeenPasserId] = useState<string | null>(
    () => {
      if (typeof window !== "undefined") {
        return localStorage.getItem("chat_last_seen_passer");
      }
      return null;
    },
  );
  const [lastSeenOldId, setLastSeenOldId] = useState<string | null>(
    () => {
      if (typeof window !== "undefined") {
        return localStorage.getItem("chat_last_seen_old");
      }
      return null;
    },
  );
  const [lastSeenCheckerId, setLastSeenCheckerId] = useState<string | null>(
    () => {
      if (typeof window !== "undefined") {
        return localStorage.getItem("chat_last_seen_checker");
      }
      return null;
    },
  );
  const [lastSeenJudgerId, setLastSeenJudgerId] = useState<string | null>(
    () => {
      if (typeof window !== "undefined") {
        return localStorage.getItem("chat_last_seen_judger");
      }
      return null;
    },
  );
  const [lastSeenInnerCouncilId, setLastSeenInnerCouncilId] = useState<string | null>(
    () => {
      if (typeof window !== "undefined") {
        return localStorage.getItem("chat_last_seen_inner_council");
      }
      return null;
    },
  );
  const [lastSeenGroupId, setLastSeenGroupId] = useState<string | null>(
    () => {
      if (typeof window !== "undefined") {
        return localStorage.getItem("chat_last_seen_group");
      }
      return null;
    },
  );
  const [lastSeenTeamId, setLastSeenTeamId] = useState<string | null>(
    () => {
      if (typeof window !== "undefined") {
        return localStorage.getItem("chat_last_seen_team");
      }
      return null;
    },
  );

  const [inputValue, setInputValue] = useState("");



  // Message unsend/delete confirmation dialog state
  const [confirmAction, setConfirmAction] = useState<{
    messageId: string;
    type: "unsend" | "delete";
  } | null>(null);

  // Active 3-dots dropdown menu state
  const [activeMenuMessageId, setActiveMenuMessageId] = useState<string | null>(
    null,
  );

  // Message currently being edited
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);

  // Message currently being replied to
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);

  // Highlighted message state for flash effect
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const handleQuoteClick = (replyToId: string) => {
    const element = document.getElementById(`msg-${replyToId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedMessageId(replyToId);
      setTimeout(() => {
        setHighlightedMessageId(null);
      }, 2000);
    } else {
      toast.error("Original message not found in active session history");
    }
  };
  // Emoji picker state and ref
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const socketRef = useRef<Socket | null>(null);

  // Keep track of the active tab and open state in refs for the polling interval
  const activeTabRef = useRef(activeTab);
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    activeTabRef.current = activeTab;
    if (socketRef.current) {
      socketRef.current.emit("chat_widget_status", { isOpen: isOpenRef.current, activeTab });
    }
  }, [activeTab]);

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (socketRef.current) {
      socketRef.current.emit("chat_widget_status", { isOpen, activeTab: activeTabRef.current });
    }
    if (isOpen) {
      // Reset unread count for current active tab when widget is opened
      if (activeTab === "applicants") {
        setUnreadApplicants(0);
        if (applicantMessages.length > 0) {
          const lastId = applicantMessages[applicantMessages.length - 1].id;
          setLastSeenApplicantId(lastId);
          localStorage.setItem("chat_last_seen_applicant", lastId);
        }
      } else if (activeTab === "passers") {
        setUnreadPassers(0);
        if (passerMessages.length > 0) {
          const lastId = passerMessages[passerMessages.length - 1].id;
          setLastSeenPasserId(lastId);
          localStorage.setItem("chat_last_seen_passer", lastId);
        }
      } else if (activeTab === "old") {
        setUnreadOld(0);
        if (oldMessages.length > 0) {
          const lastId = oldMessages[oldMessages.length - 1].id;
          setLastSeenOldId(lastId);
          localStorage.setItem("chat_last_seen_old", lastId);
        }
      } else if (activeTab === "checker") {
        setUnreadChecker(0);
        if (checkerMessages.length > 0) {
          const lastId = checkerMessages[checkerMessages.length - 1].id;
          setLastSeenCheckerId(lastId);
          localStorage.setItem("chat_last_seen_checker", lastId);
        }
      } else if (activeTab === "judger") {
        setUnreadJudger(0);
        if (judgerMessages.length > 0) {
          const lastId = judgerMessages[judgerMessages.length - 1].id;
          setLastSeenJudgerId(lastId);
          localStorage.setItem("chat_last_seen_judger", lastId);
        }
      } else if (activeTab === "inner-council") {
        setUnreadInnerCouncil(0);
        if (innerCouncilMessages.length > 0) {
          const lastId = innerCouncilMessages[innerCouncilMessages.length - 1].id;
          setLastSeenInnerCouncilId(lastId);
          localStorage.setItem("chat_last_seen_inner_council", lastId);
        }
      } else if (activeTab.startsWith("group-")) {
        setUnreadGroup(0);
        if (groupMessages.length > 0) {
          const lastId = groupMessages[groupMessages.length - 1].id;
          setLastSeenGroupId(lastId);
          localStorage.setItem("chat_last_seen_group", lastId);
        }
      } else if (activeTab.startsWith("team-")) {
        setUnreadTeam(0);
        if (teamMessages.length > 0) {
          const lastId = teamMessages[teamMessages.length - 1].id;
          setLastSeenTeamId(lastId);
          localStorage.setItem("chat_last_seen_team", lastId);
        }
      }
    }
  }, [
    isOpen,
    activeTab,
    applicantMessages,
    passerMessages,
    oldMessages,
    checkerMessages,
    judgerMessages,
    innerCouncilMessages,
    groupMessages,
    teamMessages,
  ]);

  // Load room history on-demand when active tab is selected and chat is open
  useEffect(() => {
    if (isOpen && activeTab && socketRef.current) {
      socketRef.current.emit("get_room_history", { chatType: activeTab });
    }
  }, [isOpen, activeTab]);

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close active 3-dots menu when clicking outside
  useEffect(() => {
    const handleClickOutsideMenu = (event: MouseEvent) => {
      if (activeMenuMessageId) {
        const target = event.target as Element;
        const clickedButton = target.closest(".message-actions-trigger");
        const clickedMenu = target.closest(".message-actions-menu");
        if (!clickedButton && !clickedMenu) {
          setActiveMenuMessageId(null);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutsideMenu);
    return () =>
      document.removeEventListener("mousedown", handleClickOutsideMenu);
  }, [activeMenuMessageId]);

  const handleEmojiClick = (emoji: string) => {
    setInputValue((prev) => prev + emoji);
  };

  // Scroll to bottom when messages change
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => scrollToBottom("auto"), 100);
    }
  }, [isOpen, activeTab]);

  const chatCtx = {
    role: currentUser?.role,
    isStandardBuildingPassed,
  };
  const showPasserChat = GATES.canAccessChatTab("passers", chatCtx);
  const showOldChat = GATES.canAccessChatTab("old", chatCtx);
  const showCheckerChat = GATES.canAccessChatTab("checker", chatCtx);
  const showJudgerChat = GATES.canAccessChatTab("judger", chatCtx);
  const showInnerCouncilChat = GATES.canAccessChatTab("inner-council", chatCtx);


  const isAdminOrJudger = currentUser?.role?.toLowerCase() === "admin" || roleNorm === "judger";
  const isImageAllowedInActiveTab = (() => {
    return roleNorm === "recruiter" || roleNorm === "checker" || roleNorm === "judger" || roleNorm === "admin";
  })();
  const showTeamChat = isAdminOrJudger
    ? adminSelectedTeamId !== null
    : (roleNorm === "checker") && (currentUser.teamId || userTeamIdResolved) !== null && (currentUser.teamId || userTeamIdResolved) !== undefined && userTeamName !== null;
  const showGroupChat = isAdminOrJudger
    ? adminSelectedGroupId !== null
    : (roleNorm === "checker" || roleNorm === "recruiter" || roleNorm === "labeler" || roleNorm === "applicant" || roleNorm === "old-labeler" || roleNorm === "unknown") && currentUser.groupId !== undefined && currentUser.groupId !== null && userGroupName !== null;

  // Setup Socket.io connection and listeners
  useEffect(() => {
    if (!userEmail) return;

    let socket: Socket | null = null;

    const connectSocket = () => {
      if (socket) return;

      socket = io(SOCKET_URL, {
        auth: {
          token: getCookie("xnite_session"),
          isStandardBuildingPassed,
          client: "chat",
        },
        transports: ["websocket"],
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        randomizationFactor: 0.5,
        autoConnect: true,
      });

      socketRef.current = socket;

      socket.on("connect", () => {
        if (socket) {
          socket.emit("chat_widget_status", { isOpen: isOpenRef.current, activeTab: activeTabRef.current });
        }
        // Join standard rooms
        if (socket) {
          const chatCtx = {
            role: userRole,
            isStandardBuildingPassed,
          };
          if (GATES.canAccessChatTab("applicants", chatCtx)) {
            socket.emit("join_room", { chatType: "applicants" });
          }
          if (GATES.canAccessChatTab("passers", chatCtx)) {
            socket.emit("join_room", { chatType: "passers" });
          }
          if (GATES.canAccessChatTab("old", chatCtx)) {
            socket.emit("join_room", { chatType: "old" });
          }
          if (GATES.canAccessChatTab("checker", chatCtx)) {
            socket.emit("join_room", { chatType: "checker" });
          }
          if (GATES.canAccessChatTab("judger", chatCtx)) {
            socket.emit("join_room", { chatType: "judger" });
          }
          if (GATES.canAccessChatTab("inner-council", chatCtx)) {
            socket.emit("join_room", { chatType: "inner-council" });
          }

          // Join dynamic room channels
          if (showTeamChat && activeTeamId) {
            socket.emit("join_room", { chatType: `team-${activeTeamId}` });
          }
          if (showGroupChat && activeGroupId) {
            socket.emit("join_room", { chatType: `group-${activeGroupId}` });
          }
          if (roleNorm === "judger" && userRole?.toLowerCase() !== "admin") {
            availableRooms
              .filter((r) => r.groupType === "group")
              .forEach((r) => {
                socket?.emit("join_room", { chatType: `group-${r.groupId}` });
              });
          }

          // Build lastSeenData and fetch unread counts
          const lastSeenData: Record<string, string | null> = {
            applicants: localStorage.getItem("chat_last_seen_applicant"),
            passers: localStorage.getItem("chat_last_seen_passer"),
            old: localStorage.getItem("chat_last_seen_old"),
            checker: localStorage.getItem("chat_last_seen_checker"),
            judger: localStorage.getItem("chat_last_seen_judger"),
            "inner-council": localStorage.getItem("chat_last_seen_inner_council"),
          };
          if (activeTeamId) {
            lastSeenData[`team-${activeTeamId}`] = localStorage.getItem("chat_last_seen_team");
          }
          if (activeGroupId) {
            lastSeenData[`group-${activeGroupId}`] = localStorage.getItem(`chat_last_seen_group_${activeGroupId}`) || localStorage.getItem("chat_last_seen_group");
          }
          if (roleNorm === "judger" && userRole?.toLowerCase() !== "admin") {
            availableRooms
              .filter((r) => r.groupType === "group")
              .forEach((r) => {
                lastSeenData[`group-${r.groupId}`] = localStorage.getItem(`chat_last_seen_group_${r.groupId}`) || localStorage.getItem("chat_last_seen_group");
              });
          }
          socket.emit("get_unread_counts", lastSeenData);
        }
      });

      socket.on("unread_counts_response", (counts: Record<string, number>) => {
        if (!counts) return;
        if (counts.applicants !== undefined) setUnreadApplicants(counts.applicants);
        if (counts.passers !== undefined) setUnreadPassers(counts.passers);
        if (counts.old !== undefined) setUnreadOld(counts.old);
        if (counts.checker !== undefined) setUnreadChecker(counts.checker);
        if (counts.judger !== undefined) setUnreadJudger(counts.judger);
        if (counts["inner-council"] !== undefined) setUnreadInnerCouncil(counts["inner-council"]);
        if (activeTeamId && counts[`team-${activeTeamId}`] !== undefined) {
          setUnreadTeam(counts[`team-${activeTeamId}`]);
        } else if (counts.team !== undefined) {
          setUnreadTeam(counts.team);
        }
        if (activeGroupId && counts[`group-${activeGroupId}`] !== undefined) {
          setUnreadGroup(counts[`group-${activeGroupId}`]);
        } else if (counts.group !== undefined) {
          setUnreadGroup(counts.group);
        }

        const updatedGroupUnreads: Record<number, number> = {};
        availableRooms
          .filter((r) => r.groupType === "group")
          .forEach((r) => {
            const gCount = counts[`group-${r.groupId}`];
            if (gCount !== undefined) {
              updatedGroupUnreads[r.groupId] = gCount;
            }
          });
        setGroupUnreads(prev => ({ ...prev, ...updatedGroupUnreads }));
      });

      socket.on("chat_widget_online_count", (counts: { applicants: number, passers: number, old: number, checker: number, judger: number, innerCouncil: number }) => {
        setOnlineUsers(counts);
      });

      socket.on("initial_messages", ({ chatType, messages }) => {
        const formattedMessages = messages.map((m: any) => ({
          ...m,
          createdAt: new Date(m.createdAt),
        }));

        const processMessages = (
          setMsgs: React.Dispatch<React.SetStateAction<Message[]>>,
          setLastSeenId: React.Dispatch<React.SetStateAction<string | null>>,
          setUnreadCount: React.Dispatch<React.SetStateAction<number>>,
          localStorageKey: string
        ) => {
          setMsgs(formattedMessages);
          if (formattedMessages.length > 0) {
            const lastMsgId = formattedMessages[formattedMessages.length - 1].id;
            const currentTab = activeTabRef.current;
            const currentOpen = isOpenRef.current;
            if (currentOpen && currentTab === chatType) {
              setLastSeenId(lastMsgId);
              localStorage.setItem(localStorageKey, lastMsgId);
              setUnreadCount(0);
            } else {
              const savedLastSeen = localStorage.getItem(localStorageKey);
              if (savedLastSeen) {
                const lastSeenIndex = formattedMessages.findIndex((m: any) => m.id === savedLastSeen);
                if (lastSeenIndex !== -1) {
                  setUnreadCount(formattedMessages.length - 1 - lastSeenIndex);
                } else {
                  setUnreadCount(formattedMessages.length);
                }
              } else {
                setLastSeenId(lastMsgId);
                localStorage.setItem(localStorageKey, lastMsgId);
                setUnreadCount(0);
              }
            }
          }
        };

        if (chatType === "applicants") {
          processMessages(setApplicantMessages, setLastSeenApplicantId, setUnreadApplicants, "chat_last_seen_applicant");
        } else if (chatType === "passers") {
          processMessages(setPasserMessages, setLastSeenPasserId, setUnreadPassers, "chat_last_seen_passer");
        } else if (chatType === "old") {
          processMessages(setOldMessages, setLastSeenOldId, setUnreadOld, "chat_last_seen_old");
        } else if (chatType === "checker") {
          processMessages(setCheckerMessages, setLastSeenCheckerId, setUnreadChecker, "chat_last_seen_checker");
        } else if (chatType === "judger") {
          processMessages(setJudgerMessages, setLastSeenJudgerId, setUnreadJudger, "chat_last_seen_judger");
        } else if (chatType === "inner-council") {
          processMessages(setInnerCouncilMessages, setLastSeenInnerCouncilId, setUnreadInnerCouncil, "chat_last_seen_inner_council");
        } else if (chatType.startsWith("group-")) {
          const gId = parseInt(chatType.substring(6), 10);
          if (!isNaN(gId)) {
            const isCurrentActiveGroup = activeTabRef.current === chatType && isOpenRef.current;
            if (isCurrentActiveGroup) {
              setGroupMessages(formattedMessages);
              if (formattedMessages.length > 0) {
                const lastMsgId = formattedMessages[formattedMessages.length - 1].id;
                setLastSeenGroupId(lastMsgId);
                localStorage.setItem(`chat_last_seen_group_${gId}`, lastMsgId);
              }
              setGroupUnreads((prev) => ({ ...prev, [gId]: 0 }));
            } else {
              if (activeTabRef.current === chatType) {
                setGroupMessages(formattedMessages);
              }
              if (formattedMessages.length > 0) {
                const lastMsgId = formattedMessages[formattedMessages.length - 1].id;
                const savedLastSeen = localStorage.getItem(`chat_last_seen_group_${gId}`) || localStorage.getItem("chat_last_seen_group");
                if (savedLastSeen) {
                  const lastSeenIndex = formattedMessages.findIndex((m: any) => m.id === savedLastSeen);
                  const count = lastSeenIndex !== -1 ? formattedMessages.length - 1 - lastSeenIndex : formattedMessages.length;
                  setGroupUnreads((prev) => ({ ...prev, [gId]: count }));
                } else {
                  setGroupUnreads((prev) => ({ ...prev, [gId]: 0 }));
                  localStorage.setItem(`chat_last_seen_group_${gId}`, lastMsgId);
                }
              }
            }
          } else {
            processMessages(setGroupMessages, setLastSeenGroupId, setUnreadGroup, "chat_last_seen_group");
          }
        } else if (chatType.startsWith("team-")) {
          processMessages(setTeamMessages, setLastSeenTeamId, setUnreadTeam, "chat_last_seen_team");
        }
      });

      socket.on("receive_direct_message", (msg) => {
        // Prevent payout announcements from showing as popups (they only go to header notifications)
        if (msg.isAnnouncement) return;

        setDirectMessages((prev) => {
          // Prevent duplicates if server sends the same message twice
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, {
            id: msg.id,
            subject: msg.subject,
            message: msg.message,
            fromName: msg.fromName,
            imageUrls: msg.imageUrls,
            isBroadcast: msg.isBroadcast,
            createdAt: msg.createdAt
          }];
        });
      });

      socket.on("new_message", ({ chatType, message }) => {
        const formattedMessage = {
          ...message,
          createdAt: new Date(message.createdAt),
        };

        const processNewMessage = (
          setMsgs: React.Dispatch<React.SetStateAction<Message[]>>,
          setUnreadCount: React.Dispatch<React.SetStateAction<number>>,
          setLastSeenId: React.Dispatch<React.SetStateAction<string | null>>,
          localStorageKey: string
        ) => {
          setMsgs((prev) => {
            if (prev.some((m) => m.id === message.id)) return prev;
            const filtered = prev.filter((m) => !m.id.startsWith("temp-"));
            return [...filtered, formattedMessage].slice(-100);
          });

          const currentTab = activeTabRef.current;
          const currentOpen = isOpenRef.current;
          if (!currentOpen || currentTab !== chatType) {
            setUnreadCount((prev) => prev + 1);
          } else {
            setLastSeenId(message.id);
            localStorage.setItem(localStorageKey, message.id);
          }
        };

        if (chatType === "applicants") {
          processNewMessage(setApplicantMessages, setUnreadApplicants, setLastSeenApplicantId, "chat_last_seen_applicant");
        } else if (chatType === "passers") {
          processNewMessage(setPasserMessages, setUnreadPassers, setLastSeenPasserId, "chat_last_seen_passer");
        } else if (chatType === "old") {
          processNewMessage(setOldMessages, setUnreadOld, setLastSeenOldId, "chat_last_seen_old");
        } else if (chatType === "checker") {
          processNewMessage(setCheckerMessages, setUnreadChecker, setLastSeenCheckerId, "chat_last_seen_checker");
        } else if (chatType === "judger") {
          processNewMessage(setJudgerMessages, setUnreadJudger, setLastSeenJudgerId, "chat_last_seen_judger");
        } else if (chatType === "inner-council") {
          processNewMessage(setInnerCouncilMessages, setUnreadInnerCouncil, setLastSeenInnerCouncilId, "chat_last_seen_inner_council");
        } else if (chatType.startsWith("group-")) {
          const gId = parseInt(chatType.substring(6), 10);
          if (!isNaN(gId)) {
            const isCurrentActiveGroup = activeTabRef.current === chatType && isOpenRef.current;
            if (isCurrentActiveGroup) {
              setGroupMessages((prev) => {
                if (prev.some((m) => m.id === message.id)) return prev;
                const filtered = prev.filter((m) => !m.id.startsWith("temp-"));
                return [...filtered, formattedMessage].slice(-100);
              });
              setLastSeenGroupId(message.id);
              localStorage.setItem(`chat_last_seen_group_${gId}`, message.id);
              setGroupUnreads((prev) => ({ ...prev, [gId]: 0 }));
            } else {
              if (activeTabRef.current === chatType) {
                setGroupMessages((prev) => {
                  if (prev.some((m) => m.id === message.id)) return prev;
                  const filtered = prev.filter((m) => !m.id.startsWith("temp-"));
                  return [...filtered, formattedMessage].slice(-100);
                });
              }
              setGroupUnreads((prev) => ({ ...prev, [gId]: (prev[gId] || 0) + 1 }));
            }
          } else {
            processNewMessage(setGroupMessages, setUnreadGroup, setLastSeenGroupId, "chat_last_seen_group");
          }
        } else if (chatType.startsWith("team-")) {
          processNewMessage(setTeamMessages, setUnreadTeam, setLastSeenTeamId, "chat_last_seen_team");
        }
        setTimeout(scrollToBottom, 100);
      });

      socket.on("message_edited", ({ chatType, message }) => {
        const formattedMessage = {
          ...message,
          createdAt: new Date(message.createdAt),
        };
        const updateMessages = (prev: Message[]) =>
          prev.map((m) => (m.id === message.id ? formattedMessage : m));

        if (chatType === "applicants") {
          setApplicantMessages(updateMessages);
        } else if (chatType === "passers") {
          setPasserMessages(updateMessages);
        } else if (chatType === "old") {
          setOldMessages(updateMessages);
        } else if (chatType === "checker") {
          setCheckerMessages(updateMessages);
        } else if (chatType === "judger") {
          setJudgerMessages(updateMessages);
        } else if (chatType === "inner-council") {
          setInnerCouncilMessages(updateMessages);
        } else if (chatType.startsWith("group-")) {
          setGroupMessages(updateMessages);
        } else if (chatType.startsWith("team-")) {
          setTeamMessages(updateMessages);
        }
      });

      socket.on("message_deleted", ({ chatType, message }) => {
        const formattedMessage = {
          ...message,
          createdAt: new Date(message.createdAt),
        };
        const updateMessages = (prev: Message[]) =>
          prev.map((m) => (m.id === message.id ? formattedMessage : m));

        if (chatType === "applicants") {
          setApplicantMessages(updateMessages);
        } else if (chatType === "passers") {
          setPasserMessages(updateMessages);
        } else if (chatType === "old") {
          setOldMessages(updateMessages);
        } else if (chatType === "checker") {
          setCheckerMessages(updateMessages);
        } else if (chatType === "judger") {
          setJudgerMessages(updateMessages);
        } else if (chatType === "inner-council") {
          setInnerCouncilMessages(updateMessages);
        } else if (chatType.startsWith("group-")) {
          setGroupMessages(updateMessages);
        } else if (chatType.startsWith("team-")) {
          setTeamMessages(updateMessages);
        }
      });

      // We handle message updates (including unsend/delete) via the message_deleted and message_removed listeners.
      socket.on("message_removed", ({ chatType, messageId }) => {
        const updateMessages = (prev: Message[]) =>
          prev.filter((m) => m.id !== messageId);

        if (chatType === "applicants") {
          setApplicantMessages(updateMessages);
        } else if (chatType === "passers") {
          setPasserMessages(updateMessages);
        } else if (chatType === "old") {
          setOldMessages(updateMessages);
        } else if (chatType === "checker") {
          setCheckerMessages(updateMessages);
        } else if (chatType === "judger") {
          setJudgerMessages(updateMessages);
        } else if (chatType === "inner-council") {
          setInnerCouncilMessages(updateMessages);
        } else if (chatType.startsWith("group-")) {
          setGroupMessages(updateMessages);
        } else if (chatType.startsWith("team-")) {
          setTeamMessages(updateMessages);
        }
      });

      socket.on("error_message", (err) => {
        // Room-access errors mean the tab/bubble shouldn't be visible at all —
        // fail silently instead of surfacing a toast the user can't act on.
        const isRoomAccessError =
          typeof err === "string" &&
          (err === "Invalid room name" ||
            err.includes("Lounge is locked") ||
            err.includes("do not have access to this chat room"));

        if (isRoomAccessError) {
          console.warn("[Socket] Room access denied (silenced):", err);
          return;
        }

        toast.error(err);
      });

      // Listen for global salary toggle events
      socket.on("salaries_updated", ({ disabled }) => {
        window.dispatchEvent(new CustomEvent("salaries_updated", { detail: { disabled } }));
      });

      socket.on("disconnect", () => {
      });
    };

    const disconnectSocket = () => {
      if (socket) {
        socket.disconnect();
        socket = null;
        socketRef.current = null;
      }
    };

    // Connect initially
    connectSocket();

    // Disconnect tabs that stay hidden, to free their connection. An idle socket costs
    // the server almost nothing, while every reconnect re-runs auth, room joins, unread
    // counts and the online-count broadcasts — so only give up the connection after
    // the tab has been hidden for a while, not on every quick tab switch.
    const HIDDEN_DISCONNECT_MS = 5 * 60 * 1000;
    let visibilityTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleVisibilityChange = () => {
      if (visibilityTimeout) {
        clearTimeout(visibilityTimeout);
        visibilityTimeout = null;
      }

      if (document.hidden) {
        visibilityTimeout = setTimeout(() => {
          if (!process.env.NEXT_PUBLIC_IS_LOCAL) {
            disconnectSocket();
          }
        }, HIDDEN_DISCONNECT_MS);
      } else {
        visibilityTimeout = setTimeout(() => {
          if (!process.env.NEXT_PUBLIC_IS_LOCAL) {
            connectSocket();
          }
        }, 300);
      }
    };

    const handleTriggerToggle = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (socketRef.current) {
        socketRef.current.emit("salaries_toggled", { disabled: customEvent.detail.disabled });
      }
    };

    window.addEventListener("trigger_salary_toggle", handleTriggerToggle);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (visibilityTimeout) clearTimeout(visibilityTimeout);
      window.removeEventListener("trigger_salary_toggle", handleTriggerToggle);
      disconnectSocket();
    };
  }, [
    userEmail,
    userRole,
    activeGroupId,
    activeTeamId,
    showGroupChat,
    showTeamChat,
    isStandardBuildingPassed
  ]);

  // Reset unread count when switching tabs
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === "applicants") {
      setUnreadApplicants(0);
      if (applicantMessages.length > 0) {
        const lastId = applicantMessages[applicantMessages.length - 1].id;
        setLastSeenApplicantId(lastId);
        localStorage.setItem("chat_last_seen_applicant", lastId);
      }
    } else if (tab === "passers") {
      setUnreadPassers(0);
      if (passerMessages.length > 0) {
        const lastId = passerMessages[passerMessages.length - 1].id;
        setLastSeenPasserId(lastId);
        localStorage.setItem("chat_last_seen_passer", lastId);
      }
    } else if (tab === "old") {
      setUnreadOld(0);
      if (oldMessages.length > 0) {
        const lastId = oldMessages[oldMessages.length - 1].id;
        setLastSeenOldId(lastId);
        localStorage.setItem("chat_last_seen_old", lastId);
      }
    } else if (tab === "checker") {
      setUnreadChecker(0);
      if (checkerMessages.length > 0) {
        const lastId = checkerMessages[checkerMessages.length - 1].id;
        setLastSeenCheckerId(lastId);
        localStorage.setItem("chat_last_seen_checker", lastId);
      }
    } else if (tab === "judger") {
      setUnreadJudger(0);
      if (judgerMessages.length > 0) {
        const lastId = judgerMessages[judgerMessages.length - 1].id;
        setLastSeenJudgerId(lastId);
        localStorage.setItem("chat_last_seen_judger", lastId);
      }
    } else if (tab === "inner-council") {
      setUnreadInnerCouncil(0);
      if (innerCouncilMessages.length > 0) {
        const lastId = innerCouncilMessages[innerCouncilMessages.length - 1].id;
        setLastSeenInnerCouncilId(lastId);
        localStorage.setItem("chat_last_seen_inner_council", lastId);
      }
    } else if (tab.startsWith("group-")) {
      const gId = parseInt(tab.substring(6), 10);
      if (!isNaN(gId)) {
        setGroupUnreads((prev) => ({ ...prev, [gId]: 0 }));
      }
      setUnreadGroup(0);
      if (groupMessages.length > 0) {
        const lastId = groupMessages[groupMessages.length - 1].id;
        setLastSeenGroupId(lastId);
        if (!isNaN(gId)) {
          localStorage.setItem(`chat_last_seen_group_${gId}`, lastId);
        }
        localStorage.setItem("chat_last_seen_group", lastId);
      }
    } else if (tab.startsWith("team-")) {
      setUnreadTeam(0);
      if (teamMessages.length > 0) {
        const lastId = teamMessages[teamMessages.length - 1].id;
        setLastSeenTeamId(lastId);
        localStorage.setItem("chat_last_seen_team", lastId);
      }
    }

    if (!isImageAllowedInActiveTab && selectedImageFile) {
      handleRemoveSelectedImage();
    }
  };

  const toggleChat = () => {
    setIsOpen(!isOpen);
  };

  const toggleMaximize = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMaximized(!isMaximized);
  };

  // Send Message Handler
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const textToSend = inputValue;
    const imageFileToSend = selectedImageFile;

    if (!textToSend.trim() && !imageFileToSend) return;

    const BANNED_WORDS = ["bitmappro", "ryu", "glimmertech", "glim", "zybryx"];
    const containsBanned = BANNED_WORDS.some(word => textToSend.toLowerCase().includes(word));
    if (containsBanned) {
      setInputValue("");
      return;
    }

    const isAdminOrJudger = currentUser?.role?.trim()?.toLowerCase() === "admin" || roleNorm === "judger";

    if (hasDisallowedDomain(textToSend) && !isAdminOrJudger) {
      setInputValue("");
      return;
    }

    let uploadedImageUrl: string | null = null;

    if (imageFileToSend) {
      if (!isImageAllowedInActiveTab) {
        toast.error("You do not have permission to send images.");
        return;
      }
      try {
        setIsUploadingImage(true);
        const formData = new FormData();
        formData.append("file", imageFileToSend);
        formData.append("channel", activeTab);

        const res = await fetch("/api/chat/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok || !data.success || !data.url) {
          throw new Error(data.error || "Failed to upload image");
        }
        uploadedImageUrl = data.url;
      } catch (err: any) {
        console.error("Image upload error:", err);
        toast.error(err.message || "Failed to upload image");
        setIsUploadingImage(false);
        return;
      } finally {
        setIsUploadingImage(false);
      }
    }

    setInputValue("");
    handleRemoveSelectedImage();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.overflowY = "hidden";
    }

    // Optimistic UI update
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      chatType: activeTab,
      sender: currentUser?.name || currentUser?.email || "You",
      senderRole:
        currentUser?.role?.toLowerCase() === "admin"
          ? "admin"
          : roleNorm === "judger"
            ? "judger"
            : currentUser?.role?.toLowerCase() === "checker"
              ? "checker"
              : currentUser?.role?.toLowerCase() === "recruiter"
                ? "recruiter"
                : ["old-labeler", "old-laber", "old labeler"].includes(currentUser?.role?.trim()?.toLowerCase() || "")
                  ? "old"
                  : currentUser?.role?.toLowerCase() === "labeler"
                    ? "labeler"
                    : currentUser?.role?.toLowerCase() === "applicant"
                      ? "applicant"
                      : "member",
      text: textToSend,
      imageUrl: uploadedImageUrl,
      createdAt: new Date(),
      replyToId: replyToMessage ? replyToMessage.id : null,
      replyToSender: replyToMessage ? formatSenderName(replyToMessage) : null,
      replyToText: replyToMessage ? (replyToMessage.text || (replyToMessage.imageUrl ? "[Photo]" : null)) : null,
    };

    if (activeTab === "applicants") {
      setApplicantMessages((prev) => [...prev, optimisticMessage]);
    } else if (activeTab === "passers") {
      setPasserMessages((prev) => [...prev, optimisticMessage]);
    } else if (activeTab === "old") {
      setOldMessages((prev) => [...prev, optimisticMessage]);
    } else if (activeTab === "checker") {
      setCheckerMessages((prev) => [...prev, optimisticMessage]);
    } else if (activeTab === "judger") {
      setJudgerMessages((prev) => [...prev, optimisticMessage]);
    } else if (activeTab === "inner-council") {
      setInnerCouncilMessages((prev) => [...prev, optimisticMessage]);
    } else if (activeTab.startsWith("group-")) {
      setGroupMessages((prev) => [...prev, optimisticMessage]);
    } else if (activeTab.startsWith("team-")) {
      setTeamMessages((prev) => [...prev, optimisticMessage]);
    }
    setTimeout(scrollToBottom, 100);

    if (socketRef.current) {
      socketRef.current.emit("send_message", {
        chatType: activeTab,
        text: textToSend,
        imageUrl: uploadedImageUrl,
        replyToId: replyToMessage ? replyToMessage.id : null,
        replyToSender: replyToMessage ? formatSenderName(replyToMessage) : null,
        replyToText: replyToMessage ? (replyToMessage.text || (replyToMessage.imageUrl ? "[Photo]" : null)) : null,
      });
    } else {
      toast.error("Not connected to chat server");
    }

    if (replyToMessage) {
      setReplyToMessage(null);
    }
  };



  const executeUnsend = (messageId: string) => {
    const updateLocalMessages = (prev: Message[]) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, text: "Message unsent" }
          : m,
      );

    if (activeTab === "applicants") {
      setApplicantMessages(updateLocalMessages);
    } else if (activeTab === "passers") {
      setPasserMessages(updateLocalMessages);
    } else if (activeTab === "old") {
      setOldMessages(updateLocalMessages);
    } else if (activeTab === "checker") {
      setCheckerMessages(updateLocalMessages);
    } else if (activeTab === "judger") {
      setJudgerMessages(updateLocalMessages);
    } else if (activeTab === "inner-council") {
      setInnerCouncilMessages(updateLocalMessages);
    } else if (activeTab.startsWith("group-")) {
      setGroupMessages(updateLocalMessages);
    } else if (activeTab.startsWith("team-")) {
      setTeamMessages(updateLocalMessages);
    }

    if (socketRef.current) {
      socketRef.current.emit("delete_message", {
        chatType: activeTab,
        messageId,
        forceDelete: false,
      });
    } else {
      toast.error("Not connected to chat server");
    }
  };

  const executeDelete = (messageId: string) => {
    const updateLocalMessages = (prev: Message[]) =>
      prev.filter((m) => m.id !== messageId);

    if (activeTab === "applicants") {
      setApplicantMessages(updateLocalMessages);
    } else if (activeTab === "passers") {
      setPasserMessages(updateLocalMessages);
    } else if (activeTab === "old") {
      setOldMessages(updateLocalMessages);
    } else if (activeTab === "checker") {
      setCheckerMessages(updateLocalMessages);
    } else if (activeTab === "judger") {
      setJudgerMessages(updateLocalMessages);
    } else if (activeTab === "inner-council") {
      setInnerCouncilMessages(updateLocalMessages);
    } else if (activeTab.startsWith("group-")) {
      setGroupMessages(updateLocalMessages);
    } else if (activeTab.startsWith("team-")) {
      setTeamMessages(updateLocalMessages);
    }

    if (socketRef.current) {
      socketRef.current.emit("delete_message", {
        chatType: activeTab,
        messageId,
        forceDelete: true,
      });
    } else {
      toast.error("Not connected to chat server");
    }
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMessage || !inputValue.trim()) return;

    const messageId = editingMessage.id;
    const newText = inputValue;

    const BANNED_WORDS = ["bitmappro", "ryu", "glimmertech", "glim"];
    const containsBanned = BANNED_WORDS.some(word => newText.toLowerCase().includes(word));
    if (containsBanned) {
      handleCancelEdit();
      return;
    }

    const isAdminOrJudger = currentUser?.role?.trim()?.toLowerCase() === "admin" || currentUser?.role?.trim()?.toLowerCase() === "judger";

    if (hasDisallowedDomain(newText) && !isAdminOrJudger) {
      handleCancelEdit();
      return;
    }

    // Reset editing state immediately
    handleCancelEdit();

    // Optimistic UI update: change text locally and set isEdited to true
    const updateLocalMessages = (prev: Message[]) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, text: newText, isEdited: true } : m,
      );

    if (activeTab === "applicants") {
      setApplicantMessages(updateLocalMessages);
    } else if (activeTab === "passers") {
      setPasserMessages(updateLocalMessages);
    } else if (activeTab === "old") {
      setOldMessages(updateLocalMessages);
    } else if (activeTab === "checker") {
      setCheckerMessages(updateLocalMessages);
    } else if (activeTab === "judger") {
      setJudgerMessages(updateLocalMessages);
    } else if (activeTab === "inner-council") {
      setInnerCouncilMessages(updateLocalMessages);
    } else if (activeTab.startsWith("group-")) {
      setGroupMessages(updateLocalMessages);
    } else if (activeTab.startsWith("team-")) {
      setTeamMessages(updateLocalMessages);
    }

    if (socketRef.current) {
      socketRef.current.emit("edit_message", {
        chatType: activeTab,
        messageId,
        newText,
      });
    } else {
      toast.error("Not connected to chat server");
    }
  };

  const handleStartEdit = (msg: Message) => {
    setReplyToMessage(null);
    setEditingMessage(msg);
    setInputValue(decodeHTMLEntities(msg.text));
    setActiveMenuMessageId(null);
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setInputValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.overflowY = "hidden";
    }
  };

  const handleStartReply = (msg: Message) => {
    handleCancelEdit();
    setReplyToMessage(msg);
  };



  const currentMessages =
    activeTab === "applicants"
      ? applicantMessages
      : activeTab === "passers"
        ? passerMessages
        : activeTab === "old"
          ? oldMessages
          : activeTab === "checker"
            ? checkerMessages
            : activeTab === "judger"
              ? judgerMessages
              : activeTab === "inner-council"
                ? innerCouncilMessages
                : activeTab.startsWith("group-")
                  ? groupMessages
                  : teamMessages;

  const isPasserTab = activeTab === "passers";
  const isOldTab = activeTab === "old";
  const isCheckerTab = activeTab === "checker";
  const isJudgerTab = activeTab === "judger";
  const isInnerCouncilTab = activeTab === "inner-council";
  const isGroupTab = activeTab.startsWith("group-");
  const isTeamTab = activeTab.startsWith("team-");
  const isJudgerUser = roleNorm === "judger" && currentUser?.role?.toLowerCase() !== "admin";
  const judgerGroupUnreadSum = isJudgerUser
    ? Object.values(groupUnreads).reduce((a, b) => a + b, 0)
    : unreadGroup;
  const totalUnread = unreadApplicants + unreadPassers + unreadOld + unreadChecker + unreadJudger + unreadInnerCouncil + judgerGroupUnreadSum + unreadTeam;

  return (
    <>
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-4 pointer-events-none">
        {/* Chat Window */}
        {isOpen && (
          <div
            className={cn(
              "pointer-events-auto transition-all duration-500 ease-in-out origin-bottom-right bg-white/95 dark:bg-[#090F16]/95 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col text-slate-900 dark:text-white",
              isMaximized
                ? "fixed inset-4 md:inset-10 w-auto h-auto translate-z-0"
                : "h-[550px] w-[380px] max-w-[calc(100vw-3rem)] max-h-[calc(100vh-8rem)]",
              !isOpen && "scale-90 opacity-0 translate-y-10",
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 bg-slate-50 dark:bg-[#090F16] border-b border-black/5 dark:border-white/5 select-none shrink-0 h-[52px]">
              {/* Room Title */}
              {activeTab === "applicants" ? (
                <div className="flex items-center gap-2">
                  <img src="/chat-logo/novice.png" alt="Novice" className="w-5 h-5 object-contain" />
                  <span className="font-bold text-sm text-slate-800 dark:text-white leading-tight">
                    Novice
                  </span>
                  {onlineUsers?.applicants > 0 && (
                    <div className="flex items-center gap-1.5 ml-1 mt-[1px] px-1.5 py-[1px] bg-black/5 dark:bg-white/5 rounded-full border border-black/5 dark:border-white/5">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                      </span>
                      <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{onlineUsers.applicants} Online</span>
                    </div>
                  )}
                </div>
              ) : activeTab === "passers" ? (
                <div className="flex items-center gap-2">
                  <img src="/chat-logo/challenger.png" alt="Challengers" className="w-5 h-5 object-contain" />
                  <span className="font-bold text-sm text-slate-800 dark:text-white leading-tight">
                    Challengers
                  </span>
                  {onlineUsers?.passers > 0 && (
                    <div className="flex items-center gap-1.5 ml-1 mt-[1px] px-1.5 py-[1px] bg-black/5 dark:bg-white/5 rounded-full border border-black/5 dark:border-white/5">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                      </span>
                      <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{onlineUsers.passers} Online</span>
                    </div>
                  )}
                </div>
              ) : activeTab === "old" ? (
                <div className="flex items-center gap-2">
                  <img src="/chat-logo/OG.png" alt="OGXF" className="w-5 h-5 object-contain" />
                  <span className="font-bold text-sm text-slate-800 dark:text-white leading-tight">
                    OGXF
                  </span>
                  {onlineUsers?.old > 0 && (
                    <div className="flex items-center gap-1.5 ml-1 mt-[1px] px-1.5 py-[1px] bg-black/5 dark:bg-white/5 rounded-full border border-black/5 dark:border-white/5">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-500"></span>
                      </span>
                      <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{onlineUsers.old} Online</span>
                    </div>
                  )}
                </div>
              ) : activeTab === "checker" ? (
                <div className="flex items-center gap-2">
                  <img src="/chat-logo/CK.png" alt="Checker GC" className="w-5 h-5 object-contain" />
                  <span className="font-bold text-sm text-slate-800 dark:text-white leading-tight">
                    Checker GC
                  </span>
                  {onlineUsers?.checker > 0 && (
                    <div className="flex items-center gap-1.5 ml-1 mt-[1px] px-1.5 py-[1px] bg-black/5 dark:bg-white/5 rounded-full border border-black/5 dark:border-white/5">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-500"></span>
                      </span>
                      <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{onlineUsers.checker} Online</span>
                    </div>
                  )}
                </div>
              ) : activeTab === "judger" ? (
                <div className="flex items-center gap-2">
                  <img src="/chat-logo/JG.png" alt="Judger GC" className="w-5 h-5 object-contain" />
                  <span className="font-bold text-sm text-slate-800 dark:text-white leading-tight">
                    Judger GC
                  </span>
                  {onlineUsers?.judger > 0 && (
                    <div className="flex items-center gap-1.5 ml-1 mt-[1px] px-1.5 py-[1px] bg-black/5 dark:bg-white/5 rounded-full border border-black/5 dark:border-white/5">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
                      </span>
                      <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{onlineUsers.judger} Online</span>
                    </div>
                  )}
                </div>
              ) : activeTab === "inner-council" ? (
                <div className="flex items-center gap-2">
                  <img src="/chat-logo/IC.png" alt="Inner Council" className="w-5 h-5 object-contain" />
                  <span className="font-bold text-sm text-slate-800 dark:text-white leading-tight">
                    Inner Council
                  </span>
                  {onlineUsers?.innerCouncil > 0 && (
                    <div className="flex items-center gap-1.5 ml-1 mt-[1px] px-1.5 py-[1px] bg-black/5 dark:bg-white/5 rounded-full border border-black/5 dark:border-white/5">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500"></span>
                      </span>
                      <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{onlineUsers.innerCouncil} Online</span>
                    </div>
                  )}
                </div>
              ) : activeTab.startsWith("group-") ? (
                <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                  {activeGroupLogoUrl ? (
                    <img src={activeGroupLogoUrl} alt="Group Logo" className="w-5 h-5 rounded-full object-cover shrink-0" />
                  ) : (
                    <Users className="w-5 h-5 text-indigo-500 shrink-0" />
                  )}
                  {isAdminOrJudger ? (
                    <div className="relative" ref={groupDropdownRef}>
                      <button
                        onClick={() => setIsGroupDropdownOpen(!isGroupDropdownOpen)}
                        className="font-bold text-sm text-slate-800 dark:text-white leading-tight bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded px-2 py-1 outline-none cursor-pointer flex items-center gap-1 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                      >
                        <span className="truncate max-w-[140px]">
                          {availableRooms.find((r) => r.groupId === adminSelectedGroupId)?.groupName || "Select Group"}
                        </span>
                        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                      </button>

                      {isGroupDropdownOpen && (
                        <div className="absolute top-full left-0 mt-1.5 w-60 bg-white dark:bg-[#0B1520] border border-black/10 dark:border-white/10 rounded-xl shadow-2xl p-2 z-[200] flex flex-col">
                          <div className="relative mb-1.5">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Search groups..."
                              value={groupSearchQuery}
                              onChange={(e) => setGroupSearchQuery(e.target.value)}
                              className="w-full text-xs bg-slate-100 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-lg pl-8 pr-2.5 py-1.5 outline-none text-slate-800 dark:text-white"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="max-h-48 overflow-y-auto space-y-0.5">
                            {availableRooms
                              .filter((r) => r.groupType === "group" && (
                                r.groupName.toLowerCase().includes(groupSearchQuery.toLowerCase()) ||
                                String(r.groupId).includes(groupSearchQuery)
                              ))
                              .map((r) => {
                                const isJudger = roleNorm === "judger" && currentUser?.role?.toLowerCase() !== "admin";
                                const hasUnread = isJudger && (groupUnreads[r.groupId] || 0) > 0;
                                return (
                                  <button
                                    key={r.groupId}
                                    onClick={() => {
                                      setAdminSelectedGroupId(r.groupId);
                                      handleTabChange(`group-${r.groupId}`);
                                      setGroupUnreads((prev) => ({ ...prev, [r.groupId]: 0 }));
                                      setIsGroupDropdownOpen(false);
                                      setGroupSearchQuery("");
                                    }}
                                    className={cn(
                                      "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors cursor-pointer",
                                      r.groupId === adminSelectedGroupId
                                        ? "bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 text-[#1F7A1F] dark:text-[#55f761] font-bold"
                                        : "text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5"
                                    )}
                                  >
                                    <span className="truncate flex-1 flex items-center gap-1.5">
                                      {r.groupName}
                                      {hasUnread && (
                                        <span
                                          className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse"
                                          title={`${groupUnreads[r.groupId]} new message(s)`}
                                        />
                                      )}
                                    </span>
                                    {r.groupId === adminSelectedGroupId && <Check className="w-3.5 h-3.5 shrink-0" />}
                                  </button>
                                );
                              })}
                            {availableRooms.filter((r) => r.groupType === "group" && (
                              r.groupName.toLowerCase().includes(groupSearchQuery.toLowerCase()) ||
                              String(r.groupId).includes(groupSearchQuery)
                            )).length === 0 && (
                                <div className="text-center py-3 text-xs text-slate-400 italic">No groups found</div>
                              )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="font-bold text-sm text-slate-800 dark:text-white leading-tight truncate">
                      {userGroupName || `Group Chat (ID: ${activeGroupId})`}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                  {activeTeamLogoUrl ? (
                    <img src={activeTeamLogoUrl} alt="Team Logo" className="w-5 h-5 rounded-full object-cover shrink-0" />
                  ) : (
                    <Award className="w-5 h-5 text-rose-500 shrink-0" />
                  )}
                  {isAdminOrJudger ? (
                    <div className="relative" ref={teamDropdownRef}>
                      <button
                        onClick={() => setIsTeamDropdownOpen(!isTeamDropdownOpen)}
                        className="font-bold text-sm text-slate-800 dark:text-white leading-tight bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded px-2 py-1 outline-none cursor-pointer flex items-center gap-1 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                      >
                        <span className="truncate max-w-[140px]">
                          {availableRooms.find((r) => r.groupId === adminSelectedTeamId)?.groupName || "Select Team"}
                        </span>
                        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                      </button>

                      {isTeamDropdownOpen && (
                        <div className="absolute top-full left-0 mt-1.5 w-60 bg-white dark:bg-[#0B1520] border border-black/10 dark:border-white/10 rounded-xl shadow-2xl p-2 z-[200] flex flex-col">
                          <div className="relative mb-1.5">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Search teams..."
                              value={teamSearchQuery}
                              onChange={(e) => setTeamSearchQuery(e.target.value)}
                              className="w-full text-xs bg-slate-100 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-lg pl-8 pr-2.5 py-1.5 outline-none text-slate-800 dark:text-white"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="max-h-48 overflow-y-auto space-y-0.5">
                            {availableRooms
                              .filter((r) => r.groupType === "team" && (
                                r.groupName.toLowerCase().includes(teamSearchQuery.toLowerCase()) ||
                                String(r.groupId).includes(teamSearchQuery)
                              ))
                              .map((r) => (
                                <button
                                  key={r.groupId}
                                  onClick={() => {
                                    setAdminSelectedTeamId(r.groupId);
                                    handleTabChange(`team-${r.groupId}`);
                                    setIsTeamDropdownOpen(false);
                                    setTeamSearchQuery("");
                                  }}
                                  className={cn(
                                    "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors cursor-pointer",
                                    r.groupId === adminSelectedTeamId
                                      ? "bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 text-[#1F7A1F] dark:text-[#55f761] font-bold"
                                      : "text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5"
                                  )}
                                >
                                  <span className="truncate flex-1">{r.groupName}</span>
                                  {r.groupId === adminSelectedTeamId && <Check className="w-3.5 h-3.5 shrink-0" />}
                                </button>
                              ))}
                            {availableRooms.filter((r) => r.groupType === "team" && (
                              r.groupName.toLowerCase().includes(teamSearchQuery.toLowerCase()) ||
                              String(r.groupId).includes(teamSearchQuery)
                            )).length === 0 && (
                                <div className="text-center py-3 text-xs text-slate-400 italic">No teams found</div>
                              )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="font-bold text-sm text-slate-800 dark:text-white leading-tight truncate">
                      {userTeamName || `Team Chat (ID: ${activeTeamId})`}
                    </span>
                  )}
                </div>
              )}

              {/* Header Controls */}
              <div className="flex items-center gap-0.5">
                <button
                  onClick={toggleMaximize}
                  className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-md transition-colors text-slate-500 dark:text-white/70"
                  title={isMaximized ? "Restore" : "Maximize"}
                >
                  {isMaximized ? (
                    <Minimize2 className="w-3.5 h-3.5" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleChat();
                  }}
                  className="p-1.5 hover:bg-red-500/10 hover:text-red-500 dark:hover:bg-red-500/20 dark:hover:text-red-400 rounded-md transition-colors text-slate-500 dark:text-white/70"
                  title="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Chat Content */}
            <div
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className="flex-1 flex flex-col min-h-0 bg-slate-50/30 dark:bg-white/[0.02] relative"
            >
              {/* Drag and Drop Overlay - only on allowed channels */}
              {isDraggingOver && isImageAllowedInActiveTab && (
                <div className="absolute inset-0 z-[60] bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center pointer-events-none animate-in fade-in duration-150">
                  <div className="p-6 rounded-2xl bg-white dark:bg-[#0D1B2A] border-2 border-dashed border-[#1F7A1F] dark:border-[#55f761] shadow-2xl flex flex-col items-center max-w-xs scale-100 animate-in zoom-in-95 duration-150">
                    <div className="w-12 h-12 rounded-full bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 flex items-center justify-center text-[#1F7A1F] dark:text-[#55f761] mb-3">
                      <ImageIcon className="w-6 h-6 animate-bounce" />
                    </div>
                    <span className="font-bold text-sm text-slate-800 dark:text-white mb-1">
                      Drop image to attach
                    </span>
                    <span className="text-xs text-slate-500 dark:text-white/60">
                      Max file size: 10MB
                    </span>
                  </div>
                </div>
              )}
              {/* Locked screen if Builders tab is selected and user hasn't passed */}
              {isPasserTab && !showPasserChat ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center text-slate-400 dark:text-white/40 mb-3 border border-black/5 dark:border-white/10">
                    <Lock className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-extrabold text-slate-800 dark:text-white mb-1">
                    Challengers Locked
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-white/60 max-w-[240px] leading-relaxed">
                    Pass the Standard Building training in the desktop software to
                    unlock the Challengers.
                  </p>
                </div>
              ) : isOldTab && !showOldChat ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center text-slate-400 dark:text-white/40 mb-3 border border-black/5 dark:border-white/10">
                    <Lock className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-extrabold text-slate-800 dark:text-white mb-1">
                    OGXF Locked
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-white/60 max-w-[240px] leading-relaxed">
                    This lounge is only available to OGXF members.
                  </p>
                </div>
              ) : (
                <>
                  {/* Messages List */}
                  <div className="flex-1 overflow-y-auto p-4 pb-2 flex flex-col-reverse gap-4">
                    <div ref={messagesEndRef} className="!mt-0 h-0 w-0 m-0 p-0 overflow-hidden" />
                    {[...currentMessages].reverse().map((msg, index) => {
                      const isYou =
                        msg.sender ===
                        (currentUser?.name || currentUser?.email) ||
                        msg.senderRole === "you";
                      return (
                        <MessageItem
                          key={msg.id}
                          msg={msg}
                          isYou={isYou}
                          currentUser={currentUser}
                          isPasserTab={isPasserTab}
                          isOldTab={isOldTab}
                          activeMenuMessageId={activeMenuMessageId}
                          setActiveMenuMessageId={setActiveMenuMessageId}
                          handleAvatarClick={handleAvatarClick}
                          isFetchingUserDetails={isFetchingUserDetails}
                          handleStartEdit={handleStartEdit}
                          setConfirmAction={setConfirmAction}
                          onReply={handleStartReply}
                          onQuoteClick={handleQuoteClick}
                          highlightedMessageId={highlightedMessageId}
                          onImageClick={setExpandedImage}
                          isLast={index === 0}
                          isSecondLast={index === 1}
                        />
                      );
                    })}
                  </div>

                  {/* Edit Message Banner */}
                  {editingMessage && (
                    <div className="px-3 py-1.5 bg-black/5 dark:bg-white/5 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-[10px] text-slate-500 dark:text-white/60 shrink-0">
                      <span className="font-medium">
                        Editing message. Press Esc or click{" "}
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="underline text-red-500 dark:text-red-400 cursor-pointer font-bold"
                        >
                          cancel
                        </button>{" "}
                        to discard.
                      </span>
                    </div>
                  )}

                  {/* Reply Message Preview Banner */}
                  {replyToMessage && (
                    <div className="px-3 py-2 bg-slate-100 dark:bg-white/5 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-xs shrink-0 select-none animate-in slide-in-from-bottom-2 duration-150">
                      <div className="flex flex-col border-l-2 border-emerald-500 pl-2 min-w-0 flex-1">
                        <span className="font-extrabold text-[10px] text-slate-500 dark:text-white/50">
                          Replying to {formatSenderName(replyToMessage)}
                        </span>
                        <span className="text-[10px] opacity-75 truncate break-all italic text-slate-600 dark:text-white/70">
                          {replyToMessage.text ? decodeHTMLEntities(replyToMessage.text) : "[Photo]"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReplyToMessage(null)}
                        className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-slate-400 hover:text-slate-700 dark:text-white/30 dark:hover:text-white cursor-pointer ml-2 flex-shrink-0"
                        title="Discard reply"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Selected Image Attachment Preview Banner */}
                  {selectedImagePreview && (
                    <div className="px-3 py-2 bg-slate-100 dark:bg-white/5 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-xs shrink-0 select-none animate-in slide-in-from-bottom-2 duration-150">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-black/10 dark:border-white/10 shrink-0 bg-black/5 dark:bg-white/5">
                          <img
                            src={selectedImagePreview}
                            alt="Attachment preview"
                            className="w-full h-full object-cover"
                          />
                          {isUploadingImage && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <Loader2 className="w-5 h-5 text-white animate-spin" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-[11px] text-slate-700 dark:text-white/80 truncate">
                            {selectedImageFile?.name || "Attached photo"}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-white/40">
                            {selectedImageFile
                              ? `${(selectedImageFile.size / 1024).toFixed(0)} KB • will be compressed`
                              : ""}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isUploadingImage}
                        onClick={handleRemoveSelectedImage}
                        className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-400 hover:text-red-500 dark:text-white/30 dark:hover:text-red-400 cursor-pointer ml-2 flex-shrink-0 disabled:opacity-50"
                        title="Remove image"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Message Input Form */}
                  <form
                    onSubmit={editingMessage ? handleEditSubmit : handleSend}
                    className="p-3 border-t border-black/5 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02] flex items-center gap-2 shrink-0"
                  >
                    <div className="relative flex" ref={emojiPickerRef}>
                      <button
                        type="button"
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className={cn(
                          "p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-500 dark:text-white/60 hover:text-slate-800 dark:hover:text-white transition-all",
                          showEmojiPicker &&
                          "text-slate-800 dark:text-white bg-black/5 dark:bg-white/10",
                        )}
                        title="Insert Emoji"
                      >
                        <Smile className="w-4 h-4" />
                      </button>

                      {showEmojiPicker && (
                        <div className="absolute bottom-10 left-0 z-50 bg-white dark:bg-[#0d1520] border border-black/10 dark:border-white/10 rounded-xl p-2 shadow-2xl w-[196px] grid grid-cols-6 gap-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
                          {POPULAR_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => handleEmojiClick(emoji)}
                              className="w-7 h-7 flex items-center justify-center text-sm rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Attachment Button for allowed channels */}
                    {isImageAllowedInActiveTab && (
                      <>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleImageSelect(file);
                            }
                          }}
                        />
                        <button
                          type="button"
                          disabled={isUploadingImage}
                          onClick={() => fileInputRef.current?.click()}
                          className={cn(
                            "p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-500 dark:text-white/60 hover:text-slate-800 dark:hover:text-white transition-all disabled:opacity-50 cursor-pointer",
                            selectedImageFile && "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                          )}
                          title="Attach Image (or Paste from clipboard)"
                        >
                          <ImageIcon className="w-4 h-4" />
                        </button>
                      </>
                    )}

                    <textarea
                      ref={textareaRef}
                      value={inputValue}
                      onChange={(e) => {
                        setInputValue(e.target.value);
                        e.target.style.height = "auto";
                        const newHeight = e.target.scrollHeight;
                        e.target.style.height = `${Math.min(newHeight, 150)}px`;
                        if (newHeight > 120) {
                          e.target.style.overflowY = "auto";
                        } else {
                          e.target.style.overflowY = "hidden";
                        }
                      }}
                      onPaste={(e) => {
                        if (!isImageAllowedInActiveTab) return;
                        const items = e.clipboardData?.items;
                        if (!items) return;
                        for (let i = 0; i < items.length; i++) {
                          if (items[i].type.indexOf("image") !== -1) {
                            const file = items[i].getAsFile();
                            if (file) {
                              e.preventDefault();
                              handleImageSelect(file);
                              break;
                            }
                          }
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          handleCancelEdit();
                        }
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.altKey &&
                          !e.ctrlKey
                        ) {
                          e.preventDefault();
                          if (inputValue.trim() || selectedImageFile) {
                            if (editingMessage) {
                              handleEditSubmit(e);
                            } else {
                              handleSend(e);
                            }
                          }
                        }
                      }}
                      placeholder={
                        isImageAllowedInActiveTab
                          ? "Type a message or paste image... (Shift+Enter for new line)"
                          : "Type a message... (Shift+Enter for new line)"
                      }
                      rows={1}
                      className="flex-1 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30 resize-none min-h-[50px] max-h-[150px] overflow-hidden"
                    />

                    <button
                      type="submit"
                      disabled={(!inputValue.trim() && !selectedImageFile) || isUploadingImage}
                      className={cn(
                        "p-2 rounded-lg text-white hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all flex items-center justify-center shadow-md cursor-pointer",
                        isPasserTab
                          ? "bg-amber-500"
                          : isOldTab
                            ? "bg-violet-500"
                            : isCheckerTab
                              ? "bg-pink-500"
                              : isJudgerTab
                                ? "bg-cyan-500"
                                : isInnerCouncilTab
                                  ? "bg-fuchsia-500"
                                  : isGroupTab
                                    ? "bg-indigo-600"
                                    : isTeamTab
                                      ? "bg-rose-500"
                                      : "bg-[#1F7A1F]",
                      )}
                    >
                      {isUploadingImage ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        )}

        {/* Floating Action Buttons */}
        <div className="flex flex-row gap-3 pointer-events-auto items-center">
          {showTeamChat && (
            <div className="relative">
              {((isOpen && activeTab !== `team-${activeTeamId}`) || !isOpen) && unreadTeam > 0 && (
                <div className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-black h-5 min-w-5 px-1 rounded-full flex items-center justify-center shadow-md border-2 border-white dark:border-[#0a0a0a] z-20 animate-bounce">
                  {unreadTeam >= 50 ? "50+" : unreadTeam}
                </div>
              )}
              <button
                onClick={() => {
                  if (isOpen && activeTab === `team-${activeTeamId}`) {
                    setIsOpen(false);
                  } else {
                    handleTabChange(`team-${activeTeamId}`);
                    setIsOpen(true);
                  }
                }}
                className={cn(
                  "relative group w-12 h-12 rounded-full bg-slate-900 dark:bg-[#0a0a0a] border border-black/10 dark:border-white/10 shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 overflow-visible ring-4 text-white",
                  isOpen && activeTab === `team-${activeTeamId}` ? "ring-rose-500/30" : "ring-rose-500/10",
                )}
                title={availableRooms.find((r) => r.groupId === activeTeamId)?.groupName || userTeamName || `Team Chat (ID: ${activeTeamId})`}
              >
                <div className="absolute inset-0 rounded-full bg-rose-500/10 transition-opacity duration-300 group-hover:bg-rose-500/20" />
                {isOpen && activeTab === `team-${activeTeamId}` ? (
                  <X className="w-5 h-5 relative z-10 transition-transform text-rose-500" />
                ) : activeTeamLogoUrl ? (
                  <img src={activeTeamLogoUrl} alt="Team Logo" className="w-full h-full rounded-full object-cover shrink-0 relative z-10 transition-transform hover:scale-110" />
                ) : (
                  <Award className="w-5 h-5 relative z-10 text-rose-500 transition-transform hover:scale-110" />
                )}
              </button>
            </div>
          )}

          {showGroupChat && (
            <div className="relative">
              {((isOpen && activeTab !== `group-${activeGroupId}`) || !isOpen || (isJudgerUser && judgerGroupUnreadSum > (groupUnreads[activeGroupId || 0] || 0))) && judgerGroupUnreadSum > 0 && (
                <div className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-black h-5 min-w-5 px-1 rounded-full flex items-center justify-center shadow-md border-2 border-white dark:border-[#0a0a0a] z-20 animate-bounce">
                  {judgerGroupUnreadSum >= 50 ? "50+" : judgerGroupUnreadSum}
                </div>
              )}
              <button
                onClick={() => {
                  if (isOpen && activeTab === `group-${activeGroupId}`) {
                    setIsOpen(false);
                  } else {
                    handleTabChange(`group-${activeGroupId}`);
                    if (activeGroupId) {
                      setGroupUnreads((prev) => ({ ...prev, [activeGroupId]: 0 }));
                    }
                    setIsOpen(true);
                  }
                }}
                className={cn(
                  "relative group w-12 h-12 rounded-full bg-slate-900 dark:bg-[#0a0a0a] border border-black/10 dark:border-white/10 shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 overflow-visible ring-4 text-white",
                  isOpen && activeTab === `group-${activeGroupId}` ? "ring-indigo-600/30" : "ring-indigo-600/10",
                )}
                title={availableRooms.find((r) => r.groupId === activeGroupId)?.groupName || userGroupName || `Group Chat (ID: ${activeGroupId})`}
              >
                <div className="absolute inset-0 rounded-full bg-indigo-600/10 transition-opacity duration-300 group-hover:bg-indigo-600/20" />
                {isOpen && activeTab === `group-${activeGroupId}` ? (
                  <X className="w-5 h-5 relative z-10 transition-transform text-indigo-400" />
                ) : activeGroupLogoUrl ? (
                  <img src={activeGroupLogoUrl} alt="Group Logo" className="w-full h-full rounded-full object-cover shrink-0 relative z-10 transition-transform hover:scale-110" />
                ) : (
                  <Users className="w-5 h-5 relative z-10 text-indigo-400 transition-transform hover:scale-110" />
                )}
              </button>
            </div>
          )}
          {showInnerCouncilChat && (
            <div className="relative">
              {((isOpen && activeTab !== "inner-council") || !isOpen) && unreadInnerCouncil > 0 && (
                <div className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-black h-5 min-w-5 px-1 rounded-full flex items-center justify-center shadow-md border-2 border-white dark:border-[#0a0a0a] z-20 animate-bounce">
                  {unreadInnerCouncil >= 50 ? "50+" : unreadInnerCouncil}
                </div>
              )}
              <button
                onClick={() => {
                  if (isOpen && activeTab === "inner-council") {
                    setIsOpen(false);
                  } else {
                    handleTabChange("inner-council");
                    setIsOpen(true);
                  }
                }}
                className={cn(
                  "relative group w-12 h-12 rounded-full bg-slate-900 dark:bg-[#0a0a0a] border border-black/10 dark:border-white/10 shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 overflow-visible ring-4 text-white",
                  isOpen && activeTab === "inner-council" ? "ring-fuchsia-500/30" : "ring-fuchsia-500/10",
                )}
                title="Inner Council"
              >
                <div className="absolute inset-0 rounded-full bg-fuchsia-500/10 transition-opacity duration-300 group-hover:bg-fuchsia-500/20" />
                {isOpen && activeTab === "inner-council" ? (
                  <X className="w-5 h-5 relative z-10 transition-transform text-fuchsia-500" />
                ) : (
                  <img src="/chat-logo/IC.png" alt="IC" className="mb-2 w-full h-full relative z-10 transition-transform scale-[1.50] object-contain" />
                )}
              </button>
            </div>
          )}

          {showJudgerChat && (
            <div className="relative">
              {((isOpen && activeTab !== "judger") || !isOpen) && unreadJudger > 0 && (
                <div className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-black h-5 min-w-5 px-1 rounded-full flex items-center justify-center shadow-md border-2 border-white dark:border-[#0a0a0a] z-20 animate-bounce">
                  {unreadJudger >= 50 ? "50+" : unreadJudger}
                </div>
              )}
              <button
                onClick={() => {
                  if (isOpen && activeTab === "judger") {
                    setIsOpen(false);
                  } else {
                    handleTabChange("judger");
                    setIsOpen(true);
                  }
                }}
                className={cn(
                  "relative group w-12 h-12 rounded-full bg-slate-900 dark:bg-[#0a0a0a] border border-black/10 dark:border-white/10 shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 overflow-visible ring-4 text-white",
                  isOpen && activeTab === "judger" ? "ring-cyan-500/30" : "ring-cyan-500/10",
                )}
                title="Judger GC"
              >
                <div className="absolute inset-0 rounded-full bg-cyan-500/10 transition-opacity duration-300 group-hover:bg-cyan-500/20" />
                {isOpen && activeTab === "judger" ? (
                  <X className="w-5 h-5 relative z-10 transition-transform text-cyan-500" />
                ) : (
                  <img src="/chat-logo/JG.png" alt="JG" className="mb-3 w-full h-full relative z-10 transition-transform scale-[1.35] object-contain" />
                )}
              </button>
            </div>
          )}

          {showCheckerChat && (
            <div className="relative">
              {((isOpen && activeTab !== "checker") || !isOpen) && unreadChecker > 0 && (
                <div className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-black h-5 min-w-5 px-1 rounded-full flex items-center justify-center shadow-md border-2 border-white dark:border-[#0a0a0a] z-20 animate-bounce">
                  {unreadChecker >= 50 ? "50+" : unreadChecker}
                </div>
              )}
              <button
                onClick={() => {
                  if (isOpen && activeTab === "checker") {
                    setIsOpen(false);
                  } else {
                    handleTabChange("checker");
                    setIsOpen(true);
                  }
                }}
                className={cn(
                  "relative group w-12 h-12 rounded-full bg-slate-900 dark:bg-[#0a0a0a] border border-black/10 dark:border-white/10 shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 overflow-visible ring-4 text-white",
                  isOpen && activeTab === "checker" ? "ring-pink-500/30" : "ring-pink-500/10",
                )}
                title="Checker GC"
              >
                <div className="absolute inset-0 rounded-full bg-pink-500/10 transition-opacity duration-300 group-hover:bg-pink-500/20" />
                {isOpen && activeTab === "checker" ? (
                  <X className="w-5 h-5 relative z-10 transition-transform text-pink-500" />
                ) : (
                  <img src="/chat-logo/CK.png" alt="CK" className="mb-2 w-full h-full relative z-10 transition-transform scale-[1.30] object-contain" />
                )}
              </button>
            </div>
          )}
          {/* Old Floating Bubble */}
          {showOldChat && (
            <div className="relative">
              {/* Unread count badge for Old */}
              {((isOpen && activeTab !== "old") || !isOpen) &&
                unreadOld > 0 && (
                  <div className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-black h-5 min-w-5 px-1 rounded-full flex items-center justify-center shadow-md border-2 border-white dark:border-[#0a0a0a] z-20 animate-bounce">
                    {unreadOld >= 50 ? "50+" : unreadOld}
                  </div>
                )}

              <button
                onClick={() => {
                  if (isOpen && activeTab === "old") {
                    setIsOpen(false);
                  } else {
                    handleTabChange("old");
                    setIsOpen(true);
                  }
                }}
                className={cn(
                  "relative group w-12 h-12 rounded-full bg-slate-900 dark:bg-[#0a0a0a] border border-black/10 dark:border-white/10 shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 overflow-visible ring-4 text-white",
                  isOpen && activeTab === "old"
                    ? "ring-violet-500/30"
                    : "ring-violet-500/10",
                )}
                title="OGXF"
              >
                <div className="absolute inset-0 rounded-full bg-violet-500/10 transition-opacity duration-300 group-hover:bg-violet-500/20" />
                {isOpen && activeTab === "old" ? (
                  <X className="w-5 h-5 relative z-10 transition-transform text-violet-500" />
                ) : (
                  <img src="/chat-logo/OG.png" alt="OG" className="mb-2 w-full h-full relative z-10 transition-transform scale-[1.30] object-contain" />
                )}
              </button>
            </div>
          )}

          {/* Builders Floating Bubble */}
          {showPasserChat && (
            <div className="relative">
              {/* Unread count badge for Builders */}
              {((isOpen && activeTab !== "passers") || !isOpen) &&
                unreadPassers > 0 && (
                  <div className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-black h-5 min-w-5 px-1 rounded-full flex items-center justify-center shadow-md border-2 border-white dark:border-[#0a0a0a] z-20 animate-bounce">
                    {unreadPassers >= 50 ? "50+" : unreadPassers}
                  </div>
                )}

              <button
                onClick={() => {
                  if (isOpen && activeTab === "passers") {
                    setIsOpen(false);
                  } else {
                    handleTabChange("passers");
                    setIsOpen(true);
                  }
                }}
                className={cn(
                  "relative group w-12 h-12 rounded-full bg-slate-900 dark:bg-[#0a0a0a] border border-black/10 dark:border-white/10 shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 overflow-visible ring-4 text-white",
                  isOpen && activeTab === "passers"
                    ? "ring-amber-500/30"
                    : "ring-amber-500/10",
                )}
                title="Challengers"
              >
                <div className="absolute inset-0 rounded-full bg-amber-500/10 transition-opacity duration-300 group-hover:bg-amber-500/20" />
                {isOpen && activeTab === "passers" ? (
                  <X className="w-5 h-5 relative z-10 transition-transform text-amber-500" />
                ) : (
                  <img src="/chat-logo/challenger.png" alt="Challenger" className="mb-1 w-full h-full relative z-10 transition-transform scale-[1.40] object-contain" />
                )}
              </button>
            </div>
          )}

          {/* Challengers Floating Bubble */}
          <div className="relative">
            {/* Unread count badge for Challengers */}
            {((isOpen && activeTab !== "applicants") || !isOpen) &&
              unreadApplicants > 0 && (
                <div className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-black h-5 min-w-5 px-1 rounded-full flex items-center justify-center shadow-md border-2 border-white dark:border-[#0a0a0a] z-20 animate-bounce">
                  {unreadApplicants >= 50 ? "50+" : unreadApplicants}
                </div>
              )}

            <button
              onClick={() => {
                if (isOpen && activeTab === "applicants") {
                  setIsOpen(false);
                } else {
                  handleTabChange("applicants");
                  setIsOpen(true);
                }
              }}
              className={cn(
                "relative group w-12 h-12 rounded-full bg-slate-900 dark:bg-[#0a0a0a] border border-black/10 dark:border-white/10 shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 overflow-visible ring-4 text-white",
                isOpen && activeTab === "applicants"
                  ? "ring-[#1F7A1F]/30"
                  : "ring-[#1F7A1F]/10",
              )}
              title="Novice"
            >
              <div className="absolute inset-0 rounded-full bg-[#1F7A1F]/10 transition-opacity duration-300 group-hover:bg-[#1F7A1F]/20" />
              {isOpen && activeTab === "applicants" ? (
                <X className="w-5 h-5 relative z-10 transition-transform text-[#55f761]" />
              ) : (
                <img src="/chat-logo/novice.png" alt="Novice" className="mb-1 w-full h-full relative z-10 transition-transform scale-[1.40] object-contain" />
              )}
            </button>
          </div>
        </div>



        {/* Action Confirmation Dialog */}
        <Dialog
          open={!!confirmAction}
          onOpenChange={(open) => !open && setConfirmAction(null)}
        >
          <DialogContent className="max-w-xs md:max-w-sm">
            <DialogHeader>
              <DialogTitle>
                {confirmAction?.type === "delete"
                  ? "Delete message?"
                  : "Unsend message?"}
              </DialogTitle>
              <DialogDescription>
                {confirmAction?.type === "delete"
                  ? "Are you sure you want to delete this message? This will permanently remove the message for all chat members."
                  : "Are you sure you want to unsend this message? This will change the message to unsent for all chat members."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <button
                onClick={() => setConfirmAction(null)}
                className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#1A2634] px-4 py-2 text-xs font-semibold text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-[#1A2634]/80 transition-colors shadow-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmAction) {
                    if (confirmAction.type === "delete") {
                      executeDelete(confirmAction.messageId);
                    } else {
                      executeUnsend(confirmAction.messageId);
                    }
                    setConfirmAction(null);
                  }
                }}
                className="inline-flex items-center justify-center rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2 text-xs font-semibold text-white transition-colors shadow-md cursor-pointer"
              >
                {confirmAction?.type === "delete" ? "Delete" : "Unsend"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* User Details Modal (Admin Only) */}
        <Dialog
          open={!!selectedUserDetails}
          onOpenChange={(open) => !open && setSelectedUserDetails(null)}
        >
          <DialogContent className="max-w-md bg-white dark:bg-[#0B1520] border border-black/10 dark:border-white/10 rounded-2xl p-6 text-slate-900 dark:text-white">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">
                User Details
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 dark:text-white/60">
                Full profile information for this chat member.
              </DialogDescription>
            </DialogHeader>

            {selectedUserDetails && (
              <div className="space-y-4 my-4 text-xs">
                <div className="flex items-center gap-3 pb-3 border-b border-black/5 dark:border-white/5">
                  <div className="w-12 h-12 rounded-full bg-[#1F7A1F] text-white flex items-center justify-center text-lg font-black uppercase">
                    {selectedUserDetails.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">
                      {selectedUserDetails.name}
                    </h4>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-white/70 mt-1">
                      {getGamifiedRoleLabel(selectedUserDetails.role)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-slate-400 dark:text-white/40 block font-medium">
                      Email
                    </span>
                    <span className="font-bold break-all select-all">
                      {selectedUserDetails.email}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 dark:text-white/40 block font-medium">
                      Status
                    </span>
                    <span
                      className={cn(
                        "font-bold uppercase",
                        selectedUserDetails.status === "Active"
                          ? "text-emerald-500"
                          : "text-amber-500",
                      )}
                    >
                      {selectedUserDetails.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 dark:text-white/40 block font-medium">
                      Phone
                    </span>
                    {selectedUserDetails.phone ? (
                      <span
                        className="font-bold cursor-pointer hover:text-slate-600 dark:hover:text-white/80 transition-colors tracking-widest text-[#1F7A1F] dark:text-[#55f761]"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedUserDetails.phone || "");
                          toast.success("Phone number copied to clipboard!");
                        }}
                        title="Click to copy"
                      >
                        ********
                      </span>
                    ) : (
                      <span className="font-bold">Not provided</span>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-400 dark:text-white/40 block font-medium">
                      Facebook
                    </span>
                    {selectedUserDetails.facebook ? (
                      <a
                        href={
                          selectedUserDetails.facebook.startsWith("http")
                            ? selectedUserDetails.facebook
                            : `https://${selectedUserDetails.facebook}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-[#1F7A1F] dark:text-[#55f761] underline break-all"
                      >
                        Link
                      </a>
                    ) : (
                      <span className="font-bold text-slate-400">
                        Not provided
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-400 dark:text-white/40 block font-medium">
                      Registered
                    </span>
                    <span className="font-bold">
                      {selectedUserDetails.isRegistered ? "Yes" : "No"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 dark:text-white/40 block font-medium">
                      Joined At
                    </span>
                    <span className="font-bold">
                      {selectedUserDetails.createdAt
                        ? new Date(
                          selectedUserDetails.createdAt,
                        ).toLocaleDateString()
                        : "-"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <button
                onClick={() => setSelectedUserDetails(null)}
                className="w-full sm:w-auto rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#1A2634] px-4 py-2 text-xs font-semibold text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-[#1A2634]/80 transition-colors shadow-sm cursor-pointer"
              >
                Close
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Direct Message Modal */}
        <Dialog open={!!directMessage}>
          <DialogContent
            hideCloseButton
            disableOutsideClick
            className="sm:max-w-xl md:max-w-2xl bg-white/95 dark:bg-[#1A232C]/95 backdrop-blur-xl border border-black/10 dark:border-white/10 z-[100] shadow-2xl p-0 overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-[#1F7A1F]/10 to-transparent dark:from-[#55f761]/10 px-6 py-5 border-b border-black/5 dark:border-white/5">
              <DialogTitle className="flex items-center gap-3 text-xl md:text-2xl font-bold text-[#0D1B2A] dark:text-white">
                <div className="p-2.5 rounded-xl bg-white dark:bg-[#0D1B2A] shadow-sm flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-[#1F7A1F] dark:text-[#55f761]" />
                </div>
                {directMessage?.subject}
              </DialogTitle>
              <DialogDescription className="mt-3 flex flex-wrap gap-2">
                <span className="px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 text-xs font-semibold text-[#2F3E46]/80 dark:text-white/80 flex items-center gap-2 w-fit shadow-sm">
                  <User className="w-4 h-4 text-[#1F7A1F] dark:text-[#55f761]" />
                  From: {directMessage?.fromName}
                </span>
                {directMessage?.createdAt && (
                  <span className="px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 text-xs font-semibold text-[#2F3E46]/80 dark:text-white/80 flex items-center gap-2 w-fit shadow-sm">
                    <Clock className="w-4 h-4 text-[#1F7A1F] dark:text-[#55f761]" />
                    {new Date(directMessage.createdAt).toLocaleString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </DialogDescription>
            </div>

            {/* Body */}
            <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="whitespace-pre-wrap text-[15px] md:text-[16px] leading-relaxed text-[#2F3E46] dark:text-white/90">
                {directMessage?.message ? renderAnnouncementText(directMessage.message) : null}
              </div>

              {directMessage?.imageUrls && (
                <div className="mt-6 border-t border-black/5 dark:border-white/5 pt-6">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#2F3E46]/50 dark:text-white/40 mb-3">Attachments</h4>
                  {(() => {
                    let urls: string[] = [];
                    try {
                      const parsed = JSON.parse(directMessage.imageUrls);
                      if (Array.isArray(parsed)) {
                        urls = parsed.filter(u => typeof u === 'string' && u.trim().length > 0);
                      } else if (typeof parsed === 'string' && parsed.trim().length > 0) {
                        urls = [parsed];
                      }
                    } catch {
                      if (typeof directMessage.imageUrls === 'string' && directMessage.imageUrls.trim().length > 0) {
                        urls = [directMessage.imageUrls];
                      }
                    }

                    if (urls.length === 0) return null;

                    return (
                      <div className={`grid gap-3 ${urls.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                        {urls.map((url, i) => (
                          <div key={i} className="group relative rounded-xl overflow-hidden border border-black/10 dark:border-white/10 shadow-sm bg-black/5 dark:bg-white/5 flex items-center justify-center transition-transform hover:scale-[1.01]">
                            <img
                              src={url.startsWith('http') || url.startsWith('data:') ? url : `data:image/jpeg;base64,${url}`}
                              alt={`Attached Photo ${i + 1}`}
                              className="w-full h-auto object-contain max-h-[50vh] rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                              onClick={() => setExpandedImage(url)}
                            />
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Footer & Acknowledgment */}
            <div className="bg-black/5 dark:bg-white/5 border-t border-black/10 dark:border-white/10 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <label
                htmlFor="understand-checkbox"
                className="flex items-start gap-3 cursor-pointer group flex-1"
              >
                <div className="relative flex items-center justify-center mt-0.5">
                  <input
                    type="checkbox"
                    id="understand-checkbox"
                    checked={hasCheckedUnderstanding}
                    onChange={(e) => setHasCheckedUnderstanding(e.target.checked)}
                    className="peer w-5 h-5 rounded-md border-2 border-black/20 dark:border-white/20 appearance-none checked:border-[#1F7A1F] dark:checked:border-[#55f761] checked:bg-[#1F7A1F] dark:checked:bg-[#55f761] transition-all cursor-pointer"
                  />
                  <svg className="absolute w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-[#2F3E46]/80 dark:text-white/80 group-hover:text-[#0D1B2A] dark:group-hover:text-white transition-colors leading-snug">
                  I have read and fully understand the message above.
                </span>
              </label>

              <button
                onClick={() => {
                  if (directMessages[0]?.id) {
                    socketRef.current?.emit("acknowledge_direct_message", {
                      messageId: directMessages[0].id,
                      isBroadcast: directMessages[0].isBroadcast
                    });
                  }
                  setDirectMessages((prev) => prev.slice(1));
                  setHasCheckedUnderstanding(false);
                }}
                disabled={!hasCheckedUnderstanding || acknowledgeTimer > 0}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all w-full sm:w-auto flex items-center justify-center gap-2 ${!hasCheckedUnderstanding || acknowledgeTimer > 0
                  ? "bg-black/10 dark:bg-white/10 text-black/40 dark:text-white/40 cursor-not-allowed"
                  : "bg-[#1F7A1F] hover:bg-[#1A661A] text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                  }`}
              >
                {acknowledgeTimer > 0 ? (
                  <>
                    <Clock className="w-4 h-4 animate-pulse" />
                    Wait {acknowledgeTimer}s
                  </>
                ) : (
                  "Acknowledged"
                )}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Expanded Image Modal */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/90 cursor-zoom-out p-4 animate-in fade-in duration-200"
          onClick={() => setExpandedImage(null)}
        >
          <img
            src={
              expandedImage.startsWith('http') ||
                expandedImage.startsWith('data:') ||
                expandedImage.startsWith('/') ||
                expandedImage.startsWith('blob:')
                ? expandedImage
                : `data:image/jpeg;base64,${expandedImage}`
            }
            alt="Expanded view"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}
    </>
  );
}
