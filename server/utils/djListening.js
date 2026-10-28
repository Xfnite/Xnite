// ─── "The 60-Minute Harmony" accrual ─────────────────────────────────────────
// Listening time is measured from the client's `jukebox_heartbeat` pings, and
// this is the clock: each ping credits the wall-clock gap since that listener's
// previous ping, so nothing accrues while a tab is closed, paused, muted by an
// autoplay block, or otherwise not sending pings.
//
// A session is per user (not per socket), so a reconnect, a reload or a second
// tab neither resets the tally nor double-counts it: two tabs pinging in turn
// just produce smaller gaps that still add up to the real elapsed time.

export const DJ_TARGET_MINUTES = 60;

// Clients ping every 5s. Anything beyond this is treated as "they were away",
// so a tab that goes quiet for a while resumes instead of being paid for the
// silence. Wide enough to absorb ordinary timer jitter and a brief reconnect.
export const DJ_MAX_GAP_MS = 20_000;

const MINUTE_MS = 60_000;

export function createDjSession(periodKey, minutes = 0) {
  return { periodKey, minutes, accruedMs: 0, lastPingAt: null };
}

// Credits the gap since the previous ping and returns how many whole minutes
// are now ready to be banked — 0 for the first ping of a session, for a gap
// wider than `maxGapMs`, and for every ping that doesn't complete a minute.
// The leftover seconds stay on the session, so minute 2 starts where 1 ended.
export function creditPing(session, now = Date.now(), maxGapMs = DJ_MAX_GAP_MS) {
  const gap = session.lastPingAt === null ? 0 : now - session.lastPingAt;
  session.lastPingAt = now;

  if (gap > 0 && gap <= maxGapMs) {
    session.accruedMs += gap;
  }

  const minutes = Math.floor(session.accruedMs / MINUTE_MS);
  if (minutes > 0) {
    session.accruedMs -= minutes * MINUTE_MS;
  }
  return minutes;
}

// Hands minutes back to the session when the write meant to bank them failed,
// so a transient DB error costs the listener nothing.
export function refundMinutes(session, minutes) {
  session.accruedMs += minutes * MINUTE_MS;
}

export function djProgressPayload(session) {
  return {
    minutes: Math.min(session.minutes, DJ_TARGET_MINUTES),
    target: DJ_TARGET_MINUTES,
    seconds: Math.floor(session.accruedMs / 1000),
  };
}
