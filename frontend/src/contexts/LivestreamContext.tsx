"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { getSessionUser } from "@/app/actions/auth";

function getSocketUrl(): string {
  if (typeof window !== "undefined") {
    if (
      process.env.NEXT_PUBLIC_SERVER_URL &&
      !process.env.NEXT_PUBLIC_SERVER_URL.includes("localhost")
    ) {
      return process.env.NEXT_PUBLIC_SERVER_URL;
    }
    if (
      process.env.NEXT_PUBLIC_SOCKET_URL &&
      !process.env.NEXT_PUBLIC_SOCKET_URL.includes("localhost")
    ) {
      return process.env.NEXT_PUBLIC_SOCKET_URL;
    }
    const hostname = window.location.hostname;
    if (hostname.includes("staging.xfnite.cloud")) {
      return "https://staging-server.xfnite.cloud";
    }
    if (hostname.includes("xfnite.cloud")) {
      return "https://server.xfnite.cloud";
    }
  }
  return (
    process.env.NEXT_PUBLIC_SERVER_URL ||
    process.env.NEXT_PUBLIC_SOCKET_URL ||
    "http://localhost:3001"
  );
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name + "=([^;]*)")
  );
  return match ? decodeURIComponent(match[1]) : null;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelay",
    credential: "openrelay",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelay",
    credential: "openrelay",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelay",
    credential: "openrelay",
  },
];

export interface LivestreamContextType {
  // Current User
  currentUser: any;
  setCurrentUser: React.Dispatch<React.SetStateAction<any>>;

  // Session & Queue Info
  liveSession: any;
  liveViewerCount: number;
  broadcastQueue: Array<{
    position: number;
    email: string;
    name: string;
    role?: string;
    queuedAt?: string;
  }>;
  reservedChecker: {
    email: string;
    name: string;
    role?: string;
    expiresAt: number;
  } | null;
  isQueueActionLoading: boolean;
  handleJoinQueue: () => void;
  handleLeaveQueue: () => void;
  isAnotherCheckerLive: boolean;
  isMyTurn: boolean;
  isAnotherCheckerReserved: boolean;
  isQueued: boolean;
  myQueuePosition: number;

  // Viewer State & Controls
  hasJoinedStream: boolean;
  isConnectingStream: boolean;
  isStreamInterrupted: boolean;
  isNetworkOffline: boolean;
  remoteStream: MediaStream | null;
  isViewerMuted: boolean;
  setIsViewerMuted: (muted: boolean) => void;
  unmuteViewer: () => void;
  toggleViewerMute: () => void;
  handleJoinStream: () => void;
  handleLeaveStream: () => void;
  reconnectViewerStream: (showToast?: boolean) => void;

  // Network Health & Slow Internet Detection
  networkHealth: "good" | "fair" | "poor";
  isSlowConnection: boolean;
  isVideoBuffering: boolean;
  setIsVideoBuffering: (buffering: boolean) => void;
  networkStats: {
    rttMs: number;
    packetLossPercent: number;
    downlinkMbps?: number;
    isBuffering: boolean;
  };

  // Broadcaster State & Controls
  isCapturing: boolean;
  broadcastSource: "screen" | "video" | null;
  broadcasterStream: MediaStream | null;
  recordingSeconds: number;
  sessionTitle: string;
  setSessionTitle: (title: string) => void;
  sessionProjectType: string;
  setSessionProjectType: (type: string) => void;
  sessionNotes: string;
  setSessionNotes: (notes: string) => void;
  isMicEnabled: boolean;
  toggleCheckerMic: () => void;
  startScreenCapture: () => Promise<void>;
  finishScreenCapture: () => void;
  discardCapture: () => void;

  // Video Broadcast Specific Controls
  uploadFile: File | null;
  uploadBlobUrl: string | null;
  uploadTitle: string;
  setUploadTitle: (t: string) => void;
  uploadProjectType: string;
  setUploadProjectType: (t: string) => void;
  uploadNotes: string;
  setUploadNotes: (n: string) => void;
  handleFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  startVideoBroadcast: () => void;
  finishVideoBroadcast: () => void;
  discardVideoBroadcast: () => void;
  videoDuration: number;
  videoCurrentTime: number;
  isVideoPaused: boolean;
  isMonitorAudioMuted: boolean;
  toggleVideoPlayPause: () => void;
  handleVideoSeek: (newTime: number) => void;
  handleSeekRelative: (seconds: number) => void;
  toggleMonitorAudio: () => void;

  // Review & Publishing State
  isReviewing: boolean;
  setIsReviewing: (r: boolean) => void;
  recordedBlob: Blob | null;
  recordedBlobUrl: string | null;
  recordedDuration: number;
  isUploading: boolean;
  handlePublishRecording: (onSuccess?: (recording: any) => void) => Promise<void>;
  handleDiscardRecording: () => void;
  handlePublishVideoFile: (onSuccess?: (recording: any) => void) => Promise<void>;
  handleDiscardVideoBroadcast: () => void;

  // Helpers
  formatTimer: (totalSeconds: number) => string;
}

const LivestreamContext = createContext<LivestreamContextType | null>(null);

