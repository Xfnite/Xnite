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
import { io, Socket } from "socket.io-client";
import { 
  Radio, 
  Video, 
  Upload, 
  Users, 
  Play, 
  CheckCircle2, 
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
  Trash2,
  Save,
  Check,
  LogOut
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
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.services.mozilla.com" },
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

  // Live Screen Share & WebRTC state (Viewer & Checker)
  const [liveSession, setLiveSession] = useState<any>(null);
  const [liveViewerCount, setLiveViewerCount] = useState<number>(0);
  const [useOwncastFeed, setUseOwncastFeed] = useState(false);
  const [isViewerMuted, setIsViewerMuted] = useState(true);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [hasJoinedStream, setHasJoinedStream] = useState(false);
  const [isConnectingStream, setIsConnectingStream] = useState(false);

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

  // Manual File Upload State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadProjectType, setUploadProjectType] = useState("Standard Building");

  // Keep Checker preview attached whenever capturing changes
  useEffect(() => {
    if (isCapturing && livePreviewRef.current) {
      livePreviewRef.current.muted = true;
      livePreviewRef.current.defaultMuted = true;
      const stream = screenStreamRef.current || mediaStreamRef.current;
      if (stream) {
        livePreviewRef.current.srcObject = stream;
        livePreviewRef.current.play().catch(() => {});
      }
    }
  }, [isCapturing]);

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

  // Automatically disconnect from live stream if viewer switches away from "live" tab
  useEffect(() => {
    if (activeTab !== "live" && hasJoinedStream) {
      handleLeaveStream();
    }
  }, [activeTab]);

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

    socket.on("livestream:status_update", ({ isLive, session }) => {
      if (isLive && session) {
        setLiveSession(session);
      } else {
        setLiveSession(null);
        remoteStreamRef.current = null;
        if (viewerVideoRef.current) viewerVideoRef.current.srcObject = null;
        setHasJoinedStream(false);
        setIsConnectingStream(false);
      }
    });

    socket.on("livestream:viewer_count", (count: number) => {
      setLiveViewerCount(count);
    });

    // --- CHECKER SIDE: When a viewer joins the room, send WebRTC offer ---
    socket.on("livestream:viewer_joined", async ({ viewerSocketId }) => {
      if (!mediaStreamRef.current) return;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnectionsRef.current.set(viewerSocketId, pc);
      pendingCandidatesRef.current.set(viewerSocketId, []);

      pc.oniceconnectionstatechange = () => {
        console.log(`[Checker ICE] ${viewerSocketId}: ${pc.iceConnectionState}`);
      };

      mediaStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, mediaStreamRef.current!);
      });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("livestream:signal", {
            targetSocketId: viewerSocketId,
            signal: { candidate: event.candidate },
          });
        }
      };

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("livestream:signal", {
          targetSocketId: viewerSocketId,
          signal: { sdp: offer },
        });
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

  const handleDeleteRecording = async (recordingId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this recorded check from the library?")) {
      return;
    }

    const res = await deleteCheckRecordingAction(recordingId);
    if (res.success) {
      toast.success("Recording deleted from library.");
      setRecordings((prev) => {
        const updated = prev.filter((r) => r.id !== recordingId);
        if (selectedRecording?.id === recordingId) {
          setSelectedRecording(updated.length > 0 ? updated[0] : null);
        }
        return updated;
      });
    } else {
      toast.error(res.error || "Failed to delete recording.");
    }
  };

  // 1-Click Screen Share Capture & Live Broadcast with Microphone Audio
  const startScreenCapture = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error("Screen recording is not supported in this browser. Please use Chrome or Edge.");
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

      // 2. Capture screen (with tab/system audio if user enables it)
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor" },
        audio: true,
      });
      screenStreamRef.current = screenStream;

      // 3. Mix microphone + screen audio into combined stream
      let finalAudioTracks: MediaStreamTrack[] = [];
      const hasSysAudio = screenStream.getAudioTracks().length > 0;
      const hasMicAudio = micStream && micStream.getAudioTracks().length > 0;

      if (hasSysAudio && hasMicAudio) {
        try {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
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

      // Initialize MediaRecorder for local recording
      let mimeType = "video/webm;codecs=vp9,opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "video/webm";
      }

      const recorder = new MediaRecorder(combinedStream, { mimeType });
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
      setRecordingSeconds(0);

      // Broadcast to all viewers via Socket.io that checker is LIVE
      if (socketRef.current) {
        socketRef.current.emit("livestream:checker_start", {
          title,
          projectType: sessionProjectType,
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
    toast.info("Recording discarded. Nothing was saved to the library.");
  };

  // Discard while still actively live recording
  const discardCapture = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (socketRef.current) socketRef.current.emit("livestream:checker_stop");
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
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
    setRecordingSeconds(0);
    toast.info("Live recording cancelled and discarded.");
  };

  // Handle Manual File Upload
  const handleManualUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      toast.error("Please choose a video file first.");
      return;
    }

    setIsUploading(true);
    toast.info("Uploading video check to Cloudflare R2...");

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("title", uploadTitle || uploadFile.name);
      formData.append("projectType", uploadProjectType);
      formData.append("durationSec", "0");

      const response = await fetch("/api/livestream/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.success && data.recording) {
        toast.success("Video check uploaded successfully!");
        setUploadFile(null);
        setUploadTitle("");
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
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Live Player Column */}
              <div className="lg:col-span-2 space-y-4">
                <div className="relative aspect-video w-full bg-black rounded-2xl overflow-hidden shadow-2xl border border-black/10 dark:border-white/10 group flex items-center justify-center">
                  {/* Mode A: Real-Time WebRTC In-Browser Stream when a Checker is LIVE */}
                  {liveSession && !useOwncastFeed ? (
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
                          controls
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
                          LIVE: {liveSession.checkerName}
                        </div>

                        <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
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

                        {/* Unmute overlay button if muted */}
                        {isViewerMuted && (
                          <button
                            onClick={unmuteViewer}
                            className="absolute bottom-16 right-4 z-30 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-2xl flex items-center gap-2 cursor-pointer border border-white/20 hover:scale-105 transition-all"
                          >
                            <Volume2 className="w-4 h-4 animate-bounce" />
                            Click to Unmute / Hear Checker 🔊
                          </button>
                        )}
                      </div>
                    ) : (
                      /* Live Broadcast In Progress - User Click to Join */
                      <div className="relative w-full h-full bg-gradient-to-br from-[#060D14] via-[#0D1B2A] to-[#060D14] p-8 flex flex-col items-center justify-center text-center space-y-4">
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-600/20 border border-red-500/40 text-red-400 text-xs font-bold uppercase tracking-wider">
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                          Live Quality Audit in Progress
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
                          Click to join and receive real-time 1080p screen share &amp; audio
                        </p>
                      </div>
                    )
                  ) : useOwncastFeed ? (
                    /* Mode B: Owncast HLS Iframe Feed */
                    <iframe
                      src="https://stream.xfnite.cloud/embed/video"
                      title="Xfnite Live Stream"
                      className="w-full h-full border-0"
                      allow="autoplay; fullscreen; picture-in-picture"
                      allowFullScreen
                    />
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
                      <div className="pt-2 flex items-center justify-center gap-3">
                        <button
                          onClick={() => setActiveTab("vod")}
                          className="px-4 py-2 bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] rounded-xl text-xs font-bold transition-all shadow cursor-pointer"
                        >
                          Browse Past Replays ({recordings.length})
                        </button>
                        <button
                          onClick={() => setUseOwncastFeed(true)}
                          className="px-3 py-2 bg-white/10 hover:bg-white/15 text-white/80 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                        >
                          Show Owncast Server
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Stream Sub-bar */}
                <div className="p-4 bg-white/70 dark:bg-[#060D14]/70 backdrop-blur-md rounded-2xl border border-black/5 dark:border-white/10 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${liveSession ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 dark:bg-[#55f761]/10 text-[#1F7A1F] dark:text-[#55f761]"}`}>
                      <Radio className={`w-5 h-5 ${liveSession ? "animate-ping" : "animate-pulse"}`} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[#0D1B2A] dark:text-white">
                        {liveSession ? liveSession.title : "Quality Audit Check Session"}
                      </h3>
                      <p className="text-xs text-[#2F3E46]/70 dark:text-white/50">
                        {liveSession
                          ? `Host: ${liveSession.checkerName} • In-Browser Live Stream (<0.3s Latency)`
                          : "Hosted by Lead Checkers • Powered by Cloudflare R2"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-black/5 dark:bg-white/5 rounded-full text-xs font-medium text-[#2F3E46] dark:text-white/80">
                      <Users className="w-3.5 h-3.5 text-[#1F7A1F] dark:text-[#55f761]" />
                      <span>{liveViewerCount} / 10 in Lobby</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Live Info Sidebar */}
              <div className="space-y-4">
                <div className="p-5 bg-white/70 dark:bg-[#060D14]/70 backdrop-blur-md rounded-2xl border border-black/5 dark:border-white/10 space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#1F7A1F] dark:text-[#55f761]" />
                    <h3 className="text-sm font-semibold text-[#0D1B2A] dark:text-white">
                      Live Stream Info
                    </h3>
                  </div>

                  <div className="space-y-2.5 text-xs text-[#2F3E46]/80 dark:text-white/70 leading-relaxed">
                    <div className="flex items-center justify-between py-1.5 border-b border-black/5 dark:border-white/5">
                      <span>Stream Mode</span>
                      <span className="font-semibold text-[#0D1B2A] dark:text-white">
                        {liveSession ? "WebRTC Peer Broadcast" : "HLS / Owncast"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-black/5 dark:border-white/5">
                      <span>Latency</span>
                      <span className="font-semibold text-emerald-600 dark:text-[#55f761]">
                        {liveSession ? "< 0.3s (Real-Time)" : "3 - 5s (Edge Cached)"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-black/5 dark:border-white/5">
                      <span>Lobby Capacity</span>
                      <span className="font-semibold text-[#0D1B2A] dark:text-white">10 Active Viewers</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span>VOD Availability</span>
                      <span className="font-semibold text-emerald-600 dark:text-[#55f761]">Immediate Replay</span>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      onClick={() => setUseOwncastFeed(!useOwncastFeed)}
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-xl text-xs font-semibold text-[#0D1B2A] dark:text-white transition-all cursor-pointer"
                    >
                      {useOwncastFeed ? "Switch to WebRTC Live Room" : "Switch to Owncast Embed"}
                    </button>
                    <a
                      href="https://stream.xfnite.cloud"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-xl text-xs font-semibold text-[#0D1B2A] dark:text-white transition-all cursor-pointer"
                    >
                      Open Standalone Server
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                <div className="p-4 bg-emerald-500/5 dark:bg-[#55f761]/5 border border-emerald-500/15 rounded-2xl text-xs text-[#1F7A1F] dark:text-[#55f761]/90 leading-relaxed space-y-1">
                  <span className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    How to Learn from Streams
                  </span>
                  <p>
                    Checkers provide direct verbal feedback and demonstrate correction guidelines. Note down timestamps or re-watch key sections in the Replay Library.
                  </p>
                </div>
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
                    {isUserStaff && (
                      <button
                        onClick={(e) => handleDeleteRecording(selectedRecording.id, e)}
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
                      {isUserStaff && (
                        <button
                          onClick={(e) => handleDeleteRecording(item.id, e)}
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
            {/* If Screen Share is Active -> Show Full Studio Recorder */}
            {isCapturing ? (
              <div className="bg-white/80 dark:bg-[#060D14]/80 backdrop-blur-md rounded-2xl border-2 border-emerald-500/40 p-6 space-y-6 shadow-2xl">
                {/* Active Live Header Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-black/10 dark:border-white/10">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 text-red-500 font-bold text-xs uppercase tracking-wide border border-red-500/20">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                      REC &bull; LIVE SCREEN SHARE
                    </span>
                    <span className="font-mono text-base font-bold text-[#0D1B2A] dark:text-white">
                      {formatTimer(recordingSeconds)}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-xs font-medium text-[#2F3E46] dark:text-white/80">
                      {liveViewerCount} Viewers Watching
                    </span>

                    {/* Microphone Toggle */}
                    <button
                      onClick={toggleCheckerMic}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        isMicEnabled
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-[#55f761] border-emerald-500/20"
                          : "bg-red-500/10 text-red-500 border-red-500/20"
                      }`}
                      title="Click to Mute or Unmute your Microphone"
                    >
                      {isMicEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                      <span>{isMicEnabled ? "Mic: ON" : "Mic: MUTED"}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={discardCapture}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-500/10 transition-all cursor-pointer"
                    >
                      Discard
                    </button>
                    <button
                      onClick={finishScreenCapture}
                      className="flex items-center gap-2 px-5 py-2.5 bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] rounded-xl text-xs font-bold shadow-lg hover:scale-102 active:scale-98 transition-all cursor-pointer"
                    >
                      <Square className="w-4 h-4 fill-current" />
                      End Session & Review
                    </button>
                  </div>
                </div>

                {/* Studio Layout: Video Monitor + Metadata Controls */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Live Video Monitor */}
                  <div className="lg:col-span-2 space-y-2">
                    <span className="text-xs font-semibold text-[#2F3E46]/70 dark:text-white/50 block">
                      Live Monitor Preview (What Viewers See in Real Time)
                    </span>
                    <div className="relative aspect-video w-full bg-black rounded-xl overflow-hidden border border-black/20 dark:border-white/20 shadow-inner flex items-center justify-center">
                      <video
                        ref={(el) => {
                          livePreviewRef.current = el;
                          if (el) {
                            el.muted = true;
                            el.defaultMuted = true;
                            const stream = screenStreamRef.current || mediaStreamRef.current;
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
                    </div>
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
                          <option value="Transportation" className="text-black">Transportation & Roads</option>
                          <option value="Land Cover" className="text-black">Land Cover</option>
                          <option value="Guidelines" className="text-black">Guidelines & Common Mistakes</option>
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
                    </div>
                  </div>
                </div>
              </div>
            ) : isReviewing && recordedBlobUrl ? (
              /* Review & Post-Recording Confirmation Screen */
              <div className="bg-white/85 dark:bg-[#060D14]/85 backdrop-blur-md rounded-2xl border-2 border-emerald-500/30 p-6 space-y-6 shadow-2xl">
                {/* Header with Save / Discard Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-black/10 dark:border-white/10">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-xs uppercase tracking-wide border border-blue-500/20">
                        Check Finished
                      </span>
                      <span className="text-xs text-[#2F3E46]/60 dark:text-white/50 font-mono">
                        Duration: {formatTimer(recordedDuration)}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-[#0D1B2A] dark:text-white mt-1">
                      Review Audit Recording Before Saving
                    </h3>
                    <p className="text-xs text-[#2F3E46]/70 dark:text-white/60">
                      Play your recording to verify sound and quality. You can publish it to the Replay Library or discard it completely.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDiscardRecording}
                      disabled={isUploading}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-500/10 border border-red-500/20 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      Discard Recording
                    </button>
                    <button
                      onClick={handlePublishRecording}
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
                    {recordedBlobUrl ? (
                      <XfnitePlayer
                        src={recordedBlobUrl}
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
                          <option value="Transportation" className="text-black">Transportation & Roads</option>
                          <option value="Land Cover" className="text-black">Land Cover</option>
                          <option value="Guidelines" className="text-black">Guidelines & Common Mistakes</option>
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
                    Checker Broadcast & Recording Studio
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
                        1-Click In-Browser Live Record & Broadcast
                      </h3>
                      <p className="text-xs text-[#2F3E46]/80 dark:text-white/60 leading-relaxed">
                        Share your screen directly through Chrome. Streams real-time video to viewers in the live lobby with zero latency, and saves to the Replay Library when you stop.
                      </p>
                    </div>

                    <button
                      onClick={startScreenCapture}
                      className="w-full py-2.5 px-4 bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] rounded-xl text-xs font-bold shadow-md hover:scale-101 active:scale-99 transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <ScreenShare className="w-4 h-4" />
                      Start Screen Share / Live Check
                    </button>
                  </div>

                  {/* Method 2: Drag and Drop Video Upload */}
                  <div className="p-5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                        <Upload className="w-5 h-5" />
                      </div>
                      <h3 className="text-sm font-bold text-[#0D1B2A] dark:text-white">
                        Upload Recorded Video Check
                      </h3>
                      <p className="text-xs text-[#2F3E46]/80 dark:text-white/60 leading-relaxed">
                        Already have an audit recording file (.mp4, .webm)? Upload it directly to Cloudflare R2 to make it available to all labelers.
                      </p>
                    </div>

                    <form onSubmit={handleManualUpload} className="space-y-3">
                      <label className="w-full py-2 px-3 bg-black/10 dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/15 text-[#0D1B2A] dark:text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 text-center">
                        <Upload className="w-3.5 h-3.5" />
                        {uploadFile ? uploadFile.name : "Select Video File (.mp4 / .webm)"}
                        <input
                          type="file"
                          accept="video/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setUploadFile(file);
                              setUploadTitle(file.name.replace(/\.[^/.]+$/, ""));
                            }
                          }}
                        />
                      </label>

                      {uploadFile && (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={uploadTitle}
                            onChange={(e) => setUploadTitle(e.target.value)}
                            placeholder="Video Title"
                            className="w-full px-3 py-1.5 bg-black/5 dark:bg-white/5 rounded-xl border border-black/10 dark:border-white/10 text-xs text-[#0D1B2A] dark:text-white"
                          />
                          <select
                            value={uploadProjectType}
                            onChange={(e) => setUploadProjectType(e.target.value)}
                            className="w-full px-3 py-1.5 bg-black/5 dark:bg-white/5 rounded-xl border border-black/10 dark:border-white/10 text-xs text-[#0D1B2A] dark:text-white"
                          >
                            <option value="Standard Building" className="text-black">Standard Building</option>
                            <option value="Transportation" className="text-black">Transportation</option>
                            <option value="Land Cover" className="text-black">Land Cover</option>
                            <option value="Guidelines" className="text-black">Guidelines</option>
                          </select>
                          <button
                            type="submit"
                            disabled={isUploading}
                            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
                          >
                            {isUploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                            {isUploading ? "Uploading..." : "Publish to Library"}
                          </button>
                        </div>
                      )}
                    </form>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
