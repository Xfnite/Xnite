"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getSessionUser, forceGingerLoginAction } from "@/app/actions/auth";
import { getSystemSetting } from "@/app/actions/settings";
import { cacheGingerDataAction, getCachedGingerDataAction, getUserSoftwareAccountsFromDbAction, getUserTrainingsFromDbAction } from "@/app/actions/project";
import { toast } from "sonner";
const GINGER_BASE = process.env.NEXT_PUBLIC_GINGER_API_URL || "https://ginger.bitmappro.com";

export default function AccountPage() {
  const [activeTab, setActiveTab] = useState<string>("");
  const [userData, setUserData] = useState<any>(null);
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [messengerLink, setMessengerLink] = useState("");

  useEffect(() => {
    getSystemSetting("messenger_link_account", "").then(setMessengerLink);
  }, []);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [completedTrainings, setCompletedTrainings] = useState<any[]>([]);
  const [isRefreshingAccounts, setIsRefreshingAccounts] = useState<boolean>(false);
  const [walkthroughStep, setWalkthroughStep] = useState<number>(-1);
  const [timer, setTimer] = useState<number>(0);
  const [isManualOpen, setIsManualOpen] = useState<boolean>(false);
  const completedSteps = useRef<Set<number>>(new Set());

  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    const fetchAccountData = async () => {
      let loadedDetails: any = null;
      let loadedTrainings: any = null;

      // 1. Try loading cached data first to render the UI instantly
      try {
        const cachedDetails = await getCachedGingerDataAction('account_koala_details');
        if (isMounted && cachedDetails) {
          setUserData(cachedDetails);
          loadedDetails = cachedDetails;
          setIsLoading(false);
        }

        const cachedTrainings = await getCachedGingerDataAction('trainings');
        if (isMounted && cachedTrainings && Array.isArray(cachedTrainings) && cachedTrainings.length > 0) {
          const passed = cachedTrainings.filter((t: any) => t.training_status_desc === "STATUS_PASSED" || t.trainingStatus === "STATUS_PASSED" || t.passedTask > 0);
          setCompletedTrainings(passed);
          loadedTrainings = passed;
        }
      } catch (e) {
        console.error("Failed to load cached details/trainings", e);
      }

      // 2. If no cached user data, fall back to DB software accounts immediately
      if (!loadedDetails) {
        try {
          const dbRes = await getUserSoftwareAccountsFromDbAction();
          if (isMounted && dbRes.success && dbRes.data && dbRes.data.user) {
            const u = dbRes.data.user;
            const fallbackDetails = {
              db_role: u.role,
              email: u.email,
              user_name: u.gingerUsername || u.name,
              ginger_email: u.gingerEmail || u.email,
              ginger_password: u.gingerPassword || "••••••••",
              labeler_id: u.labelerId || undefined,
              labeler_password: u.labelerPassword || undefined,
            };
            setUserData(fallbackDetails);
            loadedDetails = fallbackDetails;
            setIsLoading(false);
          }
        } catch (e) {
          console.error("Failed to load local DB software accounts", e);
        }
      }

      // 3. Concurrently kick off background requests
      try {
        let fetchedUser: any = null;

        const getSessionAndToken = async () => {
          try {
            const user = await getSessionUser();
            if (isMounted && user) {
              setSessionUser(user);
              fetchedUser = user;
            }

            let token = null;
            const scrapedData = localStorage.getItem('scrapedGingerData');
            const parsed = scrapedData ? JSON.parse(scrapedData) : null;
            if (parsed?.credential?.access_token) {
              token = parsed.credential.access_token;
            } else if (user?.gingerToken) {
              token = user.gingerToken;
            } else {
              const forceRes = await forceGingerLoginAction();
              if (forceRes.success && forceRes.token) {
                token = forceRes.token;
              }
            }
            return token;
          } catch (e) {
            console.error("Error getting session and token", e);
            return null;
          }
        };

        const accountPromise = fetch('/api/account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }).then(res => res.ok ? res.json() : null).catch(() => null);

        const trainingsPromise = getSessionAndToken().then(async (token) => {
          if (!token) return null;
          try {
            const trResponse = await fetch(`${GINGER_BASE}/bac/mapping/annotate/training-annotate/list-ongoing-projects`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({ region: "phi" }),
            });
            if (trResponse.ok) {
              const trResult = await trResponse.json();
              const allTrainings = trResult.training_annotate_list || [];
              cacheGingerDataAction('trainings', allTrainings);
              return allTrainings;
            }
          } catch (e) {
            console.error("Failed to fetch fresh trainings in background", e);
          }
          return null;
        });

        const [accountResult, freshTrainings] = await Promise.all([
          accountPromise,
          trainingsPromise
        ]);

        if (isMounted && accountResult && accountResult.success) {
          const koalaDetails = accountResult.data?.koala_user_details || accountResult.koala_user_details;
          setUserData(koalaDetails);
          loadedDetails = koalaDetails;
          cacheGingerDataAction('account_koala_details', koalaDetails);

          // Auto-trigger guide logic
          const activeUser = fetchedUser || sessionUser;
          const isOldLabelerRole =
            activeUser?.role?.trim()?.toLowerCase() === "old-labeler" ||
            koalaDetails?.db_role?.trim()?.toLowerCase() === "old-labeler";
          if (isOldLabelerRole) {
            setWalkthroughStep(-1);
          } else {
            const trigger = searchParams.get("trigger_walkthrough") === "true";
            if (trigger) {
              localStorage.removeItem("account_walkthrough_completed");
              router.replace("/account");
            }

            const isCompleted = !trigger && (accountResult.walkthroughCompleted || localStorage.getItem("account_walkthrough_completed") === "true");
            if (!isCompleted) {
              const savedStep = localStorage.getItem("account_walkthrough_step");
              if (savedStep !== null) {
                setWalkthroughStep(parseInt(savedStep, 10));
              } else {
                setWalkthroughStep(0);
              }
            }
          }
        }

        if (isMounted && freshTrainings && Array.isArray(freshTrainings)) {
          const passed = freshTrainings.filter((t: any) => t.training_status_desc === "STATUS_PASSED");
          setCompletedTrainings(passed);
          loadedTrainings = passed;
        }

        // Fallbacks if background refresh failed completely
        if (isMounted && (!accountResult || !accountResult.success)) {
          if (!loadedDetails) {
            const cached = await getCachedGingerDataAction('account_koala_details');
            if (cached) {
              setUserData(cached);
            } else {
              const dbRes = await getUserSoftwareAccountsFromDbAction();
              if (dbRes.success && dbRes.data && dbRes.data.user) {
                const u = dbRes.data.user;
                setUserData({
                  db_role: u.role,
                  email: u.email,
                  user_name: u.gingerUsername || u.name,
                  ginger_email: u.gingerEmail || u.email,
                  ginger_password: u.gingerPassword || "••••••••",
                  labeler_id: u.labelerId || undefined,
                  labeler_password: u.labelerPassword || undefined,
                });
              } else {
                setError("Unable to load account details. Please check your connection or try again later.");
              }
            }
          }

          if (!loadedTrainings || loadedTrainings.length === 0) {
            const cachedTrainings = await getCachedGingerDataAction('trainings');
            if (cachedTrainings && Array.isArray(cachedTrainings) && cachedTrainings.length > 0) {
              const passed = cachedTrainings.filter((t: any) => t.training_status_desc === "STATUS_PASSED" || t.trainingStatus === "STATUS_PASSED" || t.passedTask > 0);
              setCompletedTrainings(passed);
            } else {
              const dbTrainings = await getUserTrainingsFromDbAction();
              if (dbTrainings.success && dbTrainings.data && Array.isArray(dbTrainings.data)) {
                const passed = dbTrainings.data.filter((t: any) => t.training_status_desc === "STATUS_PASSED" || t.trainingStatus === "STATUS_PASSED" || t.passedTask > 0);
                setCompletedTrainings(passed);
              }
            }
          }
        }
      } catch (err) {
        console.error("Error loading fresh data", err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchAccountData();

    return () => {
      isMounted = false;
    };
  }, [searchParams, router]);

  useEffect(() => {
    if (walkthroughStep === -1) {
      completedSteps.current.clear();
      setTimer(0);
      return;
    }

    if (
      sessionUser?.role?.trim()?.toLowerCase() === "old-labeler" ||
      userData?.db_role?.trim()?.toLowerCase() === "old-labeler"
    ) {
      setWalkthroughStep(-1);
      return;
    }

    // Save progress step in localStorage so we can resume if they navigate away
    localStorage.setItem("account_walkthrough_step", walkthroughStep.toString());

    // Skip countdown if opened manually via help button
    if (isManualOpen) {
      setTimer(0);
      completedSteps.current.add(walkthroughStep);
      return;
    }

    if (completedSteps.current.has(walkthroughStep)) {
      setTimer(0);
      return;
    }

    setTimer(5);
    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          completedSteps.current.add(walkthroughStep);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [walkthroughStep, isManualOpen]);



  const completeWalkthrough = async () => {
    localStorage.setItem("account_walkthrough_completed", "true");
    localStorage.removeItem("account_walkthrough_step");
    setIsManualOpen(false);
    setWalkthroughStep(-1);
    try {
      await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: "complete_walkthrough" }),
      });
    } catch (e) {
      console.error("Failed to complete walkthrough in Redis:", e);
    }
  };

  const togglePasswordVisibility = (key: string) => {
    setVisiblePasswords(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRefreshAccounts = async () => {
    if (isRefreshingAccounts) return;
    setIsRefreshingAccounts(true);
    try {
      const res = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceRefresh: true }),
      });
      const data = await res.json();
      if (data && data.success) {
        const koalaDetails = data.data?.koala_user_details || data.koala_user_details;
        if (koalaDetails) {
          setUserData(koalaDetails);
          cacheGingerDataAction('account_koala_details', koalaDetails);
        }
        toast.success("Software accounts refreshed successfully");
      } else {
        toast.error(data?.error || "Failed to refresh software accounts");
      }
    } catch (err) {
      console.error("Error refreshing accounts:", err);
      toast.error("Failed to refresh software accounts");
    } finally {
      setIsRefreshingAccounts(false);
    }
  };

  const formatAuthLevel = (level: string) => {
    return level.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const groupedRoles = userData?.koala_user_role?.reduce((acc: any, roleObj: any) => {
    if (!acc[roleObj.role]) {
      acc[roleObj.role] = [];
    }
    acc[roleObj.role].push(roleObj);
    return acc;
  }, {});

  const hasGroup = userData?.group_name && userData.group_name !== "-" && userData.group_name !== "null" && userData.group_name !== "undefined" && userData.group_name.trim() !== "";
  const hasTeam = userData?.team_name && userData.team_name !== "-" && userData.team_name !== "null" && userData.team_name !== "undefined" && userData.team_name.trim() !== "";
  const isOldLabeler =
    sessionUser?.role?.trim()?.toLowerCase() === "old-labeler" ||
    userData?.db_role?.trim()?.toLowerCase() === "old-labeler";

  return (
    <div className="relative w-full min-h-full">
      {/* Mesh Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute bg-[#55f761] filter blur-[100px] rounded-full opacity-30 dark:opacity-15" style={{ width: '40vw', height: '40vw', top: '-10%', left: '-10%' }}></div>
        <div className="absolute bg-[#1F7A1F] filter blur-[100px] rounded-full opacity-30 dark:opacity-15" style={{ width: '50vw', height: '50vw', top: '40%', right: '-20%' }}></div>
      </div>

      <div className={`relative space-y-6 lg:space-y-10 w-full max-w-5xl mx-auto pt-4 pb-12 ${walkthroughStep >= 0 ? 'z-[10000]' : 'z-10'
        }`}>
        <section className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${walkthroughStep >= 0 ? 'opacity-20 pointer-events-none' : ''
          }`}>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#0D1B2A] dark:text-white mb-1">Account Info</h1>
            <p className="text-sm text-[#2F3E46] dark:text-white/60">
              Manage and view your user profile and software access details.
            </p>
          </div>
          {
            !isOldLabeler && <button
              onClick={() => { setIsManualOpen(true); setWalkthroughStep(0); }}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 text-[#1F7A1F] dark:text-[#55f761] hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 transition-all duration-300 shadow-sm self-start sm:self-auto"
              title="Show Guide"
              aria-label="Show Guide"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
              </svg>
            </button>
          }

        </section>

        {error && (
          <div className={`p-4 bg-red-500/10 border-b border-red-500/20 text-red-600 dark:text-red-400 text-sm rounded-xl ${walkthroughStep >= 0 ? 'opacity-20 pointer-events-none' : ''
            }`}>
            {error}
          </div>
        )}

        <section className="w-full">
          <div className={`rounded-tr-3xl rounded-bl-3xl overflow-hidden p-6 lg:p-8 ${walkthroughStep >= 0
            ? 'bg-transparent border border-transparent shadow-none backdrop-blur-none'
            : 'bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-xl'
            }`}>

            {isLoading ? (
              <div className="p-12 flex flex-col items-center justify-center text-[#2F3E46] dark:text-white/60">
                <div className="w-8 h-8 border-2 border-[#1F7A1F] border-t-transparent rounded-full animate-spin mb-3"></div>
                Loading profile details...
              </div>
            ) : !userData ? (
              <div className="p-12 text-center text-[#2F3E46] dark:text-white/60">
                No profile data found.
              </div>
            ) : (
              <div className="space-y-8">

                {/* Profile Grid */}
                <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${walkthroughStep >= 0 ? 'opacity-20 pointer-events-none' : ''
                  }`}>

                  {/* Left Column */}
                  <div className="flex flex-col gap-3">
                    {/* Name & Status Card */}
                    <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl py-3.5 px-4 flex flex-col justify-center relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 rounded-full blur-xl -translate-y-8 translate-x-8"></div>

                      <div className="flex justify-between items-start mb-1 z-10">
                        <div className="text-xs text-[#2F3E46] dark:text-white/60">Username</div>
                        {(userData?.db_role || sessionUser?.role) && (
                          <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase bg-[#1F7A1F]/10 text-[#1F7A1F] dark:text-[#55f761]">
                            {userData.db_role || sessionUser?.role}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 relative z-10">
                        <span className="text-lg font-bold text-[#0D1B2A] dark:text-white">
                          {(userData.db_email || userData.user_email || "").replace(/@.*$/, "")}
                        </span>
                        <button
                          onClick={() => {
                            const username = (userData.db_email || userData.user_email || "").replace(/@.*$/, "");
                            navigator.clipboard.writeText(username);
                            setCopiedKey("username");
                            setTimeout(() => setCopiedKey(null), 2000);
                          }}
                          className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-gray-400 hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-colors"
                          title="Copy Username"
                        >
                          {copiedKey === "username" ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#1F7A1F] dark:text-[#55f761]"><polyline points="20 6 9 17 4 12" /></svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                          )}
                        </button>
                      </div>
                      <div className="text-xs text-[#2F3E46] dark:text-white/60 mt-1 opacity-80">
                        {userData.db_email || userData.user_email}
                      </div>

                      {/* <div className="text-[11px] text-[#2F3E46] dark:text-white/50 mt-3 border-t border-black/5 dark:border-white/5 pt-2">
                        Default Role: <span className="font-semibold text-[#0D1B2A] dark:text-white capitalize">{userData.role || '-'}</span>
                      </div> */}
                    </div>

                    {/* Group & Team Card */}
                    <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl py-3.5 px-4 flex flex-col justify-center flex-grow">
                      <div className="text-xs text-[#2F3E46] dark:text-white/60 mb-2.5">Group & Team Chat Links</div>
                      {!hasGroup && !hasTeam ? (
                        <span className="text-sm font-bold text-[#0D1B2A] dark:text-white opacity-50">N/A</span>
                      ) : (
                        <div className="space-y-4">
                          {/* Group Section */}
                          {hasGroup && (
                            <div>
                              <div className="text-sm font-bold text-[#0D1B2A] dark:text-white">
                                {userData.group_name} <span className="opacity-50">[{userData.group_id}]</span>
                              </div>
                              {(userData.group_checker_link || userData.group_judger_link) && (
                                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                                  {userData.group_checker_link && (
                                    <a
                                      href={userData.group_checker_link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1F7A1F] dark:text-[#55f761] hover:text-[#1A661A] dark:hover:text-[#4ae055] transition-colors bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 px-2 py-0.5 rounded border border-[#1F7A1F]/20 dark:border-[#55f761]/20 shadow-sm"
                                      title="Join Checker Group Chat"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                                      </svg>
                                      <span>Join Checker Group Chat</span>
                                    </a>
                                  )}
                                  {userData.group_judger_link && 
                                    ["judger", "recruiter", "admin", "superadmin"].includes(userData.db_role?.trim()?.toLowerCase() || sessionUser?.role?.trim()?.toLowerCase() || "") && (
                                    <a
                                      href={userData.group_judger_link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors bg-blue-500/10 dark:bg-blue-400/10 px-2 py-0.5 rounded border border-blue-500/20 dark:border-blue-400/20 shadow-sm"
                                      title="Join Judger Group Chat"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                                      </svg>
                                      <span>Join Judger Group Chat</span>
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Team Section */}
                          {hasTeam && (
                            <div>
                              <div className="text-sm font-semibold text-[#0D1B2A] dark:text-white">
                                {userData.team_name} <span className="opacity-50">[{userData.team_id}]</span>
                              </div>
                              {(userData.team_checker_link || userData.team_judger_link) && (
                                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                                  {userData.team_checker_link && (
                                    <a
                                      href={userData.team_checker_link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1F7A1F] dark:text-[#55f761] hover:text-[#1A661A] dark:hover:text-[#4ae055] transition-colors bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 px-2 py-0.5 rounded border border-[#1F7A1F]/20 dark:border-[#55f761]/20 shadow-sm"
                                      title="Join Team Checker Group Chat"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                                      </svg>
                                      <span>Join Checker Group Chat</span>
                                    </a>
                                  )}
                                  {userData.team_judger_link && (
                                    <a
                                      href={userData.team_judger_link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors bg-blue-500/10 dark:bg-blue-400/10 px-2 py-0.5 rounded border border-blue-500/20 dark:border-blue-400/20 shadow-sm"
                                      title="Join Team Judger Group Chat"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                                      </svg>
                                      <span>Join Judger Group Chat</span>
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl py-3.5 px-4 flex flex-col h-full">
                    <div className="text-xs text-[#2F3E46] dark:text-white/60 mb-4">Trainings Completed</div>
                    {completedTrainings.length > 0 ? (
                      <div className="flex flex-wrap gap-2.5">
                        {completedTrainings.map((t, i) => {
                          const isStandardBuilding = t.annotate_project_id === 1 || t.annotate_sub_project_id === 1;
                          const projectName = isStandardBuilding ? 'Standard Building' : (t.annotate_sub_project_name || t.annotate_name || "Unknown Training");
                          return (
                            <span key={i} className="inline-flex items-center rounded-full bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 px-3 py-1.5 text-xs font-bold uppercase text-[#1F7A1F] dark:text-[#55f761] border border-[#1F7A1F]/20 dark:border-[#55f761]/20 shadow-sm transition-all hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20">
                              {projectName}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center flex-grow py-4 text-[#1F7A1F] dark:text-[#55f761] opacity-60 hover:opacity-100 transition-opacity">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mb-3">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                        </svg>
                        <span className="text-lg font-bold text-center">No trainings completed yet</span>
                      </div>
                    )}
                  </div>

                </div>

                {/* Authority Level */}
                {/* <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-5">
                  <div className="text-xs text-[#2F3E46] dark:text-white/60 mb-2">Authority Level</div>
                  <div className="flex flex-wrap gap-2">
                    {userData.authority_level_list?.map((level: string, i: number) => (
                      <span key={i} className="inline-flex items-center rounded-full bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 px-3 py-1.5 text-xs font-bold uppercase text-[#1F7A1F] dark:text-[#55f761] border border-[#1F7A1F]/20 dark:border-[#55f761]/20 shadow-sm">
                        {formatAuthLevel(level)}
                      </span>
                    )) || <span className="text-sm text-[#2F3E46]/50">-</span>}
                  </div>
                </div> */}

                {/* Software Accounts */}
                <div
                  id="walkthrough-software-accounts"
                  className={`pt-4 ${walkthroughStep >= 0
                    ? 'relative z-[10000] pointer-events-none border-t-transparent'
                    : 'border-t border-black/10 dark:border-white/10'
                    }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <h3 className={`text-lg font-bold text-[#0D1B2A] dark:text-white ${walkthroughStep >= 0 ? 'opacity-20' : ''
                        }`}>
                        Software Accounts
                      </h3>
                      <button
                        onClick={handleRefreshAccounts}
                        disabled={isRefreshingAccounts}
                        className="p-1.5 rounded-lg text-[#2F3E46]/60 dark:text-white/60 hover:text-[#1F7A1F] dark:hover:text-[#55f761] hover:bg-black/5 dark:hover:bg-white/10 transition-all duration-200 disabled:opacity-50"
                        title="Refresh Software Accounts"
                        aria-label="Refresh Software Accounts"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                          className={`w-4 h-4 ${isRefreshingAccounts ? 'animate-spin text-[#1F7A1F] dark:text-[#55f761]' : ''}`}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {isRefreshingAccounts ? (
                    <div className="space-y-6 animate-pulse">
                      {/* Skeleton role tabs */}
                      <div className="flex gap-2 mb-6 overflow-x-auto hide-scrollbar">
                        <div className="h-8 w-24 bg-black/10 dark:bg-white/10 rounded-full"></div>
                        <div className="h-8 w-20 bg-black/5 dark:bg-white/5 rounded-full"></div>
                        <div className="h-8 w-20 bg-black/5 dark:bg-white/5 rounded-full"></div>
                      </div>

                      {/* Skeleton cards grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className="relative flex flex-col p-5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl space-y-4"
                          >
                            <div className="flex justify-between items-center">
                              <div className="h-3 w-14 bg-black/10 dark:bg-white/10 rounded"></div>
                              <div className="h-4 w-12 bg-black/10 dark:bg-white/10 rounded-full"></div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-[#1F7A1F]/30 dark:bg-[#55f761]/30"></div>
                              <div className="h-4 w-28 bg-black/15 dark:bg-white/15 rounded"></div>
                            </div>
                            <div className="space-y-1.5 pt-1">
                              <div className="h-3 w-16 bg-black/10 dark:bg-white/10 rounded"></div>
                              <div className="h-9 w-full bg-black/10 dark:bg-white/10 rounded-xl"></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : groupedRoles && Object.keys(groupedRoles).length > 0 ? (
                    <div>
                      <div className={`flex gap-2 mb-6 overflow-x-auto hide-scrollbar ${walkthroughStep >= 0 ? 'opacity-20 pointer-events-none' : ''
                        }`}>
                        {Object.keys(groupedRoles).map((roleName) => (
                          <button
                            key={roleName}
                            onClick={() => setActiveTab(roleName)}
                            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-full transition-all duration-300 ${(activeTab || Object.keys(groupedRoles)[0]) === roleName
                              ? 'bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] shadow-md shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20'
                              : 'bg-black/5 dark:bg-white/5 text-[#2F3E46] dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10'
                              }`}
                          >
                            {roleName}
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {groupedRoles[activeTab || Object.keys(groupedRoles)[0]]?.map((role: any, idx: number) => {
                          const currentTab = activeTab || Object.keys(groupedRoles)[0];
                          const userRole = userData?.db_role || sessionUser?.role;
                          const isDefault = currentTab.toLowerCase() === userRole?.toLowerCase() || role.role?.toLowerCase() === userRole?.toLowerCase();
                          return (
                            <div
                              key={idx}
                              className={`relative p-[1.5px] overflow-hidden rounded-2xl shadow-lg transition-all duration-300 group flex w-full ${isDefault ? 'scale-[1.01] shadow-[0_0_20px_rgba(85,247,97,0.15)]' : 'hover:scale-[1.01]'
                                } ${walkthroughStep >= 0 ? 'relative z-[10000] pointer-events-auto' : ''
                                }`}>
                              {/* Animated rotating border gradient */}
                              <div className={`absolute inset-0 rounded-2xl ${isDefault ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'} transition-opacity duration-300 animate-pulse`}>
                                <div className="absolute inset-[-1000%] animate-[spin_5s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#1F7A1F_0%,#55f761_25%,#1F7A1F_50%,#55f761_75%,#1F7A1F_100%)]" />
                              </div>

                              {/* Inner content container */}
                              <div className="relative flex-grow flex flex-col p-5 bg-white/90 dark:bg-black/90 backdrop-blur-xl rounded-[14px] z-10 w-full">
                                <div className="flex justify-between items-center mb-1">
                                  <div className="text-xs font-semibold text-[#2F3E46] dark:text-white/60">User ID</div>
                                  {isDefault && (
                                    <span className="text-[9px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] shadow-sm select-none">
                                      Default
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mb-4">
                                  <span className="relative flex h-2 w-2">
                                    {isDefault && (
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1F7A1F] dark:bg-[#55f761] opacity-75"></span>
                                    )}
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#1F7A1F] dark:bg-[#55f761] shadow-[0_0_8px_rgba(85,247,97,0.8)]"></span>
                                  </span>
                                  <span className="text-sm font-mono font-bold text-[#0D1B2A] dark:text-white">{role.role_user_id}</span>
                                </div>
                                <div className="text-xs font-semibold text-[#2F3E46] dark:text-white/60 mb-1">Password</div>
                                <div className="flex items-center justify-between text-sm font-mono font-bold text-[#0D1B2A] dark:text-white bg-black/5 dark:bg-white/5 py-2 px-4 rounded-xl border border-black/5 dark:border-white/5">
                                  <span className="tracking-widest">
                                    {visiblePasswords[`${currentTab}-${idx}`] ? role.role_password : "••••••••"}
                                  </span>
                                  <div className="flex items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => togglePasswordVisibility(`${currentTab}-${idx}`)}
                                      className="hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-colors p-1"
                                      title={visiblePasswords[`${currentTab}-${idx}`] ? "Hide Password" : "Show Password"}
                                    >
                                      {visiblePasswords[`${currentTab}-${idx}`] ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                                      ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                      )}
                                    </button>
                                    <button
                                      onClick={() => copyToClipboard(role.role_password, `${currentTab}-${idx}`)}
                                      className="hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-colors p-1"
                                      title="Copy Password"
                                    >
                                      {copiedKey === `${currentTab}-${idx}` ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-[#55f761]"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                                      ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-[#2F3E46]/50 dark:text-white/50">No accounts found.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Walkthrough Tooltip Overlay */}
      {walkthroughStep >= 0 && (
        <>
          {/* Backdrop overlay - offset on medium/large screens to not cover the sidebar */}
          <div className="fixed top-0 bottom-0 right-0 left-0 md:left-[240px] z-[9998] bg-black/85 transition-all duration-300" />

          <div className="fixed top-14 bottom-0 right-0 left-0 md:left-[240px] z-[10001] flex items-center justify-end p-10 transition-all duration-300 pointer-events-none">
            <div className="relative w-full max-w-xl h-auto min-h-[590px] flex flex-col justify-between bg-white/95 dark:bg-[#0D1B2A]/95 backdrop-blur-xl border border-[#1F7A1F]/30 dark:border-[#55f761]/30 rounded-3xl shadow-2xl p-6 lg:p-8 transition-all duration-300 transform scale-100 pointer-events-auto overflow-hidden">
              {/* Ambient background glow inside modal */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#55f761]/10 rounded-full blur-xl pointer-events-none"></div>

              <div className="space-y-4">
                {/* Step Counter */}
                <div className="flex justify-between items-center mb-2 relative z-10">
                  <span className="text-[10px] font-black tracking-widest text-[#1F7A1F] dark:text-[#55f761] uppercase bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 px-2.5 py-1 rounded-full">
                    Step {walkthroughStep === 4 ? (isOldLabeler ? 4 : 5) : walkthroughStep + 1} of {isOldLabeler ? 4 : 5}
                  </span>
                </div>

                {/* Content */}
                <div className="space-y-4 relative z-10">
                  <h3 className="text-lg font-extrabold text-[#0D1B2A] dark:text-white tracking-tight">
                    {walkthroughStep === 0 && "Step 1: Logging in to Ginger"}
                    {walkthroughStep === 1 && "Step 2: Starting Training"}
                    {walkthroughStep === 2 && "Step 3: Please complete all Hands-On Training tasks"}
                    {!isOldLabeler && walkthroughStep === 3 && "Step 4: Join General Community Chat"}
                    {walkthroughStep === 4 && (isOldLabeler ? "Step 4: Finish Training" : "Step 5: Finish Training")}
                  </h3>

                  {/* Standardized Image Wrapper (fixed height of h-56) */}
                  <div className="w-full h-56 overflow-hidden rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 p-2 flex justify-center items-center shadow-inner">
                    <img
                      src={
                        walkthroughStep === 0
                          ? "/images/ginger-login.png"
                          : walkthroughStep === 1
                            ? "/images/ginger-download.png"
                            : walkthroughStep === 2
                              ? "/images/ginger-step3.jpeg"
                              : walkthroughStep === 3
                                ? "/socials/chat.png"
                                : "/images/ginger-step4.jpeg"
                      }
                      alt="Ginger Onboarding Screen"
                      className="h-full w-full object-contain rounded-lg transition-transform duration-300 hover:scale-105"
                    />
                  </div>

                  <div className="max-h-[120px] overflow-y-auto pr-1 text-sm leading-relaxed text-[#2F3E46]/90 dark:text-white/80">
                    {walkthroughStep === 0 && (
                      <>
                        After installing the pre-requisite and extracting our software and watching all training videos and guides, we can now login using your ginger ids in the software.
                        <br /><br />
                        Open “ginger-202*.exe”, choose “Agree”, and enter your ginger ID and Password, If the software asks you to update, let it update and restart ginger
                      </>
                    )}
                    {walkthroughStep === 1 && "You may now start your Hands-on Training. On the upper Left, press the “Arrow Down” icon or the Download Icon to start your task."}
                    {walkthroughStep === 2 && (
                      <>
                        After submitting a task, a "Waiting for Checker" status will appear. Your task will then be reviewed by a Checker, which may take anywhere from 30 minutes to 24 hours, depending on the number of Challengers currently in training.
                        <br /><br />
                        If your task contains mistakes, it may be returned with Checker comments. Please carefully review the feedback, make the necessary corrections, and resubmit the task.
                        <br /><br />
                        Important: Returned tasks do not automatically appear in Ginger. Make sure to download tasks periodically to check for returned tasks and Checker comments.
                      </>
                    )}
                    {walkthroughStep === 3 && (
                      <div className="flex flex-col items-center gap-3 text-center">
                        <span>
                          Please join our general community chat, it's more fun working with your co-challengers 😊
                        </span>
                        <a
                          href={messengerLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center justify-center px-6 py-2 text-xs font-bold bg-[#1F7A1F] hover:bg-[#1A661A] dark:bg-[#55f761] dark:hover:bg-[#4ae055] text-white dark:text-[#060D14] rounded-full shadow-lg shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20 transition-all uppercase tracking-wider cursor-pointer gap-2"
                        >
                          Join Community Chat
                        </a>
                      </div>
                    )}
                    {walkthroughStep === 4 && (
                      <>
                        To receive the Congratulations pop-up, make sure to download tasks periodically to check for updates.
                        <br /><br />
                        If a Checker returns your task, review the comments, fix the errors, and resubmit it. Once all of your training tasks have been approved, the Congratulations pop-up will appear after downloading task once again.
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Navigation Actions */}
              <div className="flex flex-col mt-4 pt-4 border-t border-black/10 dark:border-white/10 relative z-10 gap-3">
                <div className="flex items-center w-full">
                  <div className="flex-shrink-0">
                    {walkthroughStep > 0 && (
                      <button
                        onClick={() => {
                          if (isOldLabeler && walkthroughStep === 4) {
                            setWalkthroughStep(2);
                          } else {
                            setWalkthroughStep((prev) => prev - 1);
                          }
                        }}
                        className="w-28 h-9 text-xs font-bold border border-black/10 dark:border-white/10 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#2F3E46] dark:text-white/80 transition-all uppercase tracking-wider flex items-center justify-center cursor-pointer"
                      >
                        Back
                      </button>
                    )}
                  </div>

                  <div className="ml-auto">
                    {walkthroughStep < 4 ? (
                      <button
                        onClick={() => {
                          if (isOldLabeler && walkthroughStep === 2) {
                            setWalkthroughStep(4);
                          } else {
                            setWalkthroughStep((prev) => prev + 1);
                          }
                        }}
                        disabled={timer > 0}
                        className="w-28 h-9 text-xs font-bold bg-[#1F7A1F] hover:bg-[#1A661A] dark:bg-[#55f761] dark:hover:bg-[#4ae055] text-white dark:text-[#060D14] rounded-full shadow-lg shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20 transition-all uppercase tracking-wider flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next {timer > 0 ? `(${timer})` : ""}
                      </button>
                    ) : (
                      <button
                        onClick={completeWalkthrough}
                        disabled={timer > 0 || !completedTrainings.some((t: any) => t.annotate_project_id === 1 || t.annotate_sub_project_id === 1)}
                        className="w-64 h-9 text-xs font-bold bg-[#1F7A1F] hover:bg-[#1A661A] dark:bg-[#55f761] dark:hover:bg-[#4ae055] text-white dark:text-[#060D14] rounded-full shadow-lg shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20 transition-all uppercase tracking-wider flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Finish Hands on Training {timer > 0 ? `(${timer})` : ""}
                      </button>
                    )}
                  </div>
                </div>

                {/* Warning note centered at bottom */}
                {walkthroughStep === 4 && !completedTrainings.some((t: any) => t.annotate_project_id === 1 || t.annotate_sub_project_id === 1) && (
                  <div className="w-full mt-4 flex flex-col items-center gap-1 px-4">
                    <p className="text-sm font-extrabold text-[#1F7A1F] dark:text-[#55f761] text-center tracking-tight">
                      You may now open your Ginger Software.
                    </p>
                    <p className="text-xs text-amber-600/90 dark:text-amber-400/90 text-center max-w-sm">
                      Download task and complete the Standard Building Hands-on training first to proceed.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
