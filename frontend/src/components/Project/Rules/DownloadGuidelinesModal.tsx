import React, { useState, useEffect } from "react";

export interface DownloadFile {
  name: string;
  url: string;
  title: string;
  description?: string;
}

interface DownloadGuidelinesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed: () => void;
  isPending?: boolean;
  title?: string;
  description?: string;
  files: DownloadFile[];
}

export function DownloadGuidelinesModal({
  isOpen,
  onClose,
  onProceed,
  isPending = false,
  title = "Download Required",
  description = "Please download the guideline images below before proceeding. You will need them as reference while working.",
  files,
}: DownloadGuidelinesModalProps) {
  const [downloadedIndices, setDownloadedIndices] = useState<Set<number>>(new Set());
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
    } else {
      setIsVisible(false);
      setDownloadedIndices(new Set()); // Reset on close
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDownloadSingle = (file: DownloadFile, idx: number) => {
    const link = document.createElement("a");
    link.href = file.url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloadedIndices((prev) => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
  };

  const hasDownloadedAll = files.length > 0 && downloadedIndices.size === files.length;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{
        backgroundColor: isVisible ? "rgba(0, 0, 0, 0.7)" : "rgba(0, 0, 0, 0)",
        backdropFilter: isVisible ? "blur(12px)" : "blur(0px)",
        transition: "background-color 400ms cubic-bezier(0.16, 1, 0.3, 1), backdrop-filter 400ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div
        className="relative w-full max-w-lg bg-white dark:bg-[#060D14] rounded-tr-2xl rounded-bl-2xl shadow-2xl border border-white/40 dark:border-white/15 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? "translateY(0) scale(1)" : "translateY(24px) scale(0.96)",
          transition: "opacity 400ms cubic-bezier(0.16, 1, 0.3, 1), transform 500ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Scrollable Container for Header and Image Previews */}
        <div className="max-h-[60vh] overflow-y-auto hide-scrollbar">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-black/5 dark:border-white/5">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-lg font-bold text-[#0D1B2A] dark:text-white">{title}</h2>
            </div>
            <p className="text-sm text-[#2F3E46] dark:text-white/60 leading-relaxed">
              {description}
            </p>
          </div>

          {/* Image Previews */}
          <div className="p-6 space-y-4">
            {files.map((file, idx) => (
              <div
                key={idx}
                className="space-y-1.5"
                style={{
                  opacity: isVisible ? 1 : 0,
                  transform: isVisible ? "translateY(0)" : "translateY(12px)",
                  transition: `opacity 400ms cubic-bezier(0.16, 1, 0.3, 1) ${150 + idx * 100}ms, transform 400ms cubic-bezier(0.16, 1, 0.3, 1) ${150 + idx * 100}ms`,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-[#0D1B2A] dark:text-white/80 uppercase tracking-wider">
                    {file.title}
                  </div>
                  <button
                    onClick={() => handleDownloadSingle(file, idx)}
                    className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                      downloadedIndices.has(idx)
                        ? "bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 text-[#1F7A1F] dark:text-[#55f761]"
                        : "bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 dark:hover:bg-blue-500/30"
                    }`}
                  >
                    {downloadedIndices.has(idx) ? "Downloaded ✓" : "Download"}
                  </button>
                </div>
                <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#0E1724]">
                  <img
                    src={file.url}
                    alt={file.title}
                    className="w-full h-auto object-contain block"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 pt-3 flex items-center justify-between gap-3 border-t border-black/5 dark:border-white/5">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-black/10 dark:border-white/10 text-[#0D1B2A] dark:text-white font-bold text-sm hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all cursor-pointer"
          >
            BACK
          </button>

          {!hasDownloadedAll ? (
            <button
              disabled
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#1F7A1F]/40 to-[#2ea82e]/40 dark:from-[#55f761]/40 dark:to-[#3de34a]/40 text-white/50 dark:text-[#060D14]/50 font-bold text-sm shadow-lg shadow-[#1F7A1F]/10 cursor-not-allowed"
            >
              Download All Required
            </button>
          ) : (
            <button
              onClick={onProceed}
              disabled={isPending}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] font-bold text-sm shadow-lg shadow-[#1F7A1F]/30 dark:shadow-[#55f761]/30 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {isPending ? (
                <>
                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Submitting...
                </>
              ) : (
                "Proceed"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
