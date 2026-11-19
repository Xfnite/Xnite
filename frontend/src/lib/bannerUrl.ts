export const DEFAULT_SIDEBAR_BANNER_URL =
  "https://www.youtube.com/embed/NyzgdXyta4k?autoplay=1&mute=1&loop=1&playlist=NyzgdXyta4k&controls=0&showinfo=0&rel=0&disablekb=1&modestbranding=1&iv_load_policy=3&enablejsapi=1";

/**
 * Ensures a saved YouTube embed URL has silent, looping, chromeless autoplay parameters.
 */
export function normalizeBannerEmbedUrl(rawUrl?: string | null): string {
  if (!rawUrl || !rawUrl.trim()) {
    return DEFAULT_SIDEBAR_BANNER_URL;
  }

  let savedBanner = rawUrl.trim();
  const match = savedBanner.match(/embed\/([^?]+)/);
  if (match) {
    const vid = match[1];
    if (!savedBanner.includes("loop=1")) savedBanner += "&loop=1";
    if (!savedBanner.includes("playlist=")) savedBanner += `&playlist=${vid}`;
  }

  if (!savedBanner.includes("autoplay=1")) savedBanner += "&autoplay=1";
  if (!savedBanner.includes("mute=1")) savedBanner += "&mute=1";
  if (!savedBanner.includes("controls=0")) savedBanner += "&controls=0";
  if (!savedBanner.includes("iv_load_policy=3")) savedBanner += "&iv_load_policy=3";
  if (!savedBanner.includes("enablejsapi=1")) savedBanner += "&enablejsapi=1";

  return savedBanner;
}
