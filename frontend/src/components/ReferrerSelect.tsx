"use client";

import { useState, useEffect, useRef } from "react";

interface Referral {
  email: string;
  name: string | null;
  username?: string | null;
}

interface ReferrerSelectProps {
  referrals: Referral[];
  lockedRefEmail?: string;
  lockedRefName?: string;
}

export default function ReferrerSelect({ referrals, lockedRefEmail, lockedRefName }: ReferrerSelectProps) {
  const [referrer, setReferrer] = useState(lockedRefEmail || "");
  // "I have no referrer" submits iru's email, which is also the "0 - Cedrick | Xfnite"
  // referal row, so the label can't be told apart from the email alone.
  const [noReferrer, setNoReferrer] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isLocked = !!lockedRefEmail;
  // On phones, auto-focusing the search box opens the keyboard over the list, and the
  // keyboard closing on the next tap shifts the page so the tap misses the option.
  // Only auto-focus where there's a mouse; touch users tap the search box themselves.
  const [hasMouse, setHasMouse] = useState(false);
  useEffect(() => {
    setHasMouse(window.matchMedia("(pointer: fine)").matches);
  }, []);

  // Keeps focus (and the keyboard) where it is while tapping an option, so the
  // layout doesn't jump between touching and releasing it.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();
  const optionClass = "w-full text-left px-3 py-3 sm:px-2.5 sm:py-2 bg-white dark:bg-[#0D1B2A] hover:bg-gray-100 dark:hover:bg-[#12243A] active:bg-gray-100 dark:active:bg-[#12243A] text-sm sm:text-xs text-[#0D1B2A] dark:text-white rounded-md transition-colors block cursor-pointer";

  useEffect(() => {
    setVisibleCount(20);
  }, [searchQuery]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

  let filteredReferrals = referrals
    .filter(ref =>
      (ref.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ref.username || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      ref.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const cedrickReferral = filteredReferrals.find(r =>
    (r.name && r.name.toLowerCase().includes("cedrick sabrine")) ||
    (r.username && r.username.toLowerCase().includes("cedrick sabrine"))
  );

  if (cedrickReferral) {
    filteredReferrals = filteredReferrals.filter(r => r.email !== cedrickReferral.email);
  }

  filteredReferrals.sort((a, b) => {
    const nameA = (a.name || a.username || a.email).toLowerCase();
    const nameB = (b.name || b.username || b.email).toLowerCase();
    return nameA.localeCompare(nameB);
  });

  const displayedReferrals = filteredReferrals.slice(0, visibleCount);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const bottom = e.currentTarget.scrollHeight - e.currentTarget.scrollTop <= e.currentTarget.clientHeight + 50;
    if (bottom && visibleCount < filteredReferrals.length) {
      setVisibleCount(prev => prev + 20);
    }
  };

  const selectedReferralObj = referrals.find(r => r.email === referrer);
  const displayText = isLocked
    ? lockedRefName || lockedRefEmail || "—"
    : noReferrer
    ? "I have no referrer"
    : referrer
    ? selectedReferralObj?.name || selectedReferralObj?.username || referrer
    : "Select a Referrer";

  return (
    <div className="relative z-50 animate-fade-up delay-200" ref={dropdownRef}>
      {/* Hidden input field for native form submissions */}
      <input type="hidden" name="referrer" value={referrer} />

      {isLocked ? (
        // Locked read-only display when referred via labeler link
        <div className="w-full px-3 py-2.5 bg-black/5 dark:bg-white/5 border border-black/15 dark:border-white/15 rounded-lg text-sm text-[#0D1B2A] dark:text-white shadow-sm flex justify-between items-center cursor-not-allowed select-none">
          <span className="truncate font-medium">{displayText}</span>
          <svg className="w-4 h-4 text-[#2F3E46]/40 dark:text-white/30 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="11" width="18" height="11" rx="2" strokeWidth="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" strokeWidth="2" />
          </svg>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="w-full px-3 py-2.5 pr-10 text-left bg-white dark:bg-white/10 border border-black/15 dark:border-white/15 rounded-lg text-sm text-[#0D1B2A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1F7A1F]/30 dark:focus:ring-[#55f761]/40 focus:border-[#1F7A1F]/60 dark:focus:border-[#55f761]/50 transition-colors shadow-sm flex justify-between items-center cursor-pointer"
        >
          <span className="truncate">{displayText}</span>
          <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center px-2 text-[#2F3E46] dark:text-white/60">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
      )}

      {!isLocked && isDropdownOpen && (
        <div className="absolute top-full left-0 mt-1 w-full bg-white dark:bg-[#0D1B2A] border border-black/15 dark:border-white/15 rounded-lg shadow-xl p-2 space-y-2 z-50">
          <input
            type="text"
            className="w-full px-3 py-2 sm:py-1.5 bg-gray-50 dark:bg-[#0B1725] border border-black/10 dark:border-white/10 rounded-md text-base sm:text-xs text-[#0D1B2A] dark:text-white placeholder:text-[#2F3E46]/40 dark:placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-[#1F7A1F]/30 dark:focus:ring-[#55f761]/40"
            placeholder="Search referrer by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus={hasMouse}
          />
          <div
            className="max-h-64 sm:max-h-48 overflow-y-auto overscroll-contain space-y-1 bg-white dark:bg-[#0D1B2A] rounded-md"
            onScroll={handleScroll}
          >
            <button
              type="button"
              onMouseDown={keepFocus}
              onClick={() => {
                setReferrer("iru.xfnite@gmail.com");
                setNoReferrer(true);
                setIsDropdownOpen(false);
                setSearchQuery("");
              }}
              className={optionClass}
            >
              <div className="font-medium truncate">I have no referrer</div>
            </button>
            <div className="h-px bg-black/10 dark:bg-white/10 my-1 mx-2" />

            {cedrickReferral && (
              <>
                <button
                  type="button"
                  onMouseDown={keepFocus}
                  onClick={() => {
                    setReferrer(cedrickReferral.email);
                    setNoReferrer(false);
                    setIsDropdownOpen(false);
                    setSearchQuery("");
                  }}
                  className={optionClass}
                >
                  <div className="font-medium truncate">
                    {cedrickReferral.name || cedrickReferral.username || cedrickReferral.email}
                  </div>
                </button>
                <div className="h-px bg-black/10 dark:bg-white/10 my-1 mx-2" />
              </>
            )}

            {displayedReferrals.length > 0 ? (
              displayedReferrals.map((ref) => (
                <button
                  key={ref.email}
                  type="button"
                  onMouseDown={keepFocus}
                  onClick={() => {
                    setReferrer(ref.email);
                    setNoReferrer(false);
                    setIsDropdownOpen(false);
                    setSearchQuery("");
                  }}
                  className={optionClass}
                >
                  <div className="font-medium truncate">{ref.name || ref.username || ref.email}</div>
                </button>
              ))
            ) : (
              <div className="text-center py-2 text-xs text-gray-500 dark:text-gray-400">
                No referrers found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
