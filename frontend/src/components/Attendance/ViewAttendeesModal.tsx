import * as React from "react";
import { X, Download } from "lucide-react";

interface ViewAttendeesModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeMeeting: any;
  currentUserEmail: string;
  formatDate: (dateInput: any) => string;
  formatTime: (dateInput: any) => string;
  handleExportCSV: (meeting: any) => void;
}

export function ViewAttendeesModal({
  isOpen,
  onClose,
  activeMeeting,
  formatDate,
  formatTime,
  handleExportCSV,
}: ViewAttendeesModalProps) {
  if (!isOpen || !activeMeeting) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-white dark:bg-[#0B1520] border border-black/10 dark:border-white/10 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div>
            <h3 className="text-base font-bold text-[#0D1B2A] dark:text-white">
              Attendee Records
            </h3>
            <p className="text-xs text-[#2F3E46]/60 dark:text-white/40 font-medium">
              {activeMeeting.title} • {formatDate(activeMeeting.date)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Export available to all admins/judgers */}
            <button
              onClick={() => handleExportCSV(activeMeeting)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] hover:bg-[#1F7A1F]/90 dark:hover:bg-[#55f761]/90 transition-all cursor-pointer shadow-md select-none"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              onClick={onClose}
              className="text-[#2F3E46] dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 p-1 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Attendee List */}
        <div className="flex-grow overflow-y-auto min-h-[200px] border border-black/10 dark:border-white/10 rounded-xl bg-black/5 dark:bg-white/5 p-2">
          {!activeMeeting.attendances || activeMeeting.attendances.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-[#2F3E46]/50 dark:text-white/30 py-12">
              No one has attended this meeting yet.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black/10 dark:border-white/10 text-[10px] font-bold uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40">
                  <th className="pb-2 pt-1 pl-3 pr-2">Sitename</th>
                  <th className="pb-2 pt-1 px-2">Bitmappro Email</th>
                  <th className="pb-2 pt-1 px-2">Name</th>
                  <th className="pb-2 pt-1 px-2">FB Link</th>
                  <th className="pb-2 pt-1 pl-2 pr-3 text-right">Sign-in Time</th>
                </tr>
              </thead>
              <tbody>
                {activeMeeting.attendances.map((att: any) => (
                  <tr
                    key={att.id}
                    className="border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-xs"
                  >
                    <td className="py-2.5 pl-3 pr-2 text-[#0D1B2A] dark:text-white font-mono font-semibold text-xs">
                      {att.gingerUsername || <span className="text-[#2F3E46]/30 dark:text-white/20 italic">—</span>}
                    </td>
                    <td className="py-2.5 px-2 text-[#0D1B2A] dark:text-white font-mono text-xs">
                      {att.gingerEmail || <span className="text-[#2F3E46]/30 dark:text-white/20 italic">—</span>}
                    </td>
                    <td className="py-2.5 px-2 text-[#0D1B2A] dark:text-white font-bold">
                      {att.userName}
                    </td>
                    <td className="py-2.5 px-2 text-[#2F3E46]/70 dark:text-white/60 max-w-[140px] truncate">
                      {att.facebook ? (
                        <a
                          href={att.facebook}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline"
                        >
                          {att.facebook}
                        </a>
                      ) : (
                        <span className="text-[#2F3E46]/30 dark:text-white/20 italic">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pl-2 pr-3 text-right text-[#2F3E46]/60 dark:text-white/40">
                      {formatTime(att.attendedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end pt-4 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] rounded-xl hover:bg-[#1F7A1F]/90 dark:hover:bg-[#55f761]/90 transition-all cursor-pointer shadow-md select-none"
          >
            Close Logs
          </button>
        </div>
      </div>
    </div>
  );
}
