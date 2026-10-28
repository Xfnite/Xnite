"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const PROGRESS_COOKIE = "pre_course_progress";

function writeProgressCookie(currentIndex: number) {
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);
  const progress = { currentIndex, answers: {}, videoProgress: {} };
  document.cookie = `${PROGRESS_COOKIE}=${encodeURIComponent(JSON.stringify(progress))}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
}

interface WelcomeFlowProps {
  onNext: () => void;
}

export default function WelcomeFlow({ onNext }: WelcomeFlowProps) {
  const router = useRouter();

  const handleStart = () => {
    // Clear old progress caches for a fresh start
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("watched_videos");
        localStorage.removeItem("completed_pages");
      } catch (e) {
        console.error(e);
      }
    }
    // Set progress to Q1 (index 0) and route to /pre-course
    writeProgressCookie(0);
    onNext();
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden">
      <div className="relative w-full max-w-4xl rounded-2xl border border-black/8 dark:border-white/8 bg-white/95 dark:bg-[#0D1B2A]/98 backdrop-blur-xl shadow-2xl shadow-black/10 dark:shadow-black/40 p-6 sm:p-8">
        <div className="space-y-8 text-center py-6 px-2 sm:px-6 animate-fade-in">
          {/* Decorative Badge Header */}
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-gradient-to-r from-[#1F7A1F] to-[#55f761] rounded-full blur-lg opacity-40 animate-pulse"></div>
            <div className="relative mx-auto w-20 h-20 rounded-full bg-[#E0E1DD] dark:bg-[#1B263B] border-2 border-[#1F7A1F]/30 dark:border-[#55f761]/30 flex items-center justify-center shadow-xl">
              <svg className="w-10 h-10 text-[#1F7A1F] dark:text-[#55f761]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l8.97-8.97m-8.97 8.97L15 21l-5.187-5.096M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
            </div>
          </div>

          {/* Immersive Title & Mission Statement */}
          <div className="space-y-3">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#0D1B2A] dark:text-white uppercase">
              Welcome to XFNITE, Challenger!
            </h1>
            <p className="text-[#1F7A1F] dark:text-[#55f761] text-sm sm:text-base font-bold tracking-wide uppercase">
              Your journey starts here.
            </p>
            <p className="max-w-xl mx-auto mt-4 text-sm sm:text-base leading-relaxed text-[#0D1B2A]/70 dark:text-white/75 font-medium">
              Before entering the main campaign, you must complete a short onboarding quest. The quiz will take approximately 5–10 minutes and serves as your tutorial for the tasks and environment you&apos;ll be working in.
            </p>
          </div>

          {/* Grid of Perks / Cards */}
          <div className="grid gap-4 sm:grid-cols-3 max-w-2xl mx-auto pt-2">
            {/* Card 1 */}
            <div className="group relative overflow-hidden rounded-2xl border border-black/8 dark:border-white/8 bg-gradient-to-br from-white/30 to-white/10 dark:from-white/[0.01] dark:to-white/[0.03] p-5 text-center transition-all duration-300 hover:border-[#1F7A1F]/30 dark:hover:border-[#55f761]/30 hover:bg-white/60 dark:hover:bg-white/[0.04] hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-[#55f761]/5 hover:scale-[1.03] backdrop-blur-sm flex flex-col items-center justify-center min-h-[160px]">
              <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-[#1F7A1F]/10 to-transparent dark:from-[#55f761]/10 rounded-bl-full pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#1F7A1F] to-[#55f761] transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
              <div className="w-12 h-12 rounded-xl bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 flex items-center justify-center mb-4 text-[#1F7A1F] dark:text-[#55f761] border border-[#1F7A1F]/20 dark:border-[#55f761]/20 shadow-sm">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-[#0D1B2A] dark:text-white uppercase tracking-wider leading-snug">
                Unlimited attempts
              </h3>
            </div>

            {/* Card 2 */}
            <div className="group relative overflow-hidden rounded-2xl border border-black/8 dark:border-white/8 bg-gradient-to-br from-white/30 to-white/10 dark:from-white/[0.01] dark:to-white/[0.03] p-5 text-center transition-all duration-300 hover:border-[#1F7A1F]/30 dark:hover:border-[#55f761]/30 hover:bg-white/60 dark:hover:bg-white/[0.04] hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-[#55f761]/5 hover:scale-[1.03] backdrop-blur-sm flex flex-col items-center justify-center min-h-[160px]">
              <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-[#1F7A1F]/10 to-transparent dark:from-[#55f761]/10 rounded-bl-full pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#1F7A1F] to-[#55f761] transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
              <div className="w-12 h-12 rounded-xl bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 flex items-center justify-center mb-4 text-[#1F7A1F] dark:text-[#55f761] border border-[#1F7A1F]/20 dark:border-[#55f761]/20 shadow-sm">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-[#0D1B2A] dark:text-white uppercase tracking-wider leading-snug">
                No failing
              </h3>
            </div>

            {/* Card 3 */}
            <div className="group relative overflow-hidden rounded-2xl border border-black/8 dark:border-white/8 bg-gradient-to-br from-white/30 to-white/10 dark:from-white/[0.01] dark:to-white/[0.03] p-5 text-center transition-all duration-300 hover:border-[#1F7A1F]/30 dark:hover:border-[#55f761]/30 hover:bg-white/60 dark:hover:bg-white/[0.04] hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-[#55f761]/5 hover:scale-[1.03] backdrop-blur-sm flex flex-col items-center justify-center min-h-[160px]">
              <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-[#1F7A1F]/10 to-transparent dark:from-[#55f761]/10 rounded-bl-full pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#1F7A1F] to-[#55f761] transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
              <div className="w-12 h-12 rounded-xl bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 flex items-center justify-center mb-4 text-[#1F7A1F] dark:text-[#55f761] border border-[#1F7A1F]/20 dark:border-[#55f761]/20 shadow-sm">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-[#0D1B2A] dark:text-white uppercase tracking-wider leading-snug">
                Learn the system before taking on live missions
              </h3>
            </div>
          </div>

          {/* Motivational Footer */}
          <div className="pt-4 max-w-md mx-auto space-y-3">
            <p className="text-sm sm:text-base leading-relaxed text-[#0D1B2A]/80 dark:text-white/80 font-bold bg-[#1F7A1F]/5 dark:bg-[#55f761]/5 px-4 py-3 rounded-xl border border-[#1F7A1F]/10 dark:border-[#55f761]/10">
              Complete this tutorial, and unlock the next stage of your journey.
            </p>
            <p className="mt-3 text-xs text-[#0D1B2A]/50 dark:text-white/40 font-semibold tracking-wide uppercase">
              See you on the next mission. Good luck!
            </p>
          </div>

          <div className="flex flex-col items-center pt-4 border-t border-black/5 dark:border-white/5 space-y-4">
            <button
              type="button"
              onClick={handleStart}
              className="px-12 py-3 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] font-bold text-sm shadow-xl shadow-[#1F7A1F]/30 dark:shadow-[#55f761]/30 active:scale-95 transition-all border border-[#55f761]/20 cursor-pointer"
            >
              Start
            </button>
            <p className="text-sm text-[#0D1B2A]/70 dark:text-white/70">
              Already have an account?{" "}
              <button
                onClick={() => router.push("/login")}
                className="text-[#1F7A1F] dark:text-[#55f761] font-bold hover:underline cursor-pointer"
              >
                Log in
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
