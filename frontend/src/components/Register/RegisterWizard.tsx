"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import RegisterForm from "@/components/Register/RegisterForm";
import CompleteProfileForm from "@/components/CompleteProfile/CompleteProfileForm";
import WelcomeFlow from "@/components/Welcome/WelcomeFlow";
import PreCourseFlow from "@/components/PreCourse/PreCourseFlow";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTheme } from "@/components/ThemeProvider";

interface RegisterWizardProps {
  initialStep: "register" | "complete-profile";
  initialFirstName?: string;
  initialLastName?: string;
  isExistingUser?: boolean;
  referrerSelect: React.ReactNode;
}

export default function RegisterWizard({
  initialStep,
  initialFirstName = "",
  initialLastName = "",
  isExistingUser = false,
  referrerSelect
}: RegisterWizardProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const searchParams = useSearchParams();
  const stepParam = searchParams.get("step") as "register" | "complete-profile" | "welcome" | "pre-course" | null;
  let step = stepParam || initialStep;

  // Guard step parameter bypass if registration is disabled and user is not an existing user
  if (process.env.NEXT_PUBLIC_ENABLE_REGISTRATION !== "true" && !isExistingUser) {
    if (step === "complete-profile" || step === "welcome" || step === "pre-course") {
      step = "register";
    }
  }

  const handleSetStep = (newStep: "register" | "complete-profile" | "welcome" | "pre-course") => {
    const currentPath = window.location.pathname;
    router.push(`${currentPath}?step=${newStep}`);
  };

  useEffect(() => {
    // Centralized reload protection logic:
    // Check if the page was just hard reloaded during onboarding
    if (typeof window !== "undefined") {
      const navEntries = performance.getEntriesByType("navigation");
      const isReload = navEntries.length > 0 && (navEntries[0] as PerformanceNavigationTiming).type === "reload";

      if (isReload) {
        // Wipe pre-course progress locally so they start over
        localStorage.removeItem("completed_pages");
        localStorage.removeItem("watched_videos");
        
        // Wipe cookies
        document.cookie = "xnite_precourse_progress=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        document.cookie = "pending_signup_payload=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        
        router.replace("/login");
      }

      // Set initial history state URL if no step parameter is present
      if (!stepParam) {
        router.replace(`?step=${initialStep}`);
      }

      return () => {
        // cleanup if needed
      };
    }
  }, [router, initialStep, stepParam]);

  return (
    <div className="min-h-screen bg-[#E0E1DD] dark:bg-[#060D14] transition-colors duration-200 relative overflow-y-auto overflow-x-hidden">
      <style>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-scale-in { animation: scaleIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fade-up { opacity: 0; animation: fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .delay-100 { animation-delay: 100ms; }
        .delay-200 { animation-delay: 200ms; }
        @keyframes float {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .mesh-blob {
          position: absolute;
          filter: blur(80px);
          border-radius: 50%;
          opacity: 0.4;
          animation: float 10s infinite ease-in-out;
        }
        .dark .mesh-blob {
          opacity: 0.15;
        }
        @keyframes pulseSlow {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }
        .animate-pulse-slow { animation: pulseSlow 3s infinite ease-in-out; }
      `}</style>

      {/* Theme Toggle */}
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>

      {/* Mesh Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none fixed">
        <div className="mesh-blob bg-[#55f761]" style={{ width: '40vw', height: '40vw', top: '-10%', left: '-10%', animationDelay: '0s', animationDuration: '12s' }}></div>
        <div className="mesh-blob bg-[#1F7A1F]" style={{ width: '50vw', height: '50vw', top: '40%', right: '-20%', animationDelay: '2s', animationDuration: '18s' }}></div>
        <div className="mesh-blob bg-[#3de34a]" style={{ width: '35vw', height: '35vw', bottom: '-10%', left: '20%', animationDelay: '4s', animationDuration: '14s' }}></div>
      </div>

      <div className="relative z-10">
        {step === "register" && (
          <div className="min-h-screen flex items-center justify-center p-4 sm:p-6">
            {process.env.NEXT_PUBLIC_ENABLE_REGISTRATION !== "true" ? (
              <div className="relative z-10 w-full flex flex-col justify-center max-w-lg bg-white/60 dark:bg-black/60 backdrop-blur-xl border border-white/40 dark:border-white/15 rounded-tr-2xl rounded-bl-2xl shadow-2xl p-8 sm:p-10 animate-scale-in text-center my-8">
                <div className="mx-auto flex items-center justify-center mb-6 h-12">
                  <img
                    src={theme === "light" ? "/logo/Logo-light.svg" : "/logo/Logo.svg"}
                    alt="Xnite Logo"
                    className="h-full w-auto object-contain"
                  />
                </div>
                
                <div className="w-16 h-16 mx-auto bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mb-6 animate-pulse-slow">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </div>

                <h1 className="text-2xl font-bold tracking-tight text-[#0D1B2A] dark:text-white mb-3">
                  Registration is Closed
                </h1>
                
                <p className="text-sm text-[#2F3E46] dark:text-white/70 leading-relaxed mb-8 max-w-md mx-auto">
                  We are not accepting new registrations at this time. If you already have an account, please proceed to the login page.
                </p>

                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="w-full bg-[#1F7A1F] hover:bg-[#145214] text-white dark:bg-[#55f761] dark:hover:bg-[#3de34a] dark:text-[#060D14] font-semibold rounded-xl py-3.5 text-sm transition-all shadow-lg shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20 flex justify-center items-center hover:scale-[1.02] active:scale-[0.98]"
                >
                  Return to Login
                </button>
              </div>
            ) : (
              <RegisterForm onNext={() => handleSetStep("complete-profile")}>
                {referrerSelect}
              </RegisterForm>
            )}
          </div>
        )}

        {step === "complete-profile" && (
          <div className="min-h-screen flex items-center justify-center p-4 sm:p-6">
            <CompleteProfileForm 
              initialFirstName={initialFirstName} 
              initialLastName={initialLastName}
              onNext={() => handleSetStep("welcome")}
            >
              {referrerSelect}
            </CompleteProfileForm>
          </div>
        )}

        {step === "welcome" && (
          <WelcomeFlow onNext={() => handleSetStep("pre-course")} />
        )}

        {step === "pre-course" && (
          <PreCourseFlow />
        )}
      </div>
    </div>
  );
}
