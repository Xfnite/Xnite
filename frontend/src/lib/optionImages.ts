/**
 * Mapping of quiz options / keys to their Google Form image asset URLs.
 * Support compound keys formatted as `${questionId}::${optionText}` for question-specific images,
 * or simple global option keys for shared images.
 */
export const OPTION_IMAGE_URLS: Record<string, string> = {
  // ─── Shared Option Images ────────────────────────────────────────────────────────
  "W - Hand Tool": "https://utfs.io/f/7QT6x0ZmY23V0CrurGimdE4pfcWA9okJxG0yOUlXis85ht1n",
  "E - Parallel Tool": "https://utfs.io/f/7QT6x0ZmY23V4zYm8PyGWzMs8TCmkglajOcFNih6dnpfetq5",
  "S - Line Tool": "https://utfs.io/f/7QT6x0ZmY23VjpUCO14Md0TFszQaCb3LDeItOyXfSc8YrV4R",
  "G - Arc Tool": "https://utfs.io/f/7QT6x0ZmY23V96W4EtwDSkFxOrRWELuMtT3plX5ZUaPiNshY",
  "F - Right Angle Line Tool": "https://utfs.io/f/7QT6x0ZmY23VrPYAUPxgdpSD6ksJRyY8XHW0ZtAGuaKoPiQx",

  // ─── Other Tool mappings (can populate as URLs are available) ───────────────────
  "S - Draw Tool": "https://utfs.io/f/7QT6x0ZmY23V2tRZ7rNtsoMwE9byRYUxFafnICBij5cXek4N",
  "Z - Repair Tool": "https://utfs.io/f/7QT6x0ZmY23VfXPM9JdSp9GdNc5juX70e2ZazPTWqU6IvhyD",
  "C - Cavity Tool": "https://utfs.io/f/7QT6x0ZmY23VxFnYkaVXxDHL8y4Jt0FZ1vgnQl9YSTGuBsrj",
  "Shortcut Key 1": "https://utfs.io/f/7QT6x0ZmY23VErvY1eJstNK8n29PxOH6bVjFigZJfAYWUTup",
  "V - Merge Tool": "https://utfs.io/f/7QT6x0ZmY23VovZaWGjlbOstcBTmNa7pnEv2GFHPhzuQ9ZCd",
  "A - Select Tool": "https://utfs.io/f/7QT6x0ZmY23Vxkoom9VXxDHL8y4Jt0FZ1vgnQl9YSTGuBsrj  ",
  "B - Delete Tool": "https://utfs.io/f/7QT6x0ZmY23Vdca0T07nGE0tzSZKYM45O7mANo6UhrsH9luP",
  "X - Right Angle Repair Tool": "https://utfs.io/f/7QT6x0ZmY23VibVb67Fxph25dLacnYWTeBKtSIr0gyzlHCjF",
  "T - Split Tool": "https://utfs.io/f/7QT6x0ZmY23VNmrXwmJx17ICpcKiu9aZSkADYPMNv8m5xREJ",
  "H - Trace Tool": "https://utfs.io/f/7QT6x0ZmY23VwfVtWdzZdmJ6NW3uGQEaPvj1LSbBA0F28eOr",
  "3 - Vector Tool": "https://utfs.io/f/7QT6x0ZmY23V7HRHeIEZmY23VRIjTyrDdMlvgFZpwoH6scGS",
  "3d_building_1": "https://utfs.io/f/7QT6x0ZmY23VFC56iBYNHf8dzhpRDOIvTW3wYEVn107cKQFy",
  "3d_building_2": "https://utfs.io/f/7QT6x0ZmY23VEA6WsuJstNK8n29PxOH6bVjFigZJfAYWUTup",
  "3d_building_3": "https://utfs.io/f/7QT6x0ZmY23Vdd6YoS7nGE0tzSZKYM45O7mANo6UhrsH9luP",
  "3d_building_4": "https://utfs.io/f/7QT6x0ZmY23VNt8ksOx17ICpcKiu9aZSkADYPMNv8m5xREJ2"
};

/**
 * Returns the mapped image URL for a given option key if defined.
 * If questionId is provided, first checks if a question-specific override exists.
 * Otherwise returns null.
 */
export function getOptionImageUrl(optionKey: string, questionId?: string): string | null {
  if (questionId) {
    const compoundKey = `${questionId}::${optionKey}`;
    const url = OPTION_IMAGE_URLS[compoundKey];
    if (url && url.trim().length > 0) return url;
  }
  const url = OPTION_IMAGE_URLS[optionKey];
  return url && url.trim().length > 0 ? url : null;
}
