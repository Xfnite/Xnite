import * as React from "react";
import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { createMeetingAction, updateMeetingAction } from "@/app/actions/attendance";

interface CreateNewAttendanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    meetingToEdit?: any;
}

export function CreateNewAttendanceModal({
    isOpen,
    onClose,
    onSuccess,
    meetingToEdit,
}: CreateNewAttendanceModalProps) {
    const [newTitle, setNewTitle] = useState("");
    const [newPasscode, setNewPasscode] = useState("");
    const [newDate, setNewDate] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    const getLocalDatetimeString = () => {
        const now = new Date();
        const offset = now.getTimezoneOffset();
        const localNow = new Date(now.getTime() - offset * 60 * 1000);
        return localNow.toISOString().slice(0, 16);
    };

    const generateRandomPasscode = () => {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let result = "";
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    };

    const formatToDatetimeLocal = (dateInput: string | Date) => {
        const d = new Date(dateInput);
        const offset = d.getTimezoneOffset();
        const localTime = new Date(d.getTime() - offset * 60 * 1000);
        return localTime.toISOString().slice(0, 16);
    };

    useEffect(() => {
        if (isOpen) {
            if (meetingToEdit) {
                setNewTitle(meetingToEdit.title);
                setNewPasscode(meetingToEdit.password);
                setNewDate(formatToDatetimeLocal(meetingToEdit.date));
            } else {
                setNewTitle("");
                setNewDate(getLocalDatetimeString());
                setNewPasscode(generateRandomPasscode());
            }
        }
    }, [isOpen, meetingToEdit]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim() || !newPasscode.trim() || !newDate) {
            toast.error("Please fill in all required fields.");
            return;
        }

        setIsCreating(true);
        try {
            if (meetingToEdit) {
                const res = await updateMeetingAction(
                    meetingToEdit.id,
                    newTitle,
                    newPasscode,
                    newDate ? new Date(newDate) : undefined
                );
                if (res.success) {
                    toast.success("Attendance session updated successfully!");
                    onClose();
                    onSuccess();
                } else {
                    toast.error(res.error || "Failed to update session.");
                }
            } else {
                const res = await createMeetingAction(
                    newTitle,
                    newPasscode,
                    newDate ? new Date(newDate) : undefined
                );
                if (res.success) {
                    toast.success("Meeting attendance session created successfully!");
                    onClose();
                    onSuccess();
                } else {
                    toast.error(res.error || "Failed to create meeting.");
                }
            }
        } catch (err) {
            toast.error("An unexpected error occurred.");
        } finally {
            setIsCreating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="relative w-full max-w-md bg-white dark:bg-[#0B1520] border border-black/10 dark:border-white/10 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-[#0D1B2A] dark:text-white">
                        {meetingToEdit ? "Edit Attendance Session" : "Create Attendance Session"}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-[#2F3E46] dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 p-1 rounded-lg transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-[#2F3E46] dark:text-white/60 uppercase tracking-wider mb-1.5">
                            Attendance Title
                        </label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. Training Sync / Project Calibration"
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-[#0D1B2A] dark:text-white placeholder-[#2F3E46]/40 dark:placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761]"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-[#2F3E46] dark:text-white/60 uppercase tracking-wider mb-1.5 flex justify-between items-center">
                            <span>Attendance Passcode</span>
                            <button
                                type="button"
                                onClick={() => setNewPasscode(generateRandomPasscode())}
                                className="text-[10px] text-[#1F7A1F] dark:text-[#55f761] hover:underline font-bold cursor-pointer select-none normal-case tracking-normal"
                            >
                                Generate Random
                            </button>
                        </label>
                        <input
                            type="text"
                            required
                            placeholder="Create a code (e.g. SYNC99)"
                            value={newPasscode}
                            onChange={(e) => setNewPasscode(e.target.value.toUpperCase())}
                            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-[#0D1B2A] dark:text-white placeholder-[#2F3E46]/40 dark:placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] font-mono uppercase"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-[#2F3E46] dark:text-white/60 uppercase tracking-wider mb-1.5">
                            Meeting Date & Time
                        </label>
                        <input
                            type="datetime-local"
                            required
                            value={newDate}
                            onChange={(e) => setNewDate(e.target.value)}
                            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-[#0D1B2A] dark:text-white placeholder-[#2F3E46]/40 dark:placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761]"
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
                            disabled={isCreating}
                            className="px-5 py-2 text-xs font-semibold bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] rounded-xl hover:bg-[#1F7A1F]/90 dark:hover:bg-[#55f761]/90 transition-all cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                        >
                            {isCreating ? (
                                <>
                                    <div className="w-3.5 h-3.5 border-2 border-white dark:border-[#060D14] border-t-transparent rounded-full animate-spin"></div>
                                    {meetingToEdit ? "Saving..." : "Creating..."}
                                </>
                            ) : (
                                meetingToEdit ? "Save Changes" : "Create Session"
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
