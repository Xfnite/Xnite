"use client";

import { useState, useEffect, useRef } from "react";
import InlineVideoPlayer from "@/components/Onboarding/InlineVideoPlayer";
import { getLandCoverProgressAction, saveLandCoverProgressAction } from "@/app/actions/project";

interface LandCoverTrainingModalProps {
  isOpen: boolean;
  training: any;
  onClose: () => void;
  onComplete: () => void;
}

export const LAND_COVER_VIDEOS = [
  { id: "vwsnCSH38OE", title: "A 1" },
  { id: "2WqC7TAbXks", title: "A 2 Landcover Common tools introduction" },
  { id: "L8Z8l2ofa-4", title: "A 3 Landcover How to draw Overpass" },
  { id: "Y834cDV7oCg", title: "A 4 Landcover How to connect to neighbour" },
  { id: "ceUfIfOLdmQ", title: "A 5 Landcover How to fix common topology error" },
  { id: "loBO5goh8O0", title: "LAND COVER TRAINING TASK 1 - 3 TUTORIAL" },
  { id: "jJN67ghsbhk", title: "LAND COVER TRAINING TASK 4 - 7 TUTORIAL" },
  { id: "z1-h4IQAreI", title: "LAND COVER TRAINING TASK 8 - 14 TUTORIAL" },
  { id: "lL8RF1PSpAM", title: "LAND COVER TRAINING TASK 15 18 TUTORIAL" },
  { id: "36IgagzQfgU", title: "LAND COVER QUICK NATURE PROJECT FILTER SIDE" },
  { id: "7IUc_QWswls", title: "DRIVEWAYS & PARKINGS TUTORIAL" },
  { id: "Fa8xy8kxdBw", title: "LAND COVER MAN MADE STAGE 2 TUTORIAL" },
];

function formatVideoCountdown(secs: number): string {
  if (secs < 0) return "...";
  if (secs === 0) return "0secs";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m > 0) {
    return s > 0 ? `${m}min ${s}secs` : `${m}min`;
  }
  return `${s}secs`;
}

