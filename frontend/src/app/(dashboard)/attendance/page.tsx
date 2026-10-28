"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Calendar,
  Clock,
  Key,
  CheckCircle,
  Plus,
  Trash2,
  Users,
  Lock,
  Download,
  Pencil,
  Link2,
} from "lucide-react";
import {
  getAttendanceDataAction,
  deleteMeetingAction,
} from "@/app/actions/attendance";
import { ConfirmDeleteDialog } from "@/components/Attendance/ConfirmDeleteDialog";
import { CreateNewAttendanceModal } from "@/components/Attendance/CreateNewAttendanceModal";
import { MarkAttendanceModal } from "@/components/Attendance/MarkAttendanceModal";
import { ViewAttendeesModal } from "@/components/Attendance/ViewAttendeesModal";

export default function AttendancePage() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Create meeting modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [meetingToEdit, setMeetingToEdit] = useState<any>(null);

  // Delete Dialog states
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [meetingToDelete, setMeetingToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Mark attendance modal states
  const [isMarkModalOpen, setIsMarkModalOpen] = useState(false);
  const [activeMeetingForMarking, setActiveMeetingForMarking] = useState<any>(null);

  // Attendees detail modal states
  const [isAttendeesModalOpen, setIsAttendeesModalOpen] = useState(false);
  const [activeMeetingForAttendees, setActiveMeetingForAttendees] = useState<any>(null);

  const fetchAttendanceData = async () => {
    try {
      const res = await getAttendanceDataAction();
      if (res.success) {
        setData(res);
      } else {
        setError(res.error || "Failed to fetch attendance log.");
      }
    } catch (e: any) {
      setError("An unexpected error occurred while loading attendance.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendanceData();
  }, []);

  const handleDeleteMeetingClick = (meeting: any) => {
    setMeetingToDelete(meeting);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!meetingToDelete) return;

    setIsDeleting(true);
    try {
      const res = await deleteMeetingAction(meetingToDelete.id);
      if (res.success) {
        toast.success("Attendance session deleted successfully.");
        setIsDeleteDialogOpen(false);
        setMeetingToDelete(null);
        await fetchAttendanceData();
      } else {
        toast.error(res.error || "Failed to delete session.");
      }
    } catch (err) {
      toast.error("An unexpected error occurred.");
    } finally {
      setIsDeleting(false);
    }
  };

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

  const formatCreatorName = (createdBy: string) => {
    if (!createdBy) return "";
    if (createdBy.includes("@")) {
      const part = createdBy.split("@")[0];
      return part
        .split(/[._-]/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    }
    return createdBy;
  };

  const handleCopyLink = (meeting: any) => {
    if (!meeting.slug) {
      toast.error("No shareable link available for this session.");
      return;
    }
    const url = `${window.location.origin}/attendance/checkin/${meeting.slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Check-in link copied to clipboard!");
  };

  const handleExportCSV = (meeting: any) => {
    if (!meeting.attendances || meeting.attendances.length === 0) {
      toast.error("No attendees to export.");
      return;
    }

    const headers = ["Sitename", "Gmail", "Name", "FB Link", "Sign-in Date", "Sign-in Time"];
    const rows = meeting.attendances.map((att: any) => {
      const date = new Date(att.attendedAt);
      const dateStr = date.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      });
      const timeStr = date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      const escape = (v: string) => `"${(v || "").replace(/"/g, '""')}"`;
      return [
        escape(att.gingerUsername || ""),
        escape(att.gingerEmail || ""),
        escape(att.userName),
        escape(att.facebook || ""),
        dateStr,
        timeStr,
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);

    const cleanTitle = meeting.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const dateStamp = new Date(meeting.date).toISOString().slice(0, 10);
    link.setAttribute("download", `${cleanTitle}_attendance_${dateStamp}.csv`);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV exported successfully!");
  };

  return (
    <div className="relative w-full min-h-full">
      {/* Mesh Background */}
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

      <div className="relative space-y-6 lg:space-y-10 w-full max-w-5xl mx-auto pt-4 pb-12 z-10">
        {/* Header Section */}
        <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#0D1B2A] dark:text-white mb-1">
              Attendance Log
            </h1>
            <p className="text-sm text-[#2F3E46] dark:text-white/60">
              Verify your attendance for training meetings and project updates.
            </p>
          </div>

          {data?.currentUser?.isAdminOrJudger && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center justify-center gap-2 bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] hover:bg-[#1F7A1F]/90 dark:hover:bg-[#55f761]/90 rounded-full font-bold uppercase py-2.5 px-6 transition-all shadow-md select-none hover:scale-102 active:scale-98 text-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add New Attendance
            </button>
          )}
        </section>

        {error && (
          <div className="p-4 bg-red-500/10 border-b border-red-500/20 text-red-600 dark:text-red-400 text-sm rounded-xl">
            {error}
          </div>
        )}

        {/* Main Content Area */}
        <section className="w-full">
          <div className="rounded-tr-3xl rounded-bl-3xl overflow-hidden p-6 lg:p-8 bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-xl">
            {isLoading ? (
              <div className="p-12 flex flex-col items-center justify-center text-[#2F3E46] dark:text-white/60">
                <div className="w-8 h-8 border-2 border-[#1F7A1F] border-t-transparent rounded-full animate-spin mb-3"></div>
                Loading meetings and attendance logs...
              </div>
            ) : !data?.meetings || data.meetings.length === 0 ? (
              <div className="p-12 text-center text-[#2F3E46] dark:text-white/60 flex flex-col items-center justify-center gap-2">
                <Lock className="w-8 h-8 opacity-40 mb-2" />
                <div className="text-sm font-semibold">No attendance sessions registered yet.</div>
                <div className="text-xs opacity-75">
                  Admins and judgers will schedule meetings here.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-black/10 dark:border-white/10 text-xs font-bold uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40">
                      <th className="pb-4 pt-2 pr-4 pl-1">Date & Time</th>
                      <th className="pb-4 pt-2 px-4">Meeting Title</th>
                      {data?.currentUser?.isAdminOrJudger && (
                        <th className="pb-4 pt-2 px-4">Passcode</th>
                      )}
                      <th className="pb-4 pt-2 px-4">Attendance Status</th>
                      <th className="pb-4 pt-2 pl-4 pr-1 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.meetings.map((meeting: any) => (
                      <tr
                        key={meeting.id}
                        className="border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group text-sm"
                      >
                        {/* Date & Time */}
                        <td className="py-4 pr-4 pl-1 text-[#0D1B2A] dark:text-white font-medium align-middle">
                          <div className="flex flex-col gap-0.5">
                            <span className="flex items-center gap-1.5 font-semibold text-xs lg:text-sm">
                              <Calendar className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
                              {formatDate(meeting.date)}
                            </span>
                            <span className="flex items-center gap-1.5 text-xs text-[#2F3E46]/60 dark:text-white/40 font-medium">
                              <Clock className="w-3 h-3 opacity-60 flex-shrink-0" />
                              {formatTime(meeting.date)}
                            </span>
                          </div>
                        </td>

                        {/* Title */}
                        <td className="py-4 px-4 font-bold text-[#0D1B2A] dark:text-white align-middle">
                          <div className="flex flex-col">
                            <span>{meeting.title}</span>
                            {meeting.createdBy && (
                              <span className="text-[10px] text-[#2F3E46]/60 dark:text-white/40 font-normal mt-0.5">
                                Created by {formatCreatorName(meeting.createdBy)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Passcode (Admin/Judger Only) */}
                        {data?.currentUser?.isAdminOrJudger && (
                          <td className="py-4 px-4 font-mono font-black text-xs text-[#1F7A1F] dark:text-[#55f761] align-middle">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(meeting.password);
                                toast.success("Passcode copied to clipboard!");
                              }}
                              className="bg-black/10 dark:bg-white/10 px-2.5 py-1 rounded-lg border border-black/5 dark:border-white/5 hover:bg-black/20 dark:hover:bg-white/20 transition-colors cursor-pointer select-none"
                              title="Click to copy passcode"
                            >
                              {meeting.password}
                            </button>
                          </td>
                        )}

                        {/* Attendance Status — display only for users, clickable CTA for admins */}
                        <td className="py-4 px-4 align-middle">
                          {data?.currentUser?.isAdminOrJudger ? (
                            <button
                              onClick={() => {
                                setActiveMeetingForAttendees(meeting);
                                setIsAttendeesModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold uppercase bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 text-[#1F7A1F] dark:text-[#55f761] border border-[#1F7A1F]/20 dark:border-[#55f761]/20 hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 transition-all cursor-pointer"
                            >
                              <Users className="w-3.5 h-3.5" />
                              {meeting.attendeeCount} Attended
                            </button>
                          ) : meeting.hasAttended ? (
                            <div className="inline-flex flex-col gap-1">
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-sm w-fit select-none">
                                <CheckCircle className="w-3.5 h-3.5" />
                                Attended
                              </span>
                              {meeting.attendedAt && (
                                <span className="text-[10px] text-[#2F3E46]/60 dark:text-white/40 pl-1 font-medium">
                                  Checked-in at {formatTime(meeting.attendedAt)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase bg-gray-500/10 text-gray-500 dark:text-gray-400 border border-gray-500/20 w-fit select-none">
                              Not Attended
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-4 pl-4 pr-1 text-right align-middle">
                          <div className="flex justify-end items-center gap-1">
                            {data?.currentUser?.isAdminOrJudger ? (
                              /* Admin/Judger: export for all, edit/delete only for creator */
                              <>
                                {/* Copy Link — all admins/judgers */}
                                <button
                                  onClick={() => handleCopyLink(meeting)}
                                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                                  title="Copy Check-In Link"
                                >
                                  <Link2 className="w-4 h-4" />
                                </button>
                                {/* Export — all admins/judgers */}
                                <button
                                  onClick={() => handleExportCSV(meeting)}
                                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                                  title="Export CSV"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                                {/* Edit & Delete — creator only */}
                                {(!(meeting.createdByEmail || meeting.createdBy) ||
                                  (meeting.createdByEmail || meeting.createdBy).toLowerCase() === data.currentUser.email.toLowerCase()) && (
                                    <>
                                      <button
                                        onClick={() => {
                                          setMeetingToEdit(meeting);
                                          setIsAddModalOpen(true);
                                        }}
                                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                                        title="Edit Session"
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteMeetingClick(meeting)}
                                        className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 p-1.5 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                                        title="Delete Session"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                              </>
                            ) : (
                              /* Regular user: Copy Link + Check In btn — active if not attended, disabled if already attended */
                              <>
                                <button
                                  onClick={() => handleCopyLink(meeting)}
                                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                                  title="Copy Check-In Link"
                                >
                                  <Link2 className="w-4 h-4" />
                                </button>
                                <button
                                  disabled={meeting.hasAttended}
                                  onClick={() => {
                                    if (!meeting.hasAttended) {
                                      setActiveMeetingForMarking(meeting);
                                      setIsMarkModalOpen(true);
                                    }
                                  }}
                                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold uppercase shadow-md transition-all select-none ${meeting.hasAttended
                                      ? "bg-gray-200 dark:bg-white/10 text-gray-400 dark:text-white/30 cursor-not-allowed"
                                      : "bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] hover:bg-[#1F7A1F]/90 dark:hover:bg-[#55f761]/90 cursor-pointer"
                                    }`}
                                >
                                  {/* <Key className="w-3.5 h-3.5" /> */}
                                  {meeting.hasAttended ? "Checked In" : "Check In"}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Create / Edit Session Modal */}
      <CreateNewAttendanceModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setMeetingToEdit(null);
        }}
        onSuccess={fetchAttendanceData}
        meetingToEdit={meetingToEdit}
      />

      {/* Verify / Mark Attendance Modal */}
      <MarkAttendanceModal
        isOpen={isMarkModalOpen}
        onClose={() => {
          setIsMarkModalOpen(false);
          setActiveMeetingForMarking(null);
        }}
        onSuccess={fetchAttendanceData}
        activeMeeting={activeMeetingForMarking}
        formatDate={formatDate}
      />

      {/* View Attendees Modal */}
      <ViewAttendeesModal
        isOpen={isAttendeesModalOpen}
        onClose={() => {
          setIsAttendeesModalOpen(false);
          setActiveMeetingForAttendees(null);
        }}
        activeMeeting={activeMeetingForAttendees}
        currentUserEmail={data?.currentUser?.email || ""}
        formatDate={formatDate}
        formatTime={formatTime}
        handleExportCSV={handleExportCSV}
      />

      {/* Confirmation Delete Dialog */}
      <ConfirmDeleteDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false);
          setMeetingToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Confirm Deletion"
        description={
          meetingToDelete
            ? `Are you sure you want to delete the meeting "${meetingToDelete.title}"? This action cannot be undone and will delete all associated attendee logs.`
            : ""
        }
        isDeleting={isDeleting}
      />
    </div>
  );
}
