

export function getYouTubeUrl(youtubeId: string, startTime?: number): string {
  const base = `https://www.youtube.com/watch?v=${youtubeId}`;
  return startTime && startTime > 0 ? `${base}&t=${startTime}` : base;
}

export function getYouTubeThumbnail(youtubeId: string): string {
  return `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
}

export function SearchIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg className="w-8 h-8 text-white drop-shadow-lg" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="12" fill="rgba(0,0,0,0.55)" />
      <polygon points="10 8 16 12 10 16 10 8" fill="white" />
    </svg>
  );
}

export function ExternalLinkIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6m0 0v6m0-6L10 14" />
    </svg>
  );
}