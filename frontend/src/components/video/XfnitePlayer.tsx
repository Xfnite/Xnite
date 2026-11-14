"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize, 
  Settings, 
  Check,
  AlertTriangle,
  RotateCw,
  Loader2
} from "lucide-react";

interface XfnitePlayerProps {
  src: string;
  title?: string;
  poster?: string;
  autoPlay?: boolean;
  initialDuration?: number;
}

export default function XfnitePlayer({ 
  src, 
  title, 
  poster, 
  autoPlay = false,
  initialDuration = 0
}: XfnitePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<string>("Auto (1080p)");
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [showControls, setShowControls] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stallTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const qualities = ["Auto (1080p)", "1080p (FHD)", "720p (HD)", "360p (Data Saver)"];
  const speeds = [0.75, 1, 1.25, 1.5, 2];

  // Reload or retry loading the video
  const handleRetry = useCallback(() => {
    setHasError(false);
    setErrorMessage("");
    setIsLoading(true);
    const video = videoRef.current;
    if (video) {
      video.load();
      video.play().catch(() => {});
    }
  }, []);

  // Listen to video element lifecycle events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setHasError(false);
    setErrorMessage("");
    setCurrentTime(0);
    setDuration(initialDuration && initialDuration > 0 ? initialDuration : 0);
    setIsLoading(true);
    setIsPlaying(false);

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleProgress = () => {
      if (video.buffered.length > 0 && video.duration > 0) {
        const end = video.buffered.end(video.buffered.length - 1);
        setBufferedPercent(Math.min(100, Math.round((end / video.duration) * 100)));
      }
    };
    const handleLoadedMetadata = () => {
      if (isFinite(video.duration) && video.duration > 0) {
        setDuration(video.duration);
      } else if (initialDuration && initialDuration > 0) {
        setDuration(initialDuration);
      }
      if (video.currentTime === 0) {
        try {
          video.currentTime = 0.001;
        } catch {}
      }
      setIsLoading(false);
      setHasError(false);
    };
    const handleCanPlay = () => {
      setIsLoading(false);
      if (stallTimeoutRef.current) {
        clearTimeout(stallTimeoutRef.current);
        stallTimeoutRef.current = null;
      }
    };
    const handleWaiting = () => {
      setIsLoading(true);
      // Auto-recover from stalls on flaky connections: nudge if buffer hangs for > 3.5s
      if (stallTimeoutRef.current) clearTimeout(stallTimeoutRef.current);
      stallTimeoutRef.current = setTimeout(() => {
        if (video && !video.paused && video.readyState < 3) {
          try {
            video.currentTime = video.currentTime + 0.05;
          } catch {}
        }
      }, 3500);
    };
    const handlePlaying = () => {
      setIsPlaying(true);
      setIsLoading(false);
      setHasError(false);
      if (stallTimeoutRef.current) {
        clearTimeout(stallTimeoutRef.current);
        stallTimeoutRef.current = null;
      }
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => {
      setIsPlaying(false);
      if (stallTimeoutRef.current) {
        clearTimeout(stallTimeoutRef.current);
        stallTimeoutRef.current = null;
      }
    };
    const handleEnded = () => setIsPlaying(false);

    const handleError = () => {
      setIsLoading(false);
      setIsPlaying(false);
      setHasError(true);
      if (stallTimeoutRef.current) {
        clearTimeout(stallTimeoutRef.current);
        stallTimeoutRef.current = null;
      }
      const mediaErr = video.error;
      if (mediaErr?.code === 4) {
        setErrorMessage("Video recording not found or format unsupported (404).");
      } else if (mediaErr?.code === 2) {
        setErrorMessage("Network error while downloading the video stream.");
      } else if (mediaErr?.code === 3) {
        setErrorMessage("Video decoding error occurred.");
      } else {
        setErrorMessage("Unable to load video. Cloud storage or file may be unavailable.");
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("progress", handleProgress);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("error", handleError);

    // Initial load
    video.load();
    if (autoPlay) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // If unmuted autoplay is blocked by browser policy, try muted
          video.muted = true;
          setIsMuted(true);
          video.play().catch(() => {
            setIsPlaying(false);
          });
        });
      }
    }

    return () => {
      if (stallTimeoutRef.current) {
        clearTimeout(stallTimeoutRef.current);
        stallTimeoutRef.current = null;
      }
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("progress", handleProgress);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("error", handleError);
    };
  }, [src, autoPlay]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch((err) => {
        console.warn("[XfnitePlayer] Playback start prevented:", err?.message);
      });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    setIsMuted(vol === 0);
    if (videoRef.current) {
      videoRef.current.volume = vol;
      videoRef.current.muted = vol === 0;
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    if (isMuted) {
      videoRef.current.muted = false;
      setIsMuted(false);
      videoRef.current.volume = volume || 0.5;
    } else {
      videoRef.current.muted = true;
      setIsMuted(true);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const changeSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setShowSettings(false);
  };

  const changeQuality = (q: string) => {
    setSelectedQuality(q);
    setShowSettings(false);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0 || !isFinite(secs)) return "00:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      className="relative aspect-video w-full bg-black rounded-2xl overflow-hidden shadow-2xl group select-none flex items-center justify-center border border-black/10 dark:border-white/10"
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        preload="metadata"
        onClick={togglePlay}
        playsInline
        className="w-full h-full object-contain cursor-pointer"
      />

      {/* Loading Spinner */}
      {isLoading && !hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs z-20 pointer-events-none gap-2">
          <Loader2 className="w-10 h-10 animate-spin text-[#55f761]" />
          <span className="text-white/80 text-xs font-medium">Loading video stream...</span>
        </div>
      )}

      {/* Error Fallback Card Overlay */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md z-30 p-6 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div className="space-y-1 max-w-md">
            <h4 className="text-sm sm:text-base font-bold text-white">Video Recording Unavailable</h4>
            <p className="text-xs text-white/70 leading-relaxed">
              {errorMessage || "The video file could not be loaded or was not found on cloud storage."}
            </p>
            {src && (
              <p className="text-[10px] text-white/40 font-mono truncate max-w-sm mx-auto pt-1">
                Source: {src}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleRetry}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border border-white/15"
            >
              <RotateCw className="w-3.5 h-3.5" />
              Retry Playback
            </button>
          </div>
        </div>
      )}

      {/* Big Center Play Button when paused and no error */}
      {!isPlaying && !isLoading && !hasError && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-emerald-500/90 dark:bg-[#55f761] text-white dark:text-[#060D14] flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all cursor-pointer z-20"
        >
          <Play className="w-8 h-8 fill-current ml-1" />
        </button>
      )}

      {/* Top Overlay Badge */}
      {title && (
        <div
          className={`absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/80 to-transparent z-10 transition-opacity duration-300 ${
            showControls ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <div className="flex items-center justify-between text-white text-xs font-semibold">
            <span className="truncate pr-4">{title}</span>
            <span className="px-2 py-0.5 rounded bg-black/60 border border-white/20 text-[10px] text-emerald-400 font-mono">
              {selectedQuality}
            </span>
          </div>
        </div>
      )}

      {/* Bottom Controls Bar */}
      <div
        className={`absolute bottom-0 inset-x-0 p-3 sm:p-4 bg-gradient-to-t from-black/95 via-black/70 to-transparent z-10 transition-opacity duration-300 flex flex-col gap-2 ${
          showControls && !hasError ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Scrubber Progress Bar with Buffered Indicator */}
        <div className="relative w-full flex items-center group/scrubber cursor-pointer">
          {/* Buffered Background Track */}
          <div className="absolute inset-x-0 h-1.5 bg-white/20 rounded-lg overflow-hidden pointer-events-none">
            <div
              className="h-full bg-white/35 rounded-lg transition-all duration-300"
              style={{ width: `${bufferedPercent}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            disabled={hasError || duration === 0}
            className="relative z-10 w-full h-1.5 bg-transparent appearance-none cursor-pointer accent-[#55f761] hover:h-2.5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          />
        </div>

        {/* Action Controls Row */}
        <div className="flex items-center justify-between text-white text-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              disabled={hasError}
              className="p-1 hover:text-emerald-400 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
            </button>

            {/* Time display */}
            <span className="font-mono text-[11px] text-white/80">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            {/* Volume Control */}
            <div className="flex items-center gap-1.5 group/vol">
              <button
                onClick={toggleMute}
                className="p-1 hover:text-emerald-400 transition-colors cursor-pointer"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 bg-white/25 rounded-lg appearance-none cursor-pointer accent-[#55f761]"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 relative">
            {/* Speed & Quality Settings Menu Toggle */}
            <div className="relative">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[11px] ${
                  showSettings ? "bg-white/20 text-emerald-400" : "hover:text-emerald-400 text-white/80"
                }`}
                title="Playback Settings"
              >
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline font-mono">{selectedQuality.split(" ")[0]}</span>
              </button>

              {/* Settings Dropdown Popover */}
              {showSettings && (
                <div className="absolute bottom-9 right-0 w-52 bg-[#060D14]/95 backdrop-blur-xl border border-white/10 rounded-xl p-2.5 shadow-2xl text-xs space-y-3 z-30">
                  {/* Quality Selection */}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 px-1.5 block mb-1">
                      Quality
                    </span>
                    <div className="space-y-0.5">
                      {qualities.map((q) => (
                        <button
                          key={q}
                          onClick={() => changeQuality(q)}
                          className={`w-full text-left px-2 py-1 rounded-md flex items-center justify-between text-[11px] transition-colors ${
                            selectedQuality === q
                              ? "bg-emerald-500/20 text-[#55f761] font-semibold"
                              : "text-white/70 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          <span>{q}</span>
                          {selectedQuality === q && <Check className="w-3 h-3" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Speed Selection */}
                  <div className="pt-2 border-t border-white/10">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 px-1.5 block mb-1">
                      Speed
                    </span>
                    <div className="flex items-center justify-between gap-1 px-1">
                      {speeds.map((s) => (
                        <button
                          key={s}
                          onClick={() => changeSpeed(s)}
                          className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors ${
                            playbackSpeed === s
                              ? "bg-[#55f761] text-[#060D14] font-bold"
                              : "text-white/70 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          {s}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className="p-1 hover:text-emerald-400 transition-colors cursor-pointer"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
