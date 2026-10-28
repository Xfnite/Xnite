import * as React from "react";
import { useState, useEffect } from "react";
import { X, Calendar } from "lucide-react";
import { toast } from "sonner";
import { markAttendanceAction } from "@/app/actions/attendance";

interface MarkAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  activeMeeting: any;
  formatDate: (dateInput: any) => string;
}

export function MarkAttendanceModal({
  isOpen,
  onClose,
  onSuccess,
  activeMeeting,
  formatDate,
}: MarkAttendanceModalProps) {
  const [passcode, setPasscode] = useState("");
  const [isMarking, setIsMarking] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPasscode("");
    }
  }, [isOpen]);

  const handleMarkAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) {
      toast.error("Please enter the passcode.");
      return;
    }

    setIsMarking(true);
    try {
      const res = await markAttendanceAction(activeMeeting.id, passcode);
      if (res.success) {
        toast.success("Attendance marked successfully!");
        setPasscode("");
        onClose();
        onSuccess();
      } else {
        toast.error(res.error || "Incorrect passcode.");
      }
    } catch (err) {
      toast.error("An unexpected error occurred.");
    } finally {
      setIsMarking(false);
    }
  };

  if (!isOpen || !activeMeeting) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm bg-white dark:bg-[#0B1520] border border-black/10 dark:border-white/10 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-[#0D1B2A] dark:text-white">
            Meeting Check-In
          </h3>
          <button
            onClick={onClose}
            className="text-[#2F3E46] dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleMarkAttendance} className="space-y-4">
          <div className="bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 p-4 rounded-xl">
            <div className="text-[10px] font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider mb-1">
              Meeting Title
            </div>
            <div className="text-sm font-bold text-[#0D1B2A] dark:text-white">
              {activeMeeting.title}
            </div>
            <div className="text-[10px] font-semibold text-[#2F3E46]/50 dark:text-white/30 mt-1.5 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDate(activeMeeting.date)}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#2F3E46] dark:text-white/60 uppercase tracking-wider mb-1.5">
              Enter Passcode
            </label>
            <input
              type="text"
              required
              placeholder="e.g. MEETING_CODE"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5 text-center text-sm font-bold text-[#0D1B2A] dark:text-white placeholder-[#2F3E46]/40 dark:placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] uppercase tracking-widest font-mono"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[#2F3E46] dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isMarking}
              className="px-5 py-2 text-xs font-semibold bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] rounded-xl hover:bg-[#1F7A1F]/90 dark:hover:bg-[#55f761]/90 transition-all cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {isMarking ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white dark:border-[#060D14] border-t-transparent rounded-full animate-spin"></div>
                  Verifying...
                </>
              ) : (
                "Check In"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
