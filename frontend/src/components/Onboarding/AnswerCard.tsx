"use client";

import { useState } from "react";
import { PlayIcon, ExternalLinkIcon, getYouTubeThumbnail, getYouTubeUrl } from "@/components/Onboarding/helpers";
import { answerKeyImages } from "@/components/Onboarding/answerKeyImages";
import type { AnswerKeyTask } from "@/components/Onboarding/AnswerKeyPanel";

interface CarouselImage { src: string; alt: string }

// ─── Modal Carousel ───────────────────────────────────────────────────────────

function ModalCarousel({ images, startIndex, onClose }: { images: CarouselImage[]; startIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex);
  const multi = images.length > 1;
  const current = images[index];

  const prev = (e: React.MouseEvent) => { e.stopPropagation(); setIndex((i) => (i - 1 + images.length) % images.length); };
  const next = (e: React.MouseEvent) => { e.stopPropagation(); setIndex((i) => (i + 1) % images.length); };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      {/* Top bar */}
      <div className="w-full max-w-5xl flex items-center justify-between mb-3" onClick={(e) => e.stopPropagation()}>
        <span className="text-white/50 text-xs font-semibold">
          {multi ? `${index + 1} / ${images.length}` : ""}
        </span>
        <button
          onClick={onClose}
          className="text-white/70 hover:text-white transition-colors flex items-center gap-1.5 text-sm font-semibold"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Close
        </button>
      </div>

      {/* Image + side arrows */}
      <div className="relative w-full max-w-5xl flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {/* Prev */}
        {multi && (
          <button
            onClick={prev}
            className="flex-shrink-0 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
            aria-label="Previous"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        <img
          src={current.src}
          alt={current.alt}
          className="flex-1 min-w-0 max-h-[80vh] w-full object-contain rounded-2xl shadow-2xl"
        />

        {/* Next */}
        {multi && (
          <button
            onClick={next}
            className="flex-shrink-0 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
            aria-label="Next"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Dot indicators */}
      {multi && (
        <div className="flex gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`w-2 h-2 rounded-full transition-all ${i === index ? "bg-white scale-125" : "bg-white/35 hover:bg-white/60"}`}
              aria-label={`Go to image ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Image Carousel (card thumbnail) ─────────────────────────────────────────

function ImageCarousel({ images }: { images: CarouselImage[] }) {
  const [index, setIndex] = useState(0);
  const [modalIndex, setModalIndex] = useState<number | null>(null);

  const prev = (e: React.MouseEvent) => { e.stopPropagation(); setIndex((i) => (i - 1 + images.length) % images.length); };
  const next = (e: React.MouseEvent) => { e.stopPropagation(); setIndex((i) => (i + 1) % images.length); };
  const current = images[index];
  const multi = images.length > 1;

  return (
    <>
      <div className="relative rounded-xl overflow-hidden border border-black/8 dark:border-white/8 bg-black/[0.02] dark:bg-black/20 group">
        {/* Image — clickable to open modal at current index */}
        <button
          onClick={() => setModalIndex(index)}
          className="w-full cursor-zoom-in block"
          aria-label="View full size"
        >
          <img
            src={current.src}
            alt={current.alt}
            className="w-full max-h-56 object-contain bg-black/5 dark:bg-black/30 transition-opacity group-hover:opacity-90"
          />
        </button>

        {/* Prev / Next arrows */}
        {multi && (
          <>
            <button
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
              aria-label="Previous image"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
              aria-label="Next image"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}

        {/* Dot indicators */}
        {multi && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setIndex(i); }}
                className={`w-1.5 h-1.5 rounded-full transition-all ${i === index ? "bg-white scale-125" : "bg-white/50"}`}
                aria-label={`Go to image ${i + 1}`}
              />
            ))}
          </div>
        )}

        {/* Counter badge */}
        {multi && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-bold backdrop-blur-sm pointer-events-none">
            {index + 1}/{images.length}
          </div>
        )}
      </div>

      {modalIndex !== null && (
        <ModalCarousel images={images} startIndex={modalIndex} onClose={() => setModalIndex(null)} />
      )}
    </>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export default function AnswerCard({ task }: { task: AnswerKeyTask }) {
  const ytUrl = task.youtubeId ? getYouTubeUrl(task.youtubeId, task.startTime) : null;
  const thumbnail = task.youtubeId ? getYouTubeThumbnail(task.youtubeId) : null;

  // Build carousel images: primary + extras
  const carouselImages: CarouselImage[] = [];
  if (task.imageConfigKey) {
    const url = answerKeyImages[task.imageConfigKey];
    if (url) carouselImages.push({ src: url, alt: task.taskId });
  }
  if (task.extraImages) {
    for (const ei of task.extraImages) {
      const url = answerKeyImages[ei.configKey];
      if (url) carouselImages.push({ src: url, alt: ei.caption ?? ei.configKey });
    }
  }

  return (
    <div className="flex flex-col rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#0D1B2A] overflow-hidden shadow-sm hover:shadow-md hover:border-black/20 dark:hover:border-white/20 transition-all duration-200">
      {/* Task ID header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-black/8 dark:border-white/8 bg-black/[0.02] dark:bg-white/[0.02]">
        <span className="text-sm font-black uppercase tracking-wider px-2.5 py-1 rounded-full border bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761]">
          {task.taskId}
        </span>
        <span className="ml-auto text-sm text-black/40 dark:text-white/40 font-mono font-bold">
          #{task.pageNum}
        </span>
      </div>

      {/* Media area */}
      <div className="flex flex-col gap-3 p-4 flex-1">
        {/* YouTube thumbnail — links to YT, does NOT embed/play */}
        {ytUrl && (
          <a
            href={ytUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="relative block rounded-xl overflow-hidden group border border-black/8 dark:border-white/8"
          >
            <img
              src={`/thumbnails/${task.taskId.replace(/task\s+/i, "")}.png`}
              onError={(e) => {
                if (thumbnail && (e.target as HTMLImageElement).src !== thumbnail) {
                  (e.target as HTMLImageElement).src = thumbnail;
                }
              }}
              alt={`Thumbnail for ${task.taskId}`}
              className="w-full aspect-video object-cover bg-black/5 dark:bg-black/30"
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10">
              <PlayIcon />
            </div>
            <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/70 text-white text-[10px] font-bold backdrop-blur-sm">
              <ExternalLinkIcon />
              YouTube
            </div>
          </a>
        )}

        {/* Image carousel (single image or multi) */}
        {carouselImages.length > 0 && (
          <ImageCarousel images={carouselImages} />
        )}

        {/* Note callout */}
        {task.note && (
          <div className="flex gap-2 px-3 py-2.5 rounded-xl border border-amber-400/30 dark:border-amber-400/20 bg-amber-50/80 dark:bg-amber-900/10">
            <div className="w-0.5 flex-shrink-0 rounded-full bg-amber-400/80 dark:bg-amber-400/60 self-stretch" />
            <p className="text-xs text-amber-900/80 dark:text-amber-200/80 leading-relaxed whitespace-pre-line">{task.note}</p>
          </div>
        )}

        {/* Extra buttons */}
        {task.extraButtons && task.extraButtons.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-auto pt-1">
            {task.extraButtons.map((btn) => (
              <a
                key={btn.href}
                href={btn.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/[0.05] text-xs font-semibold text-black/70 dark:text-white/70 hover:border-[#1F7A1F]/50 dark:hover:border-[#55f761]/50 hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-all"
              >
                <ExternalLinkIcon />
                {btn.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