export function LivestreamProvider({
  children,
  initialUser,
}: {
  children: ReactNode;
  initialUser?: any;
}) {
  const [currentUser, setCurrentUser] = useState<any>(
    initialUser?.email ? initialUser : null
  );

  // Sync initialUser if updated from parent (layout.tsx)
  useEffect(() => {
    if (initialUser && initialUser.email) {
      setCurrentUser((prev: any) => ({
        ...(prev || {}),
        ...initialUser,
      }));
    }
  }, [initialUser?.email, initialUser?.role, initialUser?.name]);

  // Live Screen Share & WebRTC state (Viewer & Checker)
  const [liveSession, setLiveSession] = useState<any>(null);
  const [liveViewerCount, setLiveViewerCount] = useState<number>(0);
  const [broadcasterStream, setBroadcasterStream] = useState<MediaStream | null>(
    null
  );
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isViewerMuted, setIsViewerMuted] = useState(true);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [hasJoinedStream, setHasJoinedStream] = useState(false);
  const [isConnectingStream, setIsConnectingStream] = useState(false);
  const [isStreamInterrupted, setIsStreamInterrupted] = useState(false);
  const [isNetworkOffline, setIsNetworkOffline] = useState(false);

  // Network Health & Slow Internet Detection State
  const [networkHealth, setNetworkHealth] = useState<"good" | "fair" | "poor">("good");
  const [isVideoBuffering, setIsVideoBuffering] = useState(false);
  const [networkStats, setNetworkStats] = useState<{
    rttMs: number;
    packetLossPercent: number;
    downlinkMbps?: number;
    isBuffering: boolean;
  }>({
    rttMs: 0,
    packetLossPercent: 0,
    isBuffering: false,
  });

  const isSlowConnection = networkHealth === "poor" || isVideoBuffering;

  const hasJoinedStreamRef = useRef(false);
  const isStreamInterruptedRef = useRef(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Livestream Queue & Reservation State
  const [broadcastQueue, setBroadcastQueue] = useState<
    Array<{
      position: number;
      email: string;
      name: string;
      role?: string;
      queuedAt?: string;
    }>
  >([]);
  const [reservedChecker, setReservedChecker] = useState<{
    email: string;
    name: string;
    role?: string;
    expiresAt: number;
  } | null>(null);
  const [isQueueActionLoading, setIsQueueActionLoading] = useState(false);

  // In-Browser Recording Studio State (Checker)
  const [isCapturing, setIsCapturing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionProjectType, setSessionProjectType] =
    useState("Standard Building");
  const [sessionNotes, setSessionNotes] = useState("");

  // Post-Recording Review & Confirmation State
  const [isReviewing, setIsReviewing] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState<string | null>(null);
  const [recordedDuration, setRecordedDuration] = useState<number>(0);

  // Manual File Upload & Video Broadcast State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBlobUrl, setUploadBlobUrl] = useState<string | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadProjectType, setUploadProjectType] =
    useState("Standard Building");
  const [uploadNotes, setUploadNotes] = useState("");
  const [broadcastSource, setBroadcastSource] = useState<
    "screen" | "video" | null
  >(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState<number>(0);
  const [isVideoPaused, setIsVideoPaused] = useState<boolean>(false);
  const [isMonitorAudioMuted, setIsMonitorAudioMuted] =
    useState<boolean>(false);

  // Internal Refs for Media & WebRTC
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const viewerPeerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(
    new Map()
  );
  const viewerPendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // Persistent Broadcast Video Element (lives in the layout provider so captureStream never stops)
  const persistentBroadcastVideoRef = useRef<HTMLVideoElement | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const mediaElementSourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  // Concurrency & Queue Guards
  const isAnotherCheckerLive = Boolean(
    liveSession &&
      (!currentUser ||
        liveSession.checkerEmail?.toLowerCase() !==
          currentUser.email?.toLowerCase())
  );
  const isMyTurn = Boolean(
    reservedChecker &&
      currentUser &&
      reservedChecker.email?.toLowerCase() === currentUser.email?.toLowerCase()
  );
  const isAnotherCheckerReserved = Boolean(
    reservedChecker &&
      (!currentUser ||
        reservedChecker.email?.toLowerCase() !==
          currentUser.email?.toLowerCase())
  );
  const myQueueItem = broadcastQueue.find(
    (item) =>
      currentUser &&
      item.email?.toLowerCase() === currentUser.email?.toLowerCase()
  );
  const isQueued = Boolean(myQueueItem);
  const myQueuePosition = myQueueItem?.position || 0;

  // Format Helper
  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  // Keep user populated
  useEffect(() => {
    if (!currentUser || !currentUser.email || !currentUser.role) {
      getSessionUser()
        .then((user) => {
          if (user) {
            setCurrentUser((prev: any) => ({
              ...(prev || {}),
              ...user,
            }));
          }
        })
        .catch(() => {});
    }
  }, [currentUser?.email, currentUser?.role]);

  // Viewer Audio Controls
  const unmuteViewer = () => {
    setIsViewerMuted(false);
  };

  const toggleViewerMute = () => {
    setIsViewerMuted((prev) => !prev);
  };

  // Checker Mic Control
  const toggleCheckerMic = () => {
    if (micStreamRef.current) {
      const audioTrack = micStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicEnabled(audioTrack.enabled);
        toast.info(
          audioTrack.enabled ? "Microphone active 🎙️" : "Microphone muted 🔇"
        );
      }
    }
  };

  // Viewer Joins Stream
  const handleJoinStream = () => {
    if (!socketRef.current) return;
    setIsConnectingStream(true);
    setIsStreamInterrupted(false);
    isStreamInterruptedRef.current = false;
    setHasJoinedStream(true);
    hasJoinedStreamRef.current = true;
    socketRef.current.emit("livestream:join_room");
    toast.info("Connecting to live audit inspection...");
  };

  // Viewer Leaves Stream
  const handleLeaveStream = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.emit("livestream:leave_room");
    }
    if (viewerPeerConnectionRef.current) {
      try {
        viewerPeerConnectionRef.current.close();
      } catch {}
      viewerPeerConnectionRef.current = null;
    }
    viewerPendingCandidatesRef.current = [];
    remoteStreamRef.current = null;
    setRemoteStream(null);
    setHasJoinedStream(false);
    hasJoinedStreamRef.current = false;
    setIsConnectingStream(false);
    setIsStreamInterrupted(false);
    isStreamInterruptedRef.current = false;
    toast.info("Left live stream.");
  };

  // Reconnect Viewer Stream (e.g. after network drop)
  const reconnectViewerStream = useCallback((showToast = true) => {
    if (!socketRef.current || !hasJoinedStreamRef.current) return;
    setIsConnectingStream(true);
    setIsStreamInterrupted(true);
    isStreamInterruptedRef.current = true;

    if (showToast) {
      toast.info("Reconnecting live stream feed...");
    }

    if (viewerPeerConnectionRef.current) {
      try {
        viewerPeerConnectionRef.current.close();
      } catch {}
      viewerPeerConnectionRef.current = null;
    }

    remoteStreamRef.current = null;
    setRemoteStream(null);
    viewerPendingCandidatesRef.current = [];

    socketRef.current.emit("livestream:join_room");
  }, []);

  // Queue actions
  const handleJoinQueue = () => {
    if (!socketRef.current) return;
    setIsQueueActionLoading(true);
    socketRef.current.emit("livestream:queue_join");
  };

  const handleLeaveQueue = () => {
    if (!socketRef.current) return;
    setIsQueueActionLoading(true);
    socketRef.current.emit("livestream:queue_leave");
  };

  // Dynamic adaptive bitrate budgeting for checkers
  const applyAdaptiveBitrate = useCallback(() => {
    const activePeers = peerConnectionsRef.current.size;
    const targetBitrate = Math.max(
      800_000,
      Math.min(2_200_000, Math.floor(4_800_000 / Math.max(1, activePeers)))
    );

    peerConnectionsRef.current.forEach((peer) => {
      peer.getSenders().forEach((s) => {
        if (s.track?.kind === "video") {
          try {
            const params = s.getParameters();
            if (params.encodings && params.encodings.length > 0) {
              params.encodings[0].maxBitrate = targetBitrate;
              params.encodings[0].maxFramerate = 30;
              params.degradationPreference = "maintain-framerate";

              const vWidth =
                persistentBroadcastVideoRef.current?.videoWidth || 1920;
              if (vWidth > 1920) {
                params.encodings[0].scaleResolutionDownBy = +(
                  vWidth / 1920
                ).toFixed(2);
              } else {
                params.encodings[0].scaleResolutionDownBy = 1;
              }

              s.setParameters(params).catch(() => {});
            }
          } catch {}
        }
      });
    });
  }, []);

  // Browser network status listeners
  useEffect(() => {
    const handleOffline = () => {
      setIsNetworkOffline(true);
      if (hasJoinedStreamRef.current) {
        setIsStreamInterrupted(true);
        isStreamInterruptedRef.current = true;
      }
    };

    const handleOnline = () => {
      setIsNetworkOffline(false);
      if (hasJoinedStreamRef.current) {
        if (reconnectTimeoutRef.current)
          clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectViewerStream(true);
        }, 800);
      }
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [reconnectViewerStream]);

  // Network Health & Slow Internet Detection Monitor (Checks WebRTC stats + Network Information API)
  const lastStatsRef = useRef<{
    timestamp: number;
    packetsReceived: number;
    packetsLost: number;
  }>({
    timestamp: Date.now(),
    packetsReceived: 0,
    packetsLost: 0,
  });

  useEffect(() => {
    if (!hasJoinedStream && !isCapturing) {
      setNetworkHealth("good");
      return;
    }

    const interval = setInterval(async () => {
      const navConn =
        typeof navigator !== "undefined" ? (navigator as any).connection : null;
      const downlink = navConn?.downlink;
      const effectiveType = navConn?.effectiveType;

      let rttMs = 0;
      let lossPercent = 0;

      // Viewer Stats Polling
      if (hasJoinedStream && viewerPeerConnectionRef.current) {
        try {
          const stats = await viewerPeerConnectionRef.current.getStats();
          let currentPacketsReceived = 0;
          let currentPacketsLost = 0;
          let jitterMs = 0;

          stats.forEach((report) => {
            if (report.type === "candidate-pair" && report.state === "succeeded") {
              if (typeof report.currentRoundTripTime === "number") {
                rttMs = Math.round(report.currentRoundTripTime * 1000);
              }
            }
            if (report.type === "inbound-rtp" && report.kind === "video") {
              currentPacketsReceived = report.packetsReceived || 0;
              currentPacketsLost = report.packetsLost || 0;
              if (typeof report.jitter === "number") {
                jitterMs = Math.round(report.jitter * 1000);
              }
            }
          });

          const deltaReceived =
            currentPacketsReceived - lastStatsRef.current.packetsReceived;
          const deltaLost = currentPacketsLost - lastStatsRef.current.packetsLost;
          const totalDelta = deltaReceived + deltaLost;

          if (totalDelta > 0 && deltaLost >= 0) {
            lossPercent = Math.min(
              100,
              Math.round((deltaLost / totalDelta) * 100)
            );
          }

          lastStatsRef.current = {
            timestamp: Date.now(),
            packetsReceived: currentPacketsReceived,
            packetsLost: currentPacketsLost,
          };

          const isPoor =
            rttMs > 350 ||
            lossPercent > 6 ||
            jitterMs > 120 ||
            (downlink !== undefined && downlink < 1.0) ||
            effectiveType === "2g" ||
            effectiveType === "slow-2g";

          const isFair =
            !isPoor &&
            (rttMs > 180 ||
              lossPercent > 2 ||
              (downlink !== undefined && downlink < 2.5) ||
              effectiveType === "3g");

          setNetworkStats({
            rttMs: rttMs || (navConn?.rtt ? Math.round(navConn.rtt) : 0),
            packetLossPercent: lossPercent,
            downlinkMbps: downlink,
            isBuffering: isVideoBuffering,
          });

          setNetworkHealth(isPoor ? "poor" : isFair ? "fair" : "good");
        } catch {}
      } else if (isCapturing && peerConnectionsRef.current.size > 0) {
        // Broadcaster Stats Polling
        try {
          let maxRtt = 0;
          let bandwidthThrottled = false;

          for (const pc of peerConnectionsRef.current.values()) {
            const stats = await pc.getStats();
            stats.forEach((report) => {
              if (
                report.type === "candidate-pair" &&
                report.state === "succeeded"
              ) {
                if (typeof report.currentRoundTripTime === "number") {
                  maxRtt = Math.max(
                    maxRtt,
                    Math.round(report.currentRoundTripTime * 1000)
                  );
                }
              }
              if (report.type === "outbound-rtp" && report.kind === "video") {
                if (report.qualityLimitationReason === "bandwidth") {
                  bandwidthThrottled = true;
                }
              }
            });
          }

          const isPoor =
            maxRtt > 350 ||
            bandwidthThrottled ||
            (downlink !== undefined && downlink < 1.0) ||
            effectiveType === "2g" ||
            effectiveType === "slow-2g";

          setNetworkStats({
            rttMs: maxRtt || (navConn?.rtt ? Math.round(navConn.rtt) : 0),
            packetLossPercent: 0,
            downlinkMbps: downlink,
            isBuffering: false,
          });

          setNetworkHealth(isPoor ? "poor" : maxRtt > 180 ? "fair" : "good");
        } catch {}
      } else if (navConn) {
        const isPoor =
          (downlink !== undefined && downlink < 1.0) ||
          effectiveType === "2g" ||
          effectiveType === "slow-2g" ||
          (navConn.rtt && navConn.rtt > 350);

        setNetworkStats({
          rttMs: navConn.rtt ? Math.round(navConn.rtt) : 0,
          packetLossPercent: 0,
          downlinkMbps: downlink,
          isBuffering: isVideoBuffering,
        });

        setNetworkHealth(isPoor ? "poor" : "good");
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [hasJoinedStream, isCapturing, isVideoBuffering]);

  // Tab Visibility Listener
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (
          audioContextRef.current &&
          audioContextRef.current.state === "suspended"
        ) {
          audioContextRef.current.resume().catch(() => {});
        }

        if (
          isCapturing &&
          broadcastSource === "video" &&
          persistentBroadcastVideoRef.current
        ) {
          if (
            persistentBroadcastVideoRef.current.paused &&
            !isVideoPaused
          ) {
            persistentBroadcastVideoRef.current.play().catch(() => {});
          }
        }

        if (socketRef.current?.connected) {
          socketRef.current.emit("livestream:get_status");
        }

        if (isCapturing) {
          peerConnectionsRef.current.forEach((pc) => {
            pc.getSenders().forEach((s) => {
              if (
                s.track?.kind === "video" &&
                typeof (s as any).generateKeyFrame === "function"
              ) {
                try {
                  (s as any).generateKeyFrame();
                } catch {}
              }
            });
          });
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isCapturing, broadcastSource, isVideoPaused]);

  // Tab Close / Browser Reload Guard for Broadcaster
  useEffect(() => {
    if (!isCapturing) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue =
        "A live broadcast is currently in progress. Leaving will end your broadcast.";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isCapturing]);

  // Setup Socket.io Connection & WebRTC Signaling
  useEffect(() => {
    const token = getCookie("xnite_session");
    const socket = io(getSocketUrl(), {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("livestream:get_status");
      if (hasJoinedStreamRef.current) {
        console.log(
          "[Livestream Socket] Reconnected while watching. Re-joining room..."
        );
        reconnectViewerStream(false);
      }
    });

    socket.on("disconnect", (reason) => {
      console.warn("[Livestream Socket] Connection lost:", reason);
      if (hasJoinedStreamRef.current) {
        setIsConnectingStream(true);
        setIsStreamInterrupted(true);
        isStreamInterruptedRef.current = true;
      }
    });

    socket.on("connect_error", (err) => {
      console.warn("[Livestream Socket] Connection error:", err.message);
    });

    socket.on("livestream:stream_available", () => {
      socket.emit("livestream:get_status");
      toast.info(
        "A checker has started a live audit inspection! Click 'Watch Live Stream' to view."
      );
    });

    socket.on(
      "livestream:checker_reconnecting",
      ({ message }: { message?: string }) => {
        if (hasJoinedStreamRef.current && !isCapturing) {
          setIsConnectingStream(true);
          setIsStreamInterrupted(true);
          isStreamInterruptedRef.current = true;
          toast.info(
            message || "Broadcaster connection paused. Waiting for reconnect..."
          );
        }
      }
    );

    socket.on("livestream:checker_reconnected", () => {
      if (hasJoinedStreamRef.current && !isCapturing) {
        toast.success("Broadcaster reconnected! Re-syncing stream...");
        reconnectViewerStream(false);
      }
    });

    socket.on(
      "livestream:status_update",
      ({ isLive, session, queue, reservedChecker: reserved }: any) => {
        if (isLive && session) {
          setLiveSession(session);
        } else {
          setLiveSession(null);
          remoteStreamRef.current = null;
          setRemoteStream(null);
          setHasJoinedStream(false);
          hasJoinedStreamRef.current = false;
          setIsConnectingStream(false);
          setIsStreamInterrupted(false);
          isStreamInterruptedRef.current = false;
        }
        if (Array.isArray(queue)) {
          setBroadcastQueue(queue);
        }
        setReservedChecker(reserved || null);
      }
    );

    socket.on(
      "livestream:your_turn",
      ({ message }: { expiresAt: number; message?: string }) => {
        toast.success(
          message ||
            "🎉 It's your turn to broadcast! You now have reserved broadcast access.",
          {
            duration: 12000,
          }
        );
      }
    );

    socket.on(
      "livestream:queue_joined",
      ({ position }: { position: number }) => {
        setIsQueueActionLoading(false);
        toast.success(
          `Joined queue! You are #${position} in line to broadcast.`
        );
      }
    );

    socket.on("livestream:queue_left", () => {
      setIsQueueActionLoading(false);
      toast.info("You left the broadcast queue.");
    });

    socket.on(
      "livestream:queue_error",
      ({ message }: { message: string }) => {
        setIsQueueActionLoading(false);
        toast.error(message || "Queue action failed.");
      }
    );

    socket.on("livestream:viewer_count", (count: number) => {
      setLiveViewerCount(() => {
        const activePeers = peerConnectionsRef.current.size;
        return Math.max(count, activePeers);
      });
    });

    socket.on(
      "livestream:checker_busy",
      ({ message }: { message: string }) => {
        toast.error(
          message ||
            "Another checker is currently live. Only one broadcast can be active at a time."
        );
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state !== "inactive"
        ) {
          mediaRecorderRef.current.stop();
        }
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        setIsCapturing(false);
        setRecordingSeconds(0);
      }
    );

    // --- CHECKER SIDE: When a viewer joins the room, send WebRTC offer ---
    socket.on("livestream:viewer_joined", async ({ viewerSocketId }) => {
      setLiveViewerCount((prev) =>
        Math.max(prev + 1, peerConnectionsRef.current.size + 1)
      );
      if (!mediaStreamRef.current) return;

      const existingPc = peerConnectionsRef.current.get(viewerSocketId);
      if (existingPc) {
        try {
          existingPc.close();
        } catch {}
        peerConnectionsRef.current.delete(viewerSocketId);
      }
      pendingCandidatesRef.current.delete(viewerSocketId);

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnectionsRef.current.set(viewerSocketId, pc);
      pendingCandidatesRef.current.set(viewerSocketId, []);

      pc.oniceconnectionstatechange = () => {
        console.log(`[Checker ICE] ${viewerSocketId}: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === "failed") {
          try {
            (pc as any).restartIce?.();
          } catch {}
        }
      };

      const activePeers = peerConnectionsRef.current.size;
      const targetBitrate = Math.max(
        800_000,
        Math.min(2_200_000, Math.floor(4_800_000 / Math.max(1, activePeers)))
      );

      mediaStreamRef.current.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, mediaStreamRef.current!);
        if (track.kind === "video" && sender) {
          try {
            const params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) {
              params.encodings = [{}];
            }
            params.encodings[0].maxBitrate = targetBitrate;
            params.encodings[0].maxFramerate = 30;
            params.degradationPreference = "maintain-framerate";

            const vWidth =
              persistentBroadcastVideoRef.current?.videoWidth || 1920;
            if (vWidth > 1920) {
              params.encodings[0].scaleResolutionDownBy = +(
                vWidth / 1920
              ).toFixed(2);
            } else {
              params.encodings[0].scaleResolutionDownBy = 1;
            }

            sender.setParameters(params).catch(() => {});
          } catch {}

          if (typeof (sender as any).generateKeyFrame === "function") {
            try {
              (sender as any).generateKeyFrame();
            } catch {}
          }
        }
      });

      if (
        broadcastSource === "video" &&
        persistentBroadcastVideoRef.current &&
        !persistentBroadcastVideoRef.current.paused
      ) {
        try {
          const curTime = persistentBroadcastVideoRef.current.currentTime;
          persistentBroadcastVideoRef.current.currentTime = Math.max(
            0,
            curTime - 0.001
          );
        } catch {}
      }

      // Prioritize hardware-accelerated VP8 and H264 codecs
      try {
        if (
          "setCodecPreferences" in RTCRtpTransceiver.prototype &&
          (window as any).RTCRtpReceiver?.getCapabilities
        ) {
          const transceivers = pc.getTransceivers();
          const videoTransceiver = transceivers.find(
            (t) => t.sender.track?.kind === "video"
          );
          if (videoTransceiver) {
            const caps = (window as any).RTCRtpReceiver.getCapabilities("video");
            if (caps?.codecs) {
              const preferred = caps.codecs.filter(
                (c: any) =>
                  c.mimeType.toLowerCase() === "video/vp8" ||
                  c.mimeType.toLowerCase() === "video/h264"
              );
              const rest = caps.codecs.filter(
                (c: any) =>
                  c.mimeType.toLowerCase() !== "video/vp8" &&
                  c.mimeType.toLowerCase() !== "video/h264"
              );
              if (preferred.length > 0) {
                videoTransceiver.setCodecPreferences([...preferred, ...rest]);
              }
            }
          }
        }
      } catch {}

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("livestream:signal", {
            targetSocketId: viewerSocketId,
            signal: { candidate: event.candidate },
          });
        }
      };

      try {
        let offer = await pc.createOffer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: false,
        });

        // Optimize SDP: Enable Opus in-band FEC and DTX safely
        if (offer.sdp) {
          let sdp = offer.sdp;
          if (/a=fmtp:(\d+)/.test(sdp)) {
            sdp = sdp.replace(/a=fmtp:(\d+)(.*)/g, (match, pt) => {
              const isOpus = new RegExp(`a=rtpmap:${pt} opus/48000/2`).test(sdp);
              if (isOpus) {
                return `a=fmtp:${pt} minptime=10;useinbandfec=1;usedtx=1;maxaveragebitrate=128000`;
              }
              return match;
            });
          } else {
            sdp = sdp.replace(
              /a=rtpmap:(\d+) opus\/48000\/2/g,
              "a=rtpmap:$1 opus/48000/2\r\na=fmtp:$1 minptime=10;useinbandfec=1;usedtx=1;maxaveragebitrate=128000"
            );
          }
          offer = new RTCSessionDescription({ type: offer.type, sdp });
        }

        await pc.setLocalDescription(offer);
        socket.emit("livestream:signal", {
          targetSocketId: viewerSocketId,
          signal: { sdp: offer },
        });

        applyAdaptiveBitrate();
      } catch (err) {
        console.error("Failed to create WebRTC offer:", err);
      }
    });

    socket.on("livestream:viewer_left", ({ viewerSocketId }) => {
      const pc = peerConnectionsRef.current.get(viewerSocketId);
      if (pc) {
        pc.close();
        peerConnectionsRef.current.delete(viewerSocketId);
      }
      pendingCandidatesRef.current.delete(viewerSocketId);
      setLiveViewerCount(() => peerConnectionsRef.current.size);
      applyAdaptiveBitrate();
    });

    // --- VIEWER & CHECKER: Handle incoming WebRTC signals ---
    socket.on("livestream:signal", async ({ senderSocketId, signal }) => {
      if (signal.sdp && signal.sdp.type === "offer") {
        if (viewerPeerConnectionRef.current) {
          try {
            viewerPeerConnectionRef.current.close();
          } catch {}
        }

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        viewerPeerConnectionRef.current = pc;

        pc.oniceconnectionstatechange = () => {
          console.log(`[Viewer ICE] state: ${pc.iceConnectionState}`);
          if (
            pc.iceConnectionState === "connected" ||
            pc.iceConnectionState === "completed"
          ) {
            setIsConnectingStream(false);
            setIsStreamInterrupted(false);
            isStreamInterruptedRef.current = false;
          } else if (pc.iceConnectionState === "disconnected") {
            setIsConnectingStream(true);
            setIsStreamInterrupted(true);
            isStreamInterruptedRef.current = true;
            if (reconnectTimeoutRef.current)
              clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = setTimeout(() => {
              if (
                viewerPeerConnectionRef.current?.iceConnectionState ===
                  "disconnected" &&
                hasJoinedStreamRef.current
              ) {
                reconnectViewerStream(false);
              }
            }, 3500);
          } else if (pc.iceConnectionState === "failed") {
            setIsConnectingStream(true);
            setIsStreamInterrupted(true);
            isStreamInterruptedRef.current = true;
            if (hasJoinedStreamRef.current) {
              reconnectViewerStream(false);
            }
          }
        };

        pc.ontrack = (event) => {
          let stream = remoteStreamRef.current;
          if (!stream) {
            stream = new MediaStream();
            remoteStreamRef.current = stream;
          }
          if (!stream.getTracks().some((t) => t.id === event.track.id)) {
            stream.addTrack(event.track);
          }
          setRemoteStream(stream);
          setIsConnectingStream(false);
          setIsStreamInterrupted(false);
          isStreamInterruptedRef.current = false;
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("livestream:signal", {
              targetSocketId: senderSocketId,
              signal: { candidate: event.candidate },
            });
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

        const buffered = [...viewerPendingCandidatesRef.current];
        viewerPendingCandidatesRef.current = [];
        for (const cand of buffered) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch {}
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("livestream:signal", {
          targetSocketId: senderSocketId,
          signal: { sdp: answer },
        });
      } else if (signal.sdp && signal.sdp.type === "answer") {
        const pc = peerConnectionsRef.current.get(senderSocketId);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          const buffered =
            pendingCandidatesRef.current.get(senderSocketId) || [];
          pendingCandidatesRef.current.delete(senderSocketId);
          for (const cand of buffered) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
        }
      } else if (signal.candidate) {
        if (peerConnectionsRef.current.has(senderSocketId)) {
          const pc = peerConnectionsRef.current.get(senderSocketId)!;
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc
              .addIceCandidate(new RTCIceCandidate(signal.candidate))
              .catch(() => {});
          } else {
            const queue =
              pendingCandidatesRef.current.get(senderSocketId) || [];
            queue.push(signal.candidate);
            pendingCandidatesRef.current.set(senderSocketId, queue);
          }
        } else {
          const pc = viewerPeerConnectionRef.current;
          if (pc && pc.remoteDescription && pc.remoteDescription.type) {
            await pc
              .addIceCandidate(new RTCIceCandidate(signal.candidate))
              .catch(() => {});
          } else {
            viewerPendingCandidatesRef.current.push(signal.candidate);
          }
        }
      }
    });

    socket.on("livestream:ended", () => {
      setLiveSession(null);
      remoteStreamRef.current = null;
      setRemoteStream(null);
      if (viewerPeerConnectionRef.current) {
        try {
          viewerPeerConnectionRef.current.close();
        } catch {}
        viewerPeerConnectionRef.current = null;
      }
      setHasJoinedStream(false);
      hasJoinedStreamRef.current = false;
      setIsConnectingStream(false);
      setIsStreamInterrupted(false);
      isStreamInterruptedRef.current = false;
      toast.info("The live inspection session has ended.");
    });

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (viewerPeerConnectionRef.current) {
        try {
          viewerPeerConnectionRef.current.close();
        } catch {}
      }
      socket.disconnect();
    };
  }, [reconnectViewerStream, applyAdaptiveBitrate, broadcastSource, isCapturing]);

  // --- CHECKER: Screen Capture Broadcast ---
  const startScreenCapture = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error(
        "Screen recording is not supported in this browser. Please use Chrome or Edge."
      );
      return;
    }

    if (
      liveSession &&
      (!currentUser ||
        liveSession.checkerEmail?.toLowerCase() !==
          currentUser.email?.toLowerCase())
    ) {
      toast.error(
        `Checker "${liveSession.checkerName}" is currently live. You can join the broadcast queue to be next!`
      );
      return;
    }

    if (isAnotherCheckerReserved && reservedChecker) {
      toast.error(
        `Broadcast slot is currently reserved for ${reservedChecker.name}. You can join the queue behind them.`
      );
      return;
    }

    try {
      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        micStreamRef.current = micStream;
        setIsMicEnabled(true);
      } catch (micErr) {
        console.warn("Microphone access not available or denied:", micErr);
        toast.info("Microphone not detected; streaming screen without mic audio.");
      }

      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "monitor",
          width: { max: 1920 },
          height: { max: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: true,
      });
      screenStreamRef.current = screenStream;

      const screenTrack = screenStream.getVideoTracks()[0];
      if (screenTrack && "contentHint" in screenTrack) {
        screenTrack.contentHint = "detail";
      }

      let finalAudioTracks: MediaStreamTrack[] = [];
      const hasSysAudio = screenStream.getAudioTracks().length > 0;
      const hasMicAudio = micStream && micStream.getAudioTracks().length > 0;

      if (hasSysAudio && hasMicAudio) {
        try {
          const audioCtx = new (
            window.AudioContext || (window as any).webkitAudioContext
          )({
            sampleRate: 48000,
            latencyHint: "interactive",
          });
          audioContextRef.current = audioCtx;
          const dest = audioCtx.createMediaStreamDestination();
          const sysSource = audioCtx.createMediaStreamSource(screenStream);
          const micSource = audioCtx.createMediaStreamSource(micStream!);
          sysSource.connect(dest);
          micSource.connect(dest);
          finalAudioTracks = dest.stream.getAudioTracks();
        } catch {
          finalAudioTracks = micStream!.getAudioTracks();
        }
      } else if (hasMicAudio) {
        finalAudioTracks = micStream!.getAudioTracks();
      } else if (hasSysAudio) {
        finalAudioTracks = screenStream.getAudioTracks();
      }

      const combinedStream = new MediaStream([
        ...screenStream.getVideoTracks(),
        ...finalAudioTracks,
      ]);

      mediaStreamRef.current = combinedStream;
      setBroadcasterStream(combinedStream);
      recordedChunksRef.current = [];

      let mimeType = "video/webm;codecs=vp8,opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "video/webm;codecs=vp9,opus";
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "video/webm";
      }

      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 2_500_000,
        audioBitsPerSecond: 128_000,
      });
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;

      const title =
        sessionTitle ||
        `Quality Audit Check - ${new Date().toLocaleDateString()}`;
      setSessionTitle(title);
      setIsCapturing(true);
      setBroadcastSource("screen");
      setRecordingSeconds(0);

      if (socketRef.current) {
        socketRef.current.emit("livestream:checker_start", {
          title,
          projectType: sessionProjectType,
          broadcastType: "screen",
        });
      }

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

      screenStream.getVideoTracks()[0].onended = () => {
        finishScreenCapture();
      };

      toast.success(
        "Live broadcast started! Screen and microphone are now live."
      );
    } catch (err) {
      console.error("Screen capture error:", err);
      toast.error("Screen sharing was cancelled.");
    }
  };

  const finishScreenCapture = () => {
    if (!mediaRecorderRef.current || !mediaStreamRef.current) return;

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.emit("livestream:checker_stop");
    }

    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    setLiveViewerCount(0);

    const recorder = mediaRecorderRef.current;
    const finalDuration = recordingSeconds;
    setRecordedDuration(finalDuration);

    recorder.onstop = () => {
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      screenStreamRef.current = null;
      micStreamRef.current = null;
      mediaStreamRef.current = null;
      setBroadcasterStream(null);
      mediaRecorderRef.current = null;

      const mime = recorder.mimeType || "video/webm";
      const blob = new Blob(recordedChunksRef.current, { type: mime });
      const url = URL.createObjectURL(blob);
      setRecordedBlob(blob);
      setRecordedBlobUrl(url);
      setIsCapturing(false);
      setIsReviewing(true);
      toast.info(
        "Session ended. Review your recording to save or discard."
      );
    };

    recorder.stop();
  };

  const discardCapture = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (socketRef.current) socketRef.current.emit("livestream:checker_stop");
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    setLiveViewerCount(0);
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    screenStreamRef.current = null;
    micStreamRef.current = null;
    mediaStreamRef.current = null;
    setBroadcasterStream(null);
    mediaRecorderRef.current = null;
    setIsCapturing(false);
    setBroadcastSource(null);
    setRecordingSeconds(0);
    toast.info("Live recording cancelled and discarded.");
  };

  // --- CHECKER: Video File Broadcast ---
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (uploadBlobUrl) URL.revokeObjectURL(uploadBlobUrl);
      const url = URL.createObjectURL(file);
      setUploadFile(file);
      setUploadBlobUrl(url);
      const cleanName = file.name.replace(/\.[^/.]+$/, "");
      setUploadTitle(cleanName);
      setUploadNotes("");
      setVideoCurrentTime(0);

      const tempVideo = document.createElement("video");
      tempVideo.preload = "metadata";
      tempVideo.src = url;
      tempVideo.onloadedmetadata = () => {
        setVideoDuration(Math.round(tempVideo.duration || 0));
      };
    }
  };

  const startVideoBroadcast = () => {
    if (!uploadFile || !uploadBlobUrl) {
      toast.error("Please choose a video file first.");
      return;
    }

    if (
      liveSession &&
      (!currentUser ||
        liveSession.checkerEmail?.toLowerCase() !==
          currentUser.email?.toLowerCase())
    ) {
      toast.error(
        `Checker "${liveSession.checkerName}" is currently live. You can join the broadcast queue to be next!`
      );
      return;
    }

    if (isAnotherCheckerReserved && reservedChecker) {
      toast.error(
        `Broadcast slot is currently reserved for ${reservedChecker.name}. You can join the queue behind them.`
      );
      return;
    }

    const title =
      uploadTitle?.trim() || uploadFile.name.replace(/\.[^/.]+$/, "");
    setSessionTitle(title);
    setSessionProjectType(uploadProjectType);
    setSessionNotes(uploadNotes);
    setBroadcastSource("video");
    setIsCapturing(true);
    setRecordingSeconds(0);
    setVideoCurrentTime(0);
    setIsVideoPaused(false);
  };

  // Video Broadcast Setup Hook
  useEffect(() => {
    if (!isCapturing || broadcastSource !== "video") return;

    let isCancelled = false;

    const setupVideoStream = async () => {
      const video = persistentBroadcastVideoRef.current;
      if (!video) return;

      try {
        video.currentTime = 0;
        await video.play();
        if (isCancelled) return;

        const captureFn =
          (video as any).captureStream || (video as any).mozCaptureStream;
        if (!captureFn) {
          toast.error(
            "Browser does not support video streaming. Please use Chrome, Edge, or Firefox."
          );
          setIsCapturing(false);
          setBroadcastSource(null);
          return;
        }

        const videoStream: MediaStream = captureFn.call(video, 30);

        const videoTrack = videoStream.getVideoTracks()[0];
        if (videoTrack && "contentHint" in videoTrack) {
          videoTrack.contentHint = "detail";
        }

        let micStream: MediaStream | null = null;
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          micStreamRef.current = micStream;
          setIsMicEnabled(true);
        } catch {
          console.warn("Microphone not available; streaming video audio only.");
        }

        let combinedAudioTracks: MediaStreamTrack[] = [];
        const hasVideoAudio = videoStream.getAudioTracks().length > 0;
        const hasMicAudio = micStream && micStream.getAudioTracks().length > 0;

        if (hasVideoAudio || hasMicAudio) {
          try {
            const audioCtx = new (
              window.AudioContext || (window as any).webkitAudioContext
            )({
              sampleRate: 48000,
              latencyHint: "interactive",
            });
            audioContextRef.current = audioCtx;
            const dest = audioCtx.createMediaStreamDestination();

            if (hasVideoAudio) {
              if (!mediaElementSourceRef.current) {
                mediaElementSourceRef.current =
                  audioCtx.createMediaElementSource(video);
              }
              const sourceNode = mediaElementSourceRef.current;
              sourceNode.connect(dest);

              const monitorGain = audioCtx.createGain();
              monitorGain.gain.value = isMonitorAudioMuted ? 0 : 0.8;
              sourceNode.connect(monitorGain);
              monitorGain.connect(audioCtx.destination);
              monitorGainRef.current = monitorGain;
            }

            if (hasMicAudio && micStream) {
              const micSource = audioCtx.createMediaStreamSource(micStream);
              micSource.connect(dest);
            }

            combinedAudioTracks = dest.stream.getAudioTracks();
          } catch (audioErr) {
            console.warn("Web Audio mix fallback:", audioErr);
            if (hasVideoAudio) {
              combinedAudioTracks = videoStream.getAudioTracks();
            } else if (hasMicAudio) {
              combinedAudioTracks = micStream!.getAudioTracks();
            }
          }
        }

        const combinedStream = new MediaStream([
          videoTrack,
          ...combinedAudioTracks,
        ]);

        mediaStreamRef.current = combinedStream;
        setBroadcasterStream(combinedStream);

        const broadcastTitle =
          sessionTitle ||
          uploadTitle ||
          uploadFile?.name ||
          "Quality Audit Check";
        const broadcastType = sessionProjectType || uploadProjectType;

        if (socketRef.current) {
          socketRef.current.emit("livestream:checker_start", {
            title: broadcastTitle,
            projectType: broadcastType,
            broadcastType: "video",
          });
        }

        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = setInterval(() => {
          setRecordingSeconds((prev) => prev + 1);
        }, 1000);

        toast.success(
          "Live broadcast started! Video check is streaming live to all viewers."
        );
      } catch (err: any) {
        console.error("Video broadcast error:", err);
        toast.error(
          "Failed to start video broadcast: " + (err.message || "Unknown error")
        );
        setIsCapturing(false);
        setBroadcastSource(null);
        setBroadcasterStream(null);
      }
    };

    setupVideoStream();

    return () => {
      isCancelled = true;
    };
  }, [isCapturing, broadcastSource]);

  const finishVideoBroadcast = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.emit("livestream:checker_stop");
    }

    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    setLiveViewerCount(0);

    if (persistentBroadcastVideoRef.current) {
      persistentBroadcastVideoRef.current.pause();
    }

    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    setBroadcasterStream(null);

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    monitorGainRef.current = null;
    mediaElementSourceRef.current = null;

    const finalDuration =
      videoCurrentTime || videoDuration || recordingSeconds || 0;
    setRecordedDuration(finalDuration);
    setIsCapturing(false);
    setIsReviewing(true);
    toast.info("Session ended. Review your video check below to publish or discard.");
  };

  const discardVideoBroadcast = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (socketRef.current) socketRef.current.emit("livestream:checker_stop");
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    setLiveViewerCount(0);

    if (persistentBroadcastVideoRef.current) {
      persistentBroadcastVideoRef.current.pause();
      persistentBroadcastVideoRef.current.currentTime = 0;
    }

    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    setBroadcasterStream(null);

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    monitorGainRef.current = null;
    mediaElementSourceRef.current = null;

    setIsCapturing(false);
    setBroadcastSource(null);
    setRecordingSeconds(0);
    setVideoCurrentTime(0);
    toast.info("Live video broadcast cancelled.");
  };

  // Video Playback Controls
  const toggleVideoPlayPause = () => {
    const video = persistentBroadcastVideoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setIsVideoPaused(false);
    } else {
      video.pause();
      setIsVideoPaused(true);
    }
  };

  const handleVideoSeek = (newTime: number) => {
    setVideoCurrentTime(newTime);
    if (persistentBroadcastVideoRef.current) {
      persistentBroadcastVideoRef.current.currentTime = newTime;
    }
  };

  const handleSeekRelative = (seconds: number) => {
    const video = persistentBroadcastVideoRef.current;
    if (!video) return;
    const dur = videoDuration || video.duration || 0;
    const current = video.currentTime;
    const target = Math.max(0, Math.min(dur, current + seconds));
    video.currentTime = target;
    setVideoCurrentTime(Math.round(target));
  };

  const toggleMonitorAudio = () => {
    setIsMonitorAudioMuted((prev) => {
      const next = !prev;
      if (monitorGainRef.current) {
        monitorGainRef.current.gain.value = next ? 0 : 0.8;
      }
      if (persistentBroadcastVideoRef.current && !monitorGainRef.current) {
        persistentBroadcastVideoRef.current.muted = next;
      }
      toast.info(
        next ? "Local monitor audio muted 🔇" : "Local monitor audio active 🔊"
      );
      return next;
    });
  };

  // Review & Publishing Handlers
  const handlePublishRecording = async (onSuccess?: (recording: any) => void) => {
    if (!recordedBlob) return;

    setIsUploading(true);
    toast.info("Publishing recording to Replay Library...");

    const filename = `audit-${Date.now()}.webm`;
    const file = new File([recordedBlob], filename, { type: "video/webm" });

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", sessionTitle || "Quality Audit Check");
      formData.append("projectType", sessionProjectType);
      formData.append("durationSec", String(recordedDuration));
      formData.append("description", sessionNotes);

      const response = await fetch("/api/livestream/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.success && data.recording) {
        toast.success("Check session successfully published to Replay Library!");
        if (recordedBlobUrl) URL.revokeObjectURL(recordedBlobUrl);
        setRecordedBlob(null);
        setRecordedBlobUrl(null);
        setIsReviewing(false);
        setIsUploading(false);
        setBroadcastSource(null);
        if (onSuccess) onSuccess(data.recording);
      } else {
        toast.error(data.error || "Failed to save recording.");
        setIsUploading(false);
      }
    } catch (err: any) {
      toast.error("Upload error: " + (err.message || "Failed to upload."));
      setIsUploading(false);
    }
  };

  const handleDiscardRecording = () => {
    if (recordedBlobUrl) URL.revokeObjectURL(recordedBlobUrl);
    setRecordedBlob(null);
    setRecordedBlobUrl(null);
    setIsReviewing(false);
    setRecordedDuration(0);
    setRecordingSeconds(0);
    setBroadcastSource(null);
    toast.info("Recording discarded. Nothing was saved to the library.");
  };

  const handlePublishVideoFile = async (onSuccess?: (recording: any) => void) => {
    if (!uploadFile) return;

    setIsUploading(true);
    toast.info("Publishing video check to Replay Library...");

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("title", sessionTitle || uploadTitle || uploadFile.name);
      formData.append("projectType", sessionProjectType || uploadProjectType);
      formData.append(
        "durationSec",
        String(recordedDuration || videoDuration || 0)
      );
      formData.append("description", sessionNotes || uploadNotes);

      const response = await fetch("/api/livestream/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.success && data.recording) {
        toast.success("Check session successfully published to Replay Library!");
        if (uploadBlobUrl) URL.revokeObjectURL(uploadBlobUrl);
        setUploadFile(null);
        setUploadBlobUrl(null);
        setUploadTitle("");
        setUploadNotes("");
        setIsReviewing(false);
        setIsUploading(false);
        setBroadcastSource(null);
        if (onSuccess) onSuccess(data.recording);
      } else {
        toast.error(data.error || "Failed to save video to library.");
        setIsUploading(false);
      }
    } catch (err: any) {
      toast.error("Upload error: " + (err.message || "Failed to upload."));
      setIsUploading(false);
    }
  };

  const handleDiscardVideoBroadcast = () => {
    if (uploadBlobUrl) URL.revokeObjectURL(uploadBlobUrl);
    setUploadFile(null);
    setUploadBlobUrl(null);
    setUploadTitle("");
    setUploadNotes("");
    setIsReviewing(false);
    setRecordedDuration(0);
    setRecordingSeconds(0);
    setBroadcastSource(null);
    toast.info("Livestream finished. Video was not saved to Replay Library.");
  };

  const contextValue: LivestreamContextType = {
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
  };

  return (
    <LivestreamContext.Provider value={contextValue}>
      {children}
      {/* Persistent Offscreen Video for Checker Studio Video Broadcast */}
      <video
        ref={persistentBroadcastVideoRef}
        src={uploadBlobUrl || undefined}
        playsInline
        preload="auto"
        onTimeUpdate={(e) => {
          setVideoCurrentTime(Math.round(e.currentTarget.currentTime));
        }}
        onDurationChange={(e) => {
          setVideoDuration(Math.round(e.currentTarget.duration || 0));
        }}
        onEnded={() => finishVideoBroadcast()}
        onPlay={() => setIsVideoPaused(false)}
        onPause={() => setIsVideoPaused(true)}
        style={{
          position: "fixed",
          top: -9999,
          left: -9999,
          width: 640,
          height: 360,
          opacity: 0,
          pointerEvents: "none",
          zIndex: -1,
        }}
      />
    </LivestreamContext.Provider>
  );
}

export function useLivestream() {
  const context = useContext(LivestreamContext);
  if (!context) {
    throw new Error("useLivestream must be used within a LivestreamProvider");
  }
  return context;
}

