"use client";

import React, { useState, useEffect, useRef } from "react";
import { Music, ListMusic, SkipForward, Play, VolumeX, Minus, Plus } from "lucide-react";
import ReactPlayer from "react-player";
import { io, Socket } from "socket.io-client";
import { cn } from "@/lib/utils";
import { useFloatingPanelSlot } from "@/lib/useFloatingPanelSlot";
import { toast } from "sonner";
import { trackQuestProgress } from "@/app/actions/loyalty";
import { DAILY_QUESTS } from "@/config/quests";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ||
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  "http://localhost:3001";

interface Song {
  id: string;
  url: string;
  title: string;
  requestedBy: string;
  requestedByEmail: string;
  startedAt?: number;
  thumbnail?: string;
}

interface JukeboxState {
  queue: Song[];
  currentSong: Song | null;
  skipVotesCount: number;
  votesNeeded: number;
  serverTime?: number;
  listenerCount?: number;
}

interface JukeboxWidgetProps {
  currentUser: {
    email?: string;
    role?: string;
    name?: string;
  };
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

export default function JukeboxWidget({ currentUser }: JukeboxWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [jukeboxState, setJukeboxState] = useState<JukeboxState>({
    queue: [],
    currentSong: null,
    skipVotesCount: 0,
    votesNeeded: 10,
  });
  
  const [hasVotedSkip, setHasVotedSkip] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  // Nothing to buffer when there's no current song (e.g. empty queue) —
  // ReactPlayer never mounts in that case, so onReady never fires to clear this.
  useEffect(() => {
    if (!jukeboxState.currentSong) {
      setIsBuffering(false);
    }
  }, [jukeboxState.currentSong]);

  const socketRef = useRef<Socket | null>(null);
  const playerRef = useRef<any>(null);
  const serverTimeOffsetRef = useRef(0);
  const isBufferingRef = useRef(false);

  useEffect(() => {
    if (!currentUser?.email) return;
    const token = getCookie("xnite_session");

    const socket = io(SOCKET_URL, {
      auth: { token, client: "jukebox" },
      transports: ["websocket"],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
    });

    socket.on("jukebox_state_update", (state: JukeboxState) => {
      if (state.serverTime) {
        serverTimeOffsetRef.current = state.serverTime - Date.now();
      }
      setJukeboxState(prev => {
        if (prev.currentSong?.id !== state.currentSong?.id) {
          setHasVotedSkip(false);
          setProgress(0);
          setDuration(0);
        }
        return state;
      });
    });

    // "The 60-Minute Harmony": the server credits the minute, we just relay the
    // new total so the quest card can tick live without a DB round-trip.
    // The server keeps echoing the capped total (on connect and every heartbeat),
    // so only toast on the actual crossing seen by this connection.
    let lastMinutes: number | null = null;
    socket.on("dj_minutes", ({ minutes, target }: { minutes: number; target: number }) => {
      window.dispatchEvent(
        new CustomEvent("dj_minutes", { detail: { minutes, target } })
      );
      if (lastMinutes !== null && lastMinutes < target && minutes >= target) {
        toast.success(`🎧 Quest Complete: The 60-Minute Harmony! +1 LXP`);
        window.dispatchEvent(new Event("refresh_quests"));
      }
      lastMinutes = minutes;
    });

    socket.on("refresh_quests", () => {
      window.dispatchEvent(new Event("refresh_quests"));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // "The 60-Minute Harmony" heartbeat. Sent ONLY while the website tab is focused
  // and playback is actively running.
  useEffect(() => {
    const canAccrue = () =>
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      document.hasFocus() &&
      isPlaying &&
      !!jukeboxState.currentSong;

    const sendPing = () => {
      if (canAccrue()) {
        socketRef.current?.emit("jukebox_heartbeat");
      }
    };

    sendPing();
    const timer = setInterval(sendPing, 5_000);
    document.addEventListener("visibilitychange", sendPing);
    window.addEventListener("focus", sendPing);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", sendPing);
      window.removeEventListener("focus", sendPing);
    };
  }, [isPlaying, jukeboxState.currentSong]);

  // Sits beside the Quest Log panel (to its left) when that one was opened first.
  // The minimized pill doesn't count as open — it lives in the FAB's spot.
  const { isLeft } = useFloatingPanelSlot("jukebox", isOpen && !isMinimized);

  // The FAB stays visible beside the open panel and toggles it: first click
  // joins and opens, clicking again minimizes (music keeps playing).
  const handleFabClick = () => {
    if (isOpen) {
      setIsMinimized(true);
      return;
    }
    setIsOpen(true);
    setIsPlaying(true);
    setIsBuffering(true);
    socketRef.current?.emit("jukebox_join");
  };

  const handleAddSong = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    try {
      if (ReactPlayer.canPlay && !ReactPlayer.canPlay(urlInput)) {
        toast.error("Unsupported URL. Please use YouTube, SoundCloud, etc.");
        return;
      }
    } catch (err) {
      // Ignore canPlay errors silently
    }

    if (socketRef.current) {
      const pendingUrl = urlInput.trim();
      setUrlInput("");
      setCooldown(10);

      // Instant UI update for the quest, similar to gamified branch
      const creditBardsBallad = async () => {
        try {
          const bardsBallad = DAILY_QUESTS.find((q) => q.id === "daily_q3")!;
          const targetMatches = bardsBallad.target.match(/^0\/(\d+)/);
          const targetCount = targetMatches ? parseInt(targetMatches[1], 10) : 2;
          const result = await trackQuestProgress(bardsBallad.id, bardsBallad.xp, targetCount);
          window.dispatchEvent(new Event("refresh_quests"));
          if (result.success && result.completed) {
            toast.success(`🎵 Quest Complete: ${bardsBallad.title}! +${bardsBallad.xp} LXP`);
          }
        } catch (err) {
          console.error("[Jukebox] Failed to track Bards Ballad quest:", err);
        }
      };

      creditBardsBallad();

      socketRef.current.emit(
        "jukebox_add_song",
        { url: pendingUrl, title: "Added Media" },
        async (response: { success: boolean; error?: string }) => {
          if (!response?.success) {
            toast.error(response?.error || "Failed to add song. Please try again.");
            return;
          }
          toast.success("Song added to queue!");
        }
      );

      if (!isPlaying) {
        socketRef.current.emit("jukebox_join");
        setIsPlaying(true);
        setIsBuffering(true);
      }
      setIsOpen(true);
      setIsMinimized(false);
    } else {
      toast.error("Not connected to server. Please refresh.");
    }
  };

  const handleVoteSkip = () => {
    if (!socketRef.current || !jukeboxState.currentSong) return;
    if (hasVotedSkip) {
      socketRef.current.emit("jukebox_remove_skip");
      setHasVotedSkip(false);
      toast.success("Vote to skip removed.");
    } else {
      socketRef.current.emit("jukebox_vote_skip");
      setHasVotedSkip(true);
      toast.success("Voted to skip!");
    }
  };

  const handleSongEnded = () => {
    if (!socketRef.current || !jukeboxState.currentSong) return;
    
    // Prevent false 'onEnded' triggers from skipping the song for everyone.
    // This happens if a user's browser blocks autoplay or if the video is unplayable for them.
    const isPremature = duration > 0 && duration - progress > 5;
    const isFailedToStart = duration === 0 && progress < 1;
    
    if (isPremature || isFailedToStart) {
      return;
    }

    socketRef.current.emit("jukebox_song_ended", { songId: jukeboxState.currentSong.id });
  };

  const handlePlayerReady = () => {
    setIsBuffering(false);
    if (!hasInitialSeekedRef.current && jukeboxState.currentSong?.startedAt && playerRef.current) {
      hasInitialSeekedRef.current = true;
      const currentServerTime = Date.now() + serverTimeOffsetRef.current;
      const elapsedSeconds = (currentServerTime - jukeboxState.currentSong.startedAt) / 1000;
      if (typeof playerRef.current.seekTo === "function") {
        playerRef.current.seekTo(elapsedSeconds, "seconds");
      } else if (typeof playerRef.current.currentTime !== "undefined") {
        playerRef.current.currentTime = elapsedSeconds;
      }
    }
  };

  const hasInitialSeekedRef = useRef(false);
  const prevPlayingRef = useRef(false);
  const prevSongIdRef = useRef<string | null>(null);
  const lastSeekTimeRef = useRef(0);

  useEffect(() => {
    const isCurrentlyPlaying = isPlaying;
    const wasPlaying = prevPlayingRef.current;
    const currentSongId = jukeboxState.currentSong?.id || null;
    const prevSongId = prevSongIdRef.current;

    if (currentSongId !== prevSongId) {
      hasInitialSeekedRef.current = false;
    }

    const shouldSeek = 
      (currentSongId !== prevSongId && isCurrentlyPlaying) ||
      (isCurrentlyPlaying && !wasPlaying);

    if (shouldSeek && jukeboxState.currentSong?.startedAt && playerRef.current) {
      hasInitialSeekedRef.current = true;
      const currentServerTime = Date.now() + serverTimeOffsetRef.current;
      const elapsedSeconds = (currentServerTime - jukeboxState.currentSong.startedAt) / 1000;
      if (typeof playerRef.current.seekTo === "function") {
        playerRef.current.seekTo(elapsedSeconds, "seconds");
      } else if (typeof playerRef.current.currentTime !== "undefined") {
        playerRef.current.currentTime = elapsedSeconds;
      }
    }

    prevPlayingRef.current = isCurrentlyPlaying;
    prevSongIdRef.current = currentSongId;
  }, [isOpen, isMinimized, isPlaying, jukeboxState.currentSong]);

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <>
      {/* Persistent global ReactPlayer so audio doesn't stop when minimizing/opening/closing 
          Using opacity: 0.0001 instead of width:0/height:0 to prevent browsers from throttling the background iframe (which causes audio stuttering) */}
      <div style={{ position: 'absolute', top: 0, left: 0, opacity: 0.0001, pointerEvents: 'none', zIndex: -9999 }}>
        {jukeboxState.currentSong && (
          <ReactPlayer 
            ref={playerRef}
            src={jukeboxState.currentSong.url} 
            playing={isPlaying && (isOpen || isMinimized)} 
            volume={0.5} 
            controls={false}
            width="300px"
            height="300px"
            onPlay={() => setIsPlaying(true)}
            onPause={() => { setIsPlaying(false); socketRef.current?.emit("jukebox_leave"); }}
            onEnded={() => handleSongEnded()}
            onError={(e: any) => console.error("Jukebox playback error:", e)}
            onReady={handlePlayerReady}
            onWaiting={() => { setIsBuffering(true); isBufferingRef.current = true; }}
            onPlaying={() => { setIsBuffering(false); isBufferingRef.current = false; }}
            onDurationChange={(e: any) => {
              const d = e?.currentTarget?.duration || e?.target?.duration || 0;
              if (d > 0 && !isNaN(d)) setDuration(d);
            }}
            onTimeUpdate={(e: any) => {
              const currentTime = e?.currentTarget?.currentTime || e?.target?.currentTime || 0;
              setProgress(currentTime);

              if (jukeboxState.currentSong?.startedAt && playerRef.current && isPlaying && !isBufferingRef.current) {
                const currentServerTime = Date.now() + serverTimeOffsetRef.current;
                const expectedTime = Math.max(0, (currentServerTime - jukeboxState.currentSong.startedAt) / 1000);
                
                if (Math.abs(currentTime - expectedTime) > 5 && (Date.now() - lastSeekTimeRef.current > 10000)) {
                  lastSeekTimeRef.current = Date.now();
                  if (typeof (playerRef.current as any).seekTo === "function") {
                    (playerRef.current as any).seekTo(expectedTime, "seconds");
                  } else if (typeof (playerRef.current as any).currentTime !== "undefined") {
                    (playerRef.current as any).currentTime = expectedTime;
                  }
                }
              }
            }}
          />
        )}
      </div>
      {/* FABs stay visible while the panel is open (it sits to their left); the minimized pill replaces them */}
      {(!isOpen || !isMinimized) && !jukeboxState.currentSong && (
        <button
          onClick={handleFabClick}
          aria-label={isOpen ? "Minimize DJ Booth" : "Open DJ Booth"}
          aria-expanded={isOpen}
          className="fixed bottom-[90px] right-6 z-[70] bg-emerald-500/80 hover:bg-emerald-500 backdrop-blur-md text-white p-3.5 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.3)] border border-emerald-400/30 transition-all duration-300 hover:scale-105 active:scale-95 flex items-center gap-0 group-hover:gap-2 group"
        >
          <Music className="w-5 h-5 group-hover:animate-bounce" />
          {/* Hover label expands leftward, so suppress it while the panel sits there */}
          <span className={cn(
            "max-w-0 overflow-hidden opacity-0 whitespace-nowrap transition-all duration-500 text-sm font-bold tracking-wide",
            !isOpen && "group-hover:max-w-[120px] group-hover:opacity-100 group-hover:pl-1.5 group-hover:pr-1"
          )}>
            DJ Booth
          </span>
        </button>
      )}

      {(!isOpen || !isMinimized) && jukeboxState.currentSong && (
        <div className="fixed bottom-[90px] right-6 z-[70] flex items-center bg-[#060D14]/60 backdrop-blur-md border border-emerald-500/30 rounded-full shadow-[0_0_20px_rgba(16,185,129,0.2)] p-1.5 animate-in slide-in-from-bottom-5 hover:border-emerald-500/60 transition-colors group">
          <button
            onClick={handleFabClick}
            aria-label={isOpen ? "Minimize DJ Booth" : "Open DJ Booth"}
            aria-expanded={isOpen}
            className="bg-emerald-500 hover:bg-emerald-600 text-white p-2.5 rounded-full transition-transform hover:scale-105 active:scale-95 flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
          >
            <Music className="w-4 h-4 animate-pulse" />
          </button>
          <div
            className={cn(
              "cursor-pointer select-none flex flex-col justify-center max-w-0 opacity-0 overflow-hidden whitespace-nowrap transition-all duration-500",
              !isOpen && "group-hover:max-w-[160px] group-hover:opacity-100 group-hover:ml-3 group-hover:pr-4"
            )}
            onClick={handleFabClick}
          >
            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest drop-shadow-[0_0_5px_rgba(16,185,129,0.8)]">Now Playing</p>
            <p className="text-xs text-white font-medium truncate max-w-[140px]">
              {jukeboxState.currentSong.title !== "Added Media" ? jukeboxState.currentSong.title : "Live Track"}
            </p>
          </div>
        </div>
      )}

      {isOpen && (
        <div
          className={cn(
            "fixed z-[60] bg-white/30 dark:bg-[#060D14]/60 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)] flex flex-col overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            isMinimized
              ? "bottom-[90px] right-6 w-auto h-16 rounded-full"
              : cn(
                  "bottom-[90px] right-[92px] w-[400px] max-w-[calc(100vw-108px)] h-[550px] rounded-3xl",
                  isLeft && "lg:right-[508px]"
                )
          )}
        >
          <div className={isMinimized ? "hidden" : ""}>
            <div className="h-16 px-5 bg-gradient-to-r from-emerald-500/10 to-transparent border-b border-emerald-500/10 text-slate-800 dark:text-emerald-400 flex items-center justify-between shrink-0 select-none">
              <div className="flex items-center gap-2 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]">
                <Music className="w-5 h-5" />
                <span className="font-bold tracking-wide">DJ Booth</span>
                {(jukeboxState.listenerCount ?? 0) > 0 && (
                  <span className="text-[9px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    {jukeboxState.listenerCount} listening
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="p-2 text-slate-500 dark:text-emerald-400/70 hover:text-slate-800 dark:hover:text-emerald-400 hover:bg-black/5 dark:hover:bg-emerald-500/20 rounded-xl transition-all"
                  title={isMinimized ? "Maximize" : "Minimize"}
                >
                  {isMinimized ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => { setIsOpen(false); setIsMinimized(false); setIsPlaying(false); setIsBuffering(false); socketRef.current?.emit("jukebox_leave"); }}
                  className="p-2 text-slate-500 dark:text-emerald-400/70 hover:text-slate-800 dark:hover:text-emerald-400 hover:bg-black/5 dark:hover:bg-emerald-500/20 rounded-xl transition-all"
                  title="Close"
                >
                  <VolumeX className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {isMinimized && (
             <div className="flex w-full h-full items-center justify-between px-2 gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
                 <div className="flex items-center gap-3" onClick={() => setIsMinimized(false)}>
                    <button className="bg-emerald-500 text-white p-2.5 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)] shrink-0 hover:bg-emerald-600 transition-colors">
                      <Music className="w-4 h-4" />
                    </button>
                 </div>
                 <button onClick={() => { setIsOpen(false); setIsMinimized(false); setIsPlaying(false); setIsBuffering(false); socketRef.current?.emit("jukebox_leave"); }} className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full text-slate-500 dark:text-slate-400 transition-colors mr-1">
                   <VolumeX className="w-4 h-4"/>
                 </button>
             </div>
          )}

          {!isMinimized && (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="p-5 border-b border-black/5 dark:border-white/10 shrink-0 bg-gradient-to-b from-black/5 dark:from-emerald-500/5 to-transparent">
                <h3 className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-4">
                  {jukeboxState.currentSong && isBuffering ? 'Syncing...' : 'Now Playing'}
                </h3>
                {jukeboxState.currentSong ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-xl overflow-hidden bg-black/5 dark:bg-black/40 border border-black/10 dark:border-white/10 shrink-0 relative shadow-lg pointer-events-none flex items-center justify-center">
                        {jukeboxState.currentSong.thumbnail ? (
                          <img src={jukeboxState.currentSong.thumbnail} alt="Cover" className="w-full h-full object-cover" />
                        ) : (
                          <Music className="w-10 h-10 text-slate-400 opacity-50" />
                        )}
                      </div>
                      
                      <div className="flex flex-col min-w-0 flex-1 justify-center">
                        <span className="text-base font-bold text-slate-800 dark:text-white truncate drop-shadow-md">
                           {jukeboxState.currentSong.title === "Added Media" ? "Live Track" : jukeboxState.currentSong.title}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 truncate mb-2">
                          Req by <span className="text-emerald-600 dark:text-emerald-400 font-medium">{jukeboxState.currentSong.requestedBy}</span>
                        </span>
                        
                        <button 
                          onClick={handleVoteSkip}
                          className={cn(
                            "w-fit flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold transition-all shrink-0 uppercase tracking-wide",
                            hasVotedSkip 
                              ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 dark:text-emerald-400 active:scale-95 border border-emerald-500/20" 
                              : "bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400 active:scale-95 border border-red-500/20"
                          )}
                        >
                          <SkipForward className="w-3 h-3" />
                          {hasVotedSkip ? "Remove Vote" : "Skip"} ({jukeboxState.skipVotesCount}/{jukeboxState.votesNeeded})
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 mt-1">
                      <div className="flex justify-between text-[10px] text-emerald-600 dark:text-emerald-400 font-bold font-mono tracking-wider">
                        <span>{formatTime(progress)}</span>
                        <span>{formatTime(duration)}</span>
                      </div>
                      <div className="w-full bg-black/10 dark:bg-black/40 rounded-full h-2 overflow-hidden border border-black/5 dark:border-white/5">
                        <div 
                          className="bg-emerald-500 h-full rounded-full transition-all duration-1000 ease-linear shadow-[0_0_10px_rgba(16,185,129,0.8)]"
                          style={{ width: duration > 0 ? `${(progress / duration) * 100}%` : '0%' }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 gap-3">
                    <Play className="w-10 h-10 opacity-30" />
                    <span className="text-sm font-medium tracking-wide">Nothing is playing</span>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto flex flex-col relative scrollbar-thin scrollbar-thumb-emerald-500/20 scrollbar-track-transparent">
                <div className="flex items-center gap-2 sticky top-0 z-10 py-3 px-5 bg-white/80 dark:bg-[#0B1520]/80 backdrop-blur-md border-b border-black/5 dark:border-white/5 mb-3 shadow-[0_4px_10px_-4px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_10px_-4px_rgba(0,0,0,0.2)]">
                  <ListMusic className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Up Next</h3>
                  <span className="ml-auto text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                    {jukeboxState.queue.length}
                  </span>
                </div>
                
                {jukeboxState.queue.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center opacity-50 text-slate-500 pb-8 mt-4 px-5">
                    <span className="text-xs font-medium">Queue is empty. Be the DJ!</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5 pb-5 px-5">
                    {jukeboxState.queue.map((song, idx) => (
                      <div key={song.id} className="bg-black/5 dark:bg-black/20 p-3 rounded-2xl border border-black/5 dark:border-white/5 hover:border-emerald-500/30 transition-colors flex items-center gap-4 group">
                        <span className="text-sm font-black text-slate-400 dark:text-slate-500 w-5 text-center shrink-0 group-hover:text-emerald-500 transition-colors">
                          {idx + 1}
                        </span>
                        {song.thumbnail ? (
                          <img src={song.thumbnail} alt="Thumbnail" className="w-12 h-12 rounded-xl object-cover shrink-0 shadow-md" />
                        ) : (
                          <div className="w-12 h-12 bg-black/5 dark:bg-white/5 rounded-xl flex items-center justify-center shrink-0 shadow-inner">
                            <Music className="w-5 h-5 text-slate-400" />
                          </div>
                        )}
                        <div className="flex flex-col min-w-0 flex-1 justify-center">
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" title={song.title !== "Added Media" && song.title !== "Unknown Song" ? song.title : song.url}>
                             {song.title !== "Added Media" && song.title !== "Unknown Song" ? song.title : song.url}
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5 uppercase tracking-wide">
                            Added by {song.requestedBy}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 bg-black/5 dark:bg-black/20 border-t border-black/10 dark:border-white/10 shrink-0 backdrop-blur-md">
                <form onSubmit={handleAddSong} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Paste YouTube link..."
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    className="flex-1 bg-white/50 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  />
                  <button 
                    type="submit"
                    disabled={!urlInput.trim() || cooldown > 0}
                    className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(16,185,129,0.3)] disabled:shadow-none min-w-[70px]"
                  >
                    {cooldown > 0 ? `${cooldown}s` : "Add"}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
