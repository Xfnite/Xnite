// ─── Canonical quest / loyalty timeline ──────────────────────────────────────
// SINGLE SOURCE OF TRUTH for when a "day"/period rolls over — for every quest
// and for the loyalty (pass-the-torch) reply points.
//
// The reset boundary is anchored to a FIXED timezone and computed from the
// SERVER clock only. The client's device time/timezone is NEVER trusted, so a
// user cannot force an early reset by changing their clock. Keep this file in
// sync with frontend/src/lib/questPeriod.ts — both must use the same anchor tz
// (driven by the QUEST_RESET_TIMEZONE env var) or the two services will disagree.

const DEFAULT_TIMEZONE = "Asia/Manila";

export const QUEST_RESET_TIMEZONE =
  process.env.QUEST_RESET_TIMEZONE || DEFAULT_TIMEZONE;

// "YYYY-MM-DD" for `date` as seen in the anchor timezone. This string is the
// canonical identifier of the current period — "which day is it?".
export function getPeriodKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: QUEST_RESET_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Start of the current period as a UTC-midnight-stamped Date, e.g. the anchor-tz
// date 2026-07-22 -> Date(Date.UTC(2026, 6, 22)). Safe to store in a Prisma
// `@db.Date` column (drop-in replacement for the old getLocalToday result).
export function getPeriodStart(date = new Date()) {
  const [y, m, d] = getPeriodKey(date).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// Offset (ms) of the anchor timezone at `date`: (wall-clock time) - (UTC).
function tzOffsetMs(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: QUEST_RESET_TIMEZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  const hour = get("hour") % 24; // some engines render midnight as "24"
  const asUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second")
  );
  return asUTC - date.getTime();
}

// The real UTC instant of the next reset (next anchor-tz midnight). Useful for
// countdown timers in the UI. Two-pass so it stays correct across DST shifts.
export function getNextResetAt(date = new Date()) {
  const [y, m, d] = getPeriodKey(date).split("-").map(Number);
  const wallNextMidnight = Date.UTC(y, m - 1, d + 1);
  let instant = wallNextMidnight - tzOffsetMs(date);
  instant = wallNextMidnight - tzOffsetMs(new Date(instant));
  return new Date(instant);
}

// Whether a reset is due, given a previously stored period start (a Date /
// `@db.Date`, which we stamp as UTC midnight) or a period key string.
// Null/undefined counts as "new period".
export function isNewPeriod(stored, date = new Date()) {
  if (stored == null) return true;
  const storedKey =
    stored instanceof Date
      ? getPeriodKey(stored)
      : getPeriodKey(new Date(stored));
  return storedKey !== getPeriodKey(date);
}

// ─── Weekly period (Recruit the Realm) ───────────────────────────────────────
// A fixed Monday–Sunday week in the anchor timezone, the weekly analogue of the
// daily getPeriodKey. Asia/Manila is UTC+8 all year (no DST), so week boundaries
// are exact. A week is identified by its Monday's civil date, e.g. "2026-07-20",
// and self-resets each Monday — the same server-authoritative, clock-proof model
// as the daily quests. Keep in sync with frontend/src/lib/questPeriod.ts.

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000; // Asia/Manila = UTC+8, year-round

// Canonical id of the current week: "YYYY-MM-DD" of that week's Monday (anchor tz).
// (Weeks briefly started on Sunday, so some stored keys are Sundays; claim
// checks therefore match on createdAt within getWeekRange, not on the key.)
export function getWeekKey(date = new Date()) {
  const [y, m, d] = getPeriodKey(date).split("-").map(Number);
  // Weekday of the civil date (0=Sun … 6=Sat), read off the bare calendar date.
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  const monday = new Date(Date.UTC(y, m - 1, d - daysSinceMonday));
  return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}`;
}

// The real UTC instant of the current week's start (Monday 00:00 anchor tz).
export function getWeekStart(date = new Date()) {
  const [y, m, d] = getWeekKey(date).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - MANILA_OFFSET_MS);
}

// [start, end) UTC instants covering the current anchor-tz week. Drop straight
// into a Prisma `createdAt` filter: { gte: start, lt: end }.
export function getWeekRange(date = new Date()) {
  const start = getWeekStart(date);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

// Whether a stored week key differs from the current one. Null = new week.
export function isNewWeek(storedKey, date = new Date()) {
  if (storedKey == null) return true;
  return storedKey !== getWeekKey(date);
}