export function LandCoverTrainingModal({ isOpen, training, onClose, onComplete }: LandCoverTrainingModalProps) {
  const [courseStep, setCourseStep] = useState(1);
  const [videoProgress, setVideoProgress] = useState<Record<string, number>>({});
  const [videoUnlockStatus, setVideoUnlockStatus] = useState<Record<string, boolean>>({});
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const isDev = process.env.NEXT_PUBLIC_APP_ENV === "development" || (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_APP_ENV !== "production");

  const playerRef = useRef<any>(null);

  const accumulatedWatchTimeRef = useRef<Record<string, number>>({});
  const hasReachedEndRef = useRef<Record<string, boolean>>({});
  const lastUpdateRef = useRef<Record<string, number>>({});

  const saveProgress = async (step: number, unlockStatus: Record<string, boolean>, syncToDb = false) => {
    const progressObj = { courseStep: step, videoUnlockStatus: unlockStatus };
    localStorage.setItem("landcover_training_progress", JSON.stringify(progressObj));
    try {
      await saveLandCoverProgressAction(progressObj, syncToDb);
    } catch (err) {
      console.error("Failed to save landcover progress to server:", err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      // 1. Try loading from localStorage first
      const localData = localStorage.getItem("landcover_training_progress");
      let initialStep = 1;
      let initialUnlockStatus: Record<string, boolean> = {};

      if (localData) {
        try {
          const parsed = JSON.parse(localData);
          if (parsed.courseStep) initialStep = parsed.courseStep;
          if (parsed.videoUnlockStatus) initialUnlockStatus = parsed.videoUnlockStatus;
        } catch (e) {
          console.error("Failed to parse local landcover progress:", e);
        }
      }

      setCourseStep(initialStep);
      setVideoUnlockStatus(initialUnlockStatus);
      setTimeRemaining(null);

      // 2. Fetch from database/Redis and sync
      const fetchAndSync = async () => {
        try {
          const serverProgress = await getLandCoverProgressAction();
          if (serverProgress) {
            setCourseStep(serverProgress.courseStep);
            setVideoUnlockStatus(serverProgress.videoUnlockStatus);
            localStorage.setItem("landcover_training_progress", JSON.stringify(serverProgress));
          } else if (localData) {
            // If server has no progress but local has, sync local to server
            const parsed = JSON.parse(localData);
            await saveLandCoverProgressAction(parsed, true);
          }
        } catch (err) {
          console.error("Failed to sync progress with server:", err);
        }
      };

      fetchAndSync();
    }
  }, [isOpen]);

  useEffect(() => {
    setTimeRemaining(null);
  }, [courseStep]);

  if (!isOpen || !training) return null;

  const currentVideoIndex = courseStep - 1;
  const currentVideo = LAND_COVER_VIDEOS[currentVideoIndex];
  
  const handleProgress = (videoId: string, percent: number) => {
    setVideoProgress(prev => {
      const existing = prev[videoId] || 0;
      return { ...prev, [videoId]: Math.max(existing, percent) };
    });
  };

  const handleNext = () => {
    if (courseStep < LAND_COVER_VIDEOS.length) {
      const nextStep = courseStep + 1;
      setCourseStep(nextStep);
      saveProgress(nextStep, videoUnlockStatus, true);
    } else {
      // Clean up progress on complete
      localStorage.removeItem("landcover_training_progress");
      saveLandCoverProgressAction({ courseStep: 1, videoUnlockStatus: {} }, true);
      onComplete();
    }
  };

  const handleTimeUpdate = (videoId: string, currentTime: number, duration: number) => {
    if (videoUnlockStatus[videoId]) {
      setTimeRemaining(0);
      return;
    }
    
    // If they scrub backwards from the end, reset the hasReachedEnd status
    if (duration > 0 && duration - currentTime > 2.5) {
      hasReachedEndRef.current[videoId] = false;
    }
    
    // Cap requiredTime at the actual duration of the video so users don't get stuck on short videos
    const calculatedRequired = isDev ? 10 : (duration * 0.25) + 10;
    const requiredTime = Math.min(duration, calculatedRequired);
    const now = Date.now();
    const last = lastUpdateRef.current[videoId] || 0;
    
    let nextAcc = accumulatedWatchTimeRef.current[videoId] || 0;
    
    // Only increment if at least 800ms has passed since the last increment
    if (now - last >= 800) {
      lastUpdateRef.current[videoId] = now;
      nextAcc += 1;
      accumulatedWatchTimeRef.current[videoId] = nextAcc;
    }

    const remaining = Math.max(0, Math.ceil(requiredTime - nextAcc));
    setTimeRemaining(remaining);

    // Only unlock if both countdown finished AND they are currently at the end
    if (remaining === 0 && hasReachedEndRef.current[videoId]) {
      setVideoUnlockStatus(prev => {
        const next = { ...prev, [videoId]: true };
        saveProgress(courseStep, next, true);
        return next;
      });
    }
  };

  const handleVideoEnded = () => {
    hasReachedEndRef.current[currentVideo.id] = true;
    const currentAcc = accumulatedWatchTimeRef.current[currentVideo.id] || 0;
    
    // If the video has not played at all, do not unlock (prevents immediate-scrub bypass)
    if (timeRemaining === null) {
      return;
    }

    // Unlock if the countdown is finished or within a 2-second threshold of finishing
    // (prevents getting stuck due to 1-second rounding/tick mismatches at the end of the video)
    if (timeRemaining <= 2 || currentAcc >= (currentAcc + timeRemaining)) {
      setVideoUnlockStatus(prev => {
        const next = { ...prev, [currentVideo.id]: true };
        saveProgress(courseStep, next, true);
        return next;
      });
      setTimeRemaining(0);
    }
  };

  const canProceed = !!videoUnlockStatus[currentVideo.id];

  return (
    <div className="fixed inset-y-0 right-0 left-0 md:left-[240px] z-[10010] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#060D14] rounded-2xl w-full max-w-4xl max-h-[95vh] shadow-2xl border border-black/10 dark:border-white/10 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex justify-between items-center bg-[#E0E1DD]/30 dark:bg-[#0D1B2A]/30 flex-shrink-0">
          <div>
            <h3 className="text-lg font-bold text-[#0D1B2A] dark:text-white">
              Land Cover Training
            </h3>
            <p className="text-sm text-[#2F3E46] dark:text-white/60">
              {training.annotate_sub_project_name || training.annotate_name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 dark:bg-gray-800 h-1.5 flex-shrink-0">
          <div
            className="bg-[#1F7A1F] dark:bg-[#55f761] h-1.5 transition-all duration-300 ease-in-out"
            style={{ width: `${(courseStep / LAND_COVER_VIDEOS.length) * 100}%` }}
          ></div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
            <h4 className="font-semibold text-lg text-[#0D1B2A] dark:text-white">
              Step {courseStep}: {currentVideo.title}
            </h4>
            <p className="text-sm text-[#2F3E46] dark:text-white/70">
              Please watch the instructional video carefully before proceeding to the next step.
            </p>
            <div className="aspect-video w-full rounded-xl overflow-hidden bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 relative">
              <InlineVideoPlayer
                ref={playerRef}
                videoId={currentVideo.id}
                watchedPercent={videoProgress[currentVideo.id] || 0}
                onProgress={handleProgress}
                onTimeUpdate={handleTimeUpdate}
                onVideoEnded={handleVideoEnded}
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-black/10 dark:border-white/10 bg-[#E0E1DD]/30 dark:bg-[#0D1B2A]/30 flex justify-between items-center flex-shrink-0">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-[#2F3E46] dark:text-white/50 uppercase tracking-wider">
              Video {courseStep} of {LAND_COVER_VIDEOS.length}
            </span>
          </div>
          <div className="flex gap-3">
            {courseStep > 1 && (
              <button
                onClick={() => setCourseStep(s => s - 1)}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-black/5 dark:bg-white/5 text-[#0D1B2A] dark:text-white hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                Back
              </button>
            )}

            {courseStep < LAND_COVER_VIDEOS.length ? (
              <button
                onClick={timeRemaining === null ? () => playerRef.current?.play() : handleNext}
                disabled={!canProceed && timeRemaining !== null}
                className={`px-6 py-2 text-sm font-bold rounded-lg flex items-center gap-2 transition-all bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] shadow-md shadow-[#1F7A1F]/30 dark:shadow-[#55f761]/30 border border-[#55f761]/20 ${
                  canProceed || timeRemaining === null
                    ? "cursor-pointer active:scale-95 hover:opacity-90" 
                    : "opacity-40 cursor-not-allowed"
                }`}
              >
                {!canProceed ? (
                  timeRemaining === null ? "Play Video" : 
                  timeRemaining > 0 ? `Next Video (${formatVideoCountdown(timeRemaining)})` : 
                  "Finish Video"
                ) : "Next Video"}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </button>
            ) : (
              <button
                onClick={timeRemaining === null ? () => playerRef.current?.play() : handleNext}
                disabled={!canProceed && timeRemaining !== null}
                className={`px-6 py-2 text-sm font-bold rounded-lg flex items-center gap-2 transition-all bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] shadow-md shadow-[#1F7A1F]/30 dark:shadow-[#55f761]/30 border border-[#55f761]/20 ${
                  canProceed || timeRemaining === null
                    ? "cursor-pointer active:scale-95 hover:opacity-90" 
                    : "opacity-40 cursor-not-allowed"
                }`}
              >
                {!canProceed ? (
                  timeRemaining === null ? "Play Video" : 
                  timeRemaining > 0 ? `Start Training (${formatVideoCountdown(timeRemaining)})` : 
                  "Finish Video"
                ) : "Start Training"}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
