"use client";

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";

export interface InlineVideoPlayerRef {
  play: () => void;
  pause: () => void;
}

interface InlineVideoPlayerProps {
  videoId: string;
  watchedPercent: number;
  onProgress: (videoId: string, percent: number) => void;
  /** Fired once when watch-time first crosses (25% of duration + thresholdExtraSecs) */
  onReach25?: () => void;
  /** Fired once the first time the video starts playing */
  onPlay?: () => void;
  /** Extra seconds added to the 25% mark before onReach25 fires (default 0) */
  thresholdExtraSecs?: number;
  /** Fired every second with current time and duration in seconds */
  onTimeUpdate?: (videoId: string, currentTime: number, duration: number) => void;
  /** Fired when the video finishes playing (reaches the end) */
  onVideoEnded?: () => void;
  /** Fired when the play/pause state changes */
  onPlayingStateChange?: (isPlaying: boolean) => void;
  /** Optional start time in seconds */
  startTime?: number;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

// Global state to track YouTube API loading across mounts and SPA transitions
let apiLoaded = false;
const readyCallbacks: (() => void)[] = [];

function loadYoutubeIframeAPI(callback: () => void) {
  if (typeof window === "undefined") return;

  if (window.YT && window.YT.Player) {
    callback();
    return;
  }

  readyCallbacks.push(callback);

  if (apiLoaded) return;
  apiLoaded = true;

  const existingScript = document.getElementById("yt-iframe-api");
  if (!existingScript) {
    const tag = document.createElement("script");
    tag.id = "yt-iframe-api";
    tag.src = "https://www.youtube.com/iframe_api";
    const first = document.getElementsByTagName("script")[0];
    if (first?.parentNode) {
      first.parentNode.insertBefore(tag, first);
    }
  }

  const previousCallback = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    if (previousCallback) {
      try {
        previousCallback();
      } catch (err) {
        console.error("Error in previous onYouTubeIframeAPIReady:", err);
      }
    }
    while (readyCallbacks.length > 0) {
      const cb = readyCallbacks.shift();
      if (cb) {
        try {
          cb();
        } catch (err) {
          console.error("Error in ready callback:", err);
        }
      }
    }
  };
}

