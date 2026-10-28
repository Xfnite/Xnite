"use client";

import { useState, useRef, useEffect } from "react";

interface VideoCardProps {
  videoId: string;
  title: string;
  taskTags: string[];
  watchedPercent: number;
  onProgress: (videoId: string, percent: number) => void;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function VideoCard({ videoId, title, taskTags, watchedPercent, onProgress }: VideoCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localPercent, setLocalPercent] = useState(watchedPercent);
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);

  const isWatched = watchedPercent >= 95;

  useEffect(() => {
    setLocalPercent(watchedPercent);
  }, [watchedPercent]);

  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      if (firstScriptTag?.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      }
    }
  }, []);

  const initPlayer = () => {
    if (!window.YT || !window.YT.Player) {
      setTimeout(initPlayer, 100);
      return;
    }
    
    playerRef.current = new window.YT.Player(`youtube-player-${videoId}`, {
      videoId: videoId,
      playerVars: {
        rel: 0,
        modestbranding: 1,
        autoplay: 1,
        playsinline: 1,
      },
      events: {
        onStateChange: (event: any) => {
          if (event.data === window.YT.PlayerState.PLAYING) {
            intervalRef.current = setInterval(() => {
              if (playerRef.current && playerRef.current.getCurrentTime) {
                const currentTime = playerRef.current.getCurrentTime();
                const duration = playerRef.current.getDuration();
                if (duration > 0) {
                  const percent = Math.min(100, Math.floor((currentTime / duration) * 100));
                  if (percent > localPercent) {
                    setLocalPercent((prev) => {
                      const newPercent = Math.max(prev, percent);
                      onProgress(videoId, newPercent);
                      return newPercent;
                    });
                  }
                }
              }
            }, 1000);
          } else {
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (event.data === window.YT.PlayerState.ENDED) {
              setLocalPercent(100);
              onProgress(videoId, 100);
            }
          }
        },
      },
    });
  };

  const openVideo = () => {
    setIsOpen(true);
    setTimeout(initPlayer, 100);
    if (localPercent === 0) {
      setLocalPercent(1);
      onProgress(videoId, 1);
    }
  };

  const closeVideo = () => {
    setIsOpen(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (playerRef.current && playerRef.current.destroy) {
      playerRef.current.destroy();
    }
    playerRef.current = null;
  };

  return (
    <>
      {/* Video Card */}
      <div
        className={`relative rounded-tr-3xl rounded-bl-3xl overflow-hidden border transition-all duration-300 cursor-pointer group backdrop-blur-xl shadow-md
          ${isWatched
            ? "border-[#1F7A1F]/40 bg-[#1F7A1F]/10 dark:bg-[#1F7A1F]/5"
            : localPercent > 0
              ? "border-[#1F7A1F]/30 dark:border-[#55f761]/30 bg-white/60 dark:bg-black/40 hover:border-[#1F7A1F]/50 dark:hover:border-[#55f761]/50 hover:bg-white/80 dark:hover:bg-black/60"
              : "border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/40 hover:border-black/20 dark:hover:border-white/20 hover:bg-white/80 dark:hover:bg-black/60"
          }`}
        onClick={openVideo}
      >
        {/* Progress bar top */}
        <div className="h-1 bg-black/10 dark:bg-white/5 w-full">
          <div
            className="h-full bg-gradient-to-r from-[#1F7A1F] to-[#55f761] transition-all duration-500"
            style={{ width: `${localPercent}%` }}
          />
        </div>

        {/* Thumbnail area */}
        <div className="relative aspect-video bg-black/50 overflow-hidden">
          <img
            src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
            alt={title}
            className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${isWatched ? "opacity-60" : "opacity-70"}`}
          />
          {/* Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          {/* Play / Done icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            {isWatched ? (
              <div className="w-12 h-12 rounded-full bg-[#1F7A1F] dark:bg-[#55f761] flex items-center justify-center shadow-lg shadow-[#1F7A1F]/30 dark:shadow-[#55f761]/30">
                <svg className="w-6 h-6 stroke-white dark:stroke-[#060D14]" fill="none" strokeWidth="3" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full bg-black/5 dark:bg-white/10 backdrop-blur-sm border border-black/10 dark:border-white/20 flex items-center justify-center group-hover:bg-[#55f761] group-hover:border-[#55f761] transition-all duration-200 shadow-lg">
                <svg className="w-5 h-5 ml-1 fill-white" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            )}
          </div>
          {/* Status badge */}
          {isWatched ? (
            <div className="absolute top-2 right-2 bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] text-[10px] font-bold px-2 py-0.5 rounded-full">
              ✓ WATCHED
            </div>
          ) : localPercent > 0 ? (
            <div className="absolute top-2 left-2 bg-[#1F7A1F]/10 dark:bg-[#55f761]/20 border border-[#1F7A1F]/30 dark:border-[#55f761]/40 text-[#1F7A1F] dark:text-[#55f761] text-[10px] font-bold px-2 py-0.5 rounded-full">
              {localPercent}% WATCHED
            </div>
          ) : null}
        </div>

        {/* Info */}
        <div className="p-3">
          <div className="text-sm font-semibold text-[#0D1B2A]/90 dark:text-white/90 mb-2 leading-tight">{title}</div>
          <div className="flex flex-wrap gap-1.5">
            {taskTags.map((tag) => (
              <span
                key={tag}
                className={`text-[10px] font-bold px-2 py-0.5 rounded border
                  ${isWatched
                    ? "bg-[#1F7A1F]/10 dark:bg-[#1F7A1F]/20 text-[#1F7A1F] dark:text-[#55f761] border-[#1F7A1F]/30 dark:border-[#1F7A1F]/40"
                    : "bg-[#1F7A1F]/5 dark:bg-[#55f761]/10 text-[#1F7A1F] dark:text-[#55f761] border-[#1F7A1F]/20 dark:border-[#55f761]/20"
                  }`}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Video Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) closeVideo(); }}
        >
          <div className="relative w-full max-w-3xl bg-[#f9f9f9] dark:bg-[#0D1B2A] rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-black/10 dark:border-white/10">
              <div>
                <div className="text-sm font-bold text-[#0D1B2A] dark:text-white">{title}</div>
                <div className="text-xs text-[#0D1B2A]/60 dark:text-white/50 mt-0.5">
                  {isWatched ? "✓ Complete" : `Watch completely to mark as complete · ${localPercent}% watched`}
                </div>
              </div>
              <button
                onClick={closeVideo}
                className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-[#0D1B2A]/60 dark:text-white/60 hover:text-[#0D1B2A] dark:hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* YouTube embed */}
            <div className="aspect-video w-full">
              <div id={`youtube-player-${videoId}`} className="w-full h-full" />
            </div>
            {/* Progress bar in modal */}
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#0D1B2A]/70 dark:text-white/60">Watch Progress</span>
                <span className="text-xs font-bold text-[#1F7A1F] dark:text-[#55f761]">{localPercent}%</span>
              </div>
              <div className="h-2 bg-black/10 dark:bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#1F7A1F] to-[#55f761] rounded-full transition-all duration-300"
                  style={{ width: `${localPercent}%` }}
                />
              </div>
              {localPercent >= 95 && (
                <div className="mt-3 text-center text-xs text-[#1F7A1F] dark:text-[#55f761] font-semibold">
                  ✓ You've watched enough to complete this video!
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
