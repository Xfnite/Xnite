import React from "react";

interface OnboardingHeaderProps {
  icon?: React.ReactNode;
  subtitle: string;
  title: string;
  accepted?: boolean;
  onClose?: () => void;
  banner?: React.ReactNode;
}

export function OnboardingHeader({
  icon = "📋",
  subtitle,
  title,
  banner,
}: OnboardingHeaderProps) {
  return (
    <div className="border-b border-black/10 dark:border-white/10 p-6 sm:p-8 space-y-3 shrink-0">
      <div className="flex justify-between items-start gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {icon && <span className="text-[#1F7A1F] dark:text-[#55f761] text-base">{icon}</span>}
            <span className="text-[10px] font-black uppercase tracking-wider text-[#1F7A1F] dark:text-[#55f761]">
              {subtitle}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#0D1B2A] dark:text-white">
            {title}
          </h2>
        </div>
      </div>
      {banner}
    </div>
  );
}
