"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoveRight } from "lucide-react";

// Dates are handled as "YYYY-MM-DD" strings so there are no timezone shifts.
const pad = (n: number) => String(n).padStart(2, "0");
const toKey = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface DateRangePickerProps {
    start: string;
    end: string;
    onChange: (start: string, end: string) => void;
    /** Latest selectable date ("YYYY-MM-DD"); later days are disabled. */
    maxDate?: string;
    /** Dropdown popup alignment, defaults to "right" */
    align?: "left" | "right";
}

export default function DateRangePicker({ start, end, onChange, maxDate, align = "right" }: DateRangePickerProps) {
    const [open, setOpen] = useState(false);
    // While picking, the first click is held here until the end date is chosen.
    const [pendingStart, setPendingStart] = useState<string | null>(null);
    const [hovered, setHovered] = useState<string | null>(null);
    const [view, setView] = useState(() => {
        const [y, m] = (start || toKey(new Date().getFullYear(), new Date().getMonth(), 1)).split("-").map(Number);
        return { year: y, month: m - 1 };
    });
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
                setPendingStart(null);
            }
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [open]);

    const shiftMonths = (delta: number) => {
        setView(({ year, month }) => {
            const d = new Date(year, month + delta, 1);
            return { year: d.getFullYear(), month: d.getMonth() };
        });
    };

    const handleDayClick = (key: string) => {
        if (!pendingStart) {
            setPendingStart(key);
            return;
        }
        const [a, b] = key < pendingStart ? [key, pendingStart] : [pendingStart, key];
        onChange(a, b);
        setPendingStart(null);
        setHovered(null);
        setOpen(false);
    };

    // Range currently shown: the committed one, or the in-progress preview.
    const rangeStart = pendingStart
        ? (hovered && hovered < pendingStart ? hovered : pendingStart)
        : start;
    const rangeEnd = pendingStart
        ? (hovered && hovered > pendingStart ? hovered : pendingStart)
        : end;

    const renderMonth = (year: number, month: number) => {
        const firstWeekday = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const cells: (number | null)[] = [
            ...Array(firstWeekday).fill(null),
            ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
        ];
        const today = (() => { const t = new Date(); return toKey(t.getFullYear(), t.getMonth(), t.getDate()); })();

        return (
            <div className="w-full">
                <div className="grid grid-cols-7 mb-1">
                    {WEEKDAYS.map((w) => (
                        <div key={w} className="text-center text-[10px] font-bold text-[#2F3E46]/50 dark:text-white/40 py-1">{w}</div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-y-1" onMouseLeave={() => setHovered(null)}>
                    {cells.map((day, i) => {
                        if (day === null) return <div key={`e${i}`} />;
                        const key = toKey(year, month, day);
                        const isStart = key === rangeStart;
                        const isEnd = key === rangeEnd;
                        const inRange = !!rangeStart && !!rangeEnd && key > rangeStart && key < rangeEnd;
                        if (maxDate && key > maxDate) {
                            return (
                                <div key={key} className="flex justify-center">
                                    <span className="w-8 h-8 flex items-center justify-center text-xs font-semibold text-[#2F3E46]/25 dark:text-white/20 cursor-not-allowed">{day}</span>
                                </div>
                            );
                        }
                        return (
                            <div
                                key={key}
                                className={`flex justify-center ${inRange ? "bg-[#1F7A1F]/10 dark:bg-[#55f761]/10" : ""} ${isStart && rangeEnd && rangeEnd !== rangeStart ? "bg-gradient-to-r from-transparent from-50% to-[#1F7A1F]/10 dark:to-[#55f761]/10 to-50%" : ""} ${isEnd && rangeStart && rangeEnd !== rangeStart ? "bg-gradient-to-l from-transparent from-50% to-[#1F7A1F]/10 dark:to-[#55f761]/10 to-50%" : ""}`}
                            >
                                <button
                                    type="button"
                                    onClick={() => handleDayClick(key)}
                                    onMouseEnter={() => setHovered(key)}
                                    className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors hover:cursor-pointer ${isStart || isEnd
                                        ? "bg-[#1F7A1F] text-white dark:bg-[#55f761] dark:text-[#0D1B2A]"
                                        : `text-[#2F3E46] dark:text-white/80 hover:bg-black/10 dark:hover:bg-white/10 ${key === today ? "ring-1 ring-[#1F7A1F] dark:ring-[#55f761]" : ""}`
                                        }`}
                                >
                                    {day}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const next = new Date(view.year, view.month + 1, 1);
    const navBtn = "p-1 rounded-md text-[#2F3E46]/60 dark:text-white/50 hover:bg-black/5 dark:hover:bg-white/10 hover:cursor-pointer";

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-black/5 dark:bg-white/5 border transition-colors hover:cursor-pointer ${open ? "border-[#1F7A1F] dark:border-[#55f761]" : "border-black/10 dark:border-white/10"} text-[#2F3E46] dark:text-white`}
            >
                {start && end && start === end && !pendingStart ? (
                    <span className="flex-1 text-left">{start} (Single day)</span>
                ) : (
                    <>
                        <span className={`flex-1 text-left ${pendingStart ? "text-[#1F7A1F] dark:text-[#55f761]" : ""}`}>{pendingStart || start || "Start date"}</span>
                        <MoveRight className="w-3.5 h-3.5 text-[#2F3E46]/40 dark:text-white/30 shrink-0" />
                        <span className="flex-1 text-left">{pendingStart ? "End date" : end || "End date"}</span>
                    </>
                )}
                <Calendar className="w-3.5 h-3.5 text-[#2F3E46]/50 dark:text-white/40 shrink-0" />
            </button>

            {open && (
                <div className={`absolute ${align === "left" ? "left-0" : "right-0"} mt-2 z-40 w-[300px] md:w-[560px] bg-white dark:bg-[#0D1B2A] border border-black/10 dark:border-white/10 rounded-2xl shadow-xl p-4 animate-in fade-in slide-in-from-top-2 duration-150`}>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-0.5">
                            <button type="button" onClick={() => shiftMonths(-12)} className={navBtn} aria-label="Previous year"><ChevronsLeft className="w-4 h-4" /></button>
                            <button type="button" onClick={() => shiftMonths(-1)} className={navBtn} aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></button>
                        </div>
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 text-center text-sm font-bold text-[#2F3E46] dark:text-white">
                            <span>{MONTHS[view.month]} {view.year}</span>
                            <span className="hidden md:block">{MONTHS[next.getMonth()]} {next.getFullYear()}</span>
                        </div>
                        <div className="flex items-center gap-0.5">
                            <button type="button" onClick={() => shiftMonths(1)} className={navBtn} aria-label="Next month"><ChevronRight className="w-4 h-4" /></button>
                            <button type="button" onClick={() => shiftMonths(12)} className={navBtn} aria-label="Next year"><ChevronsRight className="w-4 h-4" /></button>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {renderMonth(view.year, view.month)}
                        <div className="hidden md:block">{renderMonth(next.getFullYear(), next.getMonth())}</div>
                    </div>
                    <div className="mt-3 pt-2 border-t border-black/10 dark:border-white/10 flex items-center justify-between gap-2 text-[11px]">
                        <p className="font-semibold text-[#2F3E46]/50 dark:text-white/40">
                            {pendingStart ? "Select an end date (or same day for single date)" : "Select a start date"}
                        </p>
                        {pendingStart && (
                            <button
                                type="button"
                                onClick={() => {
                                    onChange(pendingStart, pendingStart);
                                    setPendingStart(null);
                                    setHovered(null);
                                    setOpen(false);
                                }}
                                className="text-[11px] font-bold text-[#1F7A1F] dark:text-[#55f761] hover:underline cursor-pointer shrink-0"
                            >
                                Just this date ({pendingStart})
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
