import { redis, isRedisReady } from "@/lib/redis";
import { otpPurposeKey, type OtpPurpose } from "@/lib/otpVerification";

// Anti-spam for OTP emails. Each OTP email an account gets pushes the next one further
// away: after the 1st the user waits 2 minutes, then 5, 10 and 30 minutes, and after
// the 5th a full 24 hours. The ladder starts over once the 24-hour wait is served, or
// 24 hours after the first OTP of the current run — so someone who asks for one OTP
// a day never climbs it. Each account has a separate ladder per purpose: waiting on a
// payment-details OTP never blocks a withdrawal OTP, and the other way round.
export const OTP_SEND_WAITS_SECONDS = [2 * 60, 5 * 60, 10 * 60, 30 * 60, 24 * 60 * 60];

const STATE_PREFIX = "otp_sends:";
const STATE_TTL_SECONDS = 24 * 60 * 60;
const LOCK_PREFIX = "otp_send_lock:";
const LOCK_SECONDS = 30; // longer than the mail timeout, so one send at a time per account

// count: OTP emails in the current run; first/last: when the run started / last sent (ms).
export type OtpSendState = { count: number; first: number; last: number };

// A run that never reached the 24-hour step is forgotten a day after it started.
function isRunOver(state: OtpSendState, now: number): boolean {
  return state.count < OTP_SEND_WAITS_SECONDS.length && now - state.first >= STATE_TTL_SECONDS * 1000;
}

// In-memory fallback when Redis is unreachable (mirrors the OTP store's fallback).
const globalForSendLimit = global as unknown as {
  otpSendLimitStore?: Record<string, { value: string; expiresAt: number }>;
};
if (!globalForSendLimit.otpSendLimitStore) globalForSendLimit.otpSendLimitStore = {};
const memStore = globalForSendLimit.otpSendLimitStore!;

// Seconds the account still has to wait before another OTP email, or 0.
export function otpSendWaitSeconds(state: OtpSendState | null, now = Date.now()): number {
  if (!state || state.count <= 0 || isRunOver(state, now)) return 0;
  const wait = OTP_SEND_WAITS_SECONDS[Math.min(state.count, OTP_SEND_WAITS_SECONDS.length) - 1];
  const elapsed = Math.floor((now - state.last) / 1000);
  return Math.max(0, wait - elapsed);
}

// The state after one more OTP email went out.
export function nextOtpSendState(state: OtpSendState | null, now = Date.now()): OtpSendState {
  if (!state || state.count >= OTP_SEND_WAITS_SECONDS.length || isRunOver(state, now)) {
    return { count: 1, first: now, last: now };
  }
  return { count: state.count + 1, first: state.first, last: now };
}

// "45 seconds", "2 minutes", "23 hours 59 minutes" — for the "please wait" message.
export function formatWait(seconds: number): string {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (seconds < 60) return plural(Math.max(1, seconds), "second");
  let hours = Math.floor(seconds / 3600);
  let minutes = Math.ceil((seconds % 3600) / 60);
  if (minutes === 60) {
    hours += 1;
    minutes = 0;
  }
  if (hours === 0) return plural(minutes, "minute");
  return minutes === 0 ? plural(hours, "hour") : `${plural(hours, "hour")} ${plural(minutes, "minute")}`;
}

async function readState(owner: string): Promise<OtpSendState | null> {
  const key = `${STATE_PREFIX}${owner}`;
  let raw: string | null = null;
  if (isRedisReady()) {
    raw = await redis.get(key);
  } else {
    const cached = memStore[key];
    if (cached && Date.now() <= cached.expiresAt) raw = cached.value;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.count === "number" && typeof parsed?.first === "number" && typeof parsed?.last === "number" ? parsed : null;
  } catch {
    return null;
  }
}

async function writeState(owner: string, state: OtpSendState): Promise<void> {
  const key = `${STATE_PREFIX}${owner}`;
  const value = JSON.stringify(state);
  if (isRedisReady()) {
    await redis.setex(key, STATE_TTL_SECONDS, value);
  } else {
    memStore[key] = { value, expiresAt: Date.now() + STATE_TTL_SECONDS * 1000 };
  }
}

async function releaseLock(owner: string): Promise<void> {
  const key = `${LOCK_PREFIX}${owner}`;
  if (isRedisReady()) {
    await redis.del(key);
  }
  delete memStore[key];
}

// Call before sending an OTP email. Returns ok, or how long the account must still
// wait for this purpose. When ok, it is locked against a second simultaneous send
// until finishOtpSend runs (or the lock times out).
export async function beginOtpSend(email: string, purpose: OtpPurpose): Promise<{ ok: true } | { ok: false; retryAfter: number; busy?: boolean }> {
  const owner = otpPurposeKey(email, purpose);
  const lockKey = `${LOCK_PREFIX}${owner}`;
  if (isRedisReady()) {
    const acquired = await redis.set(lockKey, "1", "EX", LOCK_SECONDS, "NX");
    if (!acquired) return { ok: false, retryAfter: 5, busy: true };
  } else {
    const cached = memStore[lockKey];
    if (cached && Date.now() < cached.expiresAt) return { ok: false, retryAfter: 5, busy: true };
    memStore[lockKey] = { value: "1", expiresAt: Date.now() + LOCK_SECONDS * 1000 };
  }

  let retryAfter: number;
  try {
    retryAfter = otpSendWaitSeconds(await readState(owner));
  } catch (err) {
    await releaseLock(owner).catch(() => {});
    throw err;
  }
  if (retryAfter > 0) {
    await releaseLock(owner);
    return { ok: false, retryAfter };
  }
  return { ok: true };
}

// Call after the send attempt. A delivered email moves the account one step up the
// ladder; a failed one costs nothing. Returns the seconds until the next OTP is allowed.
export async function finishOtpSend(email: string, purpose: OtpPurpose, delivered: boolean): Promise<number> {
  const owner = otpPurposeKey(email, purpose);
  try {
    if (!delivered) return 0;
    const state = nextOtpSendState(await readState(owner));
    await writeState(owner, state);
    return otpSendWaitSeconds(state);
  } finally {
    await releaseLock(owner);
  }
}

// Forgets an account's ladder for one purpose. Used by the dev self-test to clean up.
export async function clearOtpSendState(email: string, purpose: OtpPurpose): Promise<void> {
  const owner = otpPurposeKey(email, purpose);
  const key = `${STATE_PREFIX}${owner}`;
  if (isRedisReady()) {
    await redis.del(key);
  }
  delete memStore[key];
  await releaseLock(owner);
}
