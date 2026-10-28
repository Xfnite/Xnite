"use client";

interface ModuleCardProps {
  step: number;
  title: string;
  description: string;
  tag: string;
  isCompleted: boolean;
  isLocked: boolean;
  primaryAction?: {
    label: string;
    href: string;
    isExternal?: boolean;
  };
  secondaryAction?: {
    label: string;
    href: string;
    isExternal?: boolean;
  };
  onComplete?: () => void;
}

export default function ModuleCard({
  step,
  title,
  description,
  tag,
  isCompleted,
  isLocked,
  primaryAction,
  secondaryAction,
  onComplete,
}: ModuleCardProps) {
  const handlePrimaryClick = (e: React.MouseEvent) => {
    if (isLocked) { e.preventDefault(); return; }
    // Mark as complete when link is clicked
    if (onComplete && !isCompleted) {
      setTimeout(() => onComplete(), 500);
    }
  };

  const handleSecondaryClick = (e: React.MouseEvent) => {
    if (isLocked) { e.preventDefault(); return; }
    if (onComplete && !isCompleted) {
      setTimeout(() => onComplete(), 500);
    }
  };

  return (
    <div
      className={`relative rounded-2xl border overflow-hidden transition-all duration-300 shadow-sm
        ${isCompleted
          ? "border-[#1F7A1F]/30 bg-white dark:bg-[#1F7A1F]/5"
          : isLocked
            ? "border-black/5 dark:border-white/5 bg-white/70 dark:bg-white/[0.02] opacity-60 cursor-not-allowed"
            : "border-black/10 dark:border-white/10 bg-white/90 dark:bg-white/[0.03] hover:border-[#1F7A1F]/30 dark:hover:border-[#55f761]/30 hover:bg-white dark:hover:bg-white/[0.05]"
        }`}
    >
      <div className="flex items-stretch min-h-[96px]">
        {/* Step number column */}
        <div className={`w-20 flex-shrink-0 flex flex-col items-center justify-center border-r relative
          ${isCompleted ? "border-[#1F7A1F]/20 bg-[#1F7A1F]/5 dark:bg-[#1F7A1F]/10" : "border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/[0.02]"}`}>
          <span className={`text-2xl font-black tracking-tight leading-none
            ${isCompleted ? "text-[#55f761]" : isLocked ? "text-[#0D1B2A]/20 dark:text-white/20" : "text-[#0D1B2A]/30 dark:text-white/30"}`}>
            {String(step).padStart(2, "0")}
          </span>
          {/* Status dot */}
          <div className={`absolute bottom-2.5 right-2.5 w-2 h-2 rounded-full
            ${isCompleted ? "bg-[#55f761] shadow-[0_0_6px_#55f761]" : "bg-black/15 dark:bg-white/15"}`}
          />
        </div>

        {/* Main content */}
        <div className="flex-1 px-5 py-4 flex flex-col justify-center gap-1.5">
          <span className={`text-[10px] font-bold uppercase tracking-widest
            ${isCompleted ? "text-[#55f761]/70" : "text-[#0D1B2A]/30 dark:text-white/30"}`}>{tag}</span>
          <div className="text-[15px] font-bold text-[#0D1B2A]/90 dark:text-white/90 leading-tight">{title}</div>
          <div className="text-xs text-[#0D1B2A]/60 dark:text-white/50 leading-relaxed">{description}</div>
        </div>

        {/* Action column */}
        <div className={`flex-shrink-0 flex flex-col items-end justify-center gap-2 px-5 py-4
          ${secondaryAction ? "min-w-[130px]" : "min-w-[110px]"}`}>
          {isCompleted ? (
            <div className="flex flex-col gap-1.5">
              {primaryAction ? (
                <a
                  href={primaryAction.href}
                  target={primaryAction.isExternal ? "_blank" : undefined}
                  rel={primaryAction.isExternal ? "noopener noreferrer" : undefined}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-[0_10px_0_10px] bg-[#1F7A1F]/10 dark:bg-[#1F7A1F]/20 border border-[#1F7A1F]/30 dark:border-[#1F7A1F]/40 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold hover:bg-[#1F7A1F]/20 dark:hover:bg-[#1F7A1F]/30 transition-all cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {primaryAction.label}
                </a>
              ) : (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-[0_10px_0_10px] bg-[#1F7A1F]/10 dark:bg-[#1F7A1F]/20 border border-[#1F7A1F]/30 dark:border-[#1F7A1F]/40 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Done
                </div>
              )}
              {secondaryAction && (
                <a
                  href={secondaryAction.href}
                  target={secondaryAction.isExternal ? "_blank" : undefined}
                  rel={secondaryAction.isExternal ? "noopener noreferrer" : undefined}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[0_10px_0_10px] border border-[#1F7A1F]/30 dark:border-[#55f761]/30 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold hover:bg-[#1F7A1F]/5 dark:hover:bg-[#55f761]/10 transition-all"
                >
                  {secondaryAction.label}
                  {secondaryAction.isExternal && (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6m0 0v6m0-6L10 14" />
                    </svg>
                  )}
                </a>
              )}
            </div>

          ) : isLocked ? (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-[0_10px_0_10px] bg-black/5 dark:bg-white/4 border border-black/10 dark:border-white/8 text-[#0D1B2A]/40 dark:text-white/25 text-xs font-bold">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              Locked
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {primaryAction && (
                <a
                  href={primaryAction.href}
                  target={primaryAction.isExternal ? "_blank" : undefined}
                  rel={primaryAction.isExternal ? "noopener noreferrer" : undefined}
                  onClick={handlePrimaryClick}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[0_10px_0_10px] bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#060D14] text-xs font-bold hover:bg-[#145214] dark:hover:bg-[#3de34a] transition-all hover:scale-105 active:scale-95 shadow-lg shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20"
                >
                  {primaryAction.label}
                  {primaryAction.isExternal && (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6m0 0v6m0-6L10 14" />
                    </svg>
                  )}
                </a>
              )}
              {secondaryAction && (
                <a
                  href={secondaryAction.href}
                  target={secondaryAction.isExternal ? "_blank" : undefined}
                  rel={secondaryAction.isExternal ? "noopener noreferrer" : undefined}
                  onClick={handleSecondaryClick}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[0_10px_0_10px] border border-[#1F7A1F]/30 dark:border-[#55f761]/30 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold hover:bg-[#1F7A1F]/5 dark:hover:bg-[#55f761]/10 transition-all"
                >
                  {secondaryAction.label}
                  {secondaryAction.isExternal && (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6m0 0v6m0-6L10 14" />
                    </svg>
                  )}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
