"use client";

import { Dispatch, SetStateAction } from "react";

interface Question {
  id: string;
  type: string;
  question?: string;
}

interface PreCourseSidebarProps {
  questions: Question[];
  currentIndex: number;
  answers: Record<string, string>;
  showCorrectFeedback: boolean;
  showIncorrectFeedback: boolean;
  progress: number;
  currentQuestionNumber: number;
  totalQuestionsCount: number;
  sidebarOpen: boolean;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  onSelectQuestion: (index: number) => void;
  onReset: () => void;
}

function CheckCircle() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="w-3.5 h-3.5 opacity-40" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function EmptyCircle() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

function questionLabel(q: Question, index: number): string {
  if (q.id === "info_3d") return "Pre-Course Exam 2";
  if (q.id === "q1") return "Intro Video";
  return q.question || `Q${index + 1}`;
}

export default function PreCourseSidebar({
  questions,
  currentIndex,
  answers,
  showCorrectFeedback,
  showIncorrectFeedback,
  progress,
  currentQuestionNumber,
  totalQuestionsCount,
  sidebarOpen,
  setSidebarOpen,
  onSelectQuestion,
  onReset,
}: PreCourseSidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={[
          "fixed lg:sticky z-40 lg:z-10 lg:self-start",
          "flex-shrink-0 w-[260px] lg:w-[22%]",
          "bg-white/95 dark:bg-[#0D1B2A]/98 backdrop-blur-xl",
          "border-r border-black/8 dark:border-white/8",
          "flex flex-col overflow-hidden",
          "transition-transform duration-300 ease-in-out",
          "lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
        style={{ height: "100vh", maxHeight: "100vh", top: "0" }}
      >
        {/* Mobile close button */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="absolute top-4 right-2.5 lg:hidden p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-black/50 dark:text-white/50 z-10"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="px-3 pt-8 pb-3 border-b border-black/8 dark:border-white/8 flex-shrink-0">
          <div className="text-[9px] font-black tracking-widest uppercase text-[#1F7A1F] dark:text-[#55f761] mb-0.5">
            Pre-Course Quiz
          </div>
          <div className="text-xs font-bold text-black/80 dark:text-white/80 mb-2.5">
            Complete All Questions
          </div>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex-1 h-1 bg-black/8 dark:bg-white/8 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#1F7A1F] to-[#55f761] rounded-full transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] font-black text-[#1F7A1F] dark:text-[#55f761] tabular-nums">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="text-[9px] text-black/40 dark:text-white/30">
            {currentQuestionNumber} of {totalQuestionsCount} questions
          </div>
        </div>

        {/* Question list */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-px">
          {questions.map((q, i) => {
            const isAnswered = !!answers[q.id] || q.type === "info";
            const isActive = i === currentIndex && !showCorrectFeedback && !showIncorrectFeedback;
            const isPast = i < currentIndex;
            const isLocked = i > currentIndex;

            return (
              <button
                key={q.id}
                onClick={isLocked ? undefined : () => onSelectQuestion(i)}
                className={[
                  "w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all duration-150",
                  isLocked
                    ? "opacity-40 cursor-default"
                    : "cursor-pointer hover:bg-[#1F7A1F]/5 dark:hover:bg-[#55f761]/5",
                  isActive
                    ? "border-l-2 border-[#1F7A1F] dark:border-[#55f761] bg-[#1F7A1F]/8 dark:bg-[#55f761]/8 pl-[9px]"
                    : "border-l-2 border-transparent",
                ].join(" ")}
              >
                <span className={`flex-shrink-0 transition-colors ${isPast || isAnswered ? "text-[#1F7A1F] dark:text-[#55f761]" : "text-black/25 dark:text-white/25"}`}>
                  {isPast || isAnswered ? <CheckCircle /> : isLocked ? <LockIcon /> : <EmptyCircle />}
                </span>
                <span className={`flex-1 text-[11px] font-medium leading-snug truncate ${isActive ? "text-[#1F7A1F] dark:text-[#55f761] font-semibold" : "text-black/75 dark:text-white/70"}`}>
                  <span className="opacity-40 mr-1 font-mono text-[9px]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {questionLabel(q, i)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer: reset */}
        <div className="px-3 py-2.5 border-t border-black/8 dark:border-white/8 flex-shrink-0">
          <button
            type="button"
            onClick={onReset}
            className="w-full text-[10px] text-black/35 dark:text-white/35 hover:text-black/60 dark:hover:text-white/60 transition-colors underline font-medium text-center py-0.5"
          >
            Reset Quiz & Video Progress
          </button>
        </div>
      </aside>
    </>
  );
}
