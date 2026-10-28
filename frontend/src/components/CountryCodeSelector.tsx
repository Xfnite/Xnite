"use client";

import { useState, useRef, useEffect } from "react";
import { allCountries } from "country-telephone-data";

const getFlagEmoji = (countryCode: string) => {
  if (!countryCode) return "🌐";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

interface CountryCodeSelectorProps {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}

export default function CountryCodeSelector({ value, onChange, disabled }: CountryCodeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // find the selected country, default to PH (+63) if something goes wrong
  const selectedCountry = allCountries.find(c => `+${c.dialCode}` === value) || allCountries.find(c => c.iso2 === 'ph');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredCountries = allCountries.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.dialCode.includes(search)
  );

  return (
    <div className="relative z-50 shrink-0 w-[120px]" ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-white dark:bg-white/10 border border-black/15 dark:border-white/15 rounded-lg text-sm text-[#0D1B2A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1F7A1F]/30 dark:focus:ring-[#55f761]/40 focus:border-[#1F7A1F]/60 dark:focus:border-[#55f761]/50 transition-colors shadow-sm disabled:opacity-50"
      >
        <span className="truncate flex items-center gap-2">
          <span>{selectedCountry ? getFlagEmoji(selectedCountry.iso2) : "🌐"}</span>
          <span>{value}</span>
        </span>
        <svg className="w-4 h-4 opacity-50 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-[260px] bg-white dark:bg-[#1B263B] border border-black/15 dark:border-white/15 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-black/10 dark:border-white/10">
            <input
              type="text"
              autoFocus
              placeholder="Search country..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2 py-1.5 bg-gray-50 dark:bg-white/5 border border-black/15 dark:border-white/15 rounded text-sm text-[#0D1B2A] dark:text-white focus:outline-none"
            />
          </div>
          <div className="max-h-[220px] overflow-y-auto">
            {filteredCountries.map((country, idx) => (
              <button
                key={`${country.iso2}-${idx}`}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-white/10 text-[#0D1B2A] dark:text-white flex items-center gap-3"
                onClick={() => {
                  onChange(`+${country.dialCode}`);
                  setIsOpen(false);
                  setSearch("");
                }}
              >
                <span className="text-lg">{getFlagEmoji(country.iso2)}</span>
                <span className="truncate">+{country.dialCode} ({country.name.split(' (')[0]})</span>
              </button>
            ))}
            {filteredCountries.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-500">No results found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
