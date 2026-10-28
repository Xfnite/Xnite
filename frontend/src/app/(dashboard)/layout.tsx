"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Toaster } from "sonner";
import Header from "@/app/components/header";
import Sidebar from "@/app/components/sidebar";
import LogoutModal from "@/app/components/LogoutModal";
import ChatWidget from "@/app/components/ChatWidget";
import JukeboxWidget from "@/app/components/JukeboxWidget";
import QuestWidget from "@/app/components/QuestWidget";
import { GATES, canEarnInnerCouncil } from "@/config/permissions";
import { getInnerCouncilAccessAction } from "@/app/actions/user";
import WalletWalkthroughProvider from "@/components/Wallet/WalletWalkthroughProvider";
import {
  logoutAction,
  getSessionUser,
  checkStandardBuildingPassedAction,
  getTrainingPassStatusAction,
  syncGingerRoleAction,
} from "@/app/actions/auth";
import { getReferralSlugAction } from "@/app/actions/referral";
import GlobalPerformanceAnnouncements from "@/components/GlobalPerformanceAnnouncements";
import GlobalLowHoursAnnouncements from "@/components/GlobalLowHoursAnnouncements";
import WelcomeTermsModal from "@/components/WelcomeTermsModal";

// The Ginger role sync calls Ginger's API; checking every few minutes per user is
// plenty, instead of on every page change. A different user always syncs at once.
const GINGER_ROLE_SYNC_INTERVAL_MS = 5 * 60 * 1000;
let lastGingerRoleSync = { email: "", at: 0 };

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name + "=([^;]*)"),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [isAuthChecking, setIsAuthChecking] = useState(true);
  // Flips true as soon as getSessionUser() resolves — independent of
  // isAuthChecking, which also waits on the (possibly slow, external-API-backed)
  // training-status/route-gating check below. QuestWidget only needs a known
  // user identity to start fetching its own data, so it's gated on this instead
  // of the full auth chain — see the render below.
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [userName, setUserName] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [referralCode, setReferralCode] = useState<string>("");
  const [referralSlug, setReferralSlug] = useState<string>("");
  const [userRole, setUserRole] = useState<string>("");
  const [isRegistered, setIsRegistered] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isStandardBuildingPassed, setIsStandardBuildingPassed] =
    useState(false);
  const [isRulesAndGuidelinesCompleted, setIsRulesAndGuidelinesCompleted] =
    useState(false);
  const [userGroupId, setUserGroupId] = useState<number | null>(null);
  const [userTeamId, setUserTeamId] = useState<number | null>(null);
  const [userCreatedAt, setUserCreatedAt] = useState<string | null>(null);
  const [hasClickedLandCoverTraining, setHasClickedLandCoverTraining] = useState(false);
  const [hasClickedTransportationTraining, setHasClickedTransportationTraining] = useState(false);
  const [isLandcoverPassed, setIsLandcoverPassed] = useState(false);
  const [isTransportationPassed, setIsTransportationPassed] = useState(false);
  const [onboardingProgress, setOnboardingProgress] = useState<any>(null);
  const [isDashboardCompleted, setIsDashboardCompleted] = useState(false);
  const [hasAgreedToTerms, setHasAgreedToTerms] = useState(true);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);

  useEffect(() => {
    const xniteSession = getCookie("xnite_session");
    const loginRedirect = `/login?redirect=${encodeURIComponent(pathname)}`;

    if (!xniteSession) {
      router.replace(loginRedirect);
      return;
    }

    getSessionUser().then((user) => {
      if (!user) {
        router.replace(loginRedirect);
        return;
      }
      const isDev =
        process.env.NEXT_PUBLIC_APP_ENV === "development" ||
        (process.env.NODE_ENV === "development" &&
          process.env.NEXT_PUBLIC_APP_ENV !== "production");

      setUserName(user.name);
      setUserEmail(user.email);
      setReferralCode(user.username || user.id.slice(0, 8));
      setUserRole(user.role || "");
      setIsRegistered(user.isRegistered);
      setIsDashboardCompleted(user.isDashboardCompleted);
      setIsRulesAndGuidelinesCompleted(
        user.isRulesAndGuidelinesCompleted || isDev,
      );
      setUserGroupId(user.group_id || null);
      setUserTeamId(user.team_id || null);
      setUserCreatedAt(user.createdAt ? String(user.createdAt) : null);
      setHasClickedLandCoverTraining(user.hasClickedLandCoverTraining || false);
      setHasClickedTransportationTraining(user.hasClickedTransportationTraining || false);
      setOnboardingProgress(user.onboardingProgress || null);
      setIsSessionReady(true);
      setHasAgreedToTerms(user.hasAgreedToTerms || false);

      const userCreationDate = user.createdAt ? new Date(user.createdAt) : new Date();
      const cutoffDate = new Date("2026-08-21T00:00:00Z");
      const isNewUser = userCreationDate > cutoffDate;
      
      if (user.isRegistered && !user.hasAgreedToTerms && isNewUser) {
        setShowWelcomeModal(true);
      }

      // Sync ginger role in the background
      if (
        lastGingerRoleSync.email !== user.email ||
        Date.now() - lastGingerRoleSync.at > GINGER_ROLE_SYNC_INTERVAL_MS
      ) {
        lastGingerRoleSync = { email: user.email, at: Date.now() };
        syncGingerRoleAction().then((res) => {
          if (res.success && res.roleChanged && res.role) {
            setUserRole(res.role);
          }
        }).catch(console.error);
      }

      if (
        user.role?.toLowerCase() === "recruiter" ||
        user.role?.toLowerCase() === "judger"
      ) {
        // Judgers and recruiters have already passed all trainings
        setIsStandardBuildingPassed(true);
        setIsLandcoverPassed(true);
        setIsTransportationPassed(true);
        setIsAuthChecking(false);
        return;
      }

      if (pathname !== "/dashboard" && !user.isDashboardCompleted) {
        router.replace("/dashboard");
        return;
      }

      // Auto-sync gingerToken to localStorage if present in cookies but missing from client storage
      if (user.gingerToken) {
        try {
          const scrapedData = localStorage.getItem("scrapedGingerData");
          const parsed = scrapedData ? JSON.parse(scrapedData) : null;
          if (
            !parsed?.credential?.access_token ||
            parsed.credential.access_token !== user.gingerToken
          ) {
            localStorage.setItem(
              "scrapedGingerData",
              JSON.stringify({
                credential: {
                  access_token: user.gingerToken,
                },
              }),
            );
          }
        } catch (err) {
          console.error("Failed to sync gingerToken to localStorage:", err);
        }
      } else if (!user.isRegistered) {
        // Trigger registration for legacy users who completed dashboard but aren't registered
        import("@/app/actions/auth").then(({ registerWithGingerAction }) => {
          registerWithGingerAction()
            .then((res) => {
              if (res.success && res.data?.credential?.access_token) {
                setIsRegistered(true);
                localStorage.setItem(
                  "scrapedGingerData",
                  JSON.stringify({
                    credential: {
                      access_token: res.data.credential.access_token,
                    },
                  }),
                );
                // Force page reload so the children components can pick up the token
                window.location.reload();
              }
            })
            .catch(console.error);
        });
      }

      // Try to get token from localStorage first, then from the user object (cookie)
      let clientToken = user.gingerToken;
      if (typeof window !== "undefined") {
        try {
          const scrapedData = localStorage.getItem("scrapedGingerData");
          const parsed = scrapedData ? JSON.parse(scrapedData) : null;
          if (parsed?.credential?.access_token) {
            clientToken = parsed.credential.access_token;
          }
        } catch (e) {}
      }

      // Check training status (standard building + side quest trainings).
      // Each check is skipped when its answer is already known, since this runs
      // on every page change.
      const roleLower = user.role?.toLowerCase() || "";
      const isTrainingExempt = ["admin", "checker", "judger"].includes(roleLower);
      const needsTrainingStatus =
        !isTrainingExempt && !(user.hasClickedLandCoverTraining && user.hasClickedTransportationTraining);
      Promise.all([
        // Anyone past "applicant" has passed Standard Building; the action returns
        // true for them without doing anything else.
        user.role !== "applicant"
          ? Promise.resolve(true)
          : checkStandardBuildingPassedAction(clientToken ?? undefined),
        // Exempt roles pass every training (as the action reports), and a user who
        // clicked both trainings counts as passed either way below.
        needsTrainingStatus
          ? getTrainingPassStatusAction()
          : Promise.resolve({
              isLandcoverPassed: isTrainingExempt,
              isTransportationPassed: isTrainingExempt,
              isRoofPassed: isTrainingExempt,
            }),
        // Only needed to let a labeler / old labeler into Top Mentors
        pathname.startsWith("/recruiter/ranking") && canEarnInnerCouncil(user.role)
          ? getInnerCouncilAccessAction().then((res) => res.hasAccess).catch(() => false)
          : Promise.resolve(false),
      ])
        .then(([passed, trainingStatus, hasInnerCouncilAccess]) => {
          const isDev =
            process.env.NEXT_PUBLIC_APP_ENV === "development" ||
            (process.env.NODE_ENV === "development" &&
              process.env.NEXT_PUBLIC_APP_ENV !== "production");
          const effectivelyPassed = passed || isDev;

          const ctx = {
            role: user.role,
            isStandardBuildingPassed: effectivelyPassed,
            onboardingDone: user.isDashboardCompleted,
            isRulesAndGuidelinesCompleted: user.isRulesAndGuidelinesCompleted || isDev,
            hasInnerCouncilAccess,
          };

          setIsStandardBuildingPassed(effectivelyPassed);
          // New users: clicking the register button is enough
          // Legacy users: already passed so no button — check actual pass status as fallback
          setIsLandcoverPassed(user.hasClickedLandCoverTraining || trainingStatus.isLandcoverPassed);
          setIsTransportationPassed(user.hasClickedTransportationTraining || trainingStatus.isTransportationPassed);

          // Enforce route gating using centralized visibility rules
          if (
            pathname.startsWith("/project") ||
            pathname.startsWith("/wallet") ||
            pathname.startsWith("/ranking") ||
            pathname.startsWith("/attendance") ||
            pathname.startsWith("/recruiter")
          ) {
            if (!GATES.canAccessRoute(pathname, ctx)) {
              if (pathname.startsWith("/ranking") && !user.isRulesAndGuidelinesCompleted && !isDev) {
                router.replace("/project");
              } else {
                router.replace("/account");
              }
              return;
            }
          }

          setIsAuthChecking(false);
        })
        .catch((err) => {
          console.error("Failed to check training status:", err);
          setIsAuthChecking(false);
        });
    });
  }, [router, pathname]);

  // Short referral code (e.g. "cedrickr"). It's created on the first visit and never
  // changes, so it's loaded once instead of on every page change like the user above.
  useEffect(() => {
    getReferralSlugAction().then((slug) => {
      if (slug) setReferralSlug(slug);
    });
  }, []);

  useEffect(() => {
    const handleRulesCompleted = () => setIsRulesAndGuidelinesCompleted(true);
    window.addEventListener(
      "rules_and_guidelines_completed",
      handleRulesCompleted,
    );
    return () =>
      window.removeEventListener(
        "rules_and_guidelines_completed",
        handleRulesCompleted,
      );
  }, []);

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const executeLogout = async () => {
    setShowLogoutModal(false);
    setIsLoggingOut(true);
    try {
      await logoutAction();
    } catch {
      // swallow — always redirect
    } finally {
      localStorage.removeItem("scrapedGingerData");
      setIsLoggingOut(false);
      router.push("/login");
    }
  };

  // Training gates for the quest log. hasClicked* lands with the session (early,
  // but only reflects the register-button click); isLandcoverPassed/
  // isTransportationPassed land with the slower training-status check and are
  // the broader signal (click OR an actual recorded pass, plus recruiters and
  // judgers who are exempt). Taking the union means the widget unlocks as soon
  // as either source says so and never flips back off while the check is still
  // in flight.
  const landCoverUnlocked = hasClickedLandCoverTraining || isLandcoverPassed;
  const transportationUnlocked =
    hasClickedTransportationTraining || isTransportationPassed;

  // QuestWidget lives at this fixed position in the tree on every render, as a
  // sibling of the spinner-vs-full-layout choice below — not nested inside
  // either branch. It only needs the user identity (isSessionReady), not the
  // training-check/route-gating result isAuthChecking is waiting on. Because
  // its position and parent never change across the isAuthChecking transition,
  // React keeps the same instance mounted instead of tearing it down and
  // recreating it, so its data fetch (getLoyaltyData) starts as soon as the
  // session is known and is never reset when the rest of the layout unblocks.
  return (
    <>
      {isAuthChecking ? (
        <div className="min-h-screen flex items-center justify-center bg-[#E0E1DD] dark:bg-[#060D14]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0D1B2A] dark:border-[#E0E1DD]"></div>
        </div>
      ) : (
        <div className="h-screen flex flex-col bg-[#E0E1DD] dark:bg-[#060D14] font-sans transition-colors duration-200">
          <Header
            userName={userName}
            userEmail={userEmail}
            isLoggingOut={isLoggingOut}
            onLogout={handleLogout}
            onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            isDashboardCompleted={isDashboardCompleted}
            isStandardBuildingPassed={isStandardBuildingPassed}
            role={userRole}
          />

          <WalletWalkthroughProvider>
            <div className="flex flex-1 overflow-hidden w-full relative">
              <Sidebar
                isOpen={isMobileMenuOpen}
                onClose={() => setIsMobileMenuOpen(false)}
                isRegistered={isRegistered}
                isStandardBuildingPassed={isStandardBuildingPassed}
                isDashboardCompleted={isDashboardCompleted}
                isRulesAndGuidelinesCompleted={isRulesAndGuidelinesCompleted}
                email={userEmail}
                referralCode={referralSlug || referralCode}
                role={userRole}
                createdAt={userCreatedAt}
              />
              <main className="flex-1 overflow-y-auto p-6">{children}</main>

          {process.env.NEXT_PUBLIC_ENABLE_CHAT !== 'false' && (
            <ChatWidget
              currentUser={{ email: userEmail, role: userRole, name: userName, groupId: userGroupId, teamId: userTeamId }}
              isStandardBuildingPassed={isStandardBuildingPassed}
            />
          )}
          <JukeboxWidget 
            currentUser={{ email: userEmail, role: userRole, name: userName }}
          />
        </div>
      </WalletWalkthroughProvider>
      <Toaster position="top-right" richColors closeButton />

          <LogoutModal
            isOpen={showLogoutModal}
            onClose={() => setShowLogoutModal(false)}
            onConfirm={executeLogout}
          />
          <GlobalPerformanceAnnouncements />
          <GlobalLowHoursAnnouncements />
          <WelcomeTermsModal
            isOpen={showWelcomeModal}
            onAgreed={() => {
              setHasAgreedToTerms(true);
              setShowWelcomeModal(false);
            }}
          />
        </div>
      )}

      {isSessionReady && (
        <QuestWidget
          currentUser={{ email: userEmail, role: userRole, name: userName, groupId: userGroupId }}
          isRegistered={isRegistered}
          isStandardBuildingPassed={isStandardBuildingPassed}
          isDashboardCompleted={isDashboardCompleted}
          isRulesAndGuidelinesCompleted={isRulesAndGuidelinesCompleted}
          hasClickedLandCoverTraining={landCoverUnlocked}
          hasClickedTransportationTraining={transportationUnlocked}
          onboardingProgress={onboardingProgress}
        />
      )}
    </>
  );
}
