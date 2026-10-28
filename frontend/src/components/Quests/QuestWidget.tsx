import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Scroll, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import QuestList from "./QuestList";
import { useQuests } from "./DailyQuest/useQuests";
import XPFloat from "./DailyQuest/XPFloat";
import { useFloatingPanelSlot } from "@/lib/useFloatingPanelSlot";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

function getSessionIat(): number | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )xnite_session=([^;]+)/);
  if (!match) return null;
  try {
    const payload = JSON.parse(atob(match[1].split(".")[1]));
    return typeof payload.iat === "number" ? payload.iat : null;
  } catch {
    return null;
  }
}

interface QuestWidgetProps {
  currentUser: {
    email?: string;
    role?: string;
    name?: string;
    groupId?: number | null;
  };
  isRegistered: boolean;
  isStandardBuildingPassed: boolean;
  isDashboardCompleted: boolean;
  isRulesAndGuidelinesCompleted: boolean;
  hasClickedLandCoverTraining: boolean;
  hasClickedTransportationTraining: boolean;
  onboardingProgress: any;
}

export default function QuestWidget({
  currentUser,
  isRegistered,
  isStandardBuildingPassed,
  isDashboardCompleted,
  isRulesAndGuidelinesCompleted,
  hasClickedLandCoverTraining,
  hasClickedTransportationTraining,
  onboardingProgress,
}: QuestWidgetProps) {
  const router = useRouter();
  const sessionIat = getSessionIat();
  const storageKey = `quest_widget_open_${currentUser?.email ?? "guest"}_${sessionIat ?? "none"}`;
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = window.sessionStorage.getItem(storageKey);
    return stored === null ? true : stored === "true";
  });

  const {
    localDailyQuests,
    expandedQuestId,
    floatingXPs,
    toggleQuest,
    handleCompletedClick,
  } = useQuests();

  // Persist open/minimized state within this tab session (survives refresh),
  // but sessionStorage clears when the tab closes, so reopening the site —
  // or logging in fresh with a new session iat — defaults back to open.
  useEffect(() => {
    window.sessionStorage.setItem(storageKey, String(isOpen));
  }, [isOpen, storageKey]);

  // Closing plays the .quest-panel-closing animation (globals.css) before the
  // panel unmounts; opening plays the same animation reversed (.quest-panel-opening).
  // Must match that animation's duration.
  const CLOSE_ANIMATION_MS = 750;
  const [isClosing, setIsClosing] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  // Bumped on every user-initiated open so the panel remounts and the open
  // animation restarts cleanly, even when reopening mid-close.
  const [openAnimKey, setOpenAnimKey] = useState(0);
  const closeTimerRef = useRef<number | null>(null);
  const openTimerRef = useRef<number | null>(null);

  const closePanel = useCallback(() => {
    if (closeTimerRef.current !== null) return; // already closing
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    setIsOpening(false);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setIsOpen(false);
      return;
    }
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setIsClosing(false);
      setIsOpen(false);
    }, CLOSE_ANIMATION_MS);
  }, []);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
  }, []);

  // Sits beside the DJ Booth panel (to its left) when that one was opened first.
  const { isLeft } = useFloatingPanelSlot("quest", isOpen);

  // Spotlight the widget once per fresh session (login or reopened tab only) —
  // gated on the same storageKey so refreshes and re-minimizing never retrigger it.
  // Only marked "shown" once driver.js actually confirms the element was highlighted,
  // so a race against the DOM/cookie not being ready yet doesn't burn the one-shot flag.
  useEffect(() => {
    if (!isOpen || isOpening || !sessionIat) return;
    const spotlightKey = `quest_widget_spotlight_shown_${storageKey}`;
    if (window.sessionStorage.getItem(spotlightKey)) return;

    let cancelled = false;
    let driverObj: ReturnType<typeof driver> | null = null;
    let styleEl: HTMLStyleElement | null = null;
    let panelObserver: ResizeObserver | null = null;

    const pollId = window.setInterval(() => {
      if (cancelled) return;
      const target = document.getElementById("quest-widget-panel");
      if (!target) return;
      window.clearInterval(pollId);

      styleEl = document.createElement("style");
      styleEl.textContent = `
        .driverjs-theme-quest {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
          width: 1px !important;
          min-width: 1px !important;
          height: 1px !important;
        }
        .driverjs-theme-quest .driver-popover-title,
        .driverjs-theme-quest .driver-popover-description,
        .driverjs-theme-quest .driver-popover-footer,
        .driverjs-theme-quest .driver-popover-arrow,
        .driverjs-theme-quest .driver-popover-close-btn {
          display: none !important;
        }
        #quest-widget-arrow {
          position: fixed;
          z-index: 2000000000;
          pointer-events: none;
          filter: drop-shadow(0 0 8px #55f761);
          animation: quest-arrow-poke 1s ease-in-out infinite;
        }
        @keyframes quest-arrow-poke {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(-14px); }
        }
      `;
      document.head.appendChild(styleEl);

      const arrowEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      arrowEl.id = "quest-widget-arrow";
      arrowEl.setAttribute("width", "96");
      arrowEl.setAttribute("height", "42");
      arrowEl.setAttribute("viewBox", "0 0 96 42");
      arrowEl.innerHTML = `
        <line x1="3" y1="21" x2="66" y2="21" stroke="#55f761" stroke-width="9" stroke-linecap="round" />
        <path d="M54 1.5 L93 21 L54 40.5 Z" fill="#55f761" />
      `;

      const positionArrow = () => {
        const target = document.getElementById("quest-widget-panel");
        if (!target) return;
        const rect = target.getBoundingClientRect();
        arrowEl.style.top = `${rect.top + rect.height / 2 - 21 - 90}px`;
        arrowEl.style.left = `${rect.left - 110}px`;
      };

      document.body.appendChild(arrowEl);
      positionArrow();
      window.addEventListener("resize", positionArrow);
      window.addEventListener("scroll", positionArrow, true);

      driverObj = driver({
        showProgress: false,
        animate: true,
        allowClose: true,
        allowKeyboardControl: true,
        showButtons: [],
        popoverClass: "driverjs-theme-quest",
        // Hug the panel's own bounds and corner radius (rounded-3xl = 24px, plus
        // the 4px padding = 28px concentric) rather than driver.js's looser 10px
        // default, so the cutout reads as the widget itself.
        stagePadding: 4,
        stageRadius: 28,
        onHighlighted: () => {
          window.sessionStorage.setItem(spotlightKey, "true");
        },
        onDestroyed: () => {
          window.removeEventListener("resize", positionArrow);
          window.removeEventListener("scroll", positionArrow, true);
          panelObserver?.disconnect();
          arrowEl.remove();
        },
        steps: [
          {
            element: "#quest-widget-panel",
            popover: {
              side: "left",
              align: "start",
            },
          },
        ],
      });

      driverObj.drive();

      // The rect driver.js measured at drive() time goes stale if the panel
      // resizes (e.g. narrow viewports clamp its width), leaving the cutout
      // misaligned. Re-measure on every size change so the focus keeps
      // matching the panel's full bounds.
      panelObserver = new ResizeObserver(() => {
        driverObj?.refresh();
        positionArrow();
      });
      panelObserver.observe(target);
    }, 100);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      panelObserver?.disconnect();
      driverObj?.destroy();
      styleEl?.remove();
    };
  }, [isOpen, isOpening, storageKey, sessionIat]);

  const handleOpen = () => {
    // Reopening mid-close cancels the pending unmount
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsClosing(false);
    setIsOpen(true);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
      setOpenAnimKey((k) => k + 1);
      setIsOpening(true);
      openTimerRef.current = window.setTimeout(() => {
        openTimerRef.current = null;
        setIsOpening(false);
      }, CLOSE_ANIMATION_MS);
    }
  };

  const handleToggle = () => {
    if (isOpen && !isClosing) closePanel();
    else handleOpen();
  };

  const onQuestClick = (link: string) => {
    router.push(link);
    closePanel();
  };

  return (
    <>
      {/* Floating Action Button Capsule — always visible so it can toggle the panel */}
      {(
        <div className="fixed bottom-[150px] right-6 z-[70] flex items-center rounded-full p-[2px] shadow-[0_0_16px_rgba(31,122,31,0.4)] dark:shadow-[0_0_16px_rgba(85,247,97,0.4)] hover:shadow-[0_0_22px_rgba(31,122,31,0.6)] dark:hover:shadow-[0_0_22px_rgba(85,247,97,0.6)] transition-shadow animate-in slide-in-from-bottom-5 group font-sans overflow-hidden">
          {/* Rotating light/dark green conic border */}
          <div className="absolute inset-[-50%] animate-spin [animation-duration:3s] bg-[conic-gradient(from_0deg,#1F7A1F_0%,#55f761_25%,#a8f5b0_50%,#55f761_75%,#1F7A1F_100%)]" />

          <div className="relative flex items-center bg-white/90 dark:bg-[#060D14]/70 backdrop-blur-md rounded-full p-1.5">
            <button
              onClick={handleToggle}
              aria-label={isOpen ? "Close quest log" : "Open quest log"}
              aria-expanded={isOpen}
              key={openAnimKey}
              className={cn(isClosing && "quest-fab-absorbing", isOpening && "quest-fab-emitting","bg-[#1F7A1F] dark:bg-[#55f761] hover:brightness-110 text-white dark:text-[#060D14] p-2.5 rounded-full transition-transform hover:scale-105 active:scale-95 flex items-center justify-center shrink-0")}
            >
              <Scroll className="w-4 h-4 animate-pulse" />
            </button>
            {/* Hover label expands leftward, so suppress it while the panel sits there */}
            <div
              className={cn(
                "cursor-pointer select-none flex flex-col justify-center max-w-0 opacity-0 overflow-hidden whitespace-nowrap transition-all duration-500",
                !isOpen && "group-hover:max-w-[300px] group-hover:opacity-100 group-hover:ml-3 group-hover:pr-4"
              )}
              onClick={handleOpen}
            >
              <p className="text-[10px] font-bold text-[#1F7A1F] dark:text-[#55f761] uppercase tracking-widest drop-shadow-[0_0_5px_rgba(85,247,97,0.6)]">Quest</p>
              <p className="text-xs text-slate-800 dark:text-white font-medium">
                View active quests and progress
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quest Log Panel */}
      {isOpen && (
        <div
          key={openAnimKey}
          id="quest-widget-panel"
          className={cn(
            // When the DJ Booth was opened first it keeps right-[92px]; this panel
            // moves to its left on screens wide enough to fit both side by side.
            isLeft && "lg:right-[508px] quest-panel-beside",
            // Same footprint as the DJ Booth panel (bottom-[90px], 400×550).
            "fixed z-[60] bottom-[90px] right-[92px] w-[400px] max-w-[calc(100vw-108px)] h-[550px] rounded-3xl p-[2.5px] overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] font-sans shadow-[0_8px_32px_rgba(0,0,0,0.12),0_0_12px_rgba(31,122,31,0.25)] dark:shadow-[0_8px_35px_rgba(0,0,0,0.5),0_0_12px_rgba(85,247,97,0.25)]",
            isClosing && "quest-panel-closing",
            isOpening && "quest-panel-opening"
          )}
        >
          {/* Rotating light/dark green comet border — one bright head, one dark tail, so the spin reads clearly */}
          <div className="absolute inset-[-100%] animate-spin [animation-duration:2.5s] bg-[conic-gradient(from_0deg,#c3ffc8_0%,#55f761_8%,#1F7A1F_25%,#0d3d0d_50%,#0d3d0d_75%,#1F7A1F_92%,#c3ffc8_100%)]" />

          {/* Inner Card Container */}
          <div className="relative w-full h-full rounded-[calc(1.5rem-2px)] bg-white dark:bg-[#060D14] text-slate-800 dark:text-slate-100 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="h-16 px-5 bg-gradient-to-r from-[#1F7A1F]/15 dark:from-[#55f761]/20 via-[#1F7A1F]/5 dark:via-[#55f761]/5 to-transparent border-b border-black/10 dark:border-white/10 text-slate-800 dark:text-[#55f761] flex items-center justify-between shrink-0 select-none">
              <div className="flex items-center gap-2.5 drop-shadow-[0_0_10px_rgba(85,247,97,0.6)]">
                <Scroll className="w-5 h-5 text-[#1F7A1F] dark:text-[#55f761] animate-pulse" />
                <span className="font-bold tracking-wide text-slate-900 dark:text-[#55f761] text-base">Quest Log</span>
              </div>
              <button
                onClick={closePanel}
                className="p-2 text-slate-600 dark:text-[#55f761]/70 hover:text-slate-900 dark:hover:text-[#55f761] hover:bg-black/5 dark:hover:bg-[#55f761]/20 rounded-xl transition-all"
              >
                <Minus className="w-4 h-4" />
              </button>
            </div>

            {/* Quest Scroll List */}
            <QuestList
              localDailyQuests={localDailyQuests}
              expandedQuestId={expandedQuestId}
              toggleQuest={toggleQuest}
              handleCompletedClick={handleCompletedClick}
              currentUser={currentUser}
              isRegistered={isRegistered}
              isStandardBuildingPassed={isStandardBuildingPassed}
              isDashboardCompleted={isDashboardCompleted}
              isRulesAndGuidelinesCompleted={isRulesAndGuidelinesCompleted}
              hasClickedLandCoverTraining={hasClickedLandCoverTraining}
              hasClickedTransportationTraining={hasClickedTransportationTraining}
              onboardingProgress={onboardingProgress}
              onQuestClick={onQuestClick}
              isOpen={isOpen}
            />
          </div>
        </div>
      )}

      {/* Floating XP Animation Overlay */}
      <XPFloat floatingXPs={floatingXPs} />
    </>
  );
}
