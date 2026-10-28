"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, Calendar, Key, Lock } from "lucide-react";
import {
  getMeetingBySlugAction,
  markAttendanceAction,
} from "@/app/actions/attendance";
import { getSessionUser } from "@/app/actions/auth";

export default function AttendanceCheckinPage() {
  const params = useParams();
  const router = useRouter();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : (params?.slug as string);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [meeting, setMeeting] = useState<any>(null);
  const [passcode, setPasscode] = useState("");
  const [isMarking, setIsMarking] = useState(false);

  const fetchMeeting = async () => {
    try {
      const res = await getMeetingBySlugAction(slug);
      if (res.success && res.meeting) {
        if (res.meeting.isOwner) {
          router.replace("/attendance");
          return;
        }
        setMeeting(res.meeting);
        setError("");
      } else {
        setError(res.error || "Attendance session not found.");
      }
    } catch {
      setError("An unexpected error occurred while loading this session.");
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (!slug) return;

    getSessionUser().then((user) => {
      const role = user?.role?.trim().toLowerCase();
      const isAllowed = role === "checker" || role === "judger" || role === "admin";
      if (!user || !isAllowed) {
        router.replace("/dashboard");
        return;
      }
      fetchMeeting();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const formatDate = (dateInput: any) => {
    const d = new Date(dateInput);
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (dateInput: any) => {
    const d = new Date(dateInput);
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) {
      toast.error("Please enter the passcode.");
      return;
    }

    setIsMarking(true);
    try {
      const res = await markAttendanceAction(meeting.id, passcode);
      if (res.success) {
        toast.success("Attendance marked successfully!");
        setPasscode("");
        await fetchMeeting();
      } else {
        toast.error(res.error || "Incorrect passcode.");
      }
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setIsMarking(false);
    }
  };

  return (
    <div className="relative w-full min-h-full flex items-center justify-center py-12">
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div
          className="absolute bg-[#55f761] filter blur-[100px] rounded-full opacity-30 dark:opacity-15"
          style={{ width: "40vw", height: "40vw", top: "-10%", left: "-10%" }}
        ></div>
        <div
          className="absolute bg-[#1F7A1F] filter blur-[100px] rounded-full opacity-30 dark:opacity-15"
          style={{ width: "50vw", height: "50vw", top: "40%", right: "-20%" }}
        ></div>
      </div>

      <div className="relative z-10 w-full max-w-sm px-4">
        <div className="rounded-tr-3xl rounded-bl-3xl overflow-hidden p-6 lg:p-8 bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-xl">
          {isLoading ? (
            <div className="py-8 flex flex-col items-center justify-center text-[#2F3E46] dark:text-white/60">
              <div className="w-8 h-8 border-2 border-[#1F7A1F] border-t-transparent rounded-full animate-spin mb-3"></div>
              Loading session...
            </div>
          ) : error ? (
            <div className="py-8 text-center text-[#2F3E46] dark:text-white/60 flex flex-col items-center gap-2">
              <Lock className="w-8 h-8 opacity-40 mb-2" />
              <div className="text-sm font-semibold">{error}</div>
              <button
                onClick={() => router.push("/attendance")}
                className="mt-3 text-xs font-bold text-[#1F7A1F] dark:text-[#55f761] hover:underline cursor-pointer"
              >
                Back to Attendance Log
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-base font-bold text-[#0D1B2A] dark:text-white">
                Meeting Check-In
              </h3>

              <div className="bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 p-4 rounded-xl">
                <div className="text-[10px] font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider mb-1">
                  Meeting Title
                </div>
                <div className="text-sm font-bold text-[#0D1B2A] dark:text-white">
                  {meeting.title}
                </div>
                <div className="text-[10px] font-semibold text-[#2F3E46]/50 dark:text-white/30 mt-1.5 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(meeting.date)}
                </div>
              </div>

              {meeting.hasAttended ? (
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-sm select-none">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Attended
                  </span>
                  {meeting.attendedAt && (
                    <span className="text-[10px] text-[#2F3E46]/60 dark:text-white/40 font-medium">
                      Checked-in at {formatTime(meeting.attendedAt)}
                    </span>
                  )}
                  <button
                    onClick={() => router.push("/attendance")}
                    className="mt-2 text-xs font-bold text-[#1F7A1F] dark:text-[#55f761] hover:underline cursor-pointer"
                  >
                    Back to Attendance Log
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[#2F3E46] dark:text-white/60 uppercase tracking-wider mb-1.5">
                      Enter Passcode
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      placeholder="e.g. MEETING_CODE"
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5 text-center text-sm font-bold text-[#0D1B2A] dark:text-white placeholder-[#2F3E46]/40 dark:placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] uppercase tracking-widest font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isMarking}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-bold uppercase shadow-md transition-all select-none bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] hover:bg-[#1F7A1F]/90 dark:hover:bg-[#55f761]/90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isMarking ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white dark:border-[#060D14] border-t-transparent rounded-full animate-spin"></div>
                        Verifying...
                      </>
                    ) : (
                      <>
                        <Key className="w-3.5 h-3.5" />
                        Check In
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
