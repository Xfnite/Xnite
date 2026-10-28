"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { getSystemSetting } from "@/app/actions/settings";
import { getUserSidebarBanner, updateUserSidebarBanner, getLabelerRecruitCount, getInnerCouncilAccessAction } from "@/app/actions/user";
import { GATES, isStaff, isOldLabeler, isApplicant, canEarnInnerCouncil } from "@/config/permissions";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isRegistered?: boolean;
  isStandardBuildingPassed?: boolean;
  isDashboardCompleted?: boolean;
  isRulesAndGuidelinesCompleted?: boolean;
  email?: string;
  referralCode?: string;
  role?: string;
  createdAt?: string | null;
}

function LockIcon() {
  return (
    <svg
      className="w-3.5 h-3.5 ml-auto flex-shrink-0 opacity-40"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text);
  } else {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

export default function Sidebar({
  isOpen = false,
  onClose,
  isRegistered = false,
  isStandardBuildingPassed = false,
  isDashboardCompleted = false,
  isRulesAndGuidelinesCompleted = false,
  email,
  referralCode,
  role,
  createdAt,
}: SidebarProps) {
  const pathname = usePathname();
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [hasVisitedAccount, setHasVisitedAccount] = useState(false);
  const [hasVisitedProjects, setHasVisitedProjects] = useState(false);
  const [showFacebookModal, setShowFacebookModal] = useState(false);
  const [hasVisitedChat, setHasVisitedChat] = useState(false);
  const [bannerUrl, setBannerUrl] = useState("https://www.youtube.com/embed/NyzgdXyta4k?autoplay=1&mute=1&loop=1&playlist=NyzgdXyta4k&controls=0&showinfo=0&rel=0&disablekb=1&modestbranding=1&iv_load_policy=3&enablejsapi=1");
  const [showBannerModal, setShowBannerModal] = useState(false);
  const [tempBannerInput, setTempBannerInput] = useState("");
  const [isUpdatingBanner, setIsUpdatingBanner] = useState(false);
  const [hasVisitedFacebook, setHasVisitedFacebook] = useState(false);
  const [messengerLink, setMessengerLink] = useState("");
  const [showReferModal, setShowReferModal] = useState(false);
  const [recruitCount, setRecruitCount] = useState<number | null>(null);
  const [isLoadingRecruit, setIsLoadingRecruit] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const isAtLeastTwoMonthsOld = () => {
    if (!createdAt) return false;
    const createdDate = new Date(createdAt);
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    return createdDate <= twoMonthsAgo;
  };

  useEffect(() => {
    // Only check client-side flags after hydration
    if (typeof window !== "undefined") {
      getUserSidebarBanner().then((res) => {
        if (res.success && res.url) {
          let savedBanner = res.url;

          const match = savedBanner.match(/embed\/([^?]+)/);
          if (match) {
            const vid = match[1];
            if (!savedBanner.includes("loop=1")) savedBanner += "&loop=1";
            if (!savedBanner.includes("playlist=")) savedBanner += `&playlist=${vid}`;
          }

          if (!savedBanner.includes("mute=1")) savedBanner += "&mute=1";
          if (!savedBanner.includes("iv_load_policy=3")) savedBanner += "&iv_load_policy=3";
          if (!savedBanner.includes("enablejsapi=1")) savedBanner += "&enablejsapi=1";
          setBannerUrl(savedBanner);
        }
      });
    }
    getSystemSetting("messenger_link_sidebar", "").then(setMessengerLink);
  }, [role]);

  // Labelers / old labelers earn the Inner Council link through their passer count
  const [innerCouncilAccess, setInnerCouncilAccess] = useState(false);
  const hasEarnedInnerCouncil = canEarnInnerCouncil(role) && innerCouncilAccess;
  useEffect(() => {
    if (!canEarnInnerCouncil(role)) return;
    getInnerCouncilAccessAction()
      .then((res) => setInnerCouncilAccess(res.hasAccess))
      .catch(() => setInnerCouncilAccess(false));
  }, [role]);

  const [isFacebookCodeCopied, setIsFacebookCodeCopied] = useState(false);
  const [facebookCountdown, setFacebookCountdown] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isFacebookCodeCopied && facebookCountdown > 0) {
      timer = setTimeout(() => {
        setFacebookCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [isFacebookCodeCopied, facebookCountdown]);

  // Manually loop the YouTube video via postMessage when it ends
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.origin !== "https://www.youtube.com") return;
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        // info === 0 means the video ended
        if (data.event === "onStateChange" && data.info === 0) {
          if (iframeRef.current && iframeRef.current.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
              JSON.stringify({ event: "command", func: "seekTo", args: [0, true] }),
              "*"
            );
            iframeRef.current.contentWindow.postMessage(
              JSON.stringify({ event: "command", func: "playVideo", args: [] }),
              "*"
            );
          }
        }
        // Force play if it pauses (info === 2) unexpectedly
        if (data.event === "onStateChange" && data.info === 2) {
          if (iframeRef.current && iframeRef.current.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
              JSON.stringify({ event: "command", func: "playVideo", args: [] }),
              "*"
            );
          }
        }
      } catch (err) { }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (showFacebookModal) {
      setIsFacebookCodeCopied(false);
      setFacebookCountdown(0);
    }
  }, [showFacebookModal]);

  useEffect(() => {
    const checkProgress = () => {
      if (isDashboardCompleted) {
        setOnboardingDone(true);
        return;
      }
      try {
        const storageKey = email
          ? `xfnite_onboarding_progress_${email.replace(/[^a-zA-Z0-9_-]/g, "_")}`
          : "xfnite_onboarding_progress_v2";
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          setOnboardingDone(!!parsed?.onboardingComplete);
        } else {
          setOnboardingDone(false);
        }
      } catch {
        setOnboardingDone(false);
      }
    };

    checkProgress();
    window.addEventListener("onboarding_progress_updated", checkProgress);
    return () =>
      window.removeEventListener("onboarding_progress_updated", checkProgress);
  }, [pathname, isDashboardCompleted]);

  // Track account and project page visits to suppress the highlight after first click
  useEffect(() => {
    try {
      if (pathname === "/account") {
        localStorage.setItem("xfnite_account_visited", "true");
        setHasVisitedAccount(true);
      } else {
        setHasVisitedAccount(
          localStorage.getItem("xfnite_account_visited") === "true",
        );
      }

      if (pathname === "/project" || pathname.startsWith("/project/")) {
        localStorage.setItem("xfnite_projects_visited", "true");
        setHasVisitedProjects(true);
      } else {
        setHasVisitedProjects(
          localStorage.getItem("xfnite_projects_visited") === "true",
        );
      }

      setHasVisitedChat(localStorage.getItem("xfnite_chat_visited") === "true");
      setHasVisitedFacebook(
        localStorage.getItem("xfnite_facebook_visited") === "true",
      );
    } catch {
      setHasVisitedAccount(false);
      setHasVisitedProjects(false);
      setHasVisitedChat(false);
      setHasVisitedFacebook(false);
    }
  }, [pathname]);

  // Reset helper for testing: clears chat & facebook visited flags when ?trigger_socials=true is in the URL
  useEffect(() => {
    if (pathname === "/project" || pathname.startsWith("/project/")) {
      return; // Do not reset flags when navigating to the projects page
    }
    if (
      typeof window !== "undefined" &&
      window.location.search.includes("trigger_socials=true")
    ) {
      try {
        localStorage.removeItem("xfnite_chat_visited");
        localStorage.removeItem("xfnite_facebook_visited");
        localStorage.removeItem("xfnite_projects_visited");
        setHasVisitedChat(false);
        setHasVisitedFacebook(false);
        setHasVisitedProjects(false);
      } catch (e) {
        console.error("Failed to reset socials flags:", e);
      }
    }
  }, [pathname]);

  const ctx = {
    role,
    isStandardBuildingPassed,
    onboardingDone,
    isRulesAndGuidelinesCompleted,
  };

  const isAccountLocked = GATES.isAccountLocked(ctx);
  const isTrainingLocked = GATES.isTrainingLocked(ctx);
  const isRankingLocked = GATES.isRankingLocked(ctx);
  const showSocialsVisible = GATES.isSocialsVisible(ctx);
  const isRecruiter = isStaff(role);

  const showAccountHighlight =
    onboardingDone &&
    !isStandardBuildingPassed &&
    !hasVisitedAccount &&
    !isRecruiter;
  const showProjectsHighlight =
    isStandardBuildingPassed && !hasVisitedProjects && !isRecruiter;

  const showChatHighlight =
    showSocialsVisible && !hasVisitedChat && !isRecruiter;
  const showFacebookHighlight =
    showSocialsVisible && hasVisitedChat && !hasVisitedFacebook && !isRecruiter;
  const showProjectsWalkthroughHighlight =
    showSocialsVisible &&
    hasVisitedChat &&
    hasVisitedFacebook &&
    !hasVisitedProjects &&
    !isRecruiter;
  const showSocialsHighlight =
    showChatHighlight ||
    showFacebookHighlight ||
    showProjectsWalkthroughHighlight;

  return (
    <>
      <style>{`
        @keyframes shimmerRtl {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        @keyframes breatheGlow {
          0%, 100% {
            box-shadow: 0 0 8px rgba(85, 247, 97, 0.4), 0 0 15px rgba(85, 247, 97, 0.2);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 25px rgba(85, 247, 97, 0.9), 0 0 35px rgba(85, 247, 97, 0.6);
            transform: scale(1.12);
          }
        }
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-breathe {
          animation: breatheGlow 2s infinite ease-in-out;
        }
        .animate-gradient-green {
          background: linear-gradient(135deg, #0F3D0F, #1F7A1F, #2EAF2E, #1F7A1F, #0F3D0F);
          background-size: 300% 300%;
          animation: gradientShift 5s ease infinite;
          transition: all 0.3s ease;
        }
        .animate-gradient-green:hover {
          background: #55f761 !important;
          box-shadow: 0 4px 12px rgba(85, 247, 97, 0.3);
        }
      `}</style>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 ${showSocialsHighlight ? "z-[9999] border-r-0" : "z-50 border-r border-[#1B263B]/10 dark:border-[#f2f2f2]/10"} w-[240px] flex-shrink-0 flex flex-col overflow-y-auto bg-[#fff] dark:bg-[#060D14] md:bg-[#fff] md:dark:bg-[#060D14] pt-6 pb-1.5 transition-transform duration-300 transform ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"} md:flex`}
      >
        {showSocialsHighlight && (
          <div className="absolute inset-0 z-30 bg-black/85 pointer-events-auto transition-all duration-300" />
        )}
        {/* Mobile Close Button */}
        <div className="flex md:hidden justify-end px-4 mb-4">
          <button
            onClick={onClose}
            className="p-2 text-[#2F3E46] dark:text-[#E0E1DD]"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <nav className="space-y-1 flex flex-col px-4 flex-1 pb-1">
          {/* Dashboard - always visible */}
          <Link
            href="/dashboard"
            onClick={onClose}
            className={`flex items-center px-4 py-2.5 text-sm font-medium transition-colors rounded-tr-xl rounded-bl-xl ${pathname === "/dashboard"
              ? "bg-black/5 dark:bg-[#1B263B] text-[#1F7A1F] dark:text-[#55f761] shadow-sm"
              : "text-[#2F3E46] dark:text-[#E0E1DD]/70 hover:bg-black/5 dark:hover:bg-[#1B263B]/50 hover:text-[#0D1B2A] dark:hover:text-[#E0E1DD]"
              }`}
          >
            <svg
              className="w-4 h-4 mr-2.5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"
              />
            </svg>
            Onboarding
          </Link>

          {/* Separator */}
          <div className="my-1.5 border-t border-black/5 dark:border-white/5" />

          {/* Projects - locked until training is passed */}
          {isTrainingLocked ? (
            <div className="flex items-center px-4 py-2.5 text-sm font-medium rounded-tr-xl rounded-bl-xl text-[#2F3E46]/40 dark:text-[#E0E1DD]/25 cursor-not-allowed select-none">
              <svg
                className="w-4 h-4 mr-2.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 17v-2m3 2v-4m3 4v-6M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              Projects
              <LockIcon />
            </div>
          ) : (
            <Link
              href={
                showProjectsWalkthroughHighlight
                  ? "/project?trigger_project_walkthrough=true"
                  : "/project"
              }
              onClick={onClose}
              className={`flex items-center px-4 py-2.5 text-sm font-medium transition-colors rounded-tr-xl rounded-bl-xl ${showProjectsWalkthroughHighlight
                ? "bg-white dark:bg-[#1B263B] text-[#1F7A1F] dark:text-[#E0E1DD] shadow-md ring-1 ring-black/5 dark:ring-white/10"
                : pathname === "/project" || pathname.startsWith("/project/")
                  ? "bg-black/5 dark:bg-[#1B263B] text-[#1F7A1F] dark:text-[#E0E1DD] shadow-sm"
                  : "text-[#2F3E46] dark:text-[#E0E1DD]/70 hover:bg-black/5 dark:hover:bg-[#1B263B]/50 hover:text-[#0D1B2A] dark:hover:text-[#E0E1DD]"
                } ${showProjectsHighlight ? "relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-l before:from-transparent before:via-[#1F7A1F]/40 dark:before:via-[#55f761]/40 before:to-transparent before:animate-[shimmerRtl_2s_infinite_linear] shadow-[0_0_15px_rgba(31,122,31,0.5)] dark:shadow-[0_0_15px_rgba(85,247,97,0.4)] ring-1 ring-[#1F7A1F]/30 dark:ring-[#55f761]/30" : ""} ${showProjectsWalkthroughHighlight
                  ? "relative z-40 animate-breathe"
                  : ""
                }`}
            >
              <svg
                className={`relative z-10 w-4 h-4 mr-2.5 flex-shrink-0 ${showProjectsHighlight || showProjectsWalkthroughHighlight ? "text-[#1F7A1F] dark:text-[#55f761]" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 17v-2m3 2v-4m3 4v-6M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              <span className="relative z-10">Projects</span>
            </Link>
          )}

          {/* Account - locked until onboarding complete */}
          {isAccountLocked ? (
            <div className="flex items-center px-4 py-2.5 text-sm font-medium rounded-tr-xl rounded-bl-xl text-[#2F3E46]/40 dark:text-[#E0E1DD]/25 cursor-not-allowed select-none">
              <svg
                className="w-4 h-4 mr-2.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="8" r="5" />
                <path d="M20 21a8 8 0 10-16 0" />
              </svg>
              Account Info
              <LockIcon />
            </div>
          ) : (
            <Link
              href="/account"
              onClick={onClose}
              className={`flex items-center px-4 py-2.5 text-sm font-medium transition-colors rounded-tr-xl rounded-bl-xl ${pathname === "/account"
                ? "bg-black/5 dark:bg-[#1B263B] text-[#1F7A1F] dark:text-[#E0E1DD] shadow-sm"
                : "text-[#2F3E46] dark:text-[#E0E1DD]/70 hover:bg-black/5 dark:hover:bg-[#1B263B]/50 hover:text-[#0D1B2A] dark:hover:text-[#E0E1DD]"
                } ${showAccountHighlight ? "relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-l before:from-transparent before:via-[#1F7A1F]/40 dark:before:via-[#55f761]/40 before:to-transparent before:animate-[shimmerRtl_2s_infinite_linear] shadow-[0_0_15px_rgba(31,122,31,0.5)] dark:shadow-[0_0_15px_rgba(85,247,97,0.4)] ring-1 ring-[#1F7A1F]/30 dark:ring-[#55f761]/30" : ""}`}
            >
              <svg
                className={`relative z-10 w-4 h-4 mr-2.5 flex-shrink-0 ${showAccountHighlight ? "text-[#1F7A1F] dark:text-[#55f761]" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="8" r="5" />
                <path d="M20 21a8 8 0 10-16 0" />
              </svg>
              <span className="relative z-10">Account Info</span>
            </Link>
          )}

          {/* Wallet - locked until training is passed */}
          {isTrainingLocked ? (
            <div className="flex items-center px-4 py-2.5 text-sm font-medium rounded-tr-xl rounded-bl-xl text-[#2F3E46]/40 dark:text-[#E0E1DD]/25 cursor-not-allowed select-none">
              <svg
                className="w-4 h-4 mr-2.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
              Wallet
              <LockIcon />
            </div>
          ) : (
            <Link
              href="/wallet"
              id="wallet-tour-sidebar"
              onClick={onClose}
              className={`flex items-center px-4 py-2.5 text-sm font-medium transition-colors rounded-tr-xl rounded-bl-xl ${pathname === "/wallet" || pathname === "/wallet/payment-method"
                ? "bg-black/5 dark:bg-[#1B263B] text-[#1F7A1F] dark:text-[#E0E1DD] shadow-sm"
                : "text-[#2F3E46] dark:text-[#E0E1DD]/70 hover:bg-black/5 dark:hover:bg-[#1B263B]/50 hover:text-[#0D1B2A] dark:hover:text-[#E0E1DD]"
                }`}
            >
              <svg
                className="w-4 h-4 mr-2.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
              Wallet
            </Link>
          )}


          <div className="mt-auto flex flex-col pt-1.5">
            {/* Sidebar Banner */}
            <div
              className="relative w-[calc(100%+2rem)] -mx-4 mb-1 aspect-[21/9] overflow-hidden group cursor-pointer border-y border-black/10 dark:border-white/10"
              title="Click to edit banner video"
              onClick={() => {
                setTempBannerInput(bannerUrl);
                setShowBannerModal(true);
              }}
            >
              <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
                <iframe
                  ref={iframeRef}
                  className="w-full shrink-0 aspect-video pointer-events-none"
                  src={bannerUrl}
                  title="Sidebar Banner"
                  frameBorder="0"
                  allow="autoplay; encrypted-media"
                ></iframe>
              </div>
              {/* Overlay with edit text on hover */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none backdrop-blur-sm">
                <span className="text-white text-[10px] font-bold px-2 py-1 bg-black/60 rounded">Edit Banner</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 px-4 mt-1">

              {/* Recruiter - visible to staff and labelers who earned Inner Council */}
              {(isRecruiter || hasEarnedInnerCouncil) && (
                <Link
                  href="/recruiter/ranking"
                  onClick={onClose}
                  className={`flex items-center px-4 py-2.5 text-sm font-medium transition-colors rounded-xl ${pathname.startsWith("/recruiter")
                    ? "bg-black/5 dark:bg-[#1B263B] text-[#1F7A1F] dark:text-[#55f761] shadow-sm"
                    : "text-[#2F3E46] dark:text-[#E0E1DD]/70 hover:bg-black/5 dark:hover:bg-[#1B263B]/50 hover:text-[#0D1B2A] dark:hover:text-[#E0E1DD]"
                    }`}
                >
                  <svg
                    className="w-4 h-4 mr-2.5 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  > 
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M17 20h5-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                  Inner Council
                </Link>
              )}

              {/* Ranking - locked until training and rules are completed */}
              {isRankingLocked ? (
                <div className="flex items-center px-4 py-2.5 text-sm font-medium rounded-tr-xl rounded-bl-xl text-[#2F3E46]/40 dark:text-[#E0E1DD]/25 cursor-not-allowed select-none">
                  <svg
                    className="w-4 h-4 mr-2.5 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34M12 2a6 6 0 0 1 6 6v1H6V8a6 6 0 0 1 6-6z"
                    />
                  </svg>
                  Leaderboard
                  <LockIcon />
                </div>
              ) : (
                <Link
                  href="/ranking"
                  onClick={onClose}
                  className={`flex items-center px-4 py-2.5 text-sm font-medium transition-colors rounded-tr-xl rounded-bl-xl ${pathname === "/ranking"
                    ? "bg-black/5 dark:bg-[#1B263B] text-[#1F7A1F] dark:text-[#E0E1DD] shadow-sm"
                    : "text-[#2F3E46] dark:text-[#E0E1DD]/70 hover:bg-black/5 dark:hover:bg-[#1B263B]/50 hover:text-[#0D1B2A] dark:hover:text-[#E0E1DD]"
                    }`}
                >
                  <svg
                    className="w-4 h-4 mr-2.5 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34M12 2a6 6 0 0 1 6 6v1H6V8a6 6 0 0 1 6-6z"
                    />
                  </svg>
                  Leaderboard
                </Link>
              )}

              {/* Attendance - only shown once Training.ProjectID1 (Standard Building) is completed */}
              {GATES.canAccessRoute("/attendance", ctx) && (
                <Link
                  href="/attendance"
                  onClick={onClose}
                  className={`flex items-center px-4 py-2.5 text-sm font-medium transition-colors rounded-tr-xl rounded-bl-xl ${pathname === "/attendance"
                    ? "bg-black/5 dark:bg-[#1B263B] text-[#1F7A1F] dark:text-[#E0E1DD] shadow-sm"
                    : "text-[#2F3E46] dark:text-[#E0E1DD]/70 hover:bg-black/5 dark:hover:bg-[#1B263B]/50 hover:text-[#0D1B2A] dark:hover:text-[#E0E1DD]"
                    }`}
                >
                  <svg
                    className="w-4 h-4 mr-2.5 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                    />
                  </svg>
                  Attendance
                </Link>
              )}

              {/* Locked notice */}
              {(isAccountLocked || isTrainingLocked) && (
                <div className="mx-1 px-3 py-2.5 rounded-xl bg-black/5 dark:bg-[#55f761]/5 border border-black/10 dark:border-[#55f761]/15 text-[10px] text-[#1F7A1F] dark:text-[#55f761]/80 leading-relaxed font-medium">
                  ðŸ”’{" "}
                  {isAccountLocked
                    ? "Complete your onboarding to unlock your Account Info."
                    : "Pass the Standard Building training in the desktop software to unlock Projects and Wallet."}
                </div>
              )}

              {/* Unlocked notice */}
              {!isAccountLocked &&
                !isTrainingLocked &&
                showSocialsVisible && (
                  <div className="flex flex-col gap-2">
                    <div className="mx-1 px-3 py-2 rounded-xl bg-black/5 dark:bg-[#55f761]/5 border border-black/10 dark:border-[#55f761]/15 text-[10px] text-[#1F7A1F] dark:text-[#55f761]/80 leading-relaxed font-medium">
                      Please Join our Facebook Group, Community Chat for easy
                      work communication and announcements
                    </div>
                    <div className="flex items-center justify-start gap-4 py-0.5 mx-1">
                      <a
                        href={messengerLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                          localStorage.setItem("xfnite_chat_visited", "true");
                          setHasVisitedChat(true);
                        }}
                        className={`hover:scale-110 active:scale-95 transition-transform duration-200 rounded-full ${showChatHighlight ? "relative z-40 animate-breathe" : "relative z-20"
                          }`}
                      >
                        {showChatHighlight && (
                          <div className="absolute left-1/2 -top-14 -translate-x-1/2 animate-bounce pointer-events-none">
                            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-[#1F7A1F] dark:text-[#55f761] drop-shadow-lg">
                              <line x1="12" y1="5" x2="12" y2="19"></line>
                              <polyline points="19 12 12 19 5 12"></polyline>
                            </svg>
                          </div>
                        )}
                        <img
                          src="/socials/chat.png"
                          alt="Community Chat"
                          className="w-8 h-8 rounded-full object-cover shadow-sm border border-black/10 dark:border-white/10"
                        />
                      </a>
                      <button
                        onClick={() => setShowFacebookModal(true)}
                        className={`hover:scale-110 active:scale-95 transition-transform duration-200 cursor-pointer bg-transparent border-0 p-0 rounded-full ${showFacebookHighlight
                          ? "relative z-40 animate-breathe"
                          : "relative z-20"
                          }`}
                      >
                        {showFacebookHighlight && (
                          <div className="absolute left-1/2 -top-14 -translate-x-1/2 animate-bounce pointer-events-none">
                            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-[#1F7A1F] dark:text-[#55f761] drop-shadow-lg">
                              <line x1="12" y1="5" x2="12" y2="19"></line>
                              <polyline points="19 12 12 19 5 12"></polyline>
                            </svg>
                          </div>
                        )}
                        <img
                          src="/socials/facebookgroup.png"
                          alt="Facebook Group"
                          className="w-8 h-8 rounded-full object-cover shadow-sm border border-black/10 dark:border-white/10"
                        />
                      </button>
                    </div>
                  </div>
                )}

              {/* Invite a Challenger button (outside of socials block) */}
              {isAtLeastTwoMonthsOld() && role && !isApplicant(role) && process.env.NEXT_PUBLIC_ENABLE_REFERRAL !== "false" && (
                <button
                  onClick={async () => {
                    setShowReferModal(true);
                    if (recruitCount === null) {
                      setIsLoadingRecruit(true);
                      const res = await getLabelerRecruitCount();
                      setRecruitCount(res.count ?? 0);
                      setIsLoadingRecruit(false);
                    }
                  }}
                  className="-mx-1 mb-3 active:scale-95 transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 animate-gradient-green text-white hover:text-[#060D14] rounded-xl py-3 px-4 shadow-md whitespace-nowrap"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <line x1="19" y1="8" x2="19" y2="14"></line>
                    <line x1="22" y1="11" x2="16" y2="11"></line>
                  </svg>
                  <span className="text-[11px] font-bold tracking-wide uppercase whitespace-nowrap">
                    Invite a Challenger
                  </span>
                </button>
              )}

              {/* Extra padding at the bottom for old-labeler since socials are hidden */}
              {isOldLabeler(role) && <div className="h-6"></div>}
            </div>
          </div>
        </nav>
      </aside>

      {/* Global backdrop for socials highlight - covers entire screen for focus */}
      {showSocialsHighlight && (
        <div className="fixed inset-0 z-[9998] bg-black/85 transition-all duration-300 pointer-events-auto" />
      )}

      {/* Walkthrough Tooltips rendered outside the sidebar to prevent overflow clipping */}
      {showProjectsWalkthroughHighlight && (
        <div className="fixed z-[10000] p-4 bg-white/95 dark:bg-[#0D1B2A]/95 backdrop-blur-xl border border-[#1F7A1F]/30 dark:border-[#55f761]/30 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-2 md:slide-in-from-left-2 duration-300 pointer-events-auto bottom-4 left-4 right-4 md:bottom-auto md:top-[190px] md:left-[256px] md:right-auto md:w-60">
          <div className="text-[10px] font-black tracking-widest text-[#1F7A1F] dark:text-[#55f761] uppercase mb-1">
            Onboarding step 3
          </div>
          <h4 className="text-xs font-extrabold text-[#0D1B2A] dark:text-white mb-1">
            Proceed to Projects
          </h4>
          <p className="text-[11px] text-[#2F3E46]/90 dark:text-[#E0E1DD]/80 leading-relaxed">
            Click here to view your projects, accept guidelines, and start your
            training tasks.
          </p>
        </div>
      )}

      {showChatHighlight && (
        <div className="fixed z-[10000] p-4 bg-white/95 dark:bg-[#0D1B2A]/95 backdrop-blur-xl border border-[#1F7A1F]/30 dark:border-[#55f761]/30 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-2 md:slide-in-from-left-2 duration-300 pointer-events-auto bottom-4 left-4 right-4 md:bottom-[40px] md:left-[256px] md:right-auto md:w-60">
          <div className="text-[10px] font-black tracking-widest text-[#1F7A1F] dark:text-[#55f761] uppercase mb-1">
            Onboarding step 1
          </div>
          <h4 className="text-xs font-extrabold text-[#0D1B2A] dark:text-white mb-1">
            Join Community Chat
          </h4>
          <p className="text-[11px] text-[#2F3E46]/90 dark:text-[#E0E1DD]/80 leading-relaxed">
            Join our Facebook Messenger Community Chat to get real-time project
            updates and answer keys.
          </p>
        </div>
      )}

      {showFacebookHighlight && (
        <div className="fixed z-[10000] p-4 bg-white/95 dark:bg-[#0D1B2A]/95 backdrop-blur-xl border border-[#1F7A1F]/30 dark:border-[#55f761]/30 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-2 md:slide-in-from-left-2 duration-300 pointer-events-auto bottom-4 left-4 right-4 md:bottom-[40px] md:left-[256px] md:right-auto md:w-60">
          <div className="text-[10px] font-black tracking-widest text-[#1F7A1F] dark:text-[#55f761] uppercase mb-1">
            Onboarding step 2
          </div>
          <h4 className="text-xs font-extrabold text-[#0D1B2A] dark:text-white mb-1">
            Join Facebook Group
          </h4>
          <p className="text-[11px] text-[#2F3E46]/90 dark:text-[#E0E1DD]/80 leading-relaxed">
            Click here to join our official Facebook Group and confirm your
            membership.
          </p>
        </div>
      )}

      {/* Facebook Group Confirmation Modal */}
      {showFacebookModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-white dark:bg-[#0B1520] border border-black/10 dark:border-white/10 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Header */}
            <h3 className="text-base font-bold text-[#0D1B2A] dark:text-white mb-2">
              Join Facebook Group
            </h3>

            {/* Content */}
            <p className="text-xs text-[#2F3E46]/80 dark:text-white/70 leading-relaxed mb-4">
              Join our Facebook group for announcements, please enter{" "}
              <span className="font-bold text-[#1F7A1F] dark:text-[#55f761] select-all">
                SW63BD65G2
              </span>{" "}
              in the group's membership questions.
            </p>
            <div className="text-[10px] font-bold text-rose-500 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-lg mb-6">
              âš ï¸ NOTE: DO NOT SHARE to your other co-challengers the Group Code
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">

              {!isFacebookCodeCopied ? (
                <button
                  onClick={() => {
                    copyToClipboard("SW63BD65G2");
                    toast.success("Code copied to clipboard!");
                    setIsFacebookCodeCopied(true);
                    setFacebookCountdown(5);
                  }}
                  className="px-4 py-2 text-xs font-semibold bg-[#1F7A1F] hover:bg-[#1F7A1F]/90 text-white rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect
                      x="9"
                      y="9"
                      width="13"
                      height="13"
                      rx="2"
                      ry="2"
                    ></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  Copy Code
                </button>
              ) : (
                <a
                  href={
                    facebookCountdown === 0
                      ? "https://www.facebook.com/share/g/1B3P4agPhU/"
                      : undefined
                  }
                  target={facebookCountdown === 0 ? "_blank" : undefined}
                  rel={
                    facebookCountdown === 0 ? "noopener noreferrer" : undefined
                  }
                  onClick={(e) => {
                    if (facebookCountdown > 0) {
                      e.preventDefault();
                      return;
                    }
                    setShowFacebookModal(false);
                    localStorage.setItem("xfnite_facebook_visited", "true");
                    setHasVisitedFacebook(true);
                  }}
                  className={`px-4 py-2 text-xs font-semibold rounded-xl shadow-md transition-all flex items-center justify-center ${facebookCountdown > 0
                    ? "bg-gray-400 dark:bg-gray-600 text-white cursor-not-allowed opacity-70"
                    : "bg-[#1F7A1F] hover:bg-[#1F7A1F]/90 text-white cursor-pointer"
                    }`}
                >
                  {facebookCountdown > 0
                    ? `Join Facebook Group (${facebookCountdown}s)`
                    : "Join Facebook Group"}
                </a>
              )}
            </div>
          </div>
        </div>
      )}


      {/* Refer a Friend Modal */}
      {showReferModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm bg-white dark:bg-[#0B1520] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            {/* Header bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/8 dark:border-white/8">
              <div className="flex items-center gap-2.5 text-[#0D1B2A] dark:text-white">
                <div className="w-8 h-8 rounded-xl bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 flex items-center justify-center text-[#1F7A1F] dark:text-[#55f761]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <line x1="19" y1="8" x2="19" y2="14"></line>
                    <line x1="22" y1="11" x2="16" y2="11"></line>
                  </svg>
                </div>
                <span className="font-bold text-sm">Refer &amp; Earn</span>
              </div>
              <button onClick={() => setShowReferModal(false)} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-[#2F3E46]/60 dark:text-white/40 hover:text-[#0D1B2A] dark:hover:text-white transition-colors cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Recruit counter */}
              <div className="rounded-xl bg-black/3 dark:bg-white/3 border border-black/8 dark:border-white/8 px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-widest font-bold text-[#2F3E46]/50 dark:text-white/40 mb-1">Friends Recruited</p>
                  <p className="text-4xl font-black text-[#0D1B2A] dark:text-white leading-none">
                    {isLoadingRecruit ? (<span className="inline-block w-10 h-8 bg-black/10 dark:bg-white/10 rounded-lg animate-pulse align-middle" />) : (recruitCount ?? 0)}
                  </p>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 flex items-center justify-center text-[#1F7A1F] dark:text-[#55f761]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                </div>
              </div>
              {/* Earnings info */}
              <div className="rounded-xl bg-[#1F7A1F]/6 dark:bg-[#55f761]/6 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 px-5 py-4">
                <p className="text-base font-black text-[#0D1B2A] dark:text-white mb-1">Earn 10% of their pay-out</p>
                <p className="text-sm text-[#2F3E46]/70 dark:text-white/50">Capped at <span className="font-bold text-[#1F7A1F] dark:text-[#55f761]">&#8369;1,000</span> per referral</p>
              </div>
              {/* Copy Link button */}
              {isAtLeastTwoMonthsOld() && role && !isApplicant(role) && (
                <button
                  onClick={() => {
                    // NEXT_PUBLIC_REFERRAL_SHORT_URL (https://join.xfnite.cloud) gives join.xfnite.cloud/cedrickr links;
                    // a Cloudflare redirect rule forwards them to /r/ on this app.
                    const shortBase = process.env.NEXT_PUBLIC_REFERRAL_SHORT_URL;
                    const link = !referralCode
                      ? `${window.location.origin}/login?ref=${encodeURIComponent(email || "")}`
                      : shortBase
                        ? `${shortBase}/${encodeURIComponent(referralCode)}`
                        : `${process.env.NEXT_PUBLIC_REFERRAL_BASE_URL || window.location.origin}/r/${encodeURIComponent(referralCode)}`;
                    copyToClipboard(link);
                    toast.success("Referral link copied!");
                  }}
                  className="w-full py-3.5 px-6 text-sm font-bold bg-[#1F7A1F] hover:bg-[#1a661a] dark:bg-[#55f761] dark:hover:bg-[#3de34a] text-white dark:text-[#060D14] rounded-xl shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                  Copy Referral Link
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Banner Update Modal */}
      {showBannerModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#0D1B2A] rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-black/10 dark:border-white/10">
            <div className="p-6">
              <h3 className="text-xl font-bold text-[#0D1B2A] dark:text-[#E0E1DD] mb-2">Update Sidebar Banner</h3>
              <p className="text-sm text-[#2F3E46] dark:text-[#E0E1DD]/70 mb-4">
                Enter a YouTube URL or Video ID for your banner. It will automatically loop silently in the background.
              </p>
              <input
                type="text"
                value={tempBannerInput}
                onChange={(e) => setTempBannerInput(e.target.value)}
                placeholder="e.g., https://youtube.com/watch?v=NyzqdXyta4k"
                className="w-full px-4 py-3 rounded-xl bg-black/5 dark:bg-[#1B263B] border border-black/10 dark:border-white/10 text-[#0D1B2A] dark:text-[#E0E1DD] placeholder-[#2F3E46]/50 dark:placeholder-[#E0E1DD]/50 outline-none focus:ring-2 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-all"
                autoFocus
              />
            </div>
            <div className="px-6 py-4 bg-black/5 dark:bg-[#1B263B]/50 flex justify-end gap-3 border-t border-black/10 dark:border-white/10">
              <button
                onClick={() => setShowBannerModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-[#2F3E46] dark:text-[#E0E1DD]/80 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                disabled={isUpdatingBanner}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (tempBannerInput) {
                    setIsUpdatingBanner(true);
                    let videoId = tempBannerInput;
                    const match = tempBannerInput.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
                    if (match) videoId = match[1];
                    const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&showinfo=0&rel=0&disablekb=1&modestbranding=1&iv_load_policy=3&enablejsapi=1`;

                    const res = await updateUserSidebarBanner(embedUrl);
                    if (res.success) {
                      setBannerUrl(embedUrl);
                      setShowBannerModal(false);
                      toast.success("Banner updated successfully!");
                    } else {
                      toast.error(res.error || "Failed to update banner.");
                    }
                    setIsUpdatingBanner(false);
                  }
                }}
                disabled={isUpdatingBanner || !tempBannerInput}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#0D1B2A] hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isUpdatingBanner ? "Saving..." : "Save Banner"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
