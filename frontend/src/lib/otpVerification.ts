import { redis, isRedisReady } from "@/lib/redis";

// After a correct OTP, the OTP route records a short-lived "verified" pass for the
// user. Sensitive routes (withdraw, saving payout details) consume it, so they can't
// be called directly without the email OTP step the UI walks through.

const VERIFIED_PREFIX = "otp_verified:";
const VERIFIED_TTL_SECONDS = 10 * 60; // enough for the QR upload between verify and save

// What the OTP was requested for. A pass only opens the action its OTP email named,
// so a code sent for a withdrawal can't be spent on changing payout details (or vice versa).
export type OtpPurpose = "payment" | "withdraw";

export function otpPurposeKey(email: string, purpose: OtpPurpose): string {
  const key = email.toLowerCase();
  return purpose === "withdraw" ? `withdraw:${key}` : key;
}

// In-memory fallback when Redis is unreachable (mirrors the OTP route's fallback).
const globalForOtpPass = global as unknown as { otpVerifiedStore?: Record<string, number> };
if (!globalForOtpPass.otpVerifiedStore) globalForOtpPass.otpVerifiedStore = {};
const memStore = globalForOtpPass.otpVerifiedStore!;

export async function markOtpVerified(email: string, purpose: OtpPurpose = "payment"): Promise<void> {
  const key = otpPurposeKey(email, purpose);
  if (isRedisReady()) {
    await redis.setex(`${VERIFIED_PREFIX}${key}`, VERIFIED_TTL_SECONDS, "1");
  } else {
    memStore[key] = Date.now() + VERIFIED_TTL_SECONDS * 1000;
  }
}

// Peeks without consuming, so the OTP route can skip emailing a new code while a
// verified pass from an earlier attempt is still usable.
export async function hasOtpVerified(email: string, purpose: OtpPurpose = "payment"): Promise<boolean> {
  const key = otpPurposeKey(email, purpose);
  if (isRedisReady()) {
    return (await redis.exists(`${VERIFIED_PREFIX}${key}`)) === 1;
  }
  const expiresAt = memStore[key];
  return !!expiresAt && Date.now() <= expiresAt;
}

// Atomically uses up the pass; returns false if there was none (or it expired).
// One OTP therefore authorizes exactly one withdrawal or one payment-details save.
export async function consumeOtpVerified(email: string, purpose: OtpPurpose = "payment"): Promise<boolean> {
  const key = otpPurposeKey(email, purpose);
  if (isRedisReady()) {
    const removed = await redis.del(`${VERIFIED_PREFIX}${key}`);
    return removed === 1;
  }
  const expiresAt = memStore[key];
  delete memStore[key];
  return !!expiresAt && Date.now() <= expiresAt;
}
