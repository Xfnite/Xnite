"use client";

import { useEffect, useState, useRef, useCallback, forwardRef } from "react";
import { useRouter } from "next/navigation";
import { completePreCourseAction, registerWithGingerAction } from "@/app/actions/auth";
import InlineVideoPlayer, { InlineVideoPlayerRef } from "@/components/Onboarding/InlineVideoPlayer";
import { getOptionImageUrl } from "@/lib/optionImages";
import { toast, Toaster } from "sonner";
import { toUserFacingError } from "@/lib/userFacingError";


type QuizProgress = {
  currentIndex: number;
  answers: Record<string, string>;
  videoProgress?: Record<string, number>;
};

type Question = {
  id: string;
  question?: string;
  type?: string;
  options?: string[];
  layout?: string;
  diagrams?: boolean;
  videoId?: string;
  videoDuration?: number;
  requireVideoWatch?: boolean;
  questionImage?: string;
};

const QUESTIONS: Question[] = [
  {
    id: "q1",
    videoId: "QSe5XPccazs",
    videoDuration: 355,
    requireVideoWatch: true
  },
  {
    id: "q1_spacebar",
    type: "info"
  },
  {
    id: "q1_toolbars",
    type: "info"
  },
  {
    id: "q2",
    question: "Do you have PC/Laptop and WIFI?",
    type: "multiple_choice",
    options: [
      "Yes, I have PC/Laptop and WIFI Internet",
      "No, I don't Have"
    ]
  },
  {
    id: "q3",
    question: "How to draw a Square/Box Label?",
    type: "multiple_choice",
    options: ["W - Hand Tool", "E - Parallel Tool", "S - Line Tool", "G - Arc Tool"],
    layout: "grid"
  },
  {
    id: "q4",
    question: "How to draw an Arc or Circle?",
    type: "multiple_choice",
    options: ["W - Hand Tool", "F - Right Angle Line Tool", "S - Line Tool", "G - Arc Tool"],
    layout: "grid",
    videoId: "fGogAw8W0Wo",
    videoDuration: 120
  },
  {
    id: "q5",
    question: "How to Navigate within your Working Area/Map?",
    type: "multiple_choice",
    options: ["W - Hand Tool", "F - Right Angle Line Tool", "S - Line Tool", "Z - Repair Tool"],
    layout: "grid"
  },
  {
    id: "q6",
    question: "How to create a Line?",
    type: "multiple_choice",
    options: ["C - Cavity Tool", "F - Right Angle Line Tool", "S - Draw Tool", "Z - Repair Tool"],
    layout: "grid"
  },
  {
    id: "q7",
    question: "How do you Connect/Complete the Lines/Shapes?",
    type: "multiple_choice",
    options: ["C - Cavity Tool", "F - Right Angle Line Tool", "Shortcut Key 1", "Spacebar"],
    questionImage: "https://utfs.io/f/7QT6x0ZmY23VoCScYtjlbOstcBTmNa7pnEv2GFHPhzuQ9ZCd"
  },
  {
    id: "q8",
    question: "How to add a Point within the Lines of a Label?",
    type: "multiple_choice",
    options: ["C - Cavity Tool", "F - Right Angle Line Tool", "Shortcut Key 1", "Z - Repair Tool"],
    layout: "grid"
  },
  {
    id: "q9",
    question: "To draw a Line is the Shortcut key S or Line Tool, What Tool should i use that makes a Right Angle Line while I draw?",
    type: "multiple_choice",
    options: ["C - Cavity Tool", "F - Right Angle Line Tool", "V - Merge Tool", "Z - Repair Tool"],
    layout: "grid",
    videoId: "QSe5XPccazs",
    videoDuration: 10
  },
  {
    id: "q10",
    question: "How to Select a Label?",
    type: "multiple_choice",
    options: ["C - Cavity Tool", "A - Select Tool", "V - Merge Tool", "Z - Repair Tool"],
    layout: "grid"
  },
  {
    id: "q11",
    question: "How to Delete a Label?",
    type: "multiple_choice",
    options: ["C - Cavity Tool", "B - Delete Tool", "V - Merge Tool", "Z - Repair Tool"],
    layout: "grid"
  },
  {
    id: "q12",
    question: "How to Repair the shape of a Label?",
    type: "multiple_choice",
    options: ["C - Cavity Tool", "X - Right Angle Repair Tool", "V - Merge Tool", "Z - Repair Tool"],
    layout: "grid",
    videoId: "BPFyjtcq6r8",
    videoDuration: 180
  },
  {
    id: "q13",
    question: "How to Cut a Label?",
    type: "multiple_choice",
    options: ["C - Cavity Tool", "T - Split Tool", "V - Merge Tool", "H - Trace Tool"],
    layout: "grid",
    videoId: "iVLHd19arhQ",
    videoDuration: 170
  },
  {
    id: "info_3d",
    question: "Pre-Course Exam 2",
    type: "info"
  },
  {
    id: "info_3d_step1",
    question: "3D Guidelines: Step 1",
    type: "info"
  },
  {
    id: "info_3d_step2",
    question: "3D Guidelines: Step 2",
    type: "info"
  },
  {
    id: "info_3d_step3",
    question: "3D Guidelines: Step 3",
    type: "info"
  },
  {
    id: "info_3d_step4",
    question: "3D Guidelines: Step 4",
    type: "info"
  },
  {
    id: "info_3d_step5",
    question: "3D Guidelines: Step 5",
    type: "info"
  },
  {
    id: "q14",
    question: "Which of the following is a 3D Building?",
    type: "multiple_choice",
    options: ["1", "2", "3", "4"],
    layout: "grid",
    diagrams: true
  },
  {
    id: "q15",
    question: "What Shortcut key to set Vector?",
    type: "multiple_choice",
    options: ["C - Cavity Tool", "3 - Vector Tool", "V - Merge Tool", "H - Trace Tool"],
    layout: "grid"
  }
];

const TUTORIAL_SLIDES = [
  {
    title: "1. 3D Task Overview",
    description: "Welcome to the 3D Task environment! This is an example of what a 3D labeling task looks like when you begin. The goal is to accurately label structures and generate their 3D bounds.",
    images: ["/tutorial/image3.png"]
  },
  {
    title: "2. Labeling the Footprint",
    description: "When labeling a house/building, label the roof based on the house's footprint (ground footprint/outline), NOT by the actual triangular shape of the roof.",
    extraInfo: "Warning: On the lower left part of the image, the region may look like the ground, but it is actually the house's balcony. You must label it too!",
    images: ["/tutorial/image4.png"]
  },
  {
    title: "3. Setting the Vector",
    description: "First, we set the vector for the task. You only need to set 1 vector per task—this will affect all features within that task once it's set.\n\nClick the Vector tool or press '3', click an edge or a sidewall, then trace the angle of the house/building, and click again to set the end point.",
    extraInfo: "Then press Space to set the vector. A confirmation pop-up should appear.",
    images: ["/tutorial/image5.png", "/tutorial/image6.png"]
  },
  {
    title: "4. Selecting the Label",
    description: "Now we need to select the label we drew before we can construct its 3D model properties.",
    images: ["/tutorial/image7.png", "/tutorial/image8.png"]
  },
  {
    title: "5. Generating 3D Lines",
    description: "After selecting the label, HOLD the 'CTRL' key, then DRAG the label to generate 3D lines. Set the height correctly and release the mouse click first, then release the CTRL key.",
    images: ["/tutorial/image9.png", "/tutorial/image10.png"]
  }
];

