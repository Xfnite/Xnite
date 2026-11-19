"use client";

import { useEffect, useState, useRef } from "react";
import { getSessionUser } from "@/app/actions/auth";
import { getUserSidebarBanner } from "@/app/actions/user";
import { isStaff } from "@/config/permissions";
import { DEFAULT_SIDEBAR_BANNER_URL, normalizeBannerEmbedUrl } from "@/lib/bannerUrl";
import { resolveSocketUrl } from "@/lib/socketUrl";
import { 
  getCheckRecordingsAction, 
  deleteCheckRecordingAction,
} from "@/app/actions/livestream";
import XfnitePlayer from "@/components/video/XfnitePlayer";
import { ConfirmDeleteDialog } from "@/components/Attendance/ConfirmDeleteDialog";
import {
  LivestreamChat,
  LivestreamChatMessage,
  LivestreamChatUser,
  formatChatSenderName,
} from "@/components/Livestream/LivestreamChat";
import { useLivestream } from "@/contexts/LivestreamContext";
import { io, Socket } from "socket.io-client";
import { 
  Radio, 
  Upload, 
  Users, 
  Play, 
  Pause, 
  ScreenShare, 
  Film, 
  Sparkles, 
  ExternalLink, 
  ShieldCheck, 
  Clock, 
  Square, 
  RefreshCw, 
  MonitorPlay, 
  Wifi, 
  WifiOff, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Maximize, 
  RotateCcw, 
  RotateCw, 
  Trash2, 
  LogOut, 
  AlertTriangle, 
  MessageSquare, 
  PanelRightOpen, 
  Repeat, 
  X, 
  ChevronUp, 
  ChevronDown, 
  Pin 
} from "lucide-react";
import { toast } from "sonner";

const LIVESTREAM_CHAT_TYPE = "livestream-chat";
const MAX_CHAT_DISPLAY_MESSAGES = 150;

interface ReplayRecordingItem {
  id: string;
  title?: string;
  projectType?: string;
  videoUrl: string;
  durationSec?: number;
  checkerName?: string;
  createdAt?: string | Date;
}