const InlineVideoPlayer = forwardRef<InlineVideoPlayerRef, InlineVideoPlayerProps>(
  function InlineVideoPlayer({
    videoId, watchedPercent, onProgress, onReach25, onPlay, thresholdExtraSecs = 0, onTimeUpdate, onVideoEnded, onPlayingStateChange, startTime,
  }, ref) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [localPercent, setLocalPercent] = useState(watchedPercent);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playerRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const intervalRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const reach25Fired = useRef(watchedPercent >= 25); // don't re-fire if already past
    const endedFired = useRef(false);

    // Store callbacks in refs so the effect always has the latest version
    // without needing them in the dependency array.
    const onProgressRef = useRef(onProgress);
    const onReach25Ref = useRef(onReach25);
    const onPlayRef = useRef(onPlay);
    const onTimeUpdateRef = useRef(onTimeUpdate);
    const onVideoEndedRef = useRef(onVideoEnded);
    const onPlayingStateChangeRef = useRef(onPlayingStateChange);

    useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);
    useEffect(() => { onReach25Ref.current = onReach25; }, [onReach25]);
    useEffect(() => { onPlayRef.current = onPlay; }, [onPlay]);
    useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);
    useEffect(() => { onVideoEndedRef.current = onVideoEnded; }, [onVideoEnded]);
    useEffect(() => { onPlayingStateChangeRef.current = onPlayingStateChange; }, [onPlayingStateChange]);

    const playFired = useRef(false);

    useImperativeHandle(ref, () => ({
      play: () => {
        if (playerRef.current?.playVideo) {
          playerRef.current.playVideo();
        }
      },
      pause: () => {
        if (playerRef.current?.pauseVideo) {
          playerRef.current.pauseVideo();
        }
      }
    }));

    const prevVideoId = useRef<string | null>(null);

    // Keep local display in sync when navigating between videos
    useEffect(() => {
      if (prevVideoId.current !== videoId) {
        prevVideoId.current = videoId;
        setLocalPercent(watchedPercent);
        reach25Fired.current = watchedPercent >= 25;
        playFired.current = false;
        endedFired.current = false;
      } else {
        setLocalPercent((prev) => Math.max(prev, watchedPercent));
      }
    }, [watchedPercent, videoId]);

    // Safely call onProgress outside the render cycle via queueMicrotask
    const safeOnProgress = useCallback((vid: string, pct: number) => {
      queueMicrotask(() => onProgressRef.current(vid, pct));
    }, []);

    const safeOnReach25 = useCallback(() => {
      queueMicrotask(() => onReach25Ref.current?.());
    }, []);

    // Init / destroy player when videoId changes
    useEffect(() => {
      let destroyed = false;
      let playerInstance: any = null;

      const triggerEnded = () => {
        if (destroyed || endedFired.current) return;
        endedFired.current = true;
        setLocalPercent(100);
        safeOnProgress(videoId, 100);
        if (!reach25Fired.current) {
          reach25Fired.current = true;
          safeOnReach25();
        }
        // Pause the player so it stops playing but doesn't reset to the beginning
        if (playerInstance?.pauseVideo) {
          playerInstance.pauseVideo();
        }
        queueMicrotask(() => onVideoEndedRef.current?.());
      };

      function initPlayer() {
        if (destroyed) return;
        if (playerInstance?.destroy) {
          try {
            playerInstance.destroy();
          } catch { /* ignore */ }
          playerInstance = null;
        }
        if (intervalRef.current) clearInterval(intervalRef.current);

        const isPlaylist = videoId.startsWith("PL");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const playerConfig: any = {
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1, loop: 0, start: startTime },
          events: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onStateChange: (event: any) => {
              if (event.data === window.YT.PlayerState.PLAYING) {
                if (!playFired.current) {
                  playFired.current = true;
                  queueMicrotask(() => onPlayRef.current?.());
                }
                if (onPlayingStateChangeRef.current) {
                  queueMicrotask(() => onPlayingStateChangeRef.current?.(true));
                }
                intervalRef.current = setInterval(() => {
                  if (!playerInstance?.getCurrentTime) return;
                  if (playerInstance.getVideoData && playerInstance.getVideoData().video_id !== videoId) {
                    return;
                  }
                  const cur = playerInstance.getCurrentTime();
                  const dur = playerInstance.getDuration();
                  if (dur > 0) {
                    queueMicrotask(() => onTimeUpdateRef.current?.(videoId, cur, dur));
                    if (dur - cur <= 1.5) {
                      triggerEnded();
                    } else {
                      if (endedFired.current && dur - cur > 2.5) {
                        endedFired.current = false;
                      }
                      const pct = Math.min(100, Math.floor((cur / dur) * 100));
                      setLocalPercent((prev) => {
                        const next = Math.max(prev, pct);
                        if (next > prev) {
                          safeOnProgress(videoId, next);
                          // Fire onReach25 once when currentTime >= (25% of duration + extra seconds)
                          if (!reach25Fired.current) {
                            const thresholdTime = dur * 0.25 + thresholdExtraSecs;
                            if (cur >= thresholdTime) {
                              reach25Fired.current = true;
                              safeOnReach25();
                            }
                          }
                        }
                        return next;
                      });
                    }
                  }
                }, 1000);
              } else {
                if (intervalRef.current) clearInterval(intervalRef.current);
                if (event.data === window.YT.PlayerState.ENDED) {
                  triggerEnded();
                }
                if (onPlayingStateChangeRef.current) {
                  const isPlaying = event.data === window.YT.PlayerState.BUFFERING;
                  queueMicrotask(() => onPlayingStateChangeRef.current?.(isPlaying));
                }
                // When user scrubs/drags to the very end, YouTube fires PAUSED (not ENDED).
                // getCurrentTime() may not reflect the scrubbed position immediately,
                // so we retry several times with a delay.
                if (
                  event.data === window.YT.PlayerState.PAUSED ||
                  event.data === window.YT.PlayerState.BUFFERING
                ) {
                  const checkAtEnd = (attempt: number) => {
                    if (destroyed || attempt > 5) return;
                    if (playerInstance?.getCurrentTime && playerInstance?.getDuration) {
                      const cur = playerInstance.getCurrentTime();
                      const dur = playerInstance.getDuration();
                      if (dur > 0) {
                        // Report progress so page.tsx stays in sync
                        const pct = Math.min(100, Math.floor((cur / dur) * 100));
                        if (pct > 0) safeOnProgress(videoId, pct);
                        // Also trigger onTimeUpdate so parent components receive current time/duration on scrub
                        queueMicrotask(() => onTimeUpdateRef.current?.(videoId, cur, dur));

                        // If they seeked back, reset endedFired
                        if (dur - cur > 2.5) {
                          endedFired.current = false;
                        }

                        // If near the end, treat as ended
                        if (dur - cur <= 2 || pct >= 98) {
                          triggerEnded();
                          return;
                        }
                      }
                    }
                    setTimeout(() => checkAtEnd(attempt + 1), 200);
                  };
                  checkAtEnd(0);
                }
              }
            },
          },
        };

        if (isPlaylist) {
          playerConfig.playerVars.listType = "playlist";
          playerConfig.playerVars.list = videoId;
        } else {
          playerConfig.videoId = videoId;
        }

        if (containerRef.current) {
          // Clear any existing children and append a fresh target element
          containerRef.current.innerHTML = "";
          const childDiv = document.createElement("div");
          childDiv.className = "w-full h-full";
          containerRef.current.appendChild(childDiv);

          playerInstance = new window.YT.Player(childDiv, playerConfig);
          playerRef.current = playerInstance;
        }
      }

      loadYoutubeIframeAPI(() => {
        if (!destroyed) {
          initPlayer();
        }
      });

      return () => {
        destroyed = true;
        if (intervalRef.current) clearInterval(intervalRef.current);
        const player = playerInstance;
        playerInstance = null;
        playerRef.current = null;
        if (player?.destroy) {
          setTimeout(() => {
            try { player.destroy(); } catch { /* ignore */ }
          }, 100);
        }
      };
    }, [videoId, safeOnProgress, safeOnReach25, thresholdExtraSecs, startTime]);

    return (
      <div className="w-full rounded-2xl overflow-hidden border border-black/8 dark:border-white/8 bg-black shadow-lg">
        {/* YouTube player parent wrapper container */}
        <div ref={containerRef} className="relative aspect-video w-full bg-black" />
      </div>
    );
  }
);

export default InlineVideoPlayer;
