import { redis, isRedisReady } from "@/lib/redis";
import { otpPurposeKey, type OtpPurpose } from "@/lib/otpVerification";

// Storage for emailed OTP codes. Lives outside the OTP route so the dev self-test
// page can exercise the exact same code the route runs.

// ─── In-memory fallback store (used when Redis is unreachable) ───────────────
const globalForOtp = global as unknown as {
  otpStore?: Record<string, { otp: string; expiresAt: number; attempts?: number }>;
};
if (!globalForOtp.otpStore) globalForOtp.otpStore = {};
export const otpMemStore = globalForOtp.otpStore!;

export const OTP_PREFIX = "otp:";
export const OTP_TTL_SECONDS = 5 * 60; // 5 minutes
export const OTP_ATTEMPTS_PREFIX = "otp_attempts:";
export const MAX_OTP_ATTEMPTS = 5; // wrong guesses allowed before the code is discarded

export async function storeOtp(email: string, otp: string, purpose: OtpPurpose): Promise<void> {
  const purposeKey = otpPurposeKey(email, purpose);
  const key = `${OTP_PREFIX}${purposeKey}`;
  if (isRedisReady()) {
    await redis.setex(key, OTP_TTL_SECONDS, otp);
    await redis.del(`${OTP_ATTEMPTS_PREFIX}${purposeKey}`);
  } else {
    otpMemStore[purposeKey] = { otp, expiresAt: Date.now() + OTP_TTL_SECONDS * 1000 };
    console.log(`[OTP] Stored in memory (Redis unavailable) for ${email}`);
  }
}

// True while an emailed code for this purpose can still be entered.
export async function hasPendingOtp(email: string, purpose: OtpPurpose): Promise<boolean> {
  const purposeKey = otpPurposeKey(email, purpose);
  if (isRedisReady()) {
    return (await redis.exists(`${OTP_PREFIX}${purposeKey}`)) === 1;
  }
  const cached = otpMemStore[purposeKey];
  return !!cached && Date.now() <= cached.expiresAt;
}

// Compares the submitted code without touching the stored one's expiry: a wrong guess
// leaves it in place with its original TTL, and the code is discarded once
// MAX_OTP_ATTEMPTS attempts have been made on it. A correct code is deleted, so it
// can only be used once.
export async function checkOtp(email: string, purpose: OtpPurpose, submitted: string): Promise<"ok" | "expired" | "invalid" | "locked"> {
  const purposeKey = otpPurposeKey(email, purpose);
  const key = `${OTP_PREFIX}${purposeKey}`;
  const attemptsKey = `${OTP_ATTEMPTS_PREFIX}${purposeKey}`;

  if (isRedisReady()) {
    // Count the attempt before looking at the code. INCR is atomic, so however many
    // requests arrive at once, each gets its own number and at most MAX_OTP_ATTEMPTS
    // of them are ever compared against the stored code — the limit can't be raced.
    // (storeOtp resets the counter when a new code is sent.)
    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) {
      await redis.expire(attemptsKey, OTP_TTL_SECONDS);
    }

    const storedOtp = await redis.get(key);
    if (!storedOtp) return "expired";

    if (attempts > MAX_OTP_ATTEMPTS) {
      await redis.del(key);
      return "locked";
    }

    if (storedOtp !== submitted) {
      if (attempts >= MAX_OTP_ATTEMPTS) {
        await redis.del(key);
        return "locked";
      }
      return "invalid";
    }

    const removed = await redis.del(key); // consume it — can only be used once
    await redis.del(attemptsKey);
    return removed === 1 ? "ok" : "expired";
  }

  // Fallback: in-memory
  const cached = otpMemStore[purposeKey];
  if (!cached) return "expired";

  if (Date.now() > cached.expiresAt) {
    delete otpMemStore[purposeKey];
    return "expired";
  }

  if (cached.otp !== submitted) {
    cached.attempts = (cached.attempts || 0) + 1;
    if (cached.attempts >= MAX_OTP_ATTEMPTS) {
      delete otpMemStore[purposeKey];
      return "locked";
    }
    return "invalid";
  }

  delete otpMemStore[purposeKey]; // consume it
  return "ok";
}