function Info3DStepContent({ stepIndex }: { stepIndex: number }) {
  const currentSlide = TUTORIAL_SLIDES[stepIndex];
  if (!currentSlide) return null;

  return (
    <div className="space-y-6 text-left">
      {/* Step Header */}
      <div className="rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] shadow-sm">
        <div className="bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] px-6 py-4 text-white dark:text-[#060D14] font-bold text-xl tracking-tight">
          {currentSlide.title}
        </div>
        <div className="p-6 text-sm sm:text-base leading-relaxed text-[#0D1B2A]/80 dark:text-white/80 font-medium whitespace-pre-line">
          {currentSlide.description}
        </div>
      </div>

      {/* Warning/Extra Info */}
      {currentSlide.extraInfo && (
        <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400 text-sm font-semibold flex items-start gap-2.5 shadow-sm">
          <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{currentSlide.extraInfo}</span>
        </div>
      )}

      {/* Images Grid */}
      <div className={`grid gap-4 ${currentSlide.images.length > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
        {currentSlide.images.map((imgSrc, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-black/5 dark:border-white/5 bg-white p-2 flex items-center justify-center overflow-hidden shadow-sm hover:shadow-md transition-all duration-300"
          >
            <img
              src={imgSrc}
              alt={`${currentSlide.title} visual guide ${idx + 1}`}
              className="max-w-full max-h-[380px] object-contain rounded-lg hover:scale-[1.01] transition-transform duration-300"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

const PROGRESS_COOKIE = "pre_course_progress";

function readProgressCookie(): QuizProgress | null {
  if (typeof document === "undefined") return null;

  const match = document.cookie.split("; ").find((entry) => entry.startsWith(`${PROGRESS_COOKIE}=`));
  if (!match) return null;

  try {
    return JSON.parse(decodeURIComponent(match.slice(PROGRESS_COOKIE.length + 1))) as QuizProgress;
  } catch {
    return null;
  }
}

function writeProgressCookie(progress: QuizProgress) {
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);
  document.cookie = `${PROGRESS_COOKIE}=${encodeURIComponent(JSON.stringify(progress))}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
}

function clearProgressCookie() {
  document.cookie = `${PROGRESS_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}



function SpacebarConnectionWarning({
  title = "SPACEBAR TO CONNECT/COMPLETE the LINES/SHAPES",
  timer
}: {
  title?: string;
  timer?: number;
}) {
  return (
    <div className="w-full space-y-4 text-left">
      <div className="text-center font-bold text-sm tracking-wide text-[#0D1B2A]/70 dark:text-white/70 uppercase">
        {title}
      </div>

      <div className="border border-red-500/10 dark:border-red-500/20 bg-red-500/5 p-4 rounded-xl space-y-2">
        <div className="text-red-600 dark:text-red-400 font-extrabold text-xl tracking-tight">
          IMPORTANT!!!!
        </div>
        <p className="text-base sm:text-md leading-relaxed text-[#0D1B2A]/80 dark:text-white/80 font-semibold">
          While using Line Tool(Use Right Angle Line Tool&quot;F Key Tool&quot;), Draw the Lines, and <span className="text-red-600 dark:text-red-400 font-semibold">BEFORE</span> connecting the last point, press directly <span className="text-red-600 dark:text-red-400 font-semibold">&quot;Spacebar&quot;</span> to Complete/Enter the shape of the Roof/Label to avoid errors.
        </p>
      </div>

      <div className="relative rounded-xl border border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] p-2 flex items-center justify-center overflow-hidden">
        <img
          src="https://utfs.io/f/7QT6x0ZmY23VoCScYtjlbOstcBTmNa7pnEv2GFHPhzuQ9ZCd"
          alt="Spacebar Connection Diagram"
          className="max-h-[300px] object-contain rounded-lg shadow-sm"
        />
      </div>

      <div className="text-md  leading-relaxed text-[#0D1B2A]/70 dark:text-white/70 font-medium border-t border-black/5 dark:border-white/5 pt-3">
        For 3D, <span className="text-red-600 dark:text-red-400 font-semibold">Set vector first</span>, then <span className="text-red-600 dark:text-red-400 font-semibold">HOLD CTRL and drag down the label</span> for the <span className="text-orange-500 font-semibold">yellow-dashed lines</span> to appear.
      </div>
    </div>
  );
}

const MasterVideoBlock = forwardRef<InlineVideoPlayerRef, {
  videoId: string;
  watchedPercent: number;
  onProgress: (vidId: string, percent: number) => void;
  onReach25?: () => void;
  onTimeUpdate?: (vidId: string, currentTime: number, duration: number) => void;
  onVideoEnded?: () => void;
  message?: string;
  customLink?: string;
  onPlay?: () => void;
  onPlayingStateChange?: (isPlaying: boolean) => void;
}>(function MasterVideoBlock({
  videoId,
  watchedPercent,
  onProgress,
  onReach25,
  onTimeUpdate,
  onVideoEnded,
  message = "Once you MASTER the basics from the Youtube Video below and you can pass the exam easily!",
  customLink,
  onPlay,
  onPlayingStateChange
}, ref) {
  const linkUrl = customLink || `https://www.youtube.com/watch?v=${videoId}`;
  const displayLink = customLink || `www.youtube.com/watch?v=${videoId}`;

  return (
    <>
      {/* <div className="rounded-2xl p-6 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] text-left space-y-2">
        <p className="text-sm font-semibold text-[#0D1B2A]/80 dark:text-white/80">
          {message}
        </p>
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[#1F7A1F] dark:text-[#55f761] hover:underline block break-all font-medium"
        >
          {displayLink}
        </a>
      </div> */}

      <div className="rounded-2xl p-6 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04]">
        <InlineVideoPlayer
          ref={ref}
          videoId={videoId}
          watchedPercent={watchedPercent}
          onProgress={onProgress}
          onReach25={onReach25}
          onTimeUpdate={onTimeUpdate}
          onVideoEnded={onVideoEnded}
          thresholdExtraSecs={10}
          onPlay={onPlay}
          onPlayingStateChange={onPlayingStateChange}
        />
      </div>
    </>
  );
});

function Info3DExamContent() {
  const imageConcatUrl = "https://utfs.io/f/7QT6x0ZmY23VsGCFkH8NMzAOL5YGXV8T31vq9RgZCy4wEoQa";

  return (
    <div className="space-y-6 text-left">
      {/* Card 1: Congratulations / Header Card */}
      <div className="rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] shadow-sm transition-all duration-300 hover:shadow-md hover:scale-[1.005]">
        <div className="bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] px-6 py-4 text-white dark:text-[#060D14] font-bold text-xl tracking-tight">
          Pre-Course Exam 2
        </div>
        <div className="p-6 text-sm sm:text-base leading-relaxed text-[#0D1B2A]/80 dark:text-white/80 font-medium">
          Congratulations on Finishing Pre-Course Exam 1, Pre-Course Exam 2 will now cover 3D Buildings which consists of 3 Lessons which will take for only 3 minutes. Please answer everything correctly so that you could proceed to the Live Training.
        </div>
      </div>

      {/* Card 2: Visible Sidewall Definition */}
      <div className="rounded-2xl p-6 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] shadow-sm space-y-3 transition-all duration-300 hover:shadow-md hover:scale-[1.005]">
        <p className="text-sm sm:text-base leading-relaxed text-[#0D1B2A]/80 dark:text-white/80 font-medium">
          If you can find a visible Sidewall from a building/house. It is considered as a 3D building and will need to be drawn as 3D.
        </p>
      </div>

      {/* Card 3: Footprint Image Comparison */}
      <div className="rounded-2xl p-6 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] shadow-sm space-y-4 transition-all duration-300 hover:shadow-md hover:scale-[1.005]">
        <p className="text-sm sm:text-base leading-relaxed text-[#0D1B2A]/80 dark:text-white/80 font-medium">
          We only need to draw the house footprint, check the image below for an example:
        </p>
        <div className="rounded-xl border border-black/5 dark:border-white/5 bg-white/80 dark:bg-black/40 p-2 flex items-center justify-center overflow-hidden shadow-inner">
          <img
            src={imageConcatUrl}
            alt="Wrong vs Correct Footprint Example"
            className="max-w-full rounded-lg shadow-sm transition-transform duration-500 hover:scale-[1.02]"
          />
        </div>
      </div>
    </div>
  );
}



function InfoSpacebarContent({ timer }: { timer: number }) {
  return (
    <div className="space-y-6 text-left">
      <div className="rounded-2xl p-6 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] shadow-sm">
        <SpacebarConnectionWarning timer={timer} />
      </div>
    </div>
  );
}

function InfoToolbarsContent({ timer }: { timer: number }) {
  return (
    <div className="space-y-6 text-left">
      <div className="rounded-2xl p-6 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] shadow-sm">
        <div className="w-full space-y-4 text-left">
          <div className="text-center font-bold text-sm tracking-wide text-[#0D1B2A]/70 dark:text-white/70 uppercase">
            Toolbars
          </div>
          <div className="relative rounded-xl border border-black/5 dark:border-white/5 bg-white p-2 flex items-center justify-center overflow-hidden">
            <img
              src="https://utfs.io/f/7QT6x0ZmY23V0pyAbrimdE4pfcWA9okJxG0yOUlXis85ht1n"
              alt="Toolbars Overview"
              className="max-w-full object-contain rounded-lg shadow-md"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helper to format seconds for video countdown ──────────────────────────────
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

// ── Main Page Component ────────────────────────────────────────────────────────
export default function PreCourseFlow() {
  const router = useRouter();
  const isDev = process.env.NEXT_PUBLIC_APP_ENV === "development" || (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_APP_ENV !== "production");
  const [currentIndex, setCurrentIndex] = useState(0);
  const question = QUESTIONS[currentIndex];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [videoProgress, setVideoProgress] = useState<Record<string, number>>({});
  const [completedPages, setCompletedPages] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [showCorrectFeedback, setShowCorrectFeedback] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [autoTimer, setAutoTimer] = useState<number>(10);
  const autoTimerFired = useRef(false);
  const videoPlayerRef = useRef<InlineVideoPlayerRef>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [hasVideoStarted, setHasVideoStarted] = useState(false);
  const [actualDurations, setActualDurations] = useState<Record<string, number>>({});
  const [isRegistering, setIsRegistering] = useState(false);



  const markPageAsCompleted = (pageId: string) => {
    setCompletedPages((prev) => {
      if (prev.includes(pageId)) return prev;
      const updated = [...prev, pageId];
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("completed_pages", JSON.stringify(updated));
        } catch (e) {
          console.error(e);
        }
      }
      return updated;
    });
  };

  const [feedbackTimer, setFeedbackTimer] = useState<number>(0);

  useEffect(() => {
    if (!showCorrectFeedback) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFeedbackTimer(0);
      return;
    }

    if (isDev || completedPages.includes(question.id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFeedbackTimer(0);
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFeedbackTimer(5);

    const interval = setInterval(() => {
      setFeedbackTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [showCorrectFeedback, currentIndex, completedPages, question.id]);

  useEffect(() => {
    if (!isInitialized) return;
    const is10sPage = question?.id === "q1_spacebar" || question?.id === "q1_toolbars";
    const is5sPage = [
      "info_3d",
      "info_3d_step1",
      "info_3d_step2",
      "info_3d_step3",
      "info_3d_step4",
      "info_3d_step5"
    ].includes(question?.id);
    const isAutoPage = is10sPage || is5sPage;
    if (!isAutoPage) return;

    if (completedPages.includes(question.id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAutoTimer(0);
      return;
    }

    // Reset for this page
    const startSecs = isDev ? 0 : (is10sPage ? 10 : 5);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAutoTimer(startSecs);

    const interval = setInterval(() => {
      setAutoTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, isInitialized, completedPages]);

  // ── Video threshold state for "Next" button unlock on video pages
  // -1 = video hasn't reached threshold yet (25% of duration + 10 secs)
  //  0 = threshold reached → shows "Finish Video" but disabled until video = 100%
  const [countdownSecs, setCountdownSecs] = useState<number>(-1);

  // Does the current question have a video?
  const hasVideoOnPage = !!question.videoId;

  // Is the video on the current page fully watched (100%)?
  const isVideoFinished = (hasVideoOnPage && (videoProgress[question.videoId!] ?? 0) >= 98) || (hasVideoOnPage && completedPages.includes(question.id));

  // Is the countdown done (reached 0) but video not yet finished?
  const isCountdownDone = hasVideoOnPage && countdownSecs === 0;

  // Is the Next button in countdown/locked state? (not yet reached 0)
  const isCountdownLocked = hasVideoOnPage && !isVideoFinished && countdownSecs > 0 && (question.id === "q1" || showCorrectFeedback) && !completedPages.includes(question.id);

  // Is the video currently not playing/started?
  const isPlayButtonShown = hasVideoOnPage && !isVideoFinished && !hasVideoStarted && (question.id === "q1" || showCorrectFeedback) && !completedPages.includes(question.id);

  // Threshold reached is no longer used to bypass countdown
  const onVideoThresholdReached = () => { };

  // Reset threshold state when question index changes or when actual duration is loaded
  useEffect(() => {
    if (!isInitialized) return;
    const currentQuestion = QUESTIONS[currentIndex];
    if (!currentQuestion || !currentQuestion.videoId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCountdownSecs(0); // no video, unlocked
      return;
    }
    const vidId = currentQuestion.videoId;
    // Check if the video is already >= 25% (threshold likely already passed)
    const progressPercent = videoProgress[vidId] ?? 0;
    if (isDev || progressPercent >= 25) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCountdownSecs(0);
    } else {
      const duration = actualDurations[vidId] || currentQuestion.videoDuration;
      if (duration) {
        const fullThreshold = Math.floor(duration * 0.25) + 10;
        const watchedSecs = Math.floor((progressPercent / 100) * duration);
        const remaining = Math.max(0, fullThreshold - watchedSecs);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCountdownSecs(remaining);
      } else {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCountdownSecs(-1);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, isInitialized, actualDurations]);

  // If video progress is updated (e.g. scrubbing), immediately unlock if >= 25%
  useEffect(() => {
    if (!isInitialized || !hasVideoOnPage) return;
    const currentQuestion = QUESTIONS[currentIndex];
    if (currentQuestion && currentQuestion.videoId) {
      const progressPercent = videoProgress[currentQuestion.videoId] ?? 0;
      if (progressPercent >= 25) {
        setCountdownSecs(0);
      }
    }
  }, [videoProgress, currentIndex, isInitialized, hasVideoOnPage]);

  // Wall-clock pause-aware countdown timer hook
  useEffect(() => {
    if (!isInitialized || !hasVideoOnPage || countdownSecs <= 0) return;

    // The countdown ticks down only if the video has started and is playing (not paused)
    const shouldTick = hasVideoStarted && isVideoPlaying;
    if (!shouldTick) return;

    const interval = setInterval(() => {
      setCountdownSecs((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isInitialized, hasVideoOnPage, hasVideoStarted, isVideoPlaying, isVideoFinished, countdownSecs]);
  const totalQuestionsCount = QUESTIONS.length;
  const currentQuestionNumber = currentIndex + 1;
  const progress = totalQuestionsCount > 1 ? (currentIndex / (totalQuestionsCount - 1)) * 100 : 0;

  useEffect(() => {
    const saved = readProgressCookie();
    const initialVideoProgress: Record<string, number> = saved?.videoProgress || {};
    // Load watched videos and completed pages from localStorage
    if (typeof window !== "undefined") {
      try {
        const watchedList = JSON.parse(localStorage.getItem("watched_videos") || "[]");
        if (Array.isArray(watchedList)) {
          watchedList.forEach((vidId) => {
            if (typeof vidId === "string") {
              initialVideoProgress[vidId] = 100;
            }
          });
        }
        const completed = JSON.parse(localStorage.getItem("completed_pages") || "[]");
        if (Array.isArray(completed)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setCompletedPages(completed);
        }
      } catch (e) {
        console.error(e);
      }
    }

    if (saved) {
      const safeIndex = Math.min(saved.currentIndex, QUESTIONS.length - 1);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentIndex(safeIndex);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnswers(saved.answers || {});
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVideoProgress(initialVideoProgress);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelected(saved.answers?.[QUESTIONS[safeIndex].id] || "");
    } else {
      setVideoProgress(initialVideoProgress);
      // No progress cookie exists, redirect to welcome screen
      router.replace("/welcome");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsInitialized(true);
  }, [router]);

  useEffect(() => {
    if (document.cookie.includes("pre_course_completed=true")) {
      router.replace("/dashboard");
    }
  }, [router]);

  useEffect(() => {
    if (isInitialized) {
      writeProgressCookie({ currentIndex, answers, videoProgress });
    }
  }, [currentIndex, answers, videoProgress, isInitialized]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(answers[question.id] || "");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError("");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowCorrectFeedback(false);
    setIsVideoPlaying(false);
    setHasVideoStarted(false);
  }, [currentIndex]);

  // Map of question IDs to their correct answer(s)
  const CORRECT_ANSWERS: Record<string, string | string[]> = {
    q3: "E - Parallel Tool",
    q4: "G - Arc Tool",
    q5: "W - Hand Tool",
    q6: "S - Draw Tool",
    q7: "Spacebar",
    q8: "Shortcut Key 1",
    q9: "F - Right Angle Line Tool",
    q10: "A - Select Tool",
    q11: "B - Delete Tool",
    q12: ["X - Right Angle Repair Tool", "Z - Repair Tool"],
    q13: "T - Split Tool",
    q14: "4",
    q15: "3 - Vector Tool",
  };

  const handleSelect = (option: string) => {
    setSelected(option);
    setAnswers((previous) => ({ ...previous, [question.id]: option }));
  };

  const handleAnswerChange = (value: string) => {
    setSelected(value);
    setAnswers((previous) => ({ ...previous, [question.id]: value }));
  };

  const handleVideoProgress = (vidId: string, percent: number) => {
    setVideoProgress((prev) => {
      const updated = { ...prev, [vidId]: Math.max(prev[vidId] || 0, percent) };
      writeProgressCookie({ currentIndex, answers, videoProgress: updated });
      if (percent >= 98 && typeof window !== "undefined") {
        try {
          const watched = JSON.parse(localStorage.getItem("watched_videos") || "[]");
          if (!watched.includes(vidId)) {
            watched.push(vidId);
            localStorage.setItem("watched_videos", JSON.stringify(watched));
          }
        } catch (e) {
          console.error(e);
        }
      }
      return updated;
    });
  };

  const handleVideoTimeUpdate = (vidId: string, currentTime: number, duration: number) => {
    // Wall-clock based countdown is handled via useEffect interval
    if (duration > 0 && !actualDurations[vidId]) {
      setActualDurations((prev) => ({ ...prev, [vidId]: duration }));
    }
  };

  const handleVideoEnded = () => {
    // The video ended event should not override the countdown timer if it's still ticking
    if (question.videoId) {
      const vidId = question.videoId;
      setVideoProgress((prev) => {
        const updated = { ...prev, [vidId]: 100 };
        writeProgressCookie({ currentIndex, answers, videoProgress: updated });
        return updated;
      });
      if (typeof window !== "undefined") {
        try {
          const watched = JSON.parse(localStorage.getItem("watched_videos") || "[]");
          if (!watched.includes(vidId)) {
            watched.push(vidId);
            localStorage.setItem("watched_videos", JSON.stringify(watched));
          }
        } catch (e) {
          console.error(e);
        }
      }
    }
  };

  const handleNext = async () => {
    if (isNextDisabled) {
      if (question.type === "text" && (!selected || !selected.trim())) {
        setError("Please type your answer to continue.");
      } else if (question.requireVideoWatch && currentVideoProgress < 98) {
        setError("Please finish watching the video to continue.");
      } else {
        setError("Please select a valid option to continue.");
      }
      return;
    }

    setError("");

    // If we're on a feedback screen, clear it and advance (or retry)
    if (showCorrectFeedback) {
      setShowCorrectFeedback(false);
      markPageAsCompleted(question.id);
    } else {
      // First click of Next — check the answer
      const correctAnswer = CORRECT_ANSWERS[question.id];
      if (correctAnswer) {
        const isCorrect = Array.isArray(correctAnswer)
          ? correctAnswer.includes(selected)
          : selected === correctAnswer;
        if (isCorrect) {
          setShowCorrectFeedback(true);
        } else {
          // Reset quiz to first question (q1) and clear all selected answers
          setAnswers({});
          setSelected("");
          setCurrentIndex(0); // Redirect back to q1 (index 0)
          toast.error("Incorrect Answer! Quiz reset to Page 1.", {
            description: "Please watch the videos and guidelines carefully.",
            duration: 6000,
          });
        }
        return; // don't advance yet
      }
      markPageAsCompleted(question.id);
    }

    if (currentIndex < QUESTIONS.length - 1) {
      setCurrentIndex((previous) => previous + 1);
      return;
    }

    markPageAsCompleted(question.id);

    try {
      setIsRegistering(true);
      const registerResult = await registerWithGingerAction();
      if (!registerResult.success) {
        setError(registerResult.error ?? "Failed to register accounts");
        setIsRegistering(false);
        return;
      }

      clearProgressCookie();
      const result = await completePreCourseAction();
      if (!result.success) {
        setError(result.error ?? "Failed to save progress");
        setIsRegistering(false);
        return;
      }
      router.push("/dashboard");
    } catch (err) {
      setError(toUserFacingError(err, "Couldn't finish the quiz. Please try again."));
      setIsRegistering(false);
    }
  };

  const handleBack = () => {
    if (showCorrectFeedback) {
      setShowCorrectFeedback(false);
      return;
    }
    if (currentIndex === 0) return;
    setCurrentIndex((previous) => previous - 1);
  };

  const handleReset = () => {
    clearProgressCookie();
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("watched_videos");
        localStorage.removeItem("completed_pages");
      } catch (e) {
        console.error(e);
      }
    }
    setCurrentIndex(0);
    setAnswers({});
    setVideoProgress({});
    setCompletedPages([]);
    setSelected("");
    setError("");
    setShowCorrectFeedback(false);
    writeProgressCookie({ currentIndex: 0, answers: {}, videoProgress: {} });
    window.location.reload();
  };

  const currentVideoProgress = videoProgress[question.videoId || ""] || 0;
  const isVideoComplete = !question.requireVideoWatch || currentVideoProgress >= 98;
  const isDisqualified = question.id === "q2" && selected === "No, I don't Have";

  const isNextDisabled = (() => {
    if (question.id === "q1") {
      return false;
    }
    if (question.type === "info") return false;
    if (!selected) return true;

    // Gating for Question 2: must have PC & WIFI
    if (question.id === "q2" && selected === "No, I don't Have") {
      return true;
    }

    return false;
  })();

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1F7A1F] dark:border-[#55f761]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden">

      {/* FULL SCREEN REGISTRATION LOADER */}
      {isRegistering && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#E0E1DD]/80 dark:bg-[#060D14]/80 backdrop-blur-sm">
          <div className="flex flex-col items-center p-8 bg-white dark:bg-white/5 rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 max-w-sm text-center">
            <div className="w-16 h-16 border-4 border-[#1F7A1F]/30 dark:border-[#55f761]/30 border-t-[#1F7A1F] dark:border-t-[#55f761] rounded-full animate-spin mb-6"></div>
            <h3 className="text-xl font-bold text-[#0D1B2A] dark:text-white mb-2">Creating Your Account</h3>
            <p className="text-sm text-[#2F3E46] dark:text-white/70">
              Setting up your account. Please wait.
            </p>
          </div>
        </div>
      )}

      <div className="relative w-full max-w-4xl rounded-2xl border border-black/8 dark:border-white/8 bg-white/95 dark:bg-[#0D1B2A]/98 backdrop-blur-xl shadow-2xl shadow-black/10 dark:shadow-black/40 p-6 sm:p-8">
        {/* Progress Header */}
        <div className="mb-6 space-y-3">
          <div className="flex items-center justify-between text-xs sm:text-sm uppercase tracking-[0.2em] text-[#0D1B2A]/60 dark:text-white/60">
            <span>Pre-Course Quiz</span>
            <span>Page {currentQuestionNumber} of {totalQuestionsCount}</span>
          </div>
          <div className="h-2 rounded-full bg-black/8 dark:bg-white/8 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-[#1F7A1F] to-[#55f761] transition-all duration-700 shadow-[0_0_8px_rgba(85,247,97,0.3)]" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="space-y-6">
          {showCorrectFeedback ? (
            <>
              {/* Correct Feedback Content */}
              <div className="space-y-4">
                <div className="rounded-2xl overflow-hidden border border-black/8 dark:border-white/8 bg-white/60 dark:bg-white/[0.04]">
                  <div className="bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] px-6 py-4 text-white dark:text-[#060D14] font-bold text-lg flex items-center gap-2">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Correct!
                  </div>
                  <div className="p-6 text-base leading-relaxed text-[#0D1B2A]/80 dark:text-white/80 border-t border-black/5 dark:border-white/5">
                    {question.id === "q3" ? (
                      "To draw a square or box label, you can use E tool/Parallel Tool or the icon the same as below."
                    ) : question.id === "q5" ? (
                      "To Navigate within your work area/map. you can use W Tool/Hand Tool or the icon the same as below."
                    ) : question.id === "q6" ? (
                      "To create a Line, you can use S Tool/Draw Tool. then press Space to finalize its shape."
                    ) : question.id === "q7" ? (
                      "To Connect/Complete The lines/shapes using our Tools, just press SPACEBAR."
                    ) : question.id === "q8" ? (
                      <>
                        To add points, just hover over the Line and press 1, then it add a point.
                        <br />
                        To delete points, hover over the point and press 2.
                      </>
                    ) : question.id === "q9" ? (
                      "F Tool/Right Angle Tool is just the same as Line tool but using a Right Angle so that your drawing would be straight, then don't forget to press Space to finalize its shape."
                    ) : question.id === "q10" ? (
                      "To select a Label, use A Tool/Select Tool. you can also select multiple labels by click-dragging using the Select Tool. its almost the same as you would select multiple icons/files on your PC's Desktop or Libraries."
                    ) : question.id === "q11" ? (
                      "To delete a Label, use Select Tool first, then press B or click the Delete Icon on your Toolbar."
                    ) : question.id === "q12" ? (
                      "You can use either Z or X Tool, but X tool is recommended since it repairs the shape in Right Angle mode. Below is a Video Example on how to use Repair Tool/X Tool."
                    ) : question.id === "q13" ? (
                      "In this video, we used Right Angle Cut Tool which is temporarily disabled at the moment, but it has the same function with T Tool/Split Tool."
                    ) : question.id === "q4" ? (
                      "To draw an Arc or Circle, you can use the G Tool/Arc Tool. Just create 2 points then adjust the Arc's size, when creating a Circle, create 2 points which are very near to each other. Below is a Video Tutorial on how to create a Circle."
                    ) : question.id === "q14" ? (
                      "If you can find a visible Sidewall from a building/house. It is considered as a 3D building and will need to be drawn as 3D."
                    ) : question.id === "q15" ? (
                      <>
                        Vector: Direction Angles of a 3D Building
                        <br />
                        We only need 1 vector per task, it all affect all features within a task once you set it.
                        <br />
                        <br />
                        Click the Vector tool or press &quot;3&quot;, click an edge or a sidewall then trace the angle of the house/building and click again to set the end point.
                      </>
                    ) : (
                      "Correct!"
                    )}
                  </div>
                </div>

                {/* Specific Cards depending on question ID */}
                {question.id === "q3" && (
                  <div className="rounded-2xl p-6 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] flex flex-col items-center justify-center">
                    <div className="w-24 h-24 rounded-xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 flex items-center justify-center p-2">
                      <img
                        src="https://utfs.io/f/7QT6x0ZmY23VQooxePpTMPCV18EiLnU6r3XRpGgqy4OowNcK"
                        alt="Parallel Tool"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  </div>
                )}

                {question.id === "q5" && (
                  <div className="rounded-2xl p-6 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] flex flex-col items-center justify-center">
                    <div className="w-24 h-24 rounded-xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 flex items-center justify-center p-2">
                      <img
                        src="https://utfs.io/f/7QT6x0ZmY23VIJ2sHg332yMRnaWFftzHouSJeqKZGVO4T9xB"
                        alt="Hand Tool"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  </div>
                )}

                {question.id === "q6" && (
                  <div className="rounded-2xl p-6 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] flex flex-col items-center justify-center">
                    <div className="w-24 h-24 rounded-xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 flex items-center justify-center p-2">
                      <img
                        src="https://utfs.io/f/7QT6x0ZmY23V0yy5aVimdE4pfcWA9okJxG0yOUlXis85ht1n"
                        alt="Draw Tool"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  </div>
                )}

                {question.id === "q7" && (
                  <div className="rounded-2xl p-6 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04]">
                    <SpacebarConnectionWarning />
                  </div>
                )}

                {question.id === "q8" && (
                  <div className="rounded-2xl p-6 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04]">
                    <div className="w-full space-y-4 text-left">
                      <div className="text-center font-bold text-sm tracking-wide text-[#0D1B2A]/70 dark:text-white/70 uppercase">
                        Toolbars
                      </div>
                      <div className="rounded-xl border border-black/5 dark:border-white/5 bg-white p-2 flex items-center justify-center overflow-hidden">
                        <img
                          src="https://utfs.io/f/7QT6x0ZmY23V0pyAbrimdE4pfcWA9okJxG0yOUlXis85ht1n"
                          alt="Toolbars Overview"
                          className="max-w-full object-contain rounded-lg shadow-md"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {question.id === "q9" && (
                  <>
                    <MasterVideoBlock
                      ref={videoPlayerRef}
                      videoId="QSe5XPccazs"
                      watchedPercent={videoProgress["QSe5XPccazs"] || 0}
                      onProgress={handleVideoProgress}
                      onReach25={onVideoThresholdReached}
                      onTimeUpdate={handleVideoTimeUpdate}
                      onVideoEnded={handleVideoEnded}
                      onPlay={() => setHasVideoStarted(true)}
                      onPlayingStateChange={setIsVideoPlaying}
                    />
                    <div className="rounded-2xl p-6 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04]">
                      <SpacebarConnectionWarning title="Press Space to complete Shape" />
                    </div>
                  </>
                )}

                {question.id === "q10" && (
                  <div className="rounded-2xl p-6 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] flex flex-col items-center justify-center">
                    <div className="w-24 h-24 rounded-xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 flex items-center justify-center p-2">
                      <img
                        src="https://utfs.io/f/7QT6x0ZmY23VZ6upC2GKDzeYbcy9PEBQ18WjxTaw3h0uL6Gq"
                        alt="Select Tool"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  </div>
                )}

                {question.id === "q11" && (
                  <div className="rounded-2xl p-6 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] flex flex-col items-center justify-center">
                    <div className="w-24 h-24 rounded-xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 flex items-center justify-center p-2">
                      <img
                        src="https://utfs.io/f/7QT6x0ZmY23VEzlxCkJstNK8n29PxOH6bVjFigZJfAYWUTup"
                        alt="Delete Tool"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  </div>
                )}

                {question.id === "q12" && (
                  <MasterVideoBlock
                    ref={videoPlayerRef}
                    videoId="BPFyjtcq6r8"
                    watchedPercent={videoProgress["BPFyjtcq6r8"] || 0}
                    onProgress={handleVideoProgress}
                    onReach25={onVideoThresholdReached}
                    onTimeUpdate={handleVideoTimeUpdate}
                    onVideoEnded={handleVideoEnded}
                    message="Repair Tool/X Tool and Z Tool"
                    customLink="https://youtu.be/BPFyjtcq6r8"
                    onPlay={() => setHasVideoStarted(true)}
                    onPlayingStateChange={setIsVideoPlaying}
                  />
                )}

                {question.id === "q13" && (
                  <>
                    <MasterVideoBlock
                      ref={videoPlayerRef}
                      videoId="iVLHd19arhQ"
                      watchedPercent={videoProgress["iVLHd19arhQ"] || 0}
                      onProgress={handleVideoProgress}
                      onReach25={onVideoThresholdReached}
                      onTimeUpdate={handleVideoTimeUpdate}
                      onVideoEnded={handleVideoEnded}
                      message="Switching Tools. You can switch tools while labeling, example, you can switch from S tool/F tool/G tool/T tool. please watch the video below."
                      customLink="https://youtu.be/iVLHd19arhQ"
                      onPlay={() => setHasVideoStarted(true)}
                      onPlayingStateChange={setIsVideoPlaying}
                    />
                    <div className="rounded-2xl p-6 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] text-left space-y-4">
                      <p className="text-sm font-semibold text-[#0D1B2A]/80 dark:text-white/80">
                        Rectangle Split Tool is temporarily disabled but there is an alternative way to do it.
                      </p>
                      <div className="rounded-xl border border-black/5 dark:border-white/5 bg-white p-2 flex items-center justify-center overflow-hidden">
                        <img
                          src={"https://utfs.io/f/7QT6x0ZmY23VuhGatd4LarsMgJxk7Vm2bZqehoXQYOnW854l"}
                          alt="Rectangle Split Alternative"
                          className="max-w-full object-contain rounded-lg shadow-sm"
                        />
                      </div>
                    </div>
                  </>
                )}

                {question.id === "q4" && (
                  <div className="rounded-2xl p-6 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04]">
                    <div className="w-full space-y-3">
                      <h2 className="text-lg font-semibold tracking-tight text-[#0D1B2A] dark:text-white">How to create a Circle</h2>
                      <InlineVideoPlayer
                        ref={videoPlayerRef}
                        videoId="fGogAw8W0Wo"
                        watchedPercent={videoProgress["fGogAw8W0Wo"] || 0}
                        onProgress={handleVideoProgress}
                        onReach25={onVideoThresholdReached}
                        onTimeUpdate={handleVideoTimeUpdate}
                        onVideoEnded={handleVideoEnded}
                        thresholdExtraSecs={10}
                        onPlay={() => setHasVideoStarted(true)}
                        onPlayingStateChange={setIsVideoPlaying}
                      />
                    </div>
                  </div>
                )}

                {question.id === "q14" && (
                  <div className="rounded-2xl p-6 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] text-left space-y-4">
                    <p className="text-sm font-semibold text-[#0D1B2A]/80 dark:text-white/80">
                      We only need to draw the house footprint, check the image below for an example:
                    </p>
                    <div className="rounded-xl border border-black/5 dark:border-white/5 bg-white p-2 flex items-center justify-center overflow-hidden">
                      <img
                        src={"https://utfs.io/f/7QT6x0ZmY23VsGCFkH8NMzAOL5YGXV8T31vq9RgZCy4wEoQa"}
                        alt="Wrong vs Correct Footprint Example"
                        className="max-w-full object-contain rounded-lg shadow-sm"
                      />
                    </div>
                  </div>
                )}

              </div>

              {/* Action Navigation */}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between pt-4 border-t border-black/5 dark:border-white/5">
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-white/90 dark:bg-[#1B263B]/90 backdrop-blur-md text-[#0D1B2A] dark:text-white font-bold text-sm shadow-xl shadow-black/5 dark:shadow-white/5 active:scale-95 transition-all border border-black/10 dark:border-white/10 cursor-pointer"
                >
                  Back
                </button>
                {isPlayButtonShown ? (
                  <button
                    type="button"
                    onClick={() => {
                      setHasVideoStarted(true);
                      videoPlayerRef.current?.play();
                    }}
                    className="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] font-bold text-sm shadow-xl shadow-[#1F7A1F]/30 dark:shadow-[#55f761]/30 active:scale-95 transition-all border border-[#55f761]/20 cursor-pointer"
                  >
                    Play Video
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" />
                      <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
                    </svg>
                  </button>
                ) : isCountdownLocked ? (
                  <button
                    type="button"
                    disabled
                    className="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] font-bold text-sm shadow-xl shadow-[#1F7A1F]/30 dark:shadow-[#55f761]/30 active:scale-95 transition-all border border-[#55f761]/20 cursor-not-allowed disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next ({formatVideoCountdown(countdownSecs)})
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                ) : isCountdownDone && !isVideoFinished ? (
                  <button
                    type="button"
                    disabled
                    className="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1F7A1F]/40 to-[#2ea82e]/40 dark:from-[#55f761]/30 dark:to-[#3de34a]/30 text-white/60 dark:text-[#060D14]/50 font-bold text-sm shadow-xl border border-[#55f761]/10 cursor-not-allowed transition-all"
                  >
                    Finish Video
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                ) : (feedbackTimer > 0 || (question.type === "info" && autoTimer > 0)) ? (
                  <button
                    type="button"
                    disabled
                    className="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] font-bold text-sm shadow-xl shadow-[#1F7A1F]/30 dark:shadow-[#55f761]/30 active:scale-95 transition-all border border-[#55f761]/20 cursor-not-allowed disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next ({feedbackTimer > 0 ? feedbackTimer : autoTimer}s)
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={isNextDisabled || isRegistering}
                    className="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] font-bold text-sm shadow-xl shadow-[#1F7A1F]/30 dark:shadow-[#55f761]/30 active:scale-95 transition-all border border-[#55f761]/20 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isRegistering ? "Signing Up..." : (currentIndex === QUESTIONS.length - 1 ? "Sign Up" : "Next")}
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              {question.type === "info" ? (
                question.id === "info_3d" ? (
                  <Info3DExamContent />
                ) : question.id === "info_3d_step1" ? (
                  <Info3DStepContent stepIndex={0} />
                ) : question.id === "info_3d_step2" ? (
                  <Info3DStepContent stepIndex={1} />
                ) : question.id === "info_3d_step3" ? (
                  <Info3DStepContent stepIndex={2} />
                ) : question.id === "info_3d_step4" ? (
                  <Info3DStepContent stepIndex={3} />
                ) : question.id === "info_3d_step5" ? (
                  <Info3DStepContent stepIndex={4} />
                ) : question.id === "q1_spacebar" ? (
                  <InfoSpacebarContent timer={autoTimer} />
                ) : question.id === "q1_toolbars" ? (
                  <InfoToolbarsContent timer={autoTimer} />
                ) : null
              ) : (
                <>
                  {/* Question Text */}
                  {question.id !== "q1" && (
                    <div>
                      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{question.question}</h1>
                      <p className="mt-2 text-sm text-[#0D1B2A]/60 dark:text-white/60">
                        {question.type === "text" ? "Type your response to continue your onboarding." : "Choose one answer to continue your onboarding."}
                      </p>
                    </div>
                  )}

                  {/* Question Diagram Image */}
                  {question.questionImage && (
                    <div className="rounded-2xl border border-black/8 dark:border-white/8 bg-white/60 dark:bg-white/[0.04] p-4 flex items-center justify-center shadow-inner overflow-hidden">
                      <img
                        src={question.questionImage}
                        alt="Question diagram"
                        className="max-h-[320px] object-contain rounded-xl"
                      />
                    </div>
                  )}

                  {/* Embedded Video Gating Player */}
                  {question.requireVideoWatch && question.videoId && (
                    <div className="mb-6 space-y-6">
                      <InlineVideoPlayer
                        ref={videoPlayerRef}
                        videoId={question.videoId}
                        watchedPercent={currentVideoProgress}
                        onProgress={handleVideoProgress}
                        onReach25={onVideoThresholdReached}
                        onPlay={() => setHasVideoStarted(true)}
                        onTimeUpdate={handleVideoTimeUpdate}
                        onVideoEnded={handleVideoEnded}
                        thresholdExtraSecs={10}
                        onPlayingStateChange={setIsVideoPlaying}
                      />
                    </div>
                  )}
                </>
              )}

              {/* Options Display */}
              {isDisqualified ? (
                <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/25 flex items-center justify-center text-red-500 mb-2">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <p className="text-base font-semibold text-[#0D1B2A] dark:text-white max-w-md leading-relaxed">
                    Thank you for your interest, but you aren&apos;t qualified to continue, have a good day.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleSelect("")}
                    className="mt-4 rounded-xl border border-black/10 dark:border-white/10 px-5 py-2.5 text-sm font-bold text-[#0D1B2A]/70 dark:text-white/70 active:scale-95 transition-all cursor-pointer"
                  >
                    Go Back
                  </button>
                </div>
              ) : (
                <>
                  {question.type !== "info" && question.id !== "q1" && (
                    <>
                      {question.type === "text" ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={selected}
                            onChange={(e) => handleAnswerChange(e.target.value)}
                            placeholder="Type your response here..."
                            className="w-full rounded-xl border border-black/8 dark:border-white/8 bg-white/60 dark:bg-white/[0.04] px-5 py-4 text-sm font-medium text-[#0D1B2A] dark:text-white placeholder-black/35 dark:placeholder-white/30 outline-none focus:border-[#1F7A1F] dark:focus:border-[#55f761] focus:ring-1 focus:ring-[#1F7A1F]/20 dark:focus:ring-[#55f761]/20 transition-all"
                          />
                        </div>
                      ) : question.layout === "grid" ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {question.options?.map((option) => {
                            const active = selected === option;
                            return (
                              <button
                                key={option}
                                type="button"
                                onClick={() => handleSelect(option)}
                                className={`w-full flex flex-col items-center rounded-xl border p-4 text-center transition-all duration-200 hover:scale-[1.02] cursor-pointer ${active
                                  ? "border-[#1F7A1F] dark:border-[#55f761] bg-[#1F7A1F]/8 dark:bg-[#55f761]/8 shadow-lg shadow-[#1F7A1F]/10 dark:shadow-[#55f761]/10 ring-1 ring-[#1F7A1F]/20 dark:ring-[#55f761]/20"
                                  : "border-black/8 dark:border-white/8 bg-white/60 dark:bg-white/[0.04] text-[#0D1B2A]/80 dark:text-white/80 hover:border-black/15 dark:hover:border-white/15 hover:bg-white/80 dark:hover:bg-white/[0.06]"
                                  }`}
                              >
                                {/* Centered SVG or Mapped Image Box */}
                                <div className={`mb-4 rounded-xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 flex items-center justify-center shadow-sm overflow-hidden p-2 ${question.diagrams ? "w-full h-40 sm:h-52" : "w-24 h-24"
                                  }`}>
                                  {(() => {
                                    const lookupKey = question.diagrams ? `3d_building_${option}` : option;
                                    const imageUrl = getOptionImageUrl(lookupKey, question.id);
                                    if (imageUrl) {
                                      return (
                                        <img
                                          src={imageUrl}
                                          alt={option}
                                          className="max-w-full max-h-full object-contain"
                                        />
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>


                                {/* Radio Button & Label */}
                                <div className="flex items-center gap-2">
                                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${active ? "border-[#1F7A1F] dark:border-[#55f761]" : "border-black/20 dark:border-white/20"}`}>
                                    {active && <div className="w-2 h-2 rounded-full bg-[#1F7A1F] dark:bg-[#55f761]" />}
                                  </div>
                                  <span className="text-sm font-semibold truncate max-w-[200px]">{option}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="grid gap-3">
                          {question.options?.map((option) => {
                            const active = selected === option;
                            return (
                              <button
                                key={option}
                                type="button"
                                onClick={() => handleSelect(option)}
                                className={`w-full rounded-xl border px-5 py-4 text-left transition-all duration-200 hover:scale-[1.01] cursor-pointer ${active
                                  ? "border-[#1F7A1F] dark:border-[#55f761] bg-[#1F7A1F]/8 dark:bg-[#55f761]/8 text-[#1F7A1F] dark:text-[#55f761] shadow-lg shadow-[#1F7A1F]/10 dark:shadow-[#55f761]/10"
                                  : "border-black/8 dark:border-white/8 bg-white/60 dark:bg-white/[0.04] text-[#0D1B2A]/80 dark:text-white/80 hover:border-black/15 dark:hover:border-white/15 hover:bg-white/80 dark:hover:bg-white/[0.06]"
                                  }`}
                              >
                                <span className="block text-sm font-semibold">{option}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}

                  {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

                  {/* Action Navigation */}
                  {!["q1_spacebar", "q1_toolbars", "info_3d", "info_3d_step1", "info_3d_step2", "info_3d_step3", "info_3d_step4", "info_3d_step5"].includes(question.id) ? (
                    <div className={`flex flex-col-reverse gap-3 sm:flex-row pt-4 border-t border-black/5 dark:border-white/5 ${currentIndex > 0 ? "sm:justify-between" : "sm:justify-end"}`}>
                      {currentIndex > 0 && (
                        <button
                          type="button"
                          onClick={handleBack}
                          className="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-white/90 dark:bg-[#1B263B]/90 backdrop-blur-md text-[#0D1B2A] dark:text-white font-bold text-sm shadow-xl shadow-black/5 dark:shadow-white/5 active:scale-95 transition-all border border-black/10 dark:border-white/10 cursor-pointer"
                        >
                          Back
                        </button>
                      )}
                      {isPlayButtonShown ? (
                        <button
                          type="button"
                          onClick={() => {
                            setHasVideoStarted(true);
                            videoPlayerRef.current?.play();
                          }}
                          className="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] font-bold text-sm shadow-xl shadow-[#1F7A1F]/30 dark:shadow-[#55f761]/30 active:scale-95 transition-all border border-[#55f761]/20 cursor-pointer"
                        >
                          Play Video
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" />
                            <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
                          </svg>
                        </button>
                      ) : isCountdownLocked ? (
                        <button
                          type="button"
                          disabled
                          className="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] font-bold text-sm shadow-xl shadow-[#1F7A1F]/30 dark:shadow-[#55f761]/30 active:scale-95 transition-all border border-[#55f761]/20 cursor-not-allowed disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Next ({formatVideoCountdown(countdownSecs)})
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                        </button>
                      ) : question.id === "q1" && isCountdownDone && !isVideoFinished ? (
                        <button
                          type="button"
                          disabled
                          className="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1F7A1F]/40 to-[#2ea82e]/40 dark:from-[#55f761]/30 dark:to-[#3de34a]/30 text-white/60 dark:text-[#060D14]/50 font-bold text-sm shadow-xl border border-[#55f761]/10 cursor-not-allowed transition-all"
                        >
                          Finish Video
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleNext}
                          disabled={isNextDisabled}
                          className="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] font-bold text-sm shadow-xl shadow-[#1F7A1F]/30 dark:shadow-[#55f761]/30 active:scale-95 transition-all border border-[#55f761]/20 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {currentIndex === QUESTIONS.length - 1 ? "Finish Quiz" : "Next"}
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between pt-4 border-t border-black/5 dark:border-white/5">
                      <button
                        type="button"
                        onClick={handleBack}
                        className="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-white/90 dark:bg-[#1B263B]/90 backdrop-blur-md text-[#0D1B2A] dark:text-white font-bold text-sm shadow-xl shadow-black/5 dark:shadow-white/5 active:scale-95 transition-all border border-black/10 dark:border-white/10 cursor-pointer"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={handleNext}
                        disabled={autoTimer > 0}
                        className="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] font-bold text-sm shadow-xl shadow-[#1F7A1F]/30 dark:shadow-[#55f761]/30 active:scale-95 transition-all border border-[#55f761]/20 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {autoTimer > 0 ? `Next (${autoTimer}s)` : "Next"}
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}


        </div>
      </div>
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}