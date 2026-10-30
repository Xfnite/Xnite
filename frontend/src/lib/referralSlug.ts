import { splitFullName } from "@/lib/nameUtils";

// Short referral codes like "cedrickr" (first name + last initial), used in
// join.xfnite.cloud/<slug> links. Created by getReferralSlugAction, read by /r/[code].

// Words nobody gets as their referral link, since links like join.xfnite.cloud/login
// or /admin would look like real site pages.
const RESERVED = new Set([
  "404", "r", "www", "app", "api", "admin", "xfnite",
  "login", "logout", "register", "signup", "apply", "join",
  "home", "about", "contact", "faq", "help", "support", "blog",
  "privacy", "terms", "careers", "jobs",
  "dashboard", "account", "wallet", "project", "recruiter", "settings",
]);

// Lowercase a-z/0-9 only; accents are dropped so "Niño" becomes "nino".
function clean(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// "Cedrick" + "Reyes" -> "cedrickr". Falls back to the full name when first/last name are
// missing ("Cedrick Reyes" -> "cedrickr"). Multi-word first names are joined ("John Carlo" -> "johncarlo").
export function referralSlugBase(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  name: string | null | undefined,
): string {
  let first = clean(firstName);
  let lastInitial = clean(lastName).charAt(0);
  if (!first) {
    const split = splitFullName(name);
    first = clean(split.firstName);
    if (!lastInitial && split.lastName) lastInitial = clean(split.lastName).charAt(0);
  }
  return (first.slice(0, 20) || "xfniter") + lastInitial;
}

// base, base2, base3, ... — the numbers that make a taken slug unique.
export function referralSlugCandidates(base: string, from: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => (from + i === 1 ? base : `${base}${from + i}`)).filter(isUsableSlug);
}

// Reserved words are skipped, and so are 8 hex characters, which /r/[code] reads as a user-id link.
function isUsableSlug(slug: string): boolean {
  return !RESERVED.has(slug) && !/^[0-9a-f]{8}$/.test(slug);
}
