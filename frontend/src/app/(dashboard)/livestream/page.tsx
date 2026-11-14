"use client";

import { useEffect, useState, useRef } from "react";
import { getSessionUser } from "@/app/actions/auth";
import { isStaff } from "@/config/permissions";
import { 
  getCheckRecordingsAction, 
  getActiveLivestreamRoomAction,
  deleteCheckRecordingAction
} from "@/app/actions/livestream";
import XfnitePlayer from "@/components/video/XfnitePlayer";
import { ConfirmDeleteDialog } from "@/components/Attendance/ConfirmDeleteDialog";
import { io, Socket } from "socket.io-client";
import { 
  Radio, 
  Video, 
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
  Trash2,
  Save,
  Check,
  LogOut,
  AlertTriangle
} from "lucide-react";
import { toast } from "sonner";

function getSocketUrl(): string {
  if (typeof window !== "undefined") {
    if (process.env.NEXT_PUBLIC_SERVER_URL && !process.env.NEXT_PUBLIC_SERVER_URL.includes("localhost")) {
      return process.env.NEXT_PUBLIC_SERVER_URL;
    }
    if (process.env.NEXT_PUBLIC_SOCKET_URL && !process.env.NEXT_PUBLIC_SOCKET_URL.includes("localhost")) {
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
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
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

export default function LivestreamPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"live" | "vod" | "studio">("live");

  // Replay Library State
  const [recordings, setRecordings] = useState<any[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<any>(null);
  const [selectedFilter, setSelectedFilter] = useState("All");

  // In-Browser Recording Studio State (Checker)
  const [isCapturing, setIsCapturing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionProjectType, setSessionProjectType] = useState("Standard Building");
  const [sessionNotes, setSessionNotes] = useState("");

  // Post-Recording Review & Confirmation State
  const [isReviewing, setIsReviewing] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState<string | null>(null);
  const [recordedDuration, setRecordedDuration] = useState<number>(0);

  // Delete Recording Confirmation Modal State
  const [recordingToDelete, setRecordingToDelete] = useState<string | null>(null);
  const [isDeletingRecording, setIsDeletingRecording] = useState(false);

  // Live Screen Share & WebRTC state (Viewer & Checker)
  const [liveSession, setLiveSession] = useState<any>(null);
  const [liveViewerCount, setLiveViewerCount] = useState<number>(0);
  const [isViewerMuted, setIsViewerMuted] = useState(true);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [hasJoinedStream, setHasJoinedStream] = useState(false);
  const [isConnectingStream, setIsConnectingStream] = useState(false);

  // Livestream Queue & Reservation State
  const [broadcastQueue, setBroadcastQueue] = useState<
    Array<{ position: number; email: string; name: string; role?: string; queuedAt?: string }>
  >([]);
  const [reservedChecker, setReservedChecker] = useState<{
    email: string;
    name: string;
    role?: string;
    expiresAt: number;
  } | null>(null);
  const [isQueueActionLoading, setIsQueueActionLoading] = useState(false);

  // Concurrency & Queue Guards
  const isAnotherCheckerLive = Boolean(
    liveSession && (!currentUser || liveSession.checkerEmail?.toLowerCase() !== currentUser.email?.toLowerCase())
  );
  const isMyTurn = Boolean(
    reservedChecker && currentUser && reservedChecker.email?.toLowerCase() === currentUser.email?.toLowerCase()
  );
  const isAnotherCheckerReserved = Boolean(
    reservedChecker && (!currentUser || reservedChecker.email?.toLowerCase() !== currentUser.email?.toLowerCase())
  );
  const myQueueItem = broadcastQueue.find(
    (item) => currentUser && item.email?.toLowerCase() === currentUser.email?.toLowerCase()
  );
  const isQueued = Boolean(myQueueItem);
  const myQueuePosition = myQueueItem?.position || 0;

  // Refs for media stream & recording
  const livePreviewRef = useRef<HTMLVideoElement>(null);
  const viewerVideoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const unmuteViewer = () => {
    setIsViewerMuted(false);
    if (viewerVideoRef.current) {
      viewerVideoRef.current.muted = false;
      viewerVideoRef.current.volume = 1;
      viewerVideoRef.current.play().catch(() => {});
    }
  };

  const toggleCheckerMic = () => {
    if (micStreamRef.current) {
      const audioTrack = micStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicEnabled(audioTrack.enabled);
        toast.info(audioTrack.enabled ? "Microphone active 🎙️" : "Microphone muted 🔇");
      }
    }
  };

  // WebRTC Peer Connections
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map()); // For Checker: viewerSocketId -> RTCPeerConnection
  const viewerPeerConnectionRef = useRef<RTCPeerConnection | null>(null); // For Viewer
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map()); // Checker buffer: viewerSocketId -> candidates
  const viewerPendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]); // Viewer buffer: candidates before remoteDescription

  // Manual File Upload & Video Broadcast State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBlobUrl, setUploadBlobUrl] = useState<string | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadProjectType, setUploadProjectType] = useState("Standard Building");
  const [uploadNotes, setUploadNotes] = useState("");
  const [broadcastSource, setBroadcastSource] = useState<"screen" | "video" | null>(null);
  const [saveToLibraryAfterStream, setSaveToLibraryAfterStream] = useState<boolean>(true);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState<number>(0);
  const [isVideoPaused, setIsVideoPaused] = useState<boolean>(false);
  const [isMonitorAudioMuted, setIsMonitorAudioMuted] = useState<boolean>(false);

  const broadcastVideoRef = useRef<HTMLVideoElement | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const mediaElementSourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  // Keep Checker preview attached whenever screen capturing changes
  useEffect(() => {
    if (isCapturing && broadcastSource === "screen" && livePreviewRef.current) {
      livePreviewRef.current.muted = true;
      livePreviewRef.current.defaultMuted = true;
      const stream = screenStreamRef.current || mediaStreamRef.current;
      if (stream) {
        livePreviewRef.current.srcObject = stream;
        livePreviewRef.current.play().catch(() => {});
      }
    }
  }, [isCapturing, broadcastSource]);

  // Viewer manually joins live stream
  const handleJoinStream = () => {
    if (!socketRef.current) return;
    setIsConnectingStream(true);
    setHasJoinedStream(true);
    socketRef.current.emit("livestream:join_room");
    toast.info("Connecting to live audit inspection...");
  };

  // Viewer leaves live stream
  const handleLeaveStream = () => {
    if (socketRef.current) {
      socketRef.current.emit("livestream:leave_room");
    }
    if (viewerPeerConnectionRef.current) {
      viewerPeerConnectionRef.current.close();
      viewerPeerConnectionRef.current = null;
    }
    viewerPendingCandidatesRef.current = [];
    remoteStreamRef.current = null;
    if (viewerVideoRef.current) {
      viewerVideoRef.current.srcObject = null;
    }
    setHasJoinedStream(false);
    setIsConnectingStream(false);
    toast.info("Left live stream.");
  };

  // Checker joins broadcast queue when another checker is broadcasting
  const handleJoinQueue = () => {
    if (!socketRef.current) return;
    setIsQueueActionLoading(true);
    socketRef.current.emit("livestream:queue_join");
  };

  // Checker leaves broadcast queue
  const handleLeaveQueue = () => {
    if (!socketRef.current) return;
    setIsQueueActionLoading(true);
    socketRef.current.emit("livestream:queue_leave");
  };

  // Automatically disconnect from live stream if viewer switches away from "live" tab
  useEffect(() => {
    if (activeTab !== "live" && hasJoinedStream) {
      handleLeaveStream();
    }
  }, [activeTab]);

  // Viewer low-latency buffer catchup: guarantees viewers stay locked to the real-time live edge
  useEffect(() => {
    if (!hasJoinedStream) return;
    const interval = setInterval(() => {
      const v = viewerVideoRef.current;
      if (v && !v.paused && v.buffered.length > 0) {
        try {
          const bufferEnd = v.buffered.end(v.buffered.length - 1);
          const lag = bufferEnd - v.currentTime;
          // If playback drifted more than 0.35s behind the real-time live edge, jump to edge
          if (lag > 0.35) {
            v.currentTime = bufferEnd - 0.05;
          }
        } catch {}
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [hasJoinedStream]);

  // Setup Socket.io connection for real-time live streaming
  useEffect(() => {
    const token = getCookie("xnite_session");
    const socket = io(getSocketUrl(), {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("livestream:get_status");
    });

    socket.on("connect_error", (err) => {
      console.warn("[Livestream Socket] Connection error:", err.message);
    });

    socket.on("livestream:stream_available", () => {
      socket.emit("livestream:get_status");
      toast.info("A checker has started a live audit inspection! Click 'Watch Live Stream' to view.");
    });

    socket.on("livestream:status_update", ({ isLive, session, queue, reservedChecker: reserved }: any) => {
      if (isLive && session) {
        setLiveSession(session);
      } else {
        setLiveSession(null);
        remoteStreamRef.current = null;
        if (viewerVideoRef.current) viewerVideoRef.current.srcObject = null;
        setHasJoinedStream(false);
        setIsConnectingStream(false);
      }
      if (Array.isArray(queue)) {
        setBroadcastQueue(queue);
      }
      setReservedChecker(reserved || null);
    });

    socket.on("livestream:your_turn", ({ message }: { expiresAt: number; message?: string }) => {
      toast.success(message || "🎉 It's your turn to broadcast! You now have reserved broadcast access.", {
        duration: 12000,
      });
    });

    socket.on("livestream:queue_joined", ({ position }: { position: number }) => {
      setIsQueueActionLoading(false);
      toast.success(`Joined queue! You are #${position} in line to broadcast.`);
    });

    socket.on("livestream:queue_left", () => {
      setIsQueueActionLoading(false);
      toast.info("You left the broadcast queue.");
    });

    socket.on("livestream:queue_error", ({ message }: { message: string }) => {
      setIsQueueActionLoading(false);
      toast.error(message || "Queue action failed.");
    });

    socket.on("livestream:viewer_count", (count: number) => {
      setLiveViewerCount(() => {
        const activePeers = peerConnectionsRef.current.size;
        return Math.max(count, activePeers);
      });
    });

    socket.on("livestream:checker_busy", ({ message }: { message: string }) => {
      toast.error(message || "Another checker is currently live. Only one broadcast can be active at a time.");
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setIsCapturing(false);
      setRecordingSeconds(0);
    });

    // Dynamic adaptive bitrate budgeting:
    // Prevents checker's upload pipe from saturating when multiple viewers watch.
    // 1 viewer: 2.2 Mbps, 2 viewers: 1.6 Mbps each, 3-4: 1.2 Mbps each, 5+: 800 kbps each
    const applyAdaptiveBitrate = () => {
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

                const vWidth = broadcastVideoRef.current?.videoWidth || 1920;
                if (vWidth > 1920) {
                  params.encodings[0].scaleResolutionDownBy = +(vWidth / 1920).toFixed(2);
                } else {
                  params.encodings[0].scaleResolutionDownBy = 1;
                }

                s.setParameters(params).catch(() => {});
              }
            } catch {}
          }
        });
      });
    };

    // --- CHECKER SIDE: When a viewer joins the room, send WebRTC offer ---
    socket.on("livestream:viewer_joined", async ({ viewerSocketId }) => {
      setLiveViewerCount((prev) => Math.max(prev + 1, peerConnectionsRef.current.size + 1));
      if (!mediaStreamRef.current) return;

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

      // Add tracks with resolution clamping and maintain-framerate preference
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

            const vWidth = broadcastVideoRef.current?.videoWidth || 1920;
            if (vWidth > 1920) {
              params.encodings[0].scaleResolutionDownBy = +(vWidth / 1920).toFixed(2);
            } else {
              params.encodings[0].scaleResolutionDownBy = 1;
            }

            sender.setParameters(params).catch(() => {});
          } catch {}
        }
      });

      // Prioritize hardware-accelerated VP8 and H264 codecs
      try {
        if ("setCodecPreferences" in RTCRtpTransceiver.prototype && (window as any).RTCRtpReceiver?.getCapabilities) {
          const transceivers = pc.getTransceivers();
          const videoTransceiver = transceivers.find((t) => t.sender.track?.kind === "video");
          if (videoTransceiver) {
            const caps = (window as any).RTCRtpReceiver.getCapabilities("video");
            if (caps?.codecs) {
              const preferred = caps.codecs.filter(
                (c: any) => c.mimeType.toLowerCase() === "video/vp8" || c.mimeType.toLowerCase() === "video/h264"
              );
              const rest = caps.codecs.filter(
                (c: any) => c.mimeType.toLowerCase() !== "video/vp8" && c.mimeType.toLowerCase() !== "video/h264"
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

        // Optimize SDP: Enable Opus in-band FEC and DTX for zero audio stutter
        if (offer.sdp) {
          let sdp = offer.sdp;
          sdp = sdp.replace(
            /a=rtpmap:(\d+) opus\/48000\/2/g,
            "a=rtpmap:$1 opus/48000/2\r\na=fmtp:$1 minptime=10;useinbandfec=1;usedtx=1;maxaveragebitrate=128000"
          );
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
      // 1. Viewer receiving signal from Checker
      if (signal.sdp && signal.sdp.type === "offer") {
        if (viewerPeerConnectionRef.current) {
          viewerPeerConnectionRef.current.close();
        }

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        viewerPeerConnectionRef.current = pc;
        viewerPendingCandidatesRef.current = [];

        pc.oniceconnectionstatechange = () => {
          console.log(`[Viewer ICE] state: ${pc.iceConnectionState}`);
          if (pc.iceConnectionState === "connected") {
            setIsConnectingStream(false);
          } else if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
            setIsConnectingStream(false);
          }
        };

        pc.ontrack = (event) => {
          let stream = event.streams[0];
          if (!stream) {
            stream = new MediaStream([event.track]);
          }
          remoteStreamRef.current = stream;
          setIsConnectingStream(false);
          if (viewerVideoRef.current) {
            viewerVideoRef.current.srcObject = stream;
            viewerVideoRef.current.play().catch(() => {});
          }
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

        // Flush any candidates buffered before remoteDescription was set
        const buffered = viewerPendingCandidatesRef.current;
        viewerPendingCandidatesRef.current = [];
        for (const cand of buffered) {
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("livestream:signal", {
          targetSocketId: senderSocketId,
          signal: { sdp: answer },
        });
      } else if (signal.sdp && signal.sdp.type === "answer") {
        // 2. Checker receiving answer from Viewer
        const pc = peerConnectionsRef.current.get(senderSocketId);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

          // Flush any buffered candidates for this viewer
          const buffered = pendingCandidatesRef.current.get(senderSocketId) || [];
          pendingCandidatesRef.current.delete(senderSocketId);
          for (const cand of buffered) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
        }
      } else if (signal.candidate) {
        // 3. ICE candidate exchange with buffer support
        if (peerConnectionsRef.current.has(senderSocketId)) {
          // Candidate on Checker from Viewer
          const pc = peerConnectionsRef.current.get(senderSocketId)!;
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
          } else {
            const queue = pendingCandidatesRef.current.get(senderSocketId) || [];
            queue.push(signal.candidate);
            pendingCandidatesRef.current.set(senderSocketId, queue);
          }
        } else if (viewerPeerConnectionRef.current) {
          // Candidate on Viewer from Checker
          const pc = viewerPeerConnectionRef.current;
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
          } else {
            viewerPendingCandidatesRef.current.push(signal.candidate);
          }
        }
      }
    });

    socket.on("livestream:ended", () => {
      setLiveSession(null);
      remoteStreamRef.current = null;
      if (viewerVideoRef.current) viewerVideoRef.current.srcObject = null;
      if (viewerPeerConnectionRef.current) {
        viewerPeerConnectionRef.current.close();
        viewerPeerConnectionRef.current = null;
      }
      setHasJoinedStream(false);
      setIsConnectingStream(false);
      toast.info("The live inspection session has ended.");
    });

    return () => {
      if (viewerPeerConnectionRef.current) {
        viewerPeerConnectionRef.current.close();
      }
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    getSessionUser()
      .then((user) => {
        setCurrentUser(user);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));

    loadRecordings();
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
    if (!recording || !currentUser) return false;
    const userEmail = (currentUser.email || "").trim().toLowerCase();
    const checkerEmail = (recording.checkerEmail || "").trim().toLowerCase();
    const userRole = (currentUser.role || "").trim().toLowerCase();
    return (checkerEmail && userEmail === checkerEmail) || userRole === "admin";
  };

  // 1-Click Screen Share Capture & Live Broadcast with Microphone Audio
  const startScreenCapture = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error("Screen recording is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    if (liveSession && (!currentUser || liveSession.checkerEmail?.toLowerCase() !== currentUser.email?.toLowerCase())) {
      toast.error(`Checker "${liveSession.checkerName}" is currently live. You can join the broadcast queue to be next!`);
      return;
    }

    if (isAnotherCheckerReserved && reservedChecker) {
      toast.error(`Broadcast slot is currently reserved for ${reservedChecker.name}. You can join the queue behind them.`);
      return;
    }

    try {
      // 1. Capture checker microphone for clear verbal feedback
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

      // 2. Capture screen (capped at 1080p @ 30fps to eliminate lag from 2K/4K/144Hz displays)
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

      // Optimize encoding for sharp screen detail
      const screenTrack = screenStream.getVideoTracks()[0];
      if (screenTrack && "contentHint" in screenTrack) {
        screenTrack.contentHint = "detail";
      }

      // 3. Mix microphone + screen audio into combined stream
      let finalAudioTracks: MediaStreamTrack[] = [];
      const hasSysAudio = screenStream.getAudioTracks().length > 0;
      const hasMicAudio = micStream && micStream.getAudioTracks().length > 0;

      if (hasSysAudio && hasMicAudio) {
        try {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
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
        } catch (mixErr) {
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
      recordedChunksRef.current = [];

      // Attach stream to Checker's Live Monitor Preview
      if (livePreviewRef.current) {
        livePreviewRef.current.srcObject = combinedStream;
        livePreviewRef.current.play().catch(() => {});
      }

      // Initialize MediaRecorder: Prefer hardware-accelerated VP8 with 2.5 Mbps cap for smooth performance
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

      const title = sessionTitle || `Quality Audit Check - ${new Date().toLocaleDateString()}`;
      setSessionTitle(title);
      setIsCapturing(true);
      setBroadcastSource("screen");
      setRecordingSeconds(0);

      // Broadcast to all viewers via Socket.io that checker is LIVE
      if (socketRef.current) {
        socketRef.current.emit("livestream:checker_start", {
          title,
          projectType: sessionProjectType,
          broadcastType: "screen",
        });
      }

      // Start Recording Timer
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

      // Handle user clicking the Chrome floating "Stop sharing" bar
      screenStream.getVideoTracks()[0].onended = () => {
        finishScreenCapture();
      };

      toast.success("Live broadcast started! Screen and microphone are now live.");
    } catch (err) {
      console.error("Screen capture error:", err);
      toast.error("Screen sharing was cancelled.");
    }
  };

  // Finish Recording and Open Review Screen (Allows Checker to Save or Discard)
  const finishScreenCapture = () => {
    if (!mediaRecorderRef.current || !mediaStreamRef.current) return;

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // Notify viewers that live broadcast ended
    if (socketRef.current) {
      socketRef.current.emit("livestream:checker_stop");
    }

    // Close all WebRTC peer connections
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    setLiveViewerCount(0);

    const recorder = mediaRecorderRef.current;
    const finalDuration = recordingSeconds;
    setRecordedDuration(finalDuration);

    recorder.onstop = () => {
      // Stop all tracks on screen, mic, and combined streams
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
      mediaRecorderRef.current = null;
      if (livePreviewRef.current) livePreviewRef.current.srcObject = null;

      const mime = recorder.mimeType || "video/webm";
      const blob = new Blob(recordedChunksRef.current, { type: mime });
      const url = URL.createObjectURL(blob);
      setRecordedBlob(blob);
      setRecordedBlobUrl(url);
      setIsCapturing(false);
      setIsReviewing(true);
      toast.info("Session ended. Review your recording below to save or discard.");
    };

    recorder.stop();
  };

  // Publish Recording to Replay Library
  const handlePublishRecording = async () => {
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
        await loadRecordings();
        setSelectedRecording(data.recording);
        setActiveTab("vod");
      } else {
        toast.error(data.error || "Failed to save recording.");
        setIsUploading(false);
      }
    } catch (err: any) {
      toast.error("Upload error: " + (err.message || "Failed to upload."));
      setIsUploading(false);
    }
  };

  // Discard Recording Completely (Nothing is Saved)
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

  // Discard while still actively live recording
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
    mediaRecorderRef.current = null;
    if (livePreviewRef.current) livePreviewRef.current.srcObject = null;
    setIsCapturing(false);
    setBroadcastSource(null);
    setRecordingSeconds(0);
    toast.info("Live recording cancelled and discarded.");
  };

  // Handle file selection from input
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

  // Start Video Broadcast (Checker Studio)
  const startVideoBroadcast = () => {
    if (!uploadFile || !uploadBlobUrl) {
      toast.error("Please choose a video file first.");
      return;
    }

    if (liveSession && (!currentUser || liveSession.checkerEmail?.toLowerCase() !== currentUser.email?.toLowerCase())) {
      toast.error(`Checker "${liveSession.checkerName}" is currently live. You can join the broadcast queue to be next!`);
      return;
    }

    if (isAnotherCheckerReserved && reservedChecker) {
      toast.error(`Broadcast slot is currently reserved for ${reservedChecker.name}. You can join the queue behind them.`);
      return;
    }

    const title = uploadTitle?.trim() || uploadFile.name.replace(/\.[^/.]+$/, "");
    setSessionTitle(title);
    setSessionProjectType(uploadProjectType);
    setSessionNotes(uploadNotes);
    setBroadcastSource("video");
    setIsCapturing(true);
    setRecordingSeconds(0);
    setVideoCurrentTime(0);
    setIsVideoPaused(false);
  };

  // Hook to initiate WebRTC capture once video player mounts in Studio
  useEffect(() => {
    if (!isCapturing || broadcastSource !== "video") return;

    let isCancelled = false;

    const setupVideoStream = async () => {
      const video = broadcastVideoRef.current;
      if (!video) return;

      try {
        video.currentTime = 0;
        await video.play();
        if (isCancelled) return;

        const captureFn = (video as any).captureStream || (video as any).mozCaptureStream;
        if (!captureFn) {
          toast.error("Browser does not support video streaming. Please use Chrome, Edge, or Firefox.");
          setIsCapturing(false);
          setBroadcastSource(null);
          return;
        }

        const videoStream: MediaStream = captureFn.call(video, 30);

        const videoTrack = videoStream.getVideoTracks()[0];
        if (videoTrack && "contentHint" in videoTrack) {
          videoTrack.contentHint = "detail";
        }

        // Capture checker microphone if available
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
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
              sampleRate: 48000,
              latencyHint: "interactive",
            });
            audioContextRef.current = audioCtx;
            const dest = audioCtx.createMediaStreamDestination();

            if (hasVideoAudio) {
              if (!mediaElementSourceRef.current) {
                mediaElementSourceRef.current = audioCtx.createMediaElementSource(video);
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

        const broadcastTitle = sessionTitle || uploadTitle || uploadFile?.name || "Quality Audit Check";
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

        toast.success("Live broadcast started! Video check is streaming live to all viewers.");
      } catch (err: any) {
        console.error("Video broadcast error:", err);
        toast.error("Failed to start video broadcast: " + (err.message || "Unknown error"));
        setIsCapturing(false);
        setBroadcastSource(null);
      }
    };

    setupVideoStream();

    return () => {
      isCancelled = true;
    };
  }, [isCapturing, broadcastSource]);

  // Finish Video Broadcast (opens Review screen)
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

    if (broadcastVideoRef.current) {
      broadcastVideoRef.current.pause();
    }

    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    monitorGainRef.current = null;
    mediaElementSourceRef.current = null;

    const finalDuration = videoCurrentTime || videoDuration || recordingSeconds || 0;
    setRecordedDuration(finalDuration);
    setIsCapturing(false);
    setIsReviewing(true);
    toast.info("Session ended. Review your video check below to publish to the library or discard.");
  };

  // Discard Video Broadcast while actively live
  const discardVideoBroadcast = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (socketRef.current) socketRef.current.emit("livestream:checker_stop");
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    setLiveViewerCount(0);

    if (broadcastVideoRef.current) {
      broadcastVideoRef.current.pause();
      broadcastVideoRef.current.currentTime = 0;
    }

    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;

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

  // Publish Uploaded Video to Replay Library
  const handlePublishVideoFile = async () => {
    if (!uploadFile) return;

    setIsUploading(true);
    toast.info("Publishing video check to Replay Library...");

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("title", sessionTitle || uploadTitle || uploadFile.name);
      formData.append("projectType", sessionProjectType || uploadProjectType);
      formData.append("durationSec", String(recordedDuration || videoDuration || 0));
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
        await loadRecordings();
        setSelectedRecording(data.recording);
        setActiveTab("vod");
      } else {
        toast.error(data.error || "Failed to save video to library.");
        setIsUploading(false);
      }
    } catch (err: any) {
      toast.error("Upload error: " + (err.message || "Failed to upload."));
      setIsUploading(false);
    }
  };

  // Discard Uploaded Video Broadcast without saving to library
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

  // Video playback controls
  const toggleVideoPlayPause = () => {
    const video = broadcastVideoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setIsVideoPaused(false);
    } else {
      video.pause();
      setIsVideoPaused(true);
    }
  };

  const handleVideoSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number(e.target.value);
    setVideoCurrentTime(newTime);
    if (broadcastVideoRef.current) {
      broadcastVideoRef.current.currentTime = newTime;
    }
  };

  const toggleMonitorAudio = () => {
    setIsMonitorAudioMuted((prev) => {
      const next = !prev;
      if (monitorGainRef.current) {
        monitorGainRef.current.gain.value = next ? 0 : 0.8;
      }
      if (broadcastVideoRef.current && !monitorGainRef.current) {
        broadcastVideoRef.current.muted = next;
      }
      toast.info(next ? "Local monitor audio muted 🔇" : "Local monitor audio active 🔊");
      return next;
    });
  };

  // Handle Manual File Upload (Direct upload without livestreaming)
  const handleManualUpload = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!uploadFile) {
      toast.error("Please choose a video file first.");
      return;
    }

    setIsUploading(true);
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
        setUploadFile(null);
        setUploadBlobUrl(null);
        setUploadTitle("");
        setUploadNotes("");
        setIsUploading(false);
        await loadRecordings();
        setSelectedRecording(data.recording);
        setActiveTab("vod");
      } else {
        toast.error(data.error || "Upload failed.");
        setIsUploading(false);
      }
    } catch (err: any) {
      toast.error("Error: " + (err.message || "Failed to upload file."));
      setIsUploading(false);
    }
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const isUserStaff = isStaff(currentUser?.role);

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

      <div className="relative space-y-6 lg:space-y-8 w-full max-w-6xl mx-auto pt-4 pb-16 z-10 px-4 sm:px-6">
        {/* Header Section */}
        <section className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-black/5 dark:border-white/5 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-emerald-500/10 text-[#1F7A1F] dark:text-[#55f761] border border-emerald-500/20">
                <span className={`w-1.5 h-1.5 rounded-full ${liveSession ? "bg-red-500 animate-ping" : "bg-[#1F7A1F] dark:bg-[#55f761] animate-pulse"}`} />
                {liveSession ? "Live Broadcast Active" : "Live Review Hub"}
              </span>
              {isUserStaff && (
                <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  <ShieldCheck className="w-3 h-3" />
                  Checker Privileges
                </span>
              )}
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#0D1B2A] dark:text-white">
              Livestreams & Check Reviews
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
              Replay Library ({recordings.length})
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

        {/* Tab 1: Live Stream Player */}
        {activeTab === "live" && (
          <div className="space-y-4 max-w-5xl mx-auto">
            {/* Main Live Player Column */}
            <div className="space-y-4">
                <div className="relative aspect-video w-full bg-black rounded-2xl overflow-hidden shadow-2xl border border-black/10 dark:border-white/10 group flex items-center justify-center">
                  {/* Mode A: Real-Time WebRTC In-Browser Stream when a Checker is LIVE */}
                  {liveSession ? (
                    hasJoinedStream ? (
                      <div className="relative w-full h-full bg-black flex items-center justify-center">
                        <video
                          ref={(el) => {
                            viewerVideoRef.current = el;
                            if (el) {
                              el.muted = isViewerMuted;
                              el.defaultMuted = isViewerMuted;
                              if (remoteStreamRef.current && el.srcObject !== remoteStreamRef.current) {
                                el.srcObject = remoteStreamRef.current;
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
                        <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1 rounded-full bg-red-600/90 text-white text-xs font-bold uppercase tracking-wider shadow-lg">
                          <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                          {liveSession.broadcastType === "video" ? "LIVE VIDEO AUDIT: " : "LIVE: "}{liveSession.checkerName}
                        </div>

                        <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
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
                            onClick={() => {
                              if (socketRef.current) {
                                socketRef.current.emit("livestream:join_room");
                                toast.info("Reconnecting live stream feed...");
                              }
                            }}
                            className="px-3 py-1.5 rounded-xl bg-black/70 hover:bg-black/90 text-white text-xs font-semibold flex items-center gap-1.5 border border-white/20 transition-all cursor-pointer backdrop-blur-md"
                            title="Click if stream is buffering or frozen"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Reload
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

                        {/* Connecting Overlay */}
                        {isConnectingStream && !remoteStreamRef.current && (
                          <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center gap-3 z-20">
                            <RefreshCw className="w-8 h-8 animate-spin text-[#55f761]" />
                            <p className="text-white text-xs font-semibold">Connecting to checker's broadcast...</p>
                          </div>
                        )}

                        {/* Unmute / Audio Overlay Toggle */}
                        <div className="absolute bottom-4 right-4 z-30 flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (isViewerMuted) {
                                unmuteViewer();
                              } else {
                                setIsViewerMuted(true);
                                if (viewerVideoRef.current) viewerVideoRef.current.muted = true;
                              }
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold shadow-xl flex items-center gap-1.5 cursor-pointer border transition-all backdrop-blur-md ${
                              isViewerMuted
                                ? "bg-emerald-600 hover:bg-emerald-500 text-white border-white/20 animate-pulse"
                                : "bg-black/70 hover:bg-black/90 text-white border-white/20"
                            }`}
                          >
                            {isViewerMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                            <span>{isViewerMuted ? "Click to Unmute / Hear 🔊" : "Mute Sound"}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Live Broadcast In Progress - User Click to Join */
                      <div className="relative w-full h-full bg-gradient-to-br from-[#060D14] via-[#0D1B2A] to-[#060D14] p-8 flex flex-col items-center justify-center text-center space-y-4">
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
                    /* Standby / Offline Screen when no one is live */
                    <div className="text-center p-8 space-y-4 max-w-md">
                      <div className="w-16 h-16 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center mx-auto text-[#55f761]">
                        <MonitorPlay className="w-8 h-8 opacity-70" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-lg font-bold text-white">No Checker Currently Live</h3>
                        <p className="text-xs text-white/60 leading-relaxed">
                          When a checker begins a live screen review, their 1080p screen will automatically broadcast here in real time.
                        </p>
                      </div>
                      <div className="pt-2 flex items-center justify-center">
                        <button
                          onClick={() => setActiveTab("vod")}
                          className="px-5 py-2.5 bg-[#1F7A1F] dark:bg-[#55f761] hover:scale-105 active:scale-95 text-white dark:text-[#060D14] rounded-xl text-xs font-bold transition-all shadow-lg cursor-pointer flex items-center gap-2"
                        >
                          <Film className="w-4 h-4" />
                          Browse Past Replays ({recordings.length})
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
          </div>
        )}

        {/* Tab 2: VOD Library */}
        {activeTab === "vod" && (
          <div className="space-y-6">
            {/* Active Video Player (if selected) */}
            {selectedRecording && (
              <div className="space-y-3 bg-white/70 dark:bg-[#060D14]/70 backdrop-blur-md rounded-2xl border border-black/5 dark:border-white/10 p-4">
                <XfnitePlayer
                  src={selectedRecording.videoUrl}
                  title={selectedRecording.title}
                  autoPlay={true}
                />
                <div className="flex items-center justify-between px-2 pt-2">
                  <div>
                    <h3 className="text-base font-bold text-[#0D1B2A] dark:text-white">
                      {selectedRecording.title}
                    </h3>
                    <p className="text-xs text-[#2F3E46]/70 dark:text-white/50">
                      Checked by {selectedRecording.checkerName} &bull; {new Date(selectedRecording.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-[#1F7A1F] dark:text-[#55f761] border border-emerald-500/20">
                      {selectedRecording.projectType}
                    </span>
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
                <h2 className="text-base font-semibold text-[#0D1B2A] dark:text-white">
                  Recorded Project Audits & Past Streams
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

                      <div className="mt-4 pt-3 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-xs">
                        <span className="text-[#2F3E46]/60 dark:text-white/40 text-[11px]">
                          1080p &bull; 720p &bull; 360p
                        </span>
                        <span className="text-xs font-semibold text-[#1F7A1F] dark:text-[#55f761] group-hover:underline">
                          Watch Replay &rarr;
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Checker Studio (Only for Staff/Checkers) */}
        {activeTab === "studio" && isUserStaff && (
          <div className="space-y-6">
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

                {/* Studio Layout: Video Monitor + Metadata Controls */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Live Video Monitor */}
                  <div className="lg:col-span-2 space-y-3">
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
                      {broadcastSource === "video" ? (
                        <>
                          <video
                            ref={broadcastVideoRef}
                            src={uploadBlobUrl || undefined}
                            playsInline
                            onTimeUpdate={(e) => {
                              setVideoCurrentTime(Math.round(e.currentTarget.currentTime));
                            }}
                            onEnded={finishVideoBroadcast}
                            onPlay={() => setIsVideoPaused(false)}
                            onPause={() => setIsVideoPaused(true)}
                            className="w-full h-full object-contain"
                          />
                          {/* Play/Pause Overlay Toggle */}
                          <button
                            onClick={toggleVideoPlayPause}
                            className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-xl backdrop-blur-xs"
                          >
                            {isVideoPaused ? <Play className="w-7 h-7 fill-current ml-1" /> : <Pause className="w-7 h-7 fill-current" />}
                          </button>
                        </>
                      ) : (
                        <video
                          ref={livePreviewRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-contain"
                        />
                      )}
                    </div>

                    {/* Video Scrubber Controls for Video Broadcast */}
                    {broadcastSource === "video" && (
                      <div className="p-3 bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5 flex items-center gap-3">
                        <button
                          onClick={toggleVideoPlayPause}
                          className="p-2 rounded-lg bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
                          title={isVideoPaused ? "Play" : "Pause"}
                        >
                          {isVideoPaused ? <Play className="w-4 h-4 fill-current ml-0.5" /> : <Pause className="w-4 h-4 fill-current" />}
                        </button>

                        <span className="font-mono text-xs text-[#0D1B2A] dark:text-white shrink-0">
                          {formatTimer(videoCurrentTime)}
                        </span>

                        <input
                          type="range"
                          min="0"
                          max={videoDuration || 100}
                          value={videoCurrentTime}
                          onChange={handleVideoSeek}
                          className="w-full accent-[#1F7A1F] dark:accent-[#55f761] cursor-pointer"
                        />

                        <span className="font-mono text-xs text-[#2F3E46]/60 dark:text-white/50 shrink-0">
                          {formatTimer(videoDuration)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Session Metadata Inputs */}
                  <div className="space-y-4">
                    <span className="text-xs font-semibold text-[#2F3E46]/70 dark:text-white/50 block">
                      Check Session Information
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

                      <div>
                        <label className="text-[11px] font-semibold text-[#0D1B2A] dark:text-white block mb-1">
                          Notes / Description (Optional)
                        </label>
                        <textarea
                          rows={3}
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
                      onClick={broadcastSource === "video" ? handlePublishVideoFile : handlePublishRecording}
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
                            const isMe = currentUser?.email?.toLowerCase() === item.email?.toLowerCase();
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