interface ReplayLiveSessionPayload {
  sessionId?: string;
  title?: string;
  projectType?: string;
  checkerName?: string;
  checkerEmail?: string;
  broadcastType?: string;
  replayRecordingId?: string | null;
  replayVideoUrl?: string;
  replayDurationSec?: number;
  maxLoops?: number;
  startedAt?: string | Date;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

export default function LivestreamPage() {
  const {
    currentUser,
    setCurrentUser,
    liveSession,
    liveViewerCount,
    broadcastQueue,
    reservedChecker,
    isQueueActionLoading,
    handleJoinQueue,
    handleLeaveQueue,
    isAnotherCheckerLive,
    isMyTurn,
    isAnotherCheckerReserved,
    isQueued,
    myQueuePosition,
    hasJoinedStream,
    isConnectingStream,
    isStreamInterrupted,
    isNetworkOffline,
    remoteStream,
    isViewerMuted,
    setIsViewerMuted,
    unmuteViewer,
    toggleViewerMute,
    handleJoinStream,
    handleLeaveStream,
    reconnectViewerStream,
    networkHealth,
    isSlowConnection,
    isVideoBuffering,
    setIsVideoBuffering,
    networkStats,
    isCapturing,
    broadcastSource,
    broadcasterStream,
    recordingSeconds,
    sessionTitle,
    setSessionTitle,
    sessionProjectType,
    setSessionProjectType,
    sessionNotes,
    setSessionNotes,
    isMicEnabled,
    toggleCheckerMic,
    startScreenCapture,
    finishScreenCapture,
    discardCapture,
    uploadFile,
    uploadBlobUrl,
    uploadTitle,
    setUploadTitle,
    uploadProjectType,
    setUploadProjectType,
    uploadNotes,
    setUploadNotes,
    handleFileSelected,
    startVideoBroadcast,
    finishVideoBroadcast,
    discardVideoBroadcast,
    videoDuration,
    videoCurrentTime,
    isVideoPaused,
    isMonitorAudioMuted,
    toggleVideoPlayPause,
    handleVideoSeek,
    handleSeekRelative,
    toggleMonitorAudio,
    isReviewing,
    setIsReviewing,
    recordedBlob,
    recordedBlobUrl,
    recordedDuration,
    isUploading,
    handlePublishRecording,
    handleDiscardRecording,
    handlePublishVideoFile,
    handleDiscardVideoBroadcast,
    formatTimer,
  } = useLivestream();

  const [activeTab, setActiveTab] = useState<"live" | "vod" | "studio">("live");

  // Replay Library State
  const [recordings, setRecordings] = useState<any[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<any>(null);
  const [selectedFilter, setSelectedFilter] = useState("All");

  // Delete Recording Confirmation Modal State
  const [recordingToDelete, setRecordingToDelete] = useState<string | null>(null);
  const [isDeletingRecording, setIsDeletingRecording] = useState(false);

  // Twitch-style Stream Chat state (active both during live & offline lobby)
  const [chatMessages, setChatMessages] = useState<LivestreamChatMessage[]>([]);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [chatPresenceCount, setChatPresenceCount] = useState<number>(0);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [isLiveInfoCollapsed, setIsLiveInfoCollapsed] = useState(false);
  const [showUnmuteHint, setShowUnmuteHint] = useState(false);
  const unmuteHintShownSessionRef = useRef<string | null>(null);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [uptimeTickMs, setUptimeTickMs] = useState(() => Date.now());
  const currentUserRef = useRef<LivestreamChatUser | null>(null);
  const isChatCollapsedRef = useRef(false);
  const [offlineBannerUrl, setOfflineBannerUrl] = useState(DEFAULT_SIDEBAR_BANNER_URL);
  const offlineBannerIframeRef = useRef<HTMLIFrameElement>(null);

  // Synced Replay-to-Live Broadcast State
  const [replayModalRecording, setReplayModalRecording] = useState<ReplayRecordingItem | null>(null);
  const [replayLoopCount, setReplayLoopCount] = useState<number>(1);
  const [replayLoopInput, setReplayLoopInput] = useState<string>("1");
  const [replayBroadcastTitle, setReplayBroadcastTitle] = useState<string>("");
  const [replayModalDurationSec, setReplayModalDurationSec] = useState<number>(0);
  const [isStartingReplayLive, setIsStartingReplayLive] = useState<boolean>(false);
  const [currentReplayLoop, setCurrentReplayLoop] = useState<number>(1);
  const currentReplayLoopRef = useRef<number>(1);
  const replayVideoRef = useRef<HTMLVideoElement | null>(null);
  const replaySyncedSessionIdRef = useRef<string | null>(null);

  // Settings
  const [saveToLibraryAfterStream, setSaveToLibraryAfterStream] = useState<boolean>(true);

  // Video element refs
  const viewerVideoRef = useRef<HTMLVideoElement>(null);
  const livePreviewRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);

  const [localUser, setLocalUser] = useState<any>(null);

  useEffect(() => {
    if (!currentUser?.role) {
      getSessionUser()
        .then((u) => {
          if (u) {
            setLocalUser(u);
            if (setCurrentUser) setCurrentUser(u);
          }
        })
        .catch(() => {});
    }
  }, [currentUser?.role, setCurrentUser]);

  const effectiveUser = currentUser?.role ? currentUser : (localUser || currentUser);

  useEffect(() => {
    currentUserRef.current = effectiveUser
      ? {
          name: effectiveUser.name || "Member",
          email: effectiveUser.email || "",
          role: effectiveUser.role || "",
          firstName: effectiveUser.firstName,
          lastName: effectiveUser.lastName,
        }
      : null;
  }, [effectiveUser]);

  useEffect(() => {
    isChatCollapsedRef.current = isChatCollapsed;
  }, [isChatCollapsed]);

  const expandStreamChat = () => {
    setIsChatCollapsed(false);
    setUnreadChatCount(0);
  };

  // Live stream uptime ticker
  useEffect(() => {
    if (!liveSession?.startedAt) return;
    const interval = setInterval(() => {
      setUptimeTickMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [liveSession?.startedAt]);

  const streamUptimeSec = liveSession?.startedAt
    ? Math.max(0, Math.floor((uptimeTickMs - new Date(liveSession.startedAt).getTime()) / 1000))
    : 0;

  // Setup Socket.io connection for real-time live streaming & stream chat
  useEffect(() => {
    let isMounted = true;
    let activeSocket: Socket | null = null;

    resolveSocketUrl().then((socketUrl) => {
      if (!isMounted) return;

      const token = getCookie("xnite_session");
      const socket = io(socketUrl, {
        auth: { token, client: "livestream" },
        transports: ["websocket", "polling"],
      });
      activeSocket = socket;
      socketRef.current = socket;

      socket.on("connect", () => {
        setIsSocketConnected(true);
        socket.emit("join_room", { chatType: LIVESTREAM_CHAT_TYPE });
        socket.emit("get_room_history", { chatType: LIVESTREAM_CHAT_TYPE });
      });

      socket.on("disconnect", () => {
        setIsSocketConnected(false);
      });

      socket.on("room_history", ({ chatType, messages }: { chatType: string; messages: any[] }) => {
        if (chatType !== LIVESTREAM_CHAT_TYPE || !Array.isArray(messages)) return;
        setChatMessages(
          messages
            .map((m) => ({ ...m, createdAt: new Date(m.createdAt) }))
            .slice(-MAX_CHAT_DISPLAY_MESSAGES)
        );
      });

      socket.on("new_message", ({ chatType, message }: { chatType: string; message: any }) => {
        if (chatType !== LIVESTREAM_CHAT_TYPE || !message) return;
        const formatted: LivestreamChatMessage = {
          ...message,
          createdAt: new Date(message.createdAt),
        };
        const myEmail = (currentUserRef.current?.email || "").trim().toLowerCase();
        const isFromMe = Boolean(
          myEmail && message.senderEmail && message.senderEmail.trim().toLowerCase() === myEmail
        );

        setChatMessages((prev) => {
          if (prev.some((m) => m.id === formatted.id)) return prev;
          const filtered = isFromMe
            ? prev.filter((m) => !(m.id.startsWith("temp-") && m.text.trim() === formatted.text.trim()))
            : prev;
          return [...filtered, formatted].slice(-MAX_CHAT_DISPLAY_MESSAGES);
        });

        if (!isFromMe && isChatCollapsedRef.current) {
          setUnreadChatCount((c) => c + 1);
        }
      });

      socket.on("message_edited", ({ chatType, message }: { chatType: string; message: any }) => {
        if (chatType !== LIVESTREAM_CHAT_TYPE || !message) return;
        const formatted: LivestreamChatMessage = {
          ...message,
          createdAt: new Date(message.createdAt),
        };
        setChatMessages((prev) => prev.map((m) => (m.id === formatted.id ? formatted : m)));
      });

      socket.on("message_deleted", ({ chatType, message }: { chatType: string; message: any }) => {
        if (chatType !== LIVESTREAM_CHAT_TYPE || !message) return;
        const formatted: LivestreamChatMessage = {
          ...message,
          createdAt: new Date(message.createdAt),
        };
        setChatMessages((prev) => prev.map((m) => (m.id === formatted.id ? formatted : m)));
      });

      socket.on("message_removed", ({ chatType, messageId }: { chatType: string; messageId: string }) => {
        if (chatType !== LIVESTREAM_CHAT_TYPE || !messageId) return;
        setChatMessages((prev) => prev.filter((m) => m.id !== messageId));
      });

      socket.on("livestream_chat_cleared", ({ clearedBy }: { clearedBy?: string }) => {
        setChatMessages([]);
        setUnreadChatCount(0);
        toast.info(`Stream chat was cleared${clearedBy ? ` by ${clearedBy}` : ""}.`);
      });

      socket.on("livestream_chat:presence", (count: number) => {
        if (typeof count === "number") {
          setChatPresenceCount(count);
        }
      });

      socket.on("livestream:replay_started", ({ session }: { session: ReplayLiveSessionPayload }) => {
        setIsStartingReplayLive(false);
        setReplayModalRecording(null);
        currentReplayLoopRef.current = 1;
        setCurrentReplayLoop(1);
        replaySyncedSessionIdRef.current = null;
        setActiveTab("live");
        const loops = Number(session?.maxLoops || 1);
        toast.success(`Replay is now playing live (${loops} ${loops === 1 ? "loop" : "loops"}).`);
      });

      socket.on("livestream:replay_error", ({ message }: { message?: string }) => {
        setIsStartingReplayLive(false);
        toast.error(message || "Unable to start live replay broadcast.");
      });
    });

    return () => {
      isMounted = false;
      if (activeSocket) {
        activeSocket.emit("leave_room", { chatType: LIVESTREAM_CHAT_TYPE });
        activeSocket.disconnect();
      }
    };
  }, []);

  // Initial load of recordings and user sidebar banner
  useEffect(() => {
    loadRecordings();

    getUserSidebarBanner()
      .then((res) => {
        if (res.success && res.url) {
          setOfflineBannerUrl(normalizeBannerEmbedUrl(res.url));
        }
      })
      .catch(() => {});

    const handleBannerUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ url?: string }>).detail;
      if (detail?.url) {
        setOfflineBannerUrl(normalizeBannerEmbedUrl(detail.url));
      }
    };

    const handleYoutubeMessage = (e: MessageEvent) => {
      if (e.origin !== "https://www.youtube.com") return;
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        const win = offlineBannerIframeRef.current?.contentWindow;
        if (!win) return;
        if (data.event === "onStateChange" && data.info === 0) {
          win.postMessage(JSON.stringify({ event: "command", func: "seekTo", args: [0, true] }), "*");
          win.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: [] }), "*");
        } else if (data.event === "onStateChange" && data.info === 2) {
          win.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: [] }), "*");
        }
      } catch {}
    };

    window.addEventListener("sidebar_banner_updated", handleBannerUpdated);
    window.addEventListener("message", handleYoutubeMessage);
    return () => {
      window.removeEventListener("sidebar_banner_updated", handleBannerUpdated);
      window.removeEventListener("message", handleYoutubeMessage);
    };
  }, []);

  const loadRecordings = async (filter?: string) => {
    const res = await getCheckRecordingsAction(filter);
    if (res.success && res.recordings) {
      setRecordings(res.recordings);
      if (res.recordings.length > 0 && !selectedRecording) {
        setSelectedRecording(res.recordings[0]);
      }
    }
  };

  const openDeleteModal = (recordingId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setRecordingToDelete(recordingId);
  };

  const handleConfirmDelete = async () => {
    if (!recordingToDelete) return;
    setIsDeletingRecording(true);
    try {
      const res = await deleteCheckRecordingAction(recordingToDelete);
      if (res.success) {
        toast.success("Recording deleted from library.");
        setRecordings((prev) => {
          const updated = prev.filter((r) => r.id !== recordingToDelete);
          if (selectedRecording?.id === recordingToDelete) {
            setSelectedRecording(updated.length > 0 ? updated[0] : null);
          }
          return updated;
        });
        setRecordingToDelete(null);
      } else {
        toast.error(res.error || "Failed to delete recording.");
      }
    } catch {
      toast.error("Failed to delete recording.");
    } finally {
      setIsDeletingRecording(false);
    }
  };

  const canDeleteRecording = (recording?: any) => {
    if (!recording || !effectiveUser) return false;
    const userEmail = (effectiveUser.email || "").trim().toLowerCase();
    const checkerEmail = (recording.checkerEmail || "").trim().toLowerCase();
    const userRole = (effectiveUser.role || "").trim().toLowerCase();
    return (checkerEmail && userEmail === checkerEmail) || userRole === "admin";
  };

  // Keyboard shortcuts for video broadcast playback in Studio
  useEffect(() => {
    if (activeTab !== "studio" || !isCapturing || broadcastSource !== "video") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.isContentEditable)
      ) {
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleSeekRelative(-5);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleSeekRelative(5);
      } else if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        toggleVideoPlayPause();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, isCapturing, broadcastSource, handleSeekRelative, toggleVideoPlayPause]);

  // Handle Manual File Upload directly to library
  const handleManualUpload = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!uploadFile) {
      toast.error("Please choose a video file first.");
      return;
    }

    toast.info("Uploading video check directly to Replay Library...");

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("title", uploadTitle || uploadFile.name);
      formData.append("projectType", uploadProjectType);
      formData.append("durationSec", String(videoDuration || 0));
      formData.append("description", uploadNotes);

      const response = await fetch("/api/livestream/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (data.success && data.recording) {
        toast.success("Video check uploaded successfully to Replay Library!");
        if (uploadBlobUrl) URL.revokeObjectURL(uploadBlobUrl);
        await loadRecordings();
        setSelectedRecording(data.recording);
        setActiveTab("vod");
      } else {
        toast.error(data.error || "Upload failed.");
      }
    } catch (err: any) {
      toast.error("Error: " + (err.message || "Failed to upload file."));
    }
  };

  const onPublishRecording = () => {
    handlePublishRecording((rec) => {
      loadRecordings();
      setSelectedRecording(rec);
      setActiveTab("vod");
    });
  };

  const onPublishVideoFile = () => {
    handlePublishVideoFile((rec) => {
      loadRecordings();
      setSelectedRecording(rec);
      setActiveTab("vod");
    });
  };

  const formatUptime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const normalizeSenderRole = (role?: string): string => {
    const clean = (role || "").trim().toLowerCase();
    if (clean === "admin") return "admin";
    if (clean === "judger") return "judger";
    if (clean === "checker") return "checker";
    if (clean === "recruiter") return "recruiter";
    if (["old-labeler", "old-laber", "old labeler"].includes(clean)) return "old";
    if (clean === "labeler") return "labeler";
    if (clean === "applicant") return "applicant";
    return "member";
  };

  const handleSendChatMessage = ({
    text,
    replyTo,
  }: {
    text: string;
    replyTo?: LivestreamChatMessage | null;
  }): boolean => {
    if (!socketRef.current || !isSocketConnected) {
      toast.error("Reconnecting to stream chat...");
      return false;
    }

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const optimistic: LivestreamChatMessage = {
      id: tempId,
      chatType: LIVESTREAM_CHAT_TYPE,
      sender: effectiveUser?.name || effectiveUser?.email || "You",
      senderEmail: effectiveUser?.email || null,
      senderRole: normalizeSenderRole(effectiveUser?.role),
      senderFirstName: effectiveUser?.firstName || null,
      senderLastName: effectiveUser?.lastName || null,
      text,
      createdAt: new Date(),
      replyToId: replyTo ? replyTo.id : null,
      replyToSender: replyTo ? formatChatSenderName(replyTo) : null,
      replyToText: replyTo ? replyTo.text : null,
    };

    setChatMessages((prev) => [...prev, optimistic].slice(-MAX_CHAT_DISPLAY_MESSAGES));

    socketRef.current.emit("send_message", {
      chatType: LIVESTREAM_CHAT_TYPE,
      text,
      replyToId: replyTo ? replyTo.id : null,
      replyToSender: replyTo ? formatChatSenderName(replyTo) : null,
      replyToText: replyTo ? replyTo.text : null,
    });
    return true;
  };

  const handleEditChatMessage = (messageId: string, newText: string): boolean => {
    if (!socketRef.current || !isSocketConnected) {
      toast.error("Reconnecting to stream chat...");
      return false;
    }
    socketRef.current.emit("edit_message", {
      chatType: LIVESTREAM_CHAT_TYPE,
      messageId,
      newText,
    });
    return true;
  };

  const handleDeleteChatMessage = (messageId: string, forceDelete: boolean) => {
    if (!socketRef.current || !isSocketConnected) {
      toast.error("Reconnecting to stream chat...");
      return;
    }
    if (!forceDelete) {
      setChatMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, text: "Message unsent" } : m))
      );
    } else {
      setChatMessages((prev) => prev.filter((m) => m.id !== messageId));
    }
    socketRef.current.emit("delete_message", {
      chatType: LIVESTREAM_CHAT_TYPE,
      messageId,
      forceDelete,
    });
  };

  const isUserStaff = isStaff(effectiveUser?.role);
  const isReplayBroadcastActive = Boolean(
    !isCapturing && liveSession?.broadcastType === "replay" && liveSession?.replayVideoUrl
  );
  const canManageLiveReplay = Boolean(
    liveSession?.broadcastType === "replay" &&
      effectiveUser &&
      ((liveSession.checkerEmail &&
        effectiveUser.email &&
        liveSession.checkerEmail.trim().toLowerCase() === effectiveUser.email.trim().toLowerCase()) ||
        (effectiveUser.role || "").trim().toLowerCase() === "admin")
  );

  // Track room presence automatically when watching a live Replay Broadcast
  useEffect(() => {
    if (!socketRef.current || !isSocketConnected) return;
    if (activeTab === "live" && isReplayBroadcastActive) {
      socketRef.current.emit("livestream:join_room");
      return () => {
        socketRef.current?.emit("livestream:leave_room");
      };
    }
  }, [activeTab, isReplayBroadcastActive, isSocketConnected]);

  // Prevent live replay audio bleeding while browsing Replay Library or Studio tabs
  useEffect(() => {
    if (replayVideoRef.current) {
      replayVideoRef.current.muted = isViewerMuted || activeTab !== "live";
    }
  }, [isViewerMuted, activeTab, isReplayBroadcastActive]);

  // Show the unmute prompt only once per live session for a brief period, then settle into low-opacity hover state
  useEffect(() => {
    const isWatchingLiveAudio = isReplayBroadcastActive || Boolean(liveSession && hasJoinedStream);
    if (!isWatchingLiveAudio) {
      setShowUnmuteHint(false);
      if (!liveSession) {
        unmuteHintShownSessionRef.current = null;
      }
      return;
    }

    if (!isViewerMuted) {
      setShowUnmuteHint(false);
      return;
    }

    const sessionKey = String(liveSession?.sessionId || liveSession?.startedAt || "active");
    if (unmuteHintShownSessionRef.current === sessionKey) {
      return;
    }

    unmuteHintShownSessionRef.current = sessionKey;
    setShowUnmuteHint(true);
    const timer = setTimeout(() => {
      setShowUnmuteHint(false);
    }, 4500);

    return () => clearTimeout(timer);
  }, [isReplayBroadcastActive, liveSession, hasJoinedStream, isViewerMuted]);

  const openReplayBroadcastModal = (recording: ReplayRecordingItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!recording?.videoUrl) {
      toast.error("This recording does not have a playable video URL.");
      return;
    }
    setReplayModalRecording(recording);
    setReplayBroadcastTitle(recording.title || "Replay Audit Stream");
    setReplayLoopCount(1);
    setReplayLoopInput("1");
    setReplayModalDurationSec(Number(recording.durationSec || 0));
  };

  const handleStartReplayBroadcast = () => {
    if (!replayModalRecording) return;
    if (!socketRef.current || !isSocketConnected) {
      toast.error("Still connecting to stream server. Please try again.");
      return;
    }
    if (isCapturing) {
      toast.error("Stop your active Studio broadcast before starting a Replay live stream.");
      return;
    }
    if (isAnotherCheckerLive) {
      toast.error(`Checker "${liveSession.checkerName}" is currently live. Wait until their stream ends.`);
      return;
    }
    if (isAnotherCheckerReserved && reservedChecker) {
      toast.error(`Broadcast slot is currently reserved for ${reservedChecker.name}.`);
      return;
    }

    const parsedLoops = parseInt(replayLoopInput || String(replayLoopCount), 10);
    const maxLoops = Number.isFinite(parsedLoops) ? Math.max(1, Math.min(50, parsedLoops)) : 1;

    setIsStartingReplayLive(true);
    socketRef.current.emit("livestream:replay_start", {
      recordingId: replayModalRecording.id,
      videoUrl: replayModalRecording.videoUrl,
      title: replayBroadcastTitle.trim() || replayModalRecording.title || "Replay Audit Stream",
      projectType: replayModalRecording.projectType || "Standard Building",
      durationSec: replayModalDurationSec || replayModalRecording.durationSec || 0,
      maxLoops,
    });
  };

  const handleEndReplayBroadcast = () => {
    if (!socketRef.current || !isSocketConnected) {
      toast.error("Reconnecting to stream server...");
      return;
    }
    socketRef.current.emit("livestream:checker_stop");
    toast.info("Stopping live replay broadcast...");
  };

  const syncReplayVideoToLive = (videoEl: HTMLVideoElement, forceSeek = false) => {
    if (!liveSession || liveSession.broadcastType !== "replay") return;
    const maxLoops = Math.max(1, Number(liveSession.maxLoops || 1));
    const dur =
      videoEl.duration && isFinite(videoEl.duration) && videoEl.duration > 0
        ? videoEl.duration
        : Number(liveSession.replayDurationSec || 0);

    if (
      canManageLiveReplay &&
      dur > 0 &&
      (!liveSession.replayDurationSec || Math.abs(dur - Number(liveSession.replayDurationSec)) > 1)
    ) {
      socketRef.current?.emit("livestream:replay_report_duration", {
        sessionId: liveSession.sessionId,
        durationSec: dur,
      });
    }

    if (dur > 0 && liveSession.startedAt) {
      const elapsedSec = Math.max(0, (Date.now() - new Date(liveSession.startedAt).getTime()) / 1000);
      if (elapsedSec >= dur * maxLoops) {
        currentReplayLoopRef.current = maxLoops;
        setCurrentReplayLoop(maxLoops);
        try {
          videoEl.currentTime = Math.max(0, dur - 0.1);
        } catch {}
        videoEl.pause();
        socketRef.current?.emit("livestream:replay_completed", {
          sessionId: liveSession.sessionId,
        });
        return;
      }

      const calcLoop = Math.min(maxLoops, Math.floor(elapsedSec / dur) + 1);
      const offset = elapsedSec % dur;
      currentReplayLoopRef.current = calcLoop;
      setCurrentReplayLoop(calcLoop);

      if ((forceSeek || elapsedSec > 1.5) && offset < dur - 0.25) {
        try {
          videoEl.currentTime = offset;
        } catch {}
      }
    } else {
      currentReplayLoopRef.current = 1;
      setCurrentReplayLoop(1);
    }

    videoEl.play().catch(() => {
      videoEl.muted = true;
      setIsViewerMuted(true);
      videoEl.play().catch(() => {});
    });
  };

  const activeDisplaySession =
    liveSession ||
    (isCapturing
      ? {
          title: sessionTitle || "Live Quality Audit Inspection",
          checkerName: effectiveUser?.name || "You",
          projectType: sessionProjectType || "Standard Building",
          broadcastType: broadcastSource || "screen",
        }
      : null);

  return (
    <div className="relative w-full min-h-full">
      {/* Mesh Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div
          className="absolute bg-[#55f761] filter blur-[120px] rounded-full opacity-20 dark:opacity-10"
          style={{ width: "45vw", height: "45vw", top: "-10%", left: "-10%" }}
        />
        <div
          className="absolute bg-[#1F7A1F] filter blur-[120px] rounded-full opacity-20 dark:opacity-10"
          style={{ width: "50vw", height: "50vw", top: "35%", right: "-15%" }}
        />
      </div>

      <div className="relative space-y-6 lg:space-y-7 w-full max-w-[1720px] mx-auto pt-3 pb-20 z-10 px-1 sm:px-3">
        {/* Header Section */}
        <section className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-black/5 dark:border-white/5 pb-6">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#0D1B2A] dark:text-white">
              Livestreams &amp; Replays
            </h1>
            <p className="text-sm text-[#2F3E46]/80 dark:text-white/60 mt-1 max-w-2xl">
              Watch real-time project inspections, learn grading standards directly from checkers, or review past recordings on demand.
            </p>
          </div>

          {/* Navigation Pill Tabs */}
          <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-[#1B263B]/60 rounded-xl border border-black/5 dark:border-white/5">
            <button
              onClick={() => setActiveTab("live")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "live"
                  ? "bg-white dark:bg-[#060D14] text-[#1F7A1F] dark:text-[#55f761] shadow-sm"
                  : "text-[#2F3E46]/70 dark:text-white/60 hover:text-[#0D1B2A] dark:hover:text-white"
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${liveSession ? "text-red-500 animate-pulse" : ""}`} />
              Live Check
              {liveSession && <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />}
            </button>
            <button
              onClick={() => {
                setActiveTab("vod");
                loadRecordings(selectedFilter);
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "vod"
                  ? "bg-white dark:bg-[#060D14] text-[#1F7A1F] dark:text-[#55f761] shadow-sm"
                  : "text-[#2F3E46]/70 dark:text-white/60 hover:text-[#0D1B2A] dark:hover:text-white"
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              Replay Library
            </button>
            {isUserStaff && (
              <button
                onClick={() => setActiveTab("studio")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === "studio"
                    ? "bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] shadow-sm font-bold"
                    : "text-[#2F3E46]/70 dark:text-white/60 hover:text-[#0D1B2A] dark:hover:text-white"
                }`}
              >
                <ScreenShare className="w-3.5 h-3.5" />
                Checker Studio
                {isCapturing && <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />}
              </button>
            )}
          </div>
        </section>

        {/* Tab 1: Twitch-Style Live Stream Player + Stream Info + Collapsible Animated Side Chat */}
        <div
          className={
            activeTab === "live"
              ? "flex flex-col lg:flex-row lg:items-stretch"
              : "hidden"
          }
        >
          {/* Main Left Column: 16:9 Video Stage + Below-Player Stream Info Bar */}
          <div className="flex-1 min-w-0 space-y-3 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]">
              <div className="relative aspect-video w-full bg-black rounded-2xl overflow-hidden shadow-2xl border border-black/10 dark:border-white/10 group flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]">
                {/* Desktop Expand Chat button when collapsed (Twitch Theater-style) */}
                <button
                  type="button"
                  onClick={expandStreamChat}
                  aria-hidden={!isChatCollapsed}
                  className={`hidden lg:flex absolute top-3 right-3 z-40 items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/75 hover:bg-black/90 text-white text-xs font-semibold border border-white/20 backdrop-blur-md shadow-lg transition-all duration-300 ease-out cursor-pointer ${
                    isChatCollapsed
                      ? "opacity-100 scale-100 translate-x-0"
                      : "opacity-0 scale-95 translate-x-2 pointer-events-none"
                  }`}
                  title="Expand Stream Chat"
                >
                  <PanelRightOpen className="w-3.5 h-3.5 text-[#55f761]" />
                  <span>Show Chat</span>
                  {unreadChatCount > 0 && (
                    <span className="px-1.5 py-0.25 rounded-full bg-red-500 text-white text-[10px] font-bold">
                      {unreadChatCount > 99 ? "99+" : unreadChatCount}
                    </span>
                  )}
                </button>

                {/* Unified Top Live Stream Info Overlay (Active Pinned Card vs Collapsed Top-Hover Scrim) */}
                {activeDisplaySession && (
                  !isLiveInfoCollapsed ? (
                    /* Design 1 (Active / Always Showing): Docked frosted glass card bar */
                    <div
                      className={`absolute top-3 left-3 z-30 transition-all duration-300 pointer-events-auto ${
                        isChatCollapsed ? "right-3 lg:right-32" : "right-3"
                      }`}
                    >
                      <div className="bg-[#0B121B]/85 backdrop-blur-xl rounded-2xl border border-white/15 px-3.5 py-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.55)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative shrink-0">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1F7A1F] to-[#55f761] text-[#060D14] flex items-center justify-center font-black text-sm ring-2 ring-red-500 ring-offset-2 ring-offset-[#0B121B]">
                              {(activeDisplaySession.checkerName || "C").charAt(0).toUpperCase()}
                            </div>
                            <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-1.5 py-[1px] rounded bg-red-600 text-white text-[7px] font-black uppercase tracking-wider shadow">
                              LIVE
                            </span>
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-xs sm:text-sm font-bold text-white truncate">
                              {activeDisplaySession.title || "Live Quality Audit Inspection"}
                            </h3>
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] mt-0.5">
                              <span className="font-semibold text-[#55f761]">
                                {activeDisplaySession.checkerName}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-sky-400 text-[9px] font-bold uppercase border border-blue-400/25">
                                Overseer
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/85 text-[10px] font-medium">
                                {activeDisplaySession.projectType || "Standard Building"}
                              </span>
                              <span className="text-[10px] text-white/55">
                                {activeDisplaySession.broadcastType === "video" || activeDisplaySession.broadcastType === "replay"
                                  ? "Video Audit"
                                  : "Screen Share"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <span className="flex items-center gap-1 px-2 py-1 rounded-xl bg-red-500/15 text-red-300 text-[11px] font-bold border border-red-500/25">
                            <Users className="w-3 h-3" />
                            {liveViewerCount} watching
                          </span>
                          <span className="flex items-center gap-1 px-2 py-1 rounded-xl bg-white/10 text-white/90 text-[11px] font-mono font-semibold border border-white/10">
                            <Clock className="w-3 h-3 text-[#55f761]" />
                            {formatUptime(isCapturing && !liveSession ? recordingSeconds : streamUptimeSec)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsLiveInfoCollapsed(true)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#55f761]/15 hover:bg-[#55f761]/25 text-[#55f761] text-[11px] font-bold border border-[#55f761]/30 transition-all cursor-pointer"
                            title="Collapse live info bar (hover top of video to reveal)"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Collapse</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Design 2 (Collapsed -> On Hover): Minimal chip at rest, edge-to-edge top gradient banner when hovering anywhere along top */
                    <div className="group/top-live absolute top-0 inset-x-0 z-30 h-28 flex items-start pointer-events-auto">
                      {/* Minimal rest pill — clicking expands immediately */}
                      <button
                        type="button"
                        onClick={() => setIsLiveInfoCollapsed(false)}
                        className="absolute top-3 left-3 pointer-events-auto flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/65 hover:bg-black/85 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-wider border border-white/15 shadow-lg transition-opacity duration-200 group-hover/top-live:opacity-0 cursor-pointer"
                        title="Expand & keep stream info visible"
                      >
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                        <span>Live</span>
                        <span className="text-white/65 font-mono normal-case">
                          {formatUptime(isCapturing && !liveSession ? recordingSeconds : streamUptimeSec)}
                        </span>
                        <ChevronDown className="w-3 h-3 text-[#55f761]" />
                      </button>

                      {/* Hover reveal gradient overlay */}
                      <div
                        className={`w-full px-4 pt-3.5 pb-8 bg-gradient-to-b from-black/95 via-black/75 to-transparent flex flex-wrap items-center justify-between gap-3 opacity-0 -translate-y-2 pointer-events-none group-hover/top-live:opacity-100 group-hover/top-live:translate-y-0 group-hover/top-live:pointer-events-auto transition-all duration-300 ease-out ${
                          isChatCollapsed ? "lg:pr-36" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative shrink-0">
                            <div className="w-9 h-9 rounded-full bg-white/10 text-[#55f761] flex items-center justify-center font-black text-sm border border-white/20 backdrop-blur-md">
                              {(activeDisplaySession.checkerName || "C").charAt(0).toUpperCase()}
                            </div>
                            <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-1.5 py-[1px] rounded bg-red-600 text-white text-[7px] font-black uppercase tracking-wider">
                              LIVE
                            </span>
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-white truncate drop-shadow-sm">
                              {activeDisplaySession.title || "Live Quality Audit Inspection"}
                            </h3>
                            <p className="text-[11px] text-white/75 truncate flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold text-[#55f761]">
                                {activeDisplaySession.checkerName}
                              </span>
                              <span>&bull;</span>
                              <span>{activeDisplaySession.projectType || "Standard Building"}</span>
                              <span>&bull;</span>
                              <span>
                                {activeDisplaySession.broadcastType === "video" || activeDisplaySession.broadcastType === "replay"
                                  ? "Video Audit"
                                  : "Screen Share"}
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/55 text-red-300 text-[11px] font-bold border border-white/15 backdrop-blur-md">
                            <Users className="w-3 h-3" />
                            {liveViewerCount} watching
                          </span>
                          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/55 text-white text-[11px] font-mono font-semibold border border-white/15 backdrop-blur-md">
                            <Clock className="w-3 h-3 text-[#55f761]" />
                            {formatUptime(isCapturing && !liveSession ? recordingSeconds : streamUptimeSec)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsLiveInfoCollapsed(false)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold border border-white/25 backdrop-blur-md transition-all cursor-pointer shadow-lg"
                            title="Pin stream info so it always shows"
                          >
                            <Pin className="w-3 h-3 text-[#55f761]" />
                            <span>Always Show</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                )}

                {/* Mode A: Real-Time WebRTC In-Browser Stream when broadcasting or a Checker is LIVE */}
                {isCapturing ? (
                    <div className="relative w-full h-full bg-black flex items-center justify-center">
                      <video
                        ref={(el) => {
                          if (el) {
                            el.muted = true;
                            el.defaultMuted = true;
                            const stream = broadcasterStream;
                            if (stream && el.srcObject !== stream) {
                              el.srcObject = stream;
                              el.play().catch(() => {});
                            }
                          }
                        }}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-contain"
                      />

                      <div className="absolute bottom-4 right-4 z-30 flex items-center gap-2">
                        <button
                          onClick={() => setActiveTab("studio")}
                          className="px-3.5 py-1.5 rounded-xl bg-[#1F7A1F] dark:bg-[#55f761] hover:scale-105 active:scale-95 text-white dark:text-[#060D14] text-xs font-bold flex items-center gap-1.5 shadow-lg transition-all cursor-pointer backdrop-blur-md"
                        >
                          <ScreenShare className="w-3.5 h-3.5" />
                          Return to Studio Controls
                        </button>
                      </div>

                      <div className="absolute bottom-4 left-4 z-30 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/70 backdrop-blur-md text-white text-xs border border-white/10">
                        <Users className="w-3.5 h-3.5 text-[#55f761]" />
                        <span>{liveViewerCount} {liveViewerCount === 1 ? "viewer" : "viewers"} watching your live check</span>
                      </div>
                    </div>
                  ) : isReplayBroadcastActive ? (
                    <div className="relative w-full h-full bg-black flex items-center justify-center">
                      <video
                        key={liveSession.sessionId || liveSession.replayVideoUrl}
                        ref={(el) => {
                          replayVideoRef.current = el;
                          if (el) {
                            el.muted = isViewerMuted;
                            el.defaultMuted = isViewerMuted;
                          }
                        }}
                        src={liveSession.replayVideoUrl}
                        autoPlay
                        playsInline
                        muted={isViewerMuted}
                        onLoadedMetadata={(e) => {
                          const video = e.currentTarget;
                          const isNewSession = replaySyncedSessionIdRef.current !== (liveSession.sessionId || liveSession.replayVideoUrl);
                          replaySyncedSessionIdRef.current = liveSession.sessionId || liveSession.replayVideoUrl;
                          syncReplayVideoToLive(video, isNewSession);
                        }}
                        onEnded={(e) => {
                          const video = e.currentTarget;
                          const maxLoops = Math.max(1, Number(liveSession?.maxLoops || 1));
                          if (currentReplayLoopRef.current < maxLoops) {
                            const nextLoop = currentReplayLoopRef.current + 1;
                            currentReplayLoopRef.current = nextLoop;
                            setCurrentReplayLoop(nextLoop);
                            video.currentTime = 0;
                            video.play().catch(() => {});
                          } else {
                            video.pause();
                            socketRef.current?.emit("livestream:replay_completed", {
                              sessionId: liveSession.sessionId,
                            });
                          }
                        }}
                        className="w-full h-full object-contain"
                      />

                      <div className="absolute bottom-4 right-4 z-30 flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const nextMuted = !isViewerMuted;
                            setIsViewerMuted(nextMuted);
                            if (!nextMuted) setShowUnmuteHint(false);
                            if (replayVideoRef.current) {
                              replayVideoRef.current.muted = nextMuted;
                              if (!nextMuted) {
                                replayVideoRef.current.volume = 1;
                                replayVideoRef.current.play().catch(() => {});
                              }
                            }
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer border transition-all duration-300 backdrop-blur-md ${
                            isViewerMuted && showUnmuteHint
                              ? "bg-emerald-600/45 hover:bg-emerald-600/80 text-white/90 border-white/15 opacity-75 hover:opacity-100 shadow-lg"
                              : "bg-black/35 hover:bg-black/75 text-white/80 hover:text-white border-white/10 opacity-35 hover:opacity-100"
                          }`}
                        >
                          {isViewerMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                          <span>{isViewerMuted ? (showUnmuteHint ? "Click to Unmute" : "Unmute") : "Mute"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (replayVideoRef.current) {
                              syncReplayVideoToLive(replayVideoRef.current, true);
                              toast.info("Synced to live replay timestamp.");
                            }
                          }}
                          className="px-3 py-1.5 rounded-xl bg-black/70 hover:bg-black/90 text-white text-xs font-semibold flex items-center gap-1.5 border border-white/20 transition-all cursor-pointer backdrop-blur-md"
                          title="Sync to live replay timestamp"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Sync
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (replayVideoRef.current) {
                              if (!document.fullscreenElement) {
                                replayVideoRef.current.requestFullscreen().catch(() => {});
                              } else {
                                document.exitFullscreen().catch(() => {});
                              }
                            }
                          }}
                          className="p-1.5 rounded-xl bg-black/70 hover:bg-black/90 text-white text-xs font-semibold flex items-center justify-center border border-white/20 transition-all cursor-pointer backdrop-blur-md"
                          title="Toggle Fullscreen"
                        >
                          <Maximize className="w-3.5 h-3.5" />
                        </button>
                        {canManageLiveReplay && (
                          <button
                            type="button"
                            onClick={handleEndReplayBroadcast}
                            className="px-3 py-1.5 rounded-xl bg-red-600/90 hover:bg-red-600 text-white text-xs font-bold flex items-center gap-1.5 border border-white/20 transition-all cursor-pointer backdrop-blur-md shadow-lg"
                            title="End live replay broadcast"
                          >
                            <Square className="w-3.5 h-3.5 fill-current" />
                            End Live
                          </button>
                        )}
                      </div>
                    </div>
                  ) : liveSession ? (
                    hasJoinedStream ? (
                      <div className="relative w-full h-full bg-black flex items-center justify-center">
                        {isSlowConnection && !isConnectingStream && !isNetworkOffline && (
                          <div className="absolute top-13 left-3 z-30 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-950/90 border border-amber-500/50 text-amber-200 text-xs shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-1 max-w-[calc(100%-24px)] sm:max-w-md">
                            <WifiOff className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                            <div className="truncate sm:whitespace-normal">
                              <span className="font-bold text-amber-300">Slow Internet Detected:</span>
                              <span className="ml-1 text-amber-100/90 text-[11px]">
                                {networkStats.rttMs > 0 ? `High ping (${networkStats.rttMs}ms) • ` : ""}
                                Stream lag or buffering is due to your local connection.
                              </span>
                            </div>
                          </div>
                        )}
                        <video
                          ref={(el) => {
                            viewerVideoRef.current = el;
                            if (el) {
                              el.muted = isViewerMuted;
                              el.defaultMuted = isViewerMuted;
                              if (remoteStream && el.srcObject !== remoteStream) {
                                el.srcObject = remoteStream;
                                el.play().catch(() => {});
                              }
                            }
                          }}
                          autoPlay
                          playsInline
                          muted={isViewerMuted}
                          onLoadedMetadata={(e) => {
                            (e.target as HTMLVideoElement).play().catch(() => {});
                          }}
                          onCanPlay={(e) => {
                            (e.target as HTMLVideoElement).play().catch(() => {});
                          }}
                          className="w-full h-full object-contain"
                        />

                        {/* Connecting / Reconnecting Overlay */}
                        {(isConnectingStream || isStreamInterrupted) && (
                          <div className="absolute inset-0 bg-black/80 backdrop-blur-xs flex flex-col items-center justify-center gap-3 z-20 p-4 text-center">
                            <RefreshCw className="w-8 h-8 animate-spin text-[#55f761]" />
                            <div className="space-y-1">
                              <p className="text-white text-sm font-semibold">
                                {isNetworkOffline
                                  ? "Internet Connection Lost"
                                  : isStreamInterrupted
                                  ? "Reconnecting to live broadcast..."
                                  : "Connecting to checker's broadcast..."}
                              </p>
                              <p className="text-white/60 text-xs max-w-xs">
                                {isNetworkOffline
                                  ? "Playback will automatically resume once your network is restored."
                                  : "Re-establishing real-time audio and video feed."}
                              </p>
                            </div>
                            <button
                              onClick={() => reconnectViewerStream(true)}
                              className="mt-1 px-4 py-2 rounded-xl bg-[#1F7A1F] dark:bg-[#55f761] hover:scale-105 active:scale-95 text-white dark:text-[#060D14] text-xs font-bold transition-all cursor-pointer shadow-lg flex items-center gap-1.5"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              Reconnect Now
                            </button>
                          </div>
                        )}

                        {/* Unmute & Viewer Player Controls */}
                        <div className="absolute bottom-4 right-4 z-30 flex flex-wrap items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              if (isViewerMuted) {
                                setShowUnmuteHint(false);
                                unmuteViewer();
                              } else {
                                setIsViewerMuted(true);
                                if (viewerVideoRef.current) viewerVideoRef.current.muted = true;
                              }
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer border transition-all duration-300 backdrop-blur-md ${
                              isViewerMuted && showUnmuteHint
                                ? "bg-emerald-600/45 hover:bg-emerald-600/80 text-white/90 border-white/15 opacity-75 hover:opacity-100 shadow-lg"
                                : "bg-black/35 hover:bg-black/75 text-white/80 hover:text-white border-white/10 opacity-35 hover:opacity-100"
                            }`}
                          >
                            {isViewerMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                            <span>{isViewerMuted ? (showUnmuteHint ? "Click to Unmute" : "Unmute") : "Mute"}</span>
                          </button>
                          <button
                            onClick={() => reconnectViewerStream(true)}
                            className="px-3 py-1.5 rounded-xl bg-black/70 hover:bg-black/90 text-white text-xs font-semibold flex items-center gap-1.5 border border-white/20 transition-all cursor-pointer backdrop-blur-md"
                            title="Click if stream is buffering, frozen, or interrupted"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isConnectingStream ? "animate-spin" : ""}`} />
                            Reload
                          </button>
                          <button
                            onClick={() => {
                              if (viewerVideoRef.current) {
                                if (document.pictureInPictureElement) {
                                  document.exitPictureInPicture().catch(() => {});
                                } else if ((viewerVideoRef.current as any).requestPictureInPicture) {
                                  (viewerVideoRef.current as any).requestPictureInPicture().catch(() => {});
                                }
                              }
                            }}
                            className="p-1.5 rounded-xl bg-black/70 hover:bg-black/90 text-white text-xs font-semibold flex items-center justify-center border border-white/20 transition-all cursor-pointer backdrop-blur-md"
                            title="Picture-in-Picture"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (viewerVideoRef.current) {
                                if (!document.fullscreenElement) {
                                  viewerVideoRef.current.requestFullscreen().catch(() => {});
                                } else {
                                  document.exitFullscreen().catch(() => {});
                                }
                              }
                            }}
                            className="p-1.5 rounded-xl bg-black/70 hover:bg-black/90 text-white text-xs font-semibold flex items-center justify-center border border-white/20 transition-all cursor-pointer backdrop-blur-md"
                            title="Toggle Fullscreen"
                          >
                            <Maximize className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={handleLeaveStream}
                            className="px-3 py-1.5 rounded-xl bg-red-600/85 hover:bg-red-600 text-white text-xs font-semibold flex items-center gap-1.5 border border-white/20 transition-all cursor-pointer backdrop-blur-md shadow-lg"
                            title="Leave live stream"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            Leave
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Live Broadcast In Progress - User Click to Join */
                      <div className="relative w-full h-full bg-gradient-to-br from-[#060D14] via-[#0D1B2A] to-[#060D14] px-8 pb-8 pt-24 flex flex-col items-center justify-center text-center space-y-4">
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-600/20 border border-red-500/40 text-red-400 text-xs font-bold uppercase tracking-wider">
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                          {liveSession.broadcastType === "video" ? "Live Video Audit Inspection in Progress" : "Live Quality Audit in Progress"}
                        </div>

                        <div className="space-y-1.5 max-w-md">
                          <h3 className="text-xl font-bold text-white">
                            {liveSession.title || "Live Quality Audit Inspection"}
                          </h3>
                          <p className="text-xs text-white/70">
                            Conducted by <span className="font-semibold text-white">{liveSession.checkerName}</span> &bull; {liveSession.projectType}
                          </p>
                          <div className="pt-1 flex items-center justify-center gap-2 text-xs text-white/50">
                            <Users className="w-3.5 h-3.5" />
                            <span>{liveViewerCount} {liveViewerCount === 1 ? "viewer" : "viewers"} watching</span>
                          </div>
                        </div>

                        <div className="pt-2">
                          <button
                            onClick={handleJoinStream}
                            disabled={isConnectingStream}
                            className="px-6 py-3 rounded-xl bg-[#1F7A1F] dark:bg-[#55f761] hover:scale-105 active:scale-95 text-white dark:text-[#060D14] text-xs sm:text-sm font-bold shadow-2xl flex items-center gap-2 transition-all cursor-pointer"
                          >
                            {isConnectingStream ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                Connecting to Feed...
                              </>
                            ) : (
                              <>
                                <Play className="w-4 h-4 fill-current ml-0.5" />
                                Watch Live Stream
                              </>
                            )}
                          </button>
                        </div>

                        <p className="text-[11px] text-white/40">
                          {liveSession.broadcastType === "video"
                            ? "Click to join and watch real-time synchronized video inspection & live commentary"
                            : "Click to join and receive real-time 1080p screen share & audio"}
                        </p>
                      </div>
                    )
                  ) : (
                    /* Standby / Offline Screen when no one is live — decompressed blurred banner backdrop */
                    <div className="relative w-full h-full flex items-center justify-center p-6 sm:p-8 overflow-hidden bg-black">
                      <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        <iframe
                          ref={offlineBannerIframeRef}
                          src={offlineBannerUrl}
                          title="Offline Stream Banner"
                          tabIndex={-1}
                          frameBorder="0"
                          allow="autoplay; encrypted-media"
                          className="w-full h-full scale-110 blur-md opacity-55 pointer-events-none"
                        />
                        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/45 to-black/80" />
                      </div>

                      {/* Top hover zone: reveals Xfnite Live Check Lobby only when hovering at the top */}
                      <div className="group/top-lobby absolute top-0 inset-x-0 z-20 h-28 flex items-start">
                        <span className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/55 backdrop-blur-md text-white/90 text-[10px] font-bold uppercase tracking-wider border border-white/15 transition-opacity duration-200 group-hover/top-lobby:opacity-0 pointer-events-none">
                          Offline
                        </span>

                        <div className="w-full px-4 pt-3.5 pb-6 pr-36 bg-gradient-to-b from-black/90 via-black/70 to-transparent flex items-center gap-3 opacity-0 -translate-y-2 group-hover/top-lobby:opacity-100 group-hover/top-lobby:translate-y-0 transition-all duration-300 ease-out pointer-events-none">
                          <div className="relative shrink-0">
                            <div className="w-10 h-10 rounded-full bg-white/10 text-[#55f761] flex items-center justify-center border border-white/15 backdrop-blur-md">
                              <Radio className="w-4 h-4" />
                            </div>
                            <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-1.5 py-[1px] rounded bg-slate-700 text-white text-[8px] font-black uppercase tracking-wider">
                              OFFLINE
                            </span>
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-white truncate">
                              Xfnite Live Check Lobby
                            </h3>
                            <p className="text-xs text-white/75 truncate">
                              Chat stays open 24/7 even when no checker is live — ask audit questions or hang out.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Subtle translucent frosted card so center text stays legible without overpowering the blurred banner */}
                      <div className="relative z-10 text-center space-y-4 max-w-md w-full bg-black/25 backdrop-blur-md border border-white/10 rounded-2xl px-6 py-6 shadow-[0_8px_30px_rgba(0,0,0,0.28)]">
                        <div className="w-14 h-14 rounded-2xl bg-black/25 border border-[#55f761]/25 flex items-center justify-center mx-auto text-[#55f761]">
                          <MonitorPlay className="w-7 h-7 drop-shadow-[0_1px_6px_rgba(0,0,0,0.65)]" />
                        </div>
                        <div className="space-y-1.5">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/25 border border-white/10 text-[10px] font-bold uppercase tracking-wider text-white/80">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            Stream Offline
                          </div>
                          <h3 className="text-lg font-bold text-white tracking-tight drop-shadow-[0_1px_6px_rgba(0,0,0,0.75)]">No Checker Currently Live</h3>
                          <p className="text-xs text-white/80 leading-relaxed drop-shadow-[0_1px_4px_rgba(0,0,0,0.75)]">
                            When a checker begins a live screen review, their 1080p screen will automatically broadcast here in real time. Stream chat remains open!
                          </p>
                        </div>
                        <div className="pt-1 flex flex-wrap items-center justify-center gap-2.5">
                          <button
                            onClick={() => setActiveTab("vod")}
                            className="px-5 py-2.5 bg-[#1F7A1F] dark:bg-[#55f761] hover:scale-105 active:scale-95 text-white dark:text-[#060D14] rounded-xl text-xs font-bold transition-all shadow-lg cursor-pointer flex items-center gap-2"
                          >
                            <Film className="w-4 h-4" />
                            Browse Past Replays ({recordings.length})
                          </button>
                          {isUserStaff && (
                            <button
                              onClick={() => setActiveTab("studio")}
                              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold border border-white/20 transition-all cursor-pointer flex items-center gap-2"
                            >
                              <ScreenShare className="w-4 h-4 text-[#55f761]" />
                              Go Live in Studio
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
              </div>
          </div>

          {/* Right Column: Twitch-Style Real-Time Stream Chat (Always active even when offline, smooth collapse/expand) */}
          <div
            aria-hidden={isChatCollapsed}
            className={`relative overflow-hidden shrink-0 transition-[width,margin,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isChatCollapsed
                ? "h-[480px] mt-4 lg:mt-0 lg:h-auto lg:w-0 lg:ml-0 lg:opacity-0 lg:pointer-events-none"
                : "h-[480px] mt-4 lg:mt-0 lg:h-auto lg:w-[400px] xl:w-[440px] lg:ml-4 lg:opacity-100"
            }`}
          >
            <div
              className={`w-full h-full lg:w-[400px] xl:w-[440px] lg:absolute lg:top-0 lg:right-0 lg:bottom-0 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                isChatCollapsed ? "lg:translate-x-8" : "lg:translate-x-0"
              }`}
            >
              <LivestreamChat
                messages={chatMessages}
                currentUser={effectiveUser}
                isConnected={isSocketConnected}
                isLive={Boolean(liveSession || isCapturing)}
                presenceCount={chatPresenceCount}
                onSendMessage={handleSendChatMessage}
                onEditMessage={handleEditChatMessage}
                onDeleteMessage={handleDeleteChatMessage}
                onCollapse={() => setIsChatCollapsed(true)}
              />
            </div>
          </div>
        </div>

        {/* Tab 2: VOD Library */}
        <div className={activeTab === "vod" ? "space-y-6" : "hidden"}>
            {/* Active Live Replay Broadcast Banner */}
            {liveSession?.broadcastType === "replay" && (
              <div className="bg-red-500/10 dark:bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 backdrop-blur-md">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                    LIVE REPLAY
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#0D1B2A] dark:text-white truncate">
                      {liveSession.title}
                    </p>
                    <p className="text-xs text-[#2F3E46]/70 dark:text-white/60 flex items-center gap-1.5">
                      <Repeat className="w-3 h-3 text-[#1F7A1F] dark:text-[#55f761]" />
                      Playing Loop {currentReplayLoop} / {liveSession.maxLoops || 1} &bull; Ends automatically after max loops
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveTab("live")}
                    className="px-3.5 py-1.5 rounded-xl bg-black/10 dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/15 text-[#0D1B2A] dark:text-white text-xs font-semibold transition-all cursor-pointer"
                  >
                    View Live
                  </button>
                  {canManageLiveReplay && (
                    <button
                      type="button"
                      onClick={handleEndReplayBroadcast}
                      className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      End Live
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Active Video Player (if selected) */}
            {selectedRecording && (
              <div className="space-y-3 bg-white/70 dark:bg-[#060D14]/70 backdrop-blur-md rounded-2xl border border-black/5 dark:border-white/10 p-4">
                <XfnitePlayer
                  src={selectedRecording.videoUrl}
                  title={selectedRecording.title}
                  autoPlay={true}
                />
                <div className="flex flex-wrap items-center justify-between gap-3 px-2 pt-2">
                  <div>
                    <h3 className="text-base font-bold text-[#0D1B2A] dark:text-white">
                      {selectedRecording.title}
                    </h3>
                    <p className="text-xs text-[#2F3E46]/70 dark:text-white/50">
                      Checked by {selectedRecording.checkerName} &bull; {new Date(selectedRecording.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-[#1F7A1F] dark:text-[#55f761] border border-emerald-500/20">
                      {selectedRecording.projectType}
                    </span>
                    {isUserStaff && (
                      liveSession?.broadcastType === "replay" && liveSession?.replayRecordingId === selectedRecording.id && canManageLiveReplay ? (
                        <button
                          type="button"
                          onClick={handleEndReplayBroadcast}
                          className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                          End Live ({currentReplayLoop}/{liveSession.maxLoops || 1})
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openReplayBroadcastModal(selectedRecording)}
                          disabled={isCapturing || isAnotherCheckerLive || isAnotherCheckerReserved}
                          className="px-3.5 py-1.5 rounded-xl bg-[#1F7A1F] dark:bg-[#55f761] hover:opacity-90 disabled:opacity-40 text-white dark:text-[#060D14] text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                          title="Stream this replay video in Live with custom loop count"
                        >
                          <Radio className="w-3.5 h-3.5" />
                          Play in Live
                        </button>
                      )
                    )}
                    {canDeleteRecording(selectedRecording) && (
                      <button
                        onClick={(e) => openDeleteModal(selectedRecording.id, e)}
                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer"
                        title="Delete recording from library"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Filter and Library List */}
            <div className="flex items-center justify-between pt-2">
              <div>
                <h2 className="text-base font-semibold text-[#0D1B2A] dark:text-white flex items-center gap-2">
                  <span>Recorded Project Audits &amp; Past Streams</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-black/5 dark:bg-white/10 text-[#1F7A1F] dark:text-[#55f761] border border-black/5 dark:border-white/10">
                    {recordings.length}
                  </span>
                </h2>
                <p className="text-xs text-[#2F3E46]/70 dark:text-white/50">
                  Select a recorded check session to rewatch with resolution switching.
                </p>
              </div>

              {/* Category Filter & Refresh */}
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-1">
                  {["All", "Standard Building", "Transportation", "Land Cover"].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => {
                        setSelectedFilter(cat);
                        loadRecordings(cat);
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        selectedFilter === cat
                          ? "bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] font-bold"
                          : "bg-black/5 dark:bg-white/5 text-[#2F3E46]/70 dark:text-white/60 hover:text-white"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => loadRecordings(selectedFilter)}
                  className="p-1.5 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#2F3E46]/70 dark:text-white/70 transition-all cursor-pointer"
                  title="Refresh recordings list"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {recordings.length === 0 ? (
              <div className="p-12 text-center bg-white/40 dark:bg-[#060D14]/40 rounded-2xl border border-black/5 dark:border-white/5 space-y-3">
                <Film className="w-10 h-10 mx-auto text-[#2F3E46]/40 dark:text-white/30" />
                <h3 className="text-sm font-semibold text-[#0D1B2A] dark:text-white">
                  No recordings found yet
                </h3>
                <p className="text-xs text-[#2F3E46]/60 dark:text-white/50 max-w-sm mx-auto">
                  {isUserStaff
                    ? "Go to the Checker Studio tab to record your first screen share check or upload a video check file."
                    : "Checkers will publish audit sessions here soon. Check back shortly!"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {recordings.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedRecording(item);
                      window.scrollTo({ top: 100, behavior: "smooth" });
                    }}
                    className={`bg-white/70 dark:bg-[#060D14]/70 backdrop-blur-md rounded-2xl border transition-all group flex flex-col cursor-pointer ${
                      selectedRecording?.id === item.id
                        ? "ring-2 ring-[#1F7A1F] dark:ring-[#55f761] border-transparent shadow-lg"
                        : "border-black/5 dark:border-white/10 hover:shadow-md"
                    }`}
                  >
                    <div className="relative aspect-video bg-neutral-900 flex items-center justify-center overflow-hidden rounded-t-2xl">
                      <div className="w-12 h-12 rounded-full bg-white/20 group-hover:bg-[#1F7A1F] dark:group-hover:bg-[#55f761] text-white dark:text-[#060D14] flex items-center justify-center transition-all group-hover:scale-110">
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </div>
                      {item.durationSec > 0 && (
                        <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/80 text-[10px] text-white font-mono flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {formatTimer(item.durationSec)}
                        </span>
                      )}
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-emerald-500/80 text-[10px] text-white font-semibold">
                        {item.projectType}
                      </span>
                      {canDeleteRecording(item) && (
                        <button
                          onClick={(e) => openDeleteModal(item.id, e)}
                          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-red-600 text-white transition-all z-10 cursor-pointer"
                          title="Delete recording"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-[#0D1B2A] dark:text-white line-clamp-1 group-hover:text-[#1F7A1F] dark:group-hover:text-[#55f761] transition-colors">
                          {item.title}
                        </h4>
                        <p className="text-xs text-[#2F3E46]/60 dark:text-white/50 mt-1">
                          Checked by {item.checkerName} &bull; {new Date(item.createdAt).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-black/5 dark:border-white/5 flex items-center justify-between gap-2 text-xs">
                        <span className="text-[#2F3E46]/60 dark:text-white/40 text-[11px]">
                          1080p &bull; 720p &bull; 360p
                        </span>
                        <div className="flex items-center gap-2">
                          {isUserStaff && (
                            liveSession?.broadcastType === "replay" && liveSession?.replayRecordingId === item.id && canManageLiveReplay ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEndReplayBroadcast();
                                }}
                                className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                              >
                                <Square className="w-3 h-3 fill-current" />
                                End Live
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => openReplayBroadcastModal(item, e)}
                                disabled={isCapturing || isAnotherCheckerLive || isAnotherCheckerReserved}
                                className="px-2.5 py-1 rounded-lg bg-[#1F7A1F]/10 dark:bg-[#55f761]/15 hover:bg-[#1F7A1F] dark:hover:bg-[#55f761] text-[#1F7A1F] dark:text-[#55f761] hover:text-white dark:hover:text-[#060D14] disabled:opacity-40 text-[11px] font-bold flex items-center gap-1 border border-[#1F7A1F]/25 dark:border-[#55f761]/30 transition-all cursor-pointer"
                                title="Play this replay in Live Check"
                              >
                                <Radio className="w-3 h-3" />
                                Play in Live
                              </button>
                            )
                          )}
                          <span className="text-xs font-semibold text-[#1F7A1F] dark:text-[#55f761] group-hover:underline">
                            Watch &rarr;
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        {/* Tab 3: Checker Studio (Only for Staff/Checkers) */}
        {isUserStaff && (
          <div
            className={
              activeTab === "studio"
                ? "space-y-6"
                : isCapturing
                ? "fixed -top-[99999px] -left-[99999px] w-[640px] h-[360px] pointer-events-none opacity-0 overflow-hidden z-[-999]"
                : "hidden"
            }
          >
            {/* If Screen Share or Video Broadcast is Active -> Show Full Studio Recorder */}
            {isCapturing ? (
              <div className="bg-white/80 dark:bg-[#060D14]/80 backdrop-blur-md rounded-2xl border-2 border-emerald-500/40 p-6 space-y-6 shadow-2xl">
                {/* Active Live Header Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-black/10 dark:border-white/10">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 text-red-500 font-bold text-xs uppercase tracking-wide border border-red-500/20">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                      {broadcastSource === "video" ? "REC • LIVE VIDEO BROADCAST" : "REC • LIVE SCREEN SHARE"}
                    </span>
                    <span className="font-mono text-base font-bold text-[#0D1B2A] dark:text-white">
                      {broadcastSource === "video"
                        ? `${formatTimer(videoCurrentTime)} / ${formatTimer(videoDuration)}`
                        : formatTimer(recordingSeconds)}
                    </span>
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/5 dark:bg-white/10 text-xs font-medium text-[#2F3E46] dark:text-white/80">
                      <Users className="w-3.5 h-3.5 text-[#1F7A1F] dark:text-[#55f761]" />
                      <span>{liveViewerCount} {liveViewerCount === 1 ? "Viewer" : "Viewers"} Watching</span>
                    </span>

                    {/* Microphone Toggle */}
                    <button
                      onClick={toggleCheckerMic}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        isMicEnabled
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-[#55f761] border-emerald-500/20"
                          : "bg-red-500/10 text-red-500 border-red-500/20"
                      }`}
                      title="Click to Mute or Unmute your Microphone commentary"
                    >
                      {isMicEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                      <span>{isMicEnabled ? "Mic: ON" : "Mic: MUTED"}</span>
                    </button>

                    {/* Local Speaker Sound Toggle (For video broadcasts) */}
                    {broadcastSource === "video" && (
                      <button
                        onClick={toggleMonitorAudio}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                          !isMonitorAudioMuted
                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                            : "bg-neutral-500/10 text-neutral-500 border-neutral-500/20"
                        }`}
                        title="Mute or Unmute your local monitor speaker without affecting the stream"
                      >
                        {!isMonitorAudioMuted ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                        <span>{!isMonitorAudioMuted ? "Sound: ON" : "Sound: MUTED"}</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={broadcastSource === "video" ? discardVideoBroadcast : discardCapture}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-500/10 transition-all cursor-pointer"
                    >
                      Discard
                    </button>
                    <button
                      onClick={broadcastSource === "video" ? finishVideoBroadcast : finishScreenCapture}
                      className="flex items-center gap-2 px-5 py-2.5 bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] rounded-xl text-xs font-bold shadow-lg hover:scale-102 active:scale-98 transition-all cursor-pointer"
                    >
                      <Square className="w-4 h-4 fill-current" />
                      End Session &amp; Review
                    </button>
                  </div>
                </div>

                {/* Studio Layout: Video Monitor + Session Info on Left, Live Stream Chat on Right */}
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px] gap-6 items-stretch">
                  {/* Left Column: Live Video Monitor + Check Session Information */}
                  <div className="space-y-5 min-w-0">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#2F3E46]/70 dark:text-white/50 block">
                          {broadcastSource === "video"
                            ? "Live Video Broadcast Monitor (Viewers see real-time playback)"
                            : "Live Monitor Preview (What Viewers See in Real Time)"}
                        </span>
                        {broadcastSource === "video" && (
                          <span className="text-[11px] text-emerald-600 dark:text-[#55f761] font-semibold flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Real-time WebRTC feed synced
                          </span>
                        )}
                      </div>

                      <div className="relative aspect-video w-full bg-black rounded-xl overflow-hidden border border-black/20 dark:border-white/20 shadow-inner flex items-center justify-center group">
                        <video
                          ref={(el) => {
                            livePreviewRef.current = el;
                            if (el && broadcasterStream && el.srcObject !== broadcasterStream) {
                              el.srcObject = broadcasterStream;
                              el.play().catch(() => {});
                            }
                          }}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-contain"
                        />
                        {broadcastSource === "video" && (
                          <button
                            type="button"
                            onClick={toggleVideoPlayPause}
                            className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-xl backdrop-blur-xs"
                          >
                            {isVideoPaused ? <Play className="w-7 h-7 fill-current ml-1" /> : <Pause className="w-7 h-7 fill-current" />}
                          </button>
                        )}
                      </div>

                      {/* Video Scrubber Controls for Video Broadcast */}
                      {broadcastSource === "video" && (
                        <div className="p-3 bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5 flex items-center gap-2.5">
                          {/* Previous 5s (Rewind) */}
                          <button
                            type="button"
                            onClick={() => handleSeekRelative(-5)}
                            className="px-2.5 py-1.5 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-[#0D1B2A] dark:text-white hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0 flex items-center gap-1 border border-black/5 dark:border-white/10"
                            title="Rewind 5 seconds (-5s) [Left Arrow]"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-bold font-mono">-5s</span>
                          </button>

                          {/* Play / Pause Toggle */}
                          <button
                            type="button"
                            onClick={toggleVideoPlayPause}
                            className="p-2 rounded-lg bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0 shadow-sm"
                            title={isVideoPaused ? "Play [Space]" : "Pause [Space]"}
                          >
                            {isVideoPaused ? <Play className="w-4 h-4 fill-current ml-0.5" /> : <Pause className="w-4 h-4 fill-current" />}
                          </button>

                          {/* Next 5s (Forward) */}
                          <button
                            type="button"
                            onClick={() => handleSeekRelative(5)}
                            className="px-2.5 py-1.5 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-[#0D1B2A] dark:text-white hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0 flex items-center gap-1 border border-black/5 dark:border-white/10"
                            title="Forward 5 seconds (+5s) [Right Arrow]"
                          >
                            <span className="text-[11px] font-bold font-mono">+5s</span>
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>

                          <span className="font-mono text-xs text-[#0D1B2A] dark:text-white shrink-0">
                            {formatTimer(videoCurrentTime)}
                          </span>

                          <input
                            type="range"
                            min="0"
                            max={videoDuration || 100}
                            value={videoCurrentTime}
                            onChange={(e) => handleVideoSeek(Number(e.target.value))}
                            className="w-full accent-[#1F7A1F] dark:accent-[#55f761] cursor-pointer"
                          />

                          <span className="font-mono text-xs text-[#2F3E46]/60 dark:text-white/50 shrink-0">
                            {formatTimer(videoDuration)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Session Metadata Inputs (Below Monitor) */}
                    <div className="p-4 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 space-y-3">
                      <span className="text-xs font-semibold text-[#2F3E46]/70 dark:text-white/50 block">
                        Check Session Information
                      </span>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-semibold text-[#0D1B2A] dark:text-white block mb-1">
                            Session Title
                          </label>
                          <input
                            type="text"
                            value={sessionTitle}
                            onChange={(e) => setSessionTitle(e.target.value)}
                            placeholder="e.g. Standard Building Quality Audit - Batch #1"
                            className="w-full px-3 py-2 bg-black/5 dark:bg-white/5 rounded-xl border border-black/10 dark:border-white/10 text-xs text-[#0D1B2A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#55f761]"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-[#0D1B2A] dark:text-white block mb-1">
                            Project Category
                          </label>
                          <select
                            value={sessionProjectType}
                            onChange={(e) => setSessionProjectType(e.target.value)}
                            className="w-full px-3 py-2 bg-black/5 dark:bg-white/5 rounded-xl border border-black/10 dark:border-white/10 text-xs text-[#0D1B2A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#55f761]"
                          >
                            <option value="Standard Building" className="text-black">Standard Building</option>
                            <option value="Transportation" className="text-black">Transportation &amp; Roads</option>
                            <option value="Land Cover" className="text-black">Land Cover</option>
                            <option value="Guidelines" className="text-black">Guidelines &amp; Common Mistakes</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-[#0D1B2A] dark:text-white block mb-1">
                          Notes / Description (Optional)
                        </label>
                        <textarea
                          rows={2}
                          value={sessionNotes}
                          onChange={(e) => setSessionNotes(e.target.value)}
                          placeholder="Key rules covered, common mistakes demonstrated..."
                          className="w-full px-3 py-2 bg-black/5 dark:bg-white/5 rounded-xl border border-black/10 dark:border-white/10 text-xs text-[#0D1B2A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#55f761]"
                        />
                      </div>

                      {/* Quick toggle for Save to Library setting */}
                      {broadcastSource === "video" && (
                        <div className="p-3 bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5 flex items-center justify-between">
                          <div>
                            <span className="text-[11px] font-semibold text-[#0D1B2A] dark:text-white block">
                              Save to Replay Library
                            </span>
                            <span className="text-[10px] text-[#2F3E46]/60 dark:text-white/50">
                              {saveToLibraryAfterStream ? "Will prompt to save when ended" : "Livestream only (no library save)"}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSaveToLibraryAfterStream(!saveToLibraryAfterStream)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
                              saveToLibraryAfterStream
                                ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                                : "bg-neutral-500/20 text-neutral-600 dark:text-neutral-400 border border-neutral-500/30"
                            }`}
                          >
                            {saveToLibraryAfterStream ? "Enabled" : "Disabled"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Live Stream Chat so Checker can see & reply to viewers */}
                  <div className="relative min-h-[440px] lg:min-h-0">
                    <div className="h-[440px] lg:h-full lg:absolute lg:inset-0">
                      <LivestreamChat
                        messages={chatMessages}
                        currentUser={effectiveUser}
                        isConnected={isSocketConnected}
                        isLive={Boolean(liveSession || isCapturing)}
                        presenceCount={chatPresenceCount}
                        onSendMessage={handleSendChatMessage}
                        onEditMessage={handleEditChatMessage}
                        onDeleteMessage={handleDeleteChatMessage}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : isReviewing && (recordedBlobUrl || uploadBlobUrl) ? (
              /* Review & Post-Recording Confirmation Screen */
              <div className="bg-white/85 dark:bg-[#060D14]/85 backdrop-blur-md rounded-2xl border-2 border-emerald-500/30 p-6 space-y-6 shadow-2xl">
                {/* Header with Save / Discard Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-black/10 dark:border-white/10">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-xs uppercase tracking-wide border border-blue-500/20">
                        {broadcastSource === "video" ? "Video Check Finished" : "Check Finished"}
                      </span>
                      <span className="text-xs text-[#2F3E46]/60 dark:text-white/50 font-mono">
                        Duration: {formatTimer(recordedDuration)}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-[#0D1B2A] dark:text-white mt-1">
                      {broadcastSource === "video"
                        ? "Review Video Check Before Saving to Library"
                        : "Review Audit Recording Before Saving"}
                    </h3>
                    <p className="text-xs text-[#2F3E46]/70 dark:text-white/60">
                      {broadcastSource === "video"
                        ? saveToLibraryAfterStream
                          ? "Your live broadcast has finished. You can publish this video check to the Replay Library or finish without saving."
                          : "You selected Livestream Only. You can still save it to the Replay Library below if you wish, or finish without saving."
                        : "Play your recording to verify sound and quality. You can publish it to the Replay Library or discard it completely."}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={broadcastSource === "video" ? handleDiscardVideoBroadcast : handleDiscardRecording}
                      disabled={isUploading}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-500/10 border border-red-500/20 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      {broadcastSource === "video" ? "Finish (Do Not Save to Library)" : "Discard Recording"}
                    </button>
                    <button
                      onClick={broadcastSource === "video" ? onPublishVideoFile : onPublishRecording}
                      disabled={isUploading}
                      className="flex items-center gap-2 px-6 py-2.5 bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] rounded-xl text-xs font-bold shadow-lg hover:scale-102 active:scale-98 transition-all cursor-pointer"
                    >
                      {isUploading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Publishing to Library...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Publish to Replay Library
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Review Layout: Playable Video + Metadata */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Playable Video Preview */}
                  <div className="lg:col-span-2 space-y-2">
                    <span className="text-xs font-semibold text-[#2F3E46]/70 dark:text-white/50 block">
                      Playback Preview (Check your voice and screen)
                    </span>
                    {(recordedBlobUrl || uploadBlobUrl) ? (
                      <XfnitePlayer
                        src={(recordedBlobUrl || uploadBlobUrl)!}
                        title={sessionTitle || "Quality Audit Check Preview"}
                        initialDuration={recordedDuration}
                        autoPlay={false}
                      />
                    ) : (
                      <div className="relative aspect-video w-full bg-black rounded-xl overflow-hidden border border-black/20 dark:border-white/20 shadow-inner flex items-center justify-center">
                        <span className="text-white/40 text-xs">No recording loaded</span>
                      </div>
                    )}
                  </div>

                  {/* Metadata Fields */}
                  <div className="space-y-4">
                    <span className="text-xs font-semibold text-[#2F3E46]/70 dark:text-white/50 block">
                      Recording Details
                    </span>

                    <div className="space-y-3">
                      <div>
                        <label className="text-[11px] font-semibold text-[#0D1B2A] dark:text-white block mb-1">
                          Session Title
                        </label>
                        <input
                          type="text"
                          value={sessionTitle}
                          onChange={(e) => setSessionTitle(e.target.value)}
                          className="w-full px-3 py-2 bg-black/5 dark:bg-white/5 rounded-xl border border-black/10 dark:border-white/10 text-xs text-[#0D1B2A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#55f761]"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-[#0D1B2A] dark:text-white block mb-1">
                          Project Category
                        </label>
                        <select
                          value={sessionProjectType}
                          onChange={(e) => setSessionProjectType(e.target.value)}
                          className="w-full px-3 py-2 bg-black/5 dark:bg-white/5 rounded-xl border border-black/10 dark:border-white/10 text-xs text-[#0D1B2A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#55f761]"
                        >
                          <option value="Standard Building" className="text-black">Standard Building</option>
                          <option value="Transportation" className="text-black">Transportation &amp; Roads</option>
                          <option value="Land Cover" className="text-black">Land Cover</option>
                          <option value="Guidelines" className="text-black">Guidelines &amp; Common Mistakes</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-[#0D1B2A] dark:text-white block mb-1">
                          Notes / Description (Optional)
                        </label>
                        <textarea
                          rows={3}
                          value={sessionNotes}
                          onChange={(e) => setSessionNotes(e.target.value)}
                          className="w-full px-3 py-2 bg-black/5 dark:bg-white/5 rounded-xl border border-black/10 dark:border-white/10 text-xs text-[#0D1B2A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#55f761]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Idle Studio View */
              <div className="bg-white/70 dark:bg-[#060D14]/70 backdrop-blur-md rounded-2xl border border-black/5 dark:border-white/10 p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-[#0D1B2A] dark:text-white">
                    Checker Broadcast &amp; Recording Studio
                  </h2>
                  <p className="text-xs text-[#2F3E46]/70 dark:text-white/50 mt-0.5">
                    Stream your screen live or record project audits directly from your browser. No OBS or third-party software required.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Method 1: Web Browser Screen Share */}
                  <div className="p-5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-[#55f761]/10 flex items-center justify-center text-[#1F7A1F] dark:text-[#55f761]">
                        <ScreenShare className="w-5 h-5" />
                      </div>
                      <h3 className="text-sm font-bold text-[#0D1B2A] dark:text-white">
                        1-Click In-Browser Live Record &amp; Broadcast
                      </h3>
                      <p className="text-xs text-[#2F3E46]/80 dark:text-white/60 leading-relaxed">
                        Share your screen directly through Chrome. Streams real-time video to viewers in the live lobby with zero latency, and saves to the Replay Library when you stop.
                      </p>
                    </div>

                    {/* State A: It's My Turn */}
                    {isMyTurn && (
                      <div className="p-3.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-3 animate-pulse">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 shrink-0 text-emerald-600 dark:text-[#55f761]" />
                          <span>
                            <strong>It&apos;s your turn to broadcast!</strong> You have reserved access. Click below to start.
                          </span>
                        </div>
                        <button
                          onClick={handleLeaveQueue}
                          disabled={isQueueActionLoading}
                          className="text-[11px] underline text-emerald-700 dark:text-emerald-400 hover:opacity-80 shrink-0 cursor-pointer"
                        >
                          Forfeit Turn
                        </button>
                      </div>
                    )}

                    {/* State B: Another Checker Live - Not in Queue */}
                    {isAnotherCheckerLive && !isQueued && !isMyTurn && (
                      <div className="space-y-3">
                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>
                            <strong>{liveSession.checkerName}</strong> is currently live. Only one audit broadcast can be active at a time.
                          </span>
                        </div>
                        <button
                          onClick={handleJoinQueue}
                          disabled={isQueueActionLoading}
                          className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-600 active:scale-99 text-white rounded-xl text-xs font-bold shadow-md hover:scale-101 transition-all cursor-pointer flex items-center justify-center gap-2"
                        >
                          <Clock className="w-4 h-4" />
                          {isQueueActionLoading
                            ? "Joining Queue..."
                            : `Join Broadcast Queue${broadcastQueue.length > 0 ? ` (${broadcastQueue.length} waiting)` : ""}`}
                        </button>
                      </div>
                    )}

                    {/* State C: Currently Queued */}
                    {isQueued && !isMyTurn && (
                      <div className="space-y-3">
                        <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-700 dark:text-blue-300 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 shrink-0 text-blue-500" />
                            <span>
                              You are <strong>#{myQueuePosition}</strong> of {broadcastQueue.length} in queue. Your turn begins when the current check finishes.
                            </span>
                          </div>
                          <button
                            onClick={handleLeaveQueue}
                            disabled={isQueueActionLoading}
                            className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 rounded-lg text-[11px] font-semibold transition-all shrink-0 cursor-pointer"
                          >
                            Leave Queue
                          </button>
                        </div>
                      </div>
                    )}

                    {/* State D: Slot Reserved for Another Checker */}
                    {!liveSession && isAnotherCheckerReserved && !isMyTurn && !isQueued && (
                      <div className="space-y-3">
                        <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs text-purple-700 dark:text-purple-300 flex items-center gap-2">
                          <Clock className="w-4 h-4 shrink-0 text-purple-500" />
                          <span>
                            Broadcast slot is currently reserved for <strong>{reservedChecker?.name}</strong> (next in queue).
                          </span>
                        </div>
                        <button
                          onClick={handleJoinQueue}
                          disabled={isQueueActionLoading}
                          className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 active:scale-99 text-white rounded-xl text-xs font-bold shadow-md hover:scale-101 transition-all cursor-pointer flex items-center justify-center gap-2"
                        >
                          <Clock className="w-4 h-4" />
                          {isQueueActionLoading ? "Joining..." : `Queue Behind ${reservedChecker?.name}`}
                        </button>
                      </div>
                    )}

                    {/* Start Broadcast Button (Available when no one is live/reserved or when it's user's turn) */}
                    {((!isAnotherCheckerLive && !isAnotherCheckerReserved) || isMyTurn) && (
                      <button
                        onClick={startScreenCapture}
                        className={`w-full py-2.5 px-4 bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] rounded-xl text-xs font-bold shadow-md hover:scale-101 active:scale-99 transition-all cursor-pointer flex items-center justify-center gap-2 ${
                          isMyTurn ? "ring-2 ring-emerald-500 ring-offset-2 animate-bounce shadow-lg" : ""
                        }`}
                      >
                        <ScreenShare className="w-4 h-4" />
                        {isMyTurn ? "Your Turn: Start Screen Share / Live Check" : "Start Screen Share / Live Check"}
                      </button>
                    )}

                    {/* Broadcast Queue List */}
                    {broadcastQueue.length > 0 && (
                      <div className="mt-2 pt-3 border-t border-black/5 dark:border-white/5 space-y-2">
                        <div className="flex items-center justify-between text-xs font-semibold text-[#0D1B2A] dark:text-white">
                          <span className="flex items-center gap-1.5 text-black/70 dark:text-white/70">
                            <Users className="w-3.5 h-3.5 text-[#1F7A1F] dark:text-[#55f761]" />
                            Broadcast Queue ({broadcastQueue.length})
                          </span>
                          {isQueued && (
                            <span className="text-[11px] font-medium text-emerald-600 dark:text-[#55f761]">
                              You are #{myQueuePosition}
                            </span>
                          )}
                        </div>
                        <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                          {broadcastQueue.map((item, idx) => {
                            const isMe = effectiveUser?.email?.toLowerCase() === item.email?.toLowerCase();
                            return (
                              <div
                                key={item.email + idx}
                                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                                  isMe
                                    ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-900 dark:text-emerald-300 font-semibold"
                                    : "bg-black/5 dark:bg-white/5 text-[#2F3E46] dark:text-white/80"
                                }`}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <span className="w-4 h-4 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center text-[10px] font-bold shrink-0">
                                    {idx + 1}
                                  </span>
                                  <span className="truncate">
                                    {item.name} {isMe ? "(You)" : ""}
                                  </span>
                                </div>
                                <span className="text-[10px] text-black/40 dark:text-white/40 uppercase shrink-0">
                                  {item.role || "Checker"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Method 2: Drag and Drop Video Upload & Live Broadcast */}
                  <div className="p-5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                          <Radio className="w-5 h-5" />
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                          Broadcast &amp; VOD
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-[#0D1B2A] dark:text-white">
                        Livestream Recorded Video Check
                      </h3>
                      <p className="text-xs text-[#2F3E46]/80 dark:text-white/60 leading-relaxed">
                        Have an audit recording (.mp4, .webm)? Broadcast it live to labelers in the Live Check room with real-time sync, and choose whether to save it to the Replay Library.
                      </p>
                    </div>

                    <div className="space-y-3">
                      {!uploadFile ? (
                        /* File Selector */
                        <label className="w-full py-6 px-4 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-2xl border-2 border-dashed border-black/15 dark:border-white/15 hover:border-emerald-500/40 text-[#0D1B2A] dark:text-white text-xs font-semibold transition-all cursor-pointer flex flex-col items-center justify-center gap-2 text-center group">
                          <div className="w-10 h-10 rounded-xl bg-black/5 dark:bg-white/10 flex items-center justify-center text-[#2F3E46]/60 dark:text-white/60 group-hover:scale-110 group-hover:text-emerald-500 transition-all">
                            <Upload className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="font-bold text-emerald-600 dark:text-[#55f761]">Click to select video file</span>
                            <span className="text-[#2F3E46]/60 dark:text-white/50 block text-[11px] mt-0.5">Supports MP4, WebM, MOV</span>
                          </div>
                          <input
                            type="file"
                            accept="video/*"
                            className="hidden"
                            onChange={handleFileSelected}
                          />
                        </label>
                      ) : (
                        /* Selected File Details & Broadcast Configuration */
                        <div className="space-y-3">
                          {/* Selected File Card */}
                          <div className="p-3 bg-black/5 dark:bg-white/5 rounded-xl border border-black/10 dark:border-white/10 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 truncate">
                              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                                <Film className="w-4 h-4" />
                              </div>
                              <div className="truncate">
                                <p className="text-xs font-bold text-[#0D1B2A] dark:text-white truncate">
                                  {uploadFile.name}
                                </p>
                                <p className="text-[10px] text-[#2F3E46]/60 dark:text-white/50">
                                  {(uploadFile.size / (1024 * 1024)).toFixed(1)} MB
                                  {videoDuration > 0 && ` • ${formatTimer(videoDuration)}`}
                                </p>
                              </div>
                            </div>

                            <label className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer shrink-0 font-medium">
                              Change
                              <input
                                type="file"
                                accept="video/*"
                                className="hidden"
                                onChange={handleFileSelected}
                              />
                            </label>
                          </div>

                          {/* Inputs */}
                          <div className="space-y-2">
                            <div>
                              <label className="text-[10px] font-semibold text-[#0D1B2A] dark:text-white block mb-0.5">
                                Video Check Title
                              </label>
                              <input
                                type="text"
                                value={uploadTitle}
                                onChange={(e) => setUploadTitle(e.target.value)}
                                placeholder="Audit Session Title"
                                className="w-full px-3 py-1.5 bg-black/5 dark:bg-white/5 rounded-xl border border-black/10 dark:border-white/10 text-xs text-[#0D1B2A] dark:text-white focus:outline-none focus:ring-1 focus:ring-[#55f761]"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-semibold text-[#0D1B2A] dark:text-white block mb-0.5">
                                Category
                              </label>
                              <select
                                value={uploadProjectType}
                                onChange={(e) => setUploadProjectType(e.target.value)}
                                className="w-full px-3 py-1.5 bg-black/5 dark:bg-white/5 rounded-xl border border-black/10 dark:border-white/10 text-xs text-[#0D1B2A] dark:text-white focus:outline-none focus:ring-1 focus:ring-[#55f761]"
                              >
                                <option value="Standard Building" className="text-black">Standard Building</option>
                                <option value="Transportation" className="text-black">Transportation &amp; Roads</option>
                                <option value="Land Cover" className="text-black">Land Cover</option>
                                <option value="Guidelines" className="text-black">Guidelines &amp; Common Mistakes</option>
                              </select>
                            </div>

                            <div>
                              <label className="text-[10px] font-semibold text-[#0D1B2A] dark:text-white block mb-0.5">
                                Notes (Optional)
                              </label>
                              <input
                                type="text"
                                value={uploadNotes}
                                onChange={(e) => setUploadNotes(e.target.value)}
                                placeholder="Key points or audit mistakes demonstrated..."
                                className="w-full px-3 py-1.5 bg-black/5 dark:bg-white/5 rounded-xl border border-black/10 dark:border-white/10 text-xs text-[#0D1B2A] dark:text-white focus:outline-none focus:ring-1 focus:ring-[#55f761]"
                              />
                            </div>
                          </div>

                          {/* Save to Library Checkbox / Toggle */}
                          <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                            <input
                              type="checkbox"
                              checked={saveToLibraryAfterStream}
                              onChange={(e) => setSaveToLibraryAfterStream(e.target.checked)}
                              className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-[#1F7A1F] dark:accent-[#55f761] cursor-pointer"
                            />
                            <div className="text-[11px] leading-snug">
                              <span className="font-bold text-[#0D1B2A] dark:text-white block">
                                Save to Replay Library after livestream
                              </span>
                              <span className="text-[#2F3E46]/70 dark:text-white/50 text-[10px]">
                                {saveToLibraryAfterStream
                                  ? "Will prompt to save in the permanent library once the livestream concludes."
                                  : "Livestream only — will not be saved to the permanent library."}
                              </span>
                            </div>
                          </label>

                          {/* Primary Broadcast Button */}
                          <button
                            type="button"
                            onClick={startVideoBroadcast}
                            className="w-full py-2.5 px-4 bg-[#1F7A1F] dark:bg-[#55f761] hover:scale-101 active:scale-99 text-white dark:text-[#060D14] rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                          >
                            <Radio className="w-4 h-4" />
                            Start Live Broadcast &amp; Stream Video
                          </button>

                          {/* Direct Upload fallback */}
                          <button
                            type="button"
                            onClick={handleManualUpload}
                            disabled={isUploading}
                            className="w-full text-center text-[11px] text-[#2F3E46]/60 dark:text-white/50 hover:text-[#0D1B2A] dark:hover:text-white underline cursor-pointer transition-colors pt-1"
                          >
                            {isUploading ? "Uploading..." : "Or upload directly to Replay Library without livestreaming"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Replay-to-Live Loop Setup Modal */}
        {replayModalRecording && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => {
              if (!isStartingReplayLive) setReplayModalRecording(null);
            }}
          >
            {/* Hidden video probe so recordings with missing DB durationSec report exact duration */}
            <video
              preload="metadata"
              src={replayModalRecording.videoUrl}
              onLoadedMetadata={(e) => {
                const dur = e.currentTarget.duration;
                if (dur && isFinite(dur) && dur > 0) {
                  setReplayModalDurationSec(dur);
                }
              }}
              className="hidden"
            />
            <div
              className="w-full max-w-md bg-white dark:bg-[#0B121B] border border-black/10 dark:border-white/15 rounded-2xl p-6 shadow-2xl space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-[#1F7A1F] dark:text-[#55f761] text-[10px] font-bold uppercase tracking-wider border border-emerald-500/20">
                    <Radio className="w-3 h-3" />
                    Stream Replay to Live
                  </div>
                  <h3 className="text-base font-bold text-[#0D1B2A] dark:text-white">
                    Configure Live Replay Loop
                  </h3>
                  <p className="text-xs text-[#2F3E46]/70 dark:text-white/55">
                    Broadcast this Replay Library recording inside the Live Check room. You can end it anytime manually or let it stop once all loops finish.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!isStartingReplayLive) setReplayModalRecording(null);
                  }}
                  className="p-1.5 rounded-lg text-[#2F3E46]/60 dark:text-white/50 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#0D1B2A] dark:text-white mb-1.5">
                    Live Stream Title
                  </label>
                  <input
                    type="text"
                    value={replayBroadcastTitle}
                    onChange={(e) => setReplayBroadcastTitle(e.target.value)}
                    placeholder="Enter title shown in Live Check..."
                    className="w-full px-3.5 py-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs text-[#0D1B2A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-[#0D1B2A] dark:text-white flex items-center gap-1.5">
                      <Repeat className="w-3.5 h-3.5 text-[#1F7A1F] dark:text-[#55f761]" />
                      How Many Times to Loop
                    </label>
                    <span className="text-[11px] font-mono text-[#2F3E46]/60 dark:text-white/50">
                      Max 50 loops
                    </span>
                  </div>

                  <div className="grid grid-cols-5 gap-1.5 mb-2.5">
                    {[1, 2, 3, 5, 10].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setReplayLoopCount(preset);
                          setReplayLoopInput(String(preset));
                        }}
                        className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          replayLoopCount === preset
                            ? "bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] border-transparent shadow-sm"
                            : "bg-black/5 dark:bg-white/5 text-[#2F3E46] dark:text-white/75 border-black/5 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10"
                        }`}
                      >
                        {preset}&times;
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className="text-xs text-[#2F3E46]/70 dark:text-white/60 shrink-0">
                      Custom loop count:
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={replayLoopInput}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setReplayLoopInput(raw);
                        const num = parseInt(raw, 10);
                        if (Number.isFinite(num)) {
                          setReplayLoopCount(Math.max(1, Math.min(50, num)));
                        }
                      }}
                      onBlur={() => {
                        const num = parseInt(replayLoopInput, 10);
                        const clamped = Number.isFinite(num) ? Math.max(1, Math.min(50, num)) : 1;
                        setReplayLoopCount(clamped);
                        setReplayLoopInput(String(clamped));
                      }}
                      className="w-24 px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs font-mono font-bold text-[#0D1B2A] dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761]"
                    />
                    <span className="text-[11px] text-[#2F3E46]/60 dark:text-white/50">
                      {replayLoopCount === 1 ? "(Plays once)" : `(Plays ${replayLoopCount} times)`}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 text-xs space-y-1">
                  <div className="flex items-center justify-between text-[#2F3E46]/75 dark:text-white/70">
                    <span>Video Duration</span>
                    <span className="font-mono font-semibold text-[#0D1B2A] dark:text-white">
                      {replayModalDurationSec > 0 ? formatTimer(Math.round(replayModalDurationSec)) : "Detecting..."}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[#2F3E46]/75 dark:text-white/70">
                    <span>Total Auto-End Time ({replayLoopCount} {replayLoopCount === 1 ? "loop" : "loops"})</span>
                    <span className="font-mono font-bold text-[#1F7A1F] dark:text-[#55f761]">
                      {replayModalDurationSec > 0
                        ? formatTimer(Math.round(replayModalDurationSec * replayLoopCount))
                        : "Ends after max loops"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setReplayModalRecording(null)}
                  disabled={isStartingReplayLive}
                  className="px-4 py-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#0D1B2A] dark:text-white text-xs font-semibold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleStartReplayBroadcast}
                  disabled={isStartingReplayLive || isCapturing || isAnotherCheckerLive || isAnotherCheckerReserved}
                  className="px-5 py-2 rounded-xl bg-[#1F7A1F] dark:bg-[#55f761] hover:opacity-90 disabled:opacity-50 text-white dark:text-[#060D14] text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                >
                  {isStartingReplayLive ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Starting Live...
                    </>
                  ) : (
                    <>
                      <Radio className="w-3.5 h-3.5" />
                      Go Live ({replayLoopCount}&times; Loop)
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Recording Confirmation Modal */}
        <ConfirmDeleteDialog
          isOpen={Boolean(recordingToDelete)}
          onClose={() => {
            if (!isDeletingRecording) setRecordingToDelete(null);
          }}
          onConfirm={handleConfirmDelete}
          title="Delete Recorded Check"
          description="Are you sure you want to delete this recorded check from the library? This action cannot be undone."
          isDeleting={isDeletingRecording}
        />
      </div>
    </div>
  );
}