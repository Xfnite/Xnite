"use client";

import React, { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLivestream } from "@/contexts/LivestreamContext";
import {
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Maximize2,
  Minimize2,
  X,
  ExternalLink,
  Users,
  RefreshCw,
  Radio,
  Play,
  WifiOff,
} from "lucide-react";

export default function LivestreamMiniPlayer() {
  const pathname = usePathname();
  const router = useRouter();

  const {
    liveSession,
    liveViewerCount,
    hasJoinedStream,
    isConnectingStream,
    isStreamInterrupted,
    remoteStream,
    isViewerMuted,
    unmuteViewer,
    toggleViewerMute,
    handleLeaveStream,
    reconnectViewerStream,
    isCapturing,
    broadcastSource,
    broadcasterStream,
    recordingSeconds,
    isMicEnabled,
    toggleCheckerMic,
    finishScreenCapture,
    finishVideoBroadcast,
    formatTimer,
    isSlowConnection,
    isVideoBuffering,
    setIsVideoBuffering,
  } = useLivestream();

  const [isMinimized, setIsMinimized] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // If on the livestream page, the full UI is already visible
  const isOnLivestreamPage = pathname === "/livestream";

  const isViewerActive = hasJoinedStream && Boolean(liveSession);
  const isBroadcasterActive = isCapturing;
  const shouldRender = !isOnLivestreamPage && (isViewerActive || isBroadcasterActive);

  // Connect active media stream to mini-player video element
  useEffect(() => {
    if (!shouldRender || !videoRef.current) return;

    const targetStream = isBroadcasterActive ? broadcasterStream : remoteStream;
    if (targetStream && videoRef.current.srcObject !== targetStream) {
      videoRef.current.srcObject = targetStream;
      videoRef.current.play().catch(() => {});
    }
  }, [shouldRender, isBroadcasterActive, broadcasterStream, remoteStream]);

  if (!shouldRender) {
    return null;
  }

  const handleClose = () => {
    if (isBroadcasterActive) {
      const confirmEnd = window.confirm(
        "⚠️ LIVE BROADCAST IN PROGRESS\n\nClosing this player will end your broadcast for all viewers.\n\nDo you want to end your broadcast?"
      );
      if (confirmEnd) {
        if (broadcastSource === "screen") {
          finishScreenCapture();
        } else {
          finishVideoBroadcast();
        }
      }
    } else {
      handleLeaveStream();
    }
  };

  const navigateToLivestream = () => {
    router.push("/livestream");
  };

  // Minimized Floating Pill View
  if (isMinimized) {
    return (
      <div className="fixed bottom-24 right-6 sm:bottom-28 sm:right-6 z-[80] flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-[#060D14]/95 border border-emerald-500/40 text-white shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
        </span>

        <span className="text-xs font-bold text-slate-200 truncate max-w-[140px]">
          {isBroadcasterActive
            ? `Live (${formatTimer(recordingSeconds)})`
            : liveSession?.title || liveSession?.checkerName || "Live Stream"}
        </span>

        {isSlowConnection && (
          <span className="flex items-center gap-1 text-[10px] text-amber-300 font-bold px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30">
            <WifiOff className="w-2.5 h-2.5" />
            Slow
          </span>
        )}

        <button
          onClick={() => setIsMinimized(false)}
          className="p-1 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
          title="Expand Mini Player"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={navigateToLivestream}
          className="p-1 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors cursor-pointer"
          title="Return to Livestream Studio"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleClose}
          className="p-1 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
          title={isBroadcasterActive ? "End Broadcast" : "Leave Stream"}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // Expanded Floating Mini Player Card
  return (
    <div className="fixed bottom-24 right-6 sm:bottom-28 sm:right-6 z-[80] w-80 sm:w-96 rounded-2xl bg-[#060D14]/95 border border-emerald-500/30 shadow-[0_16px_50px_rgba(0,0,0,0.7)] backdrop-blur-xl overflow-hidden flex flex-col text-white transition-all duration-300 animate-in fade-in zoom-in-95">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-black/40 border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 shrink-0">
            {isBroadcasterActive ? "BROADCASTING" : "LIVE"}
          </span>
          <span
            className="text-xs font-semibold text-slate-200 truncate"
            title={
              isBroadcasterActive
                ? "Studio Broadcast Monitor"
                : liveSession?.checkerName || "Audit Inspection"
            }
          >
            {isBroadcasterActive
              ? "Studio Live"
              : liveSession?.checkerName || "Live Inspection"}
          </span>

          {isSlowConnection && (
            <span
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0"
              title="Slow internet detected. Lag or buffering is due to your local connection."
            >
              <WifiOff className="w-2.5 h-2.5 animate-pulse" />
              Slow Net
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Minimize to Pill"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={navigateToLivestream}
            className="p-1.5 hover:bg-white/10 rounded-lg text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
            title="Open in Livestream Page"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleClose}
            className="p-1.5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
            title={isBroadcasterActive ? "End Broadcast" : "Leave Stream"}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Video Viewport */}
      <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden group">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isBroadcasterActive ? true : isViewerMuted}
          onCanPlay={() => setIsVideoBuffering(false)}
          onWaiting={() => setIsVideoBuffering(true)}
          onStalled={() => setIsVideoBuffering(true)}
          onPlaying={() => setIsVideoBuffering(false)}
          className="w-full h-full object-contain"
        />

        {/* Slow Internet Buffering Overlay */}
        {isVideoBuffering && !isConnectingStream && !isStreamInterrupted && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center gap-1.5 p-2 text-center z-10 pointer-events-none animate-in fade-in">
            <RefreshCw className="w-5 h-5 text-amber-400 animate-spin" />
            <span className="text-[11px] font-bold text-amber-300">
              Slow Internet • Buffering...
            </span>
          </div>
        )}

        {/* Interrupted / Reconnecting Overlay */}
        {(isConnectingStream || isStreamInterrupted) && !isBroadcasterActive && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2 p-4 text-center z-10">
            <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
            <span className="text-xs font-medium text-slate-200">
              Reconnecting stream feed...
            </span>
            <button
              onClick={() => reconnectViewerStream(true)}
              className="mt-1 px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[11px] font-semibold border border-emerald-500/30 transition-all cursor-pointer"
            >
              Retry Now
            </button>
          </div>
        )}

        {/* Viewer Muted Tap to Unmute Overlay */}
        {isViewerActive && isViewerMuted && !isConnectingStream && (
          <button
            onClick={unmuteViewer}
            className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/75 hover:bg-black/90 text-white text-[11px] font-medium border border-white/20 backdrop-blur-md transition-all cursor-pointer"
          >
            <VolumeX className="w-3 h-3 text-red-400" />
            <span>Muted — Click to hear audio</span>
          </button>
        )}
      </div>

      {/* Footer Controls */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-black/30 border-t border-white/10 text-xs">
        {/* Left Side Status & Controls */}
        <div className="flex items-center gap-3">
          {isBroadcasterActive ? (
            <>
              {/* Mic Toggle */}
              <button
                onClick={toggleCheckerMic}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                  isMicEnabled
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30"
                    : "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                }`}
                title={isMicEnabled ? "Mute Microphone" : "Unmute Microphone"}
              >
                {isMicEnabled ? (
                  <Mic className="w-3.5 h-3.5" />
                ) : (
                  <MicOff className="w-3.5 h-3.5" />
                )}
                <span>{isMicEnabled ? "Mic ON" : "Mic OFF"}</span>
              </button>

              {/* Timer */}
              <span className="font-mono text-[11px] font-semibold text-slate-300">
                {formatTimer(recordingSeconds)}
              </span>
            </>
          ) : (
            <>
              {/* Viewer Mute Toggle */}
              <button
                onClick={toggleViewerMute}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title={isViewerMuted ? "Unmute Audio" : "Mute Audio"}
              >
                {isViewerMuted ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                )}
              </button>

              {/* Viewer Count */}
              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                <Users className="w-3 h-3 text-emerald-400" />
                <span>{liveViewerCount}</span>
              </div>
            </>
          )}
        </div>

        {/* Right Side Action */}
        <button
          onClick={navigateToLivestream}
          className="flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-semibold text-[11px] border border-emerald-500/30 transition-all cursor-pointer active:scale-95"
        >
          <span>{isBroadcasterActive ? "Studio" : "Full Screen"}</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

