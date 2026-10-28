import { redis, isRedisReady } from "@/lib/redis";
import {
  storeOtp, hasPendingOtp, checkOtp, otpMemStore,
  OTP_PREFIX, OTP_ATTEMPTS_PREFIX, OTP_TTL_SECONDS, MAX_OTP_ATTEMPTS,
} from "@/lib/otpStore";
import {
  markOtpVerified, hasOtpVerified, consumeOtpVerified, otpPurposeKey, type OtpPurpose,
} from "@/lib/otpVerification";
import { evaluateWithdrawEligibility } from "@/lib/withdrawEligibility";
import { extractEmailCandidates, splitPastedEmails, ownedGroupIds, canActivate, groupStaffNames, type ActivationStaff, type ActivationGroup } from "@/lib/userActivation";
import {
  OTP_SEND_WAITS_SECONDS, otpSendWaitSeconds, nextOtpSendState, formatWait,
  beginOtpSend, finishOtpSend, clearOtpSendState, type OtpSendState,
} from "@/lib/otpSendLimit";

// Dev-only self-test for the withdrawal OTP flow. It never touches real users or the
// database: the eligibility rules run against made-up settings (so it works while
// salaries are disabled for everyone), and the OTP checks use a throwaway address
// whose keys are removed afterwards.

export type SelfTestResult = { group: string; name: string; pass: boolean; detail: string };

const settingsFrom = (values: Record<string, string>) =>
  Object.entries(values).map(([key, value]) => ({ key, value }));

async function getOtpTtlSeconds(email: string, purpose: OtpPurpose): Promise<number> {
  const purposeKey = otpPurposeKey(email, purpose);
  if (isRedisReady()) return redis.ttl(`${OTP_PREFIX}${purposeKey}`);
  const cached = otpMemStore[purposeKey];
  return cached ? Math.ceil((cached.expiresAt - Date.now()) / 1000) : -2;
}

async function setOtpTtlSeconds(email: string, purpose: OtpPurpose, seconds: number): Promise<void> {
  const purposeKey = otpPurposeKey(email, purpose);
  if (isRedisReady()) {
    await redis.expire(`${OTP_PREFIX}${purposeKey}`, seconds);
  } else if (otpMemStore[purposeKey]) {
    otpMemStore[purposeKey].expiresAt = Date.now() + seconds * 1000;
  }
}

async function cleanup(email: string): Promise<void> {
  for (const purpose of ["payment", "withdraw"] as const) {
    const purposeKey = otpPurposeKey(email, purpose);
    if (isRedisReady()) {
      await redis.del(`${OTP_PREFIX}${purposeKey}`, `${OTP_ATTEMPTS_PREFIX}${purposeKey}`);
    }
    delete otpMemStore[purposeKey];
    await consumeOtpVerified(email, purpose);
  }
}

export async function runSelfTest(): Promise<{ store: "redis" | "memory"; results: SelfTestResult[] }> {
  const results: SelfTestResult[] = [];
  const store = isRedisReady() ? "redis" : "memory";

  const expect = (group: string, name: string, actual: unknown, expected: unknown) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    results.push({
      group, name, pass,
      detail: pass ? String(JSON.stringify(actual)) : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    });
  };
  const run = async (group: string, name: string, fn: () => Promise<void> | void) => {
    try {
      await fn();
    } catch (err) {
      results.push({ group, name, pass: false, detail: `threw: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  // ── 1. Eligibility rules (what the OTP send and the withdraw route both enforce) ──
  const ELIGIBILITY = "Eligibility rules";
  const income = { role: "labeler", status: "Fill-out claim form", estimatedAmount: 5000 };
  const thresholdOff = { disable_withdrawals_balance_enabled: "false" };
  const errorOf = (inc: typeof income, values: Record<string, string>) =>
    evaluateWithdrawEligibility(inc, settingsFrom(values))?.error ?? null;

  const DISABLED = "Withdrawal has not started yet";
  const ROLE_DISABLED = "Withdrawal has not started yet";
  const BAD_STATUS = "Status does not allow withdrawal";
  const BELOW_THRESHOLD = "Withdrawal has not started yet";

  await run(ELIGIBILITY, "eligibility cases", () => {
    expect(ELIGIBILITY, "eligible user is allowed", errorOf(income, thresholdOff), null);
    expect(ELIGIBILITY, "salaries disabled for all blocks", errorOf(income, { ...thresholdOff, salaries_disabled: "true" }), DISABLED);
    expect(ELIGIBILITY, "salaries disabled for the user's role blocks", errorOf(income, { ...thresholdOff, salaries_disabled_roles: '["labeler"]' }), DISABLED);
    expect(ELIGIBILITY, "salaries disabled for another role does not block", errorOf(income, { ...thresholdOff, salaries_disabled_roles: '["checker"]' }), null);
    expect(ELIGIBILITY, "withdrawal disabled for the user's role blocks", errorOf(income, { ...thresholdOff, withdraw_disabled_roles: '["labeler"]' }), ROLE_DISABLED);
    expect(ELIGIBILITY, "withdrawal disabled for another role does not block", errorOf(income, { ...thresholdOff, withdraw_disabled_roles: '["checker"]' }), null);
    expect(ELIGIBILITY, "malformed role list is ignored", errorOf(income, { ...thresholdOff, withdraw_disabled_roles: "not-json" }), null);
    expect(ELIGIBILITY, "non-claimable status blocks", errorOf({ ...income, status: "Sending" }, thresholdOff), BAD_STATUS);
    expect(ELIGIBILITY, "any status mentioning 'claim' is allowed", errorOf({ ...income, status: "Ready to claim" }, thresholdOff), null);
    expect(ELIGIBILITY, "below the default 1,250 threshold blocks (no settings rows)", errorOf({ ...income, estimatedAmount: 1249 }, {}), BELOW_THRESHOLD);
    expect(ELIGIBILITY, "exactly at the threshold is allowed", errorOf({ ...income, estimatedAmount: 1250 }, {}), null);
    expect(ELIGIBILITY, "custom threshold is honoured", errorOf({ ...income, estimatedAmount: 2000 }, { disable_withdrawals_balance_threshold: "3000" }), BELOW_THRESHOLD);
    expect(
      ELIGIBILITY, "labeler override applies even with the global threshold off",
      errorOf({ ...income, estimatedAmount: 2000 }, { ...thresholdOff, disable_withdrawals_balance_labeler_enabled: "true", disable_withdrawals_balance_labeler: "3000" }),
      BELOW_THRESHOLD
    );
    expect(
      ELIGIBILITY, "labeler override does not affect other roles",
      errorOf({ ...income, role: "checker", estimatedAmount: 2000 }, { ...thresholdOff, disable_withdrawals_balance_labeler_enabled: "true", disable_withdrawals_balance_labeler: "3000" }),
      null
    );
  });

  // ── Activate Users form: reading pasted lines and who may activate whom ──────────
  const ACTIVATE = "Activate Users rules";
  await run(ACTIVATE, "activation", () => {
    expect(ACTIVATE, "plain email", extractEmailCandidates("  Name@Example.com "), ["name@example.com"]);
    expect(ACTIVATE, "numbered line", extractEmailCandidates("12. name@example.com"), ["name@example.com"]);
    expect(ACTIVATE, "number stuck to the email: exact email first, then without the number", extractEmailCandidates("12.name@example.com"), ["12.name@example.com", "name@example.com"]);
    expect(ACTIVATE, "bracket numbering", extractEmailCandidates("3) Name@Example.com,"), ["name@example.com"]);
    expect(ACTIVATE, "double numbering also tries the email without the number", extractEmailCandidates("36. 1.name@example.com"), ["1.name@example.com", "name@example.com"]);
    expect(ACTIVATE, "line without an email", extractEmailCandidates("Email address"), []);
    expect(ACTIVATE, "paste: comma separated on one line", splitPastedEmails("fe@gmail.com, jewbfb@def.com, wedn@gmail.com"), ["fe@gmail.com", "jewbfb@def.com", "wedn@gmail.com"]);
    expect(ACTIVATE, "paste: no spaces, semicolons, tabs and new lines", splitPastedEmails("a@x.com,b@x.com;c@x.com\td@x.com\r\ne@x.com"), ["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com"]);
    expect(ACTIVATE, "paste: names, brackets, quotes and mailto", splitPastedEmails('Juan Cruz <juan@x.com>, "ana@x.com" (mailto:ben@x.com)'), ["juan@x.com", "ana@x.com", "ben@x.com"]);
    expect(ACTIVATE, "paste: numbered list keeps a number stuck to the email", splitPastedEmails("1. a@x.com\n2.b@x.com\n3) c@x.com"), ["a@x.com", "2.b@x.com", "c@x.com"]);
    expect(ACTIVATE, "paste: spaces around @ and invisible characters", splitPastedEmails("juan @ gmail.com\nana​@gmail.com"), ["juan@gmail.com", "ana@gmail.com"]);
    expect(ACTIVATE, "paste: a broken email is kept so it can be reported", splitPastedEmails("good@x.com bad@gmail"), ["good@x.com", "bad@gmail"]);
    expect(ACTIVATE, "paste: headers and blank lines are ignored", splitPastedEmails("Email address\n\n  \nName"), []);

    const staff = (role: string): ActivationStaff => ({
      email: "me@example.com", role, gingerEmail: "XFd_me@example.com", gingerUsername: "XFd_Me", username: "me", linkedRecruiterEmail: "boss@example.com",
    });
    const groups: ActivationGroup[] = [
      { groupId: 10, parentGroupId: 50, checkerName: "xfd_me", judgerName: null, managerEmail: null, ownerEmail: null },
      { groupId: 20, parentGroupId: 60, checkerName: "someone", judgerName: null, managerEmail: null, ownerEmail: null },
      { groupId: 60, parentGroupId: null, checkerName: null, judgerName: "XFd_Me", managerEmail: null, ownerEmail: null },
      { groupId: 70, parentGroupId: null, checkerName: null, judgerName: "other", managerEmail: null, ownerEmail: null },
    ];
    const mine = ownedGroupIds(staff("checker"), groups);
    expect(ACTIVATE, "owned groups: checked group, judged team and the groups under it", [...mine].sort(), [10, 20, 60]);

    const stranger = { refererEmail: "x@example.com", labelerRefererEmail: null, group_id: 70, team_id: null };
    expect(ACTIVATE, "admin can activate anyone", canActivate(staff("admin"), stranger, new Set()), true);
    expect(ACTIVATE, "recruiter cannot activate a stranger", canActivate(staff("recruiter"), stranger, new Set()), false);
    expect(ACTIVATE, "recruiter can activate their own recruit", canActivate(staff("recruiter"), { ...stranger, labelerRefererEmail: "ME@example.com" }, new Set()), true);
    expect(ACTIVATE, "recruiter can activate a recruit of their linked recruiter account", canActivate(staff("recruiter"), { ...stranger, refererEmail: "boss@example.com" }, new Set()), true);
    expect(ACTIVATE, "checker can activate a member of their group", canActivate(staff("checker"), { ...stranger, group_id: 10 }, mine), true);
    expect(ACTIVATE, "judger can activate a member of a group under their team", canActivate(staff("judger"), { ...stranger, group_id: 20 }, mine), true);
    expect(ACTIVATE, "but not a member of someone else's team", canActivate(staff("judger"), stranger, mine), false);
    expect(ACTIVATE, "who is responsible for a user: checker of their group, judger of the parent team",
      groupStaffNames({ ...stranger, group_id: 20 }, groups), { checker: "someone", judger: "xfd_me" });
    expect(ACTIVATE, "a user with no group has no checker or judger", groupStaffNames({ ...stranger, group_id: null }, groups), { checker: null, judger: null });
    expect(ACTIVATE, "a user with no real group is not matched by a placeholder id", canActivate(staff("checker"), { ...stranger, group_id: 0, team_id: -1 }, new Set([0, -1])), false);
  });

  // ── 2–4. OTP lifecycle, on a throwaway address ──────────────────────────────────
  const email = `selftest-${crypto.randomUUID()}@dev-selftest.invalid`;
  const CODE = "123456";
  const WRONG = "000000";

  try {
    const LIFECYCLE = "OTP code lifecycle";
    await run(LIFECYCLE, "lifecycle", async () => {
      await storeOtp(email, CODE, "withdraw");
      expect(LIFECYCLE, "a sent code is reported as pending (cancel-and-reopen case)", await hasPendingOtp(email, "withdraw"), true);
      expect(LIFECYCLE, "a wrong code is rejected", await checkOtp(email, "withdraw", WRONG), "invalid");
      expect(LIFECYCLE, "the code is still pending after a wrong guess", await hasPendingOtp(email, "withdraw"), true);
      expect(LIFECYCLE, "the correct code is accepted", await checkOtp(email, "withdraw", CODE), "ok");
      expect(LIFECYCLE, "the code is single-use", await checkOtp(email, "withdraw", CODE), "expired");
      expect(LIFECYCLE, "nothing is pending once used", await hasPendingOtp(email, "withdraw"), false);
      await storeOtp(email, "111111", "withdraw");
      await storeOtp(email, CODE, "withdraw");
      expect(LIFECYCLE, "a resent code replaces the previous one", await checkOtp(email, "withdraw", "111111"), "invalid");
      expect(LIFECYCLE, "and the new code works", await checkOtp(email, "withdraw", CODE), "ok");
    });

    const EXPIRY = "Wrong guesses and expiry";
    await run(EXPIRY, "expiry", async () => {
      await storeOtp(email, CODE, "withdraw");
      await setOtpTtlSeconds(email, "withdraw", 60);
      await checkOtp(email, "withdraw", WRONG);
      const ttl = await getOtpTtlSeconds(email, "withdraw");
      expect(EXPIRY, `a wrong guess does not reset the ${OTP_TTL_SECONDS}s expiry (shortened to 60s first)`, ttl > 0 && ttl <= 60, true);

      await storeOtp(email, CODE, "withdraw");
      const guesses: string[] = [];
      for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) guesses.push(await checkOtp(email, "withdraw", WRONG));
      expect(
        EXPIRY, `wrong guess number ${MAX_OTP_ATTEMPTS} discards the code`, guesses,
        [...Array(MAX_OTP_ATTEMPTS - 1).fill("invalid"), "locked"]
      );
      expect(EXPIRY, "the correct code no longer works after the lockout", await checkOtp(email, "withdraw", CODE), "expired");

      await storeOtp(email, CODE, "withdraw");
      for (let i = 0; i < MAX_OTP_ATTEMPTS - 1; i++) await checkOtp(email, "withdraw", WRONG);
      await storeOtp(email, CODE, "withdraw");
      expect(EXPIRY, "a newly sent code starts with a fresh guess count", await checkOtp(email, "withdraw", WRONG), "invalid");
      expect(EXPIRY, "and can still be verified", await checkOtp(email, "withdraw", CODE), "ok");

      await storeOtp(email, CODE, "withdraw");
      for (let i = 0; i < MAX_OTP_ATTEMPTS - 1; i++) await checkOtp(email, "withdraw", WRONG);
      expect(EXPIRY, `the correct code is still accepted on attempt ${MAX_OTP_ATTEMPTS}`, await checkOtp(email, "withdraw", CODE), "ok");

      // The limit must hold when the guesses arrive at the same time, not one by one.
      await storeOtp(email, CODE, "withdraw");
      const burst = await Promise.all(Array.from({ length: 20 }, () => checkOtp(email, "withdraw", WRONG)));
      expect(
        EXPIRY, `20 simultaneous wrong guesses: no more than ${MAX_OTP_ATTEMPTS - 1} are answered "invalid"`,
        burst.filter((r) => r === "invalid").length <= MAX_OTP_ATTEMPTS - 1, true
      );
      expect(EXPIRY, "and the code is gone afterwards", await checkOtp(email, "withdraw", CODE), "expired");
    });

    const PURPOSE = "Codes are tied to their purpose";
    await run(PURPOSE, "purpose", async () => {
      await storeOtp(email, CODE, "withdraw");
      expect(PURPOSE, "a withdrawal code is not pending for payment details", await hasPendingOtp(email, "payment"), false);
      expect(PURPOSE, "a withdrawal code cannot be verified as a payment-details code", await checkOtp(email, "payment", CODE), "expired");
      expect(PURPOSE, "and is still usable for the withdrawal", await checkOtp(email, "withdraw", CODE), "ok");

      await storeOtp(email, CODE, "payment");
      expect(PURPOSE, "a payment-details code cannot be verified as a withdrawal code", await checkOtp(email, "withdraw", CODE), "expired");
      expect(PURPOSE, "and is still usable for payment details", await checkOtp(email, "payment", CODE), "ok");
    });

    const PASS = "Verified pass (retry without a new code)";
    await run(PASS, "pass", async () => {
      expect(PASS, "no pass before verifying", await hasOtpVerified(email, "withdraw"), false);
      await markOtpVerified(email, "withdraw");
      expect(PASS, "a verified withdrawal pass is detected", await hasOtpVerified(email, "withdraw"), true);
      expect(PASS, "checking for the pass does not use it up", await hasOtpVerified(email, "withdraw"), true);
      expect(PASS, "it is not a payment-details pass", await hasOtpVerified(email, "payment"), false);
      expect(PASS, "it cannot be spent on a payment-details save", await consumeOtpVerified(email, "payment"), false);
      expect(PASS, "it can be spent on a withdrawal", await consumeOtpVerified(email, "withdraw"), true);
      expect(PASS, "only once", await consumeOtpVerified(email, "withdraw"), false);
      await markOtpVerified(email, "withdraw");
      expect(PASS, "handing the pass back (failed withdrawal) allows one retry", await consumeOtpVerified(email, "withdraw"), true);
    });

    const LADDER = "Wait between OTP emails";
    await run(LADDER, "ladder", async () => {
      // The rule itself, replayed with a fake clock.
      const t0 = 1_000_000_000_000;
      let state: OtpSendState | null = null;
      const waits: number[] = [];
      for (let i = 0; i < OTP_SEND_WAITS_SECONDS.length; i++) {
        state = nextOtpSendState(state, t0);
        waits.push(otpSendWaitSeconds(state, t0));
      }
      expect(LADDER, "the first OTP is sent without waiting", otpSendWaitSeconds(null, t0), 0);
      expect(LADDER, "waits after each OTP are 2, 5, 10 and 30 minutes, then 24 hours", waits, [120, 300, 600, 1800, 86400]);
      const afterSecond: OtpSendState = { count: 2, first: t0, last: t0 };
      expect(LADDER, "the wait counts down", otpSendWaitSeconds(afterSecond, t0 + 100_000), 200);
      expect(LADDER, "and ends exactly on time", otpSendWaitSeconds(afterSecond, t0 + 300_000), 0);
      expect(LADDER, "after the 24-hour wait the ladder starts over at 2 minutes", otpSendWaitSeconds(nextOtpSendState(state, t0), t0), 120);
      // One OTP every 20 hours: the run is forgotten a day after it started, so the
      // count never climbs past 2.
      const HOUR = 3_600_000;
      let daily: OtpSendState | null = null;
      const dailyCounts: number[] = [];
      for (let i = 0; i < 6; i++) {
        daily = nextOtpSendState(daily, t0 + i * 20 * HOUR);
        dailyCounts.push(daily.count);
      }
      expect(LADDER, "one OTP every 20 hours never climbs the ladder", Math.max(...dailyCounts) <= 2, true);
      expect(LADDER, "a run that started over a day ago no longer makes the user wait",
        otpSendWaitSeconds({ count: 4, first: t0, last: t0 + 23 * HOUR + 50 * 60_000 }, t0 + 24 * HOUR), 0);
      expect(LADDER, "but the 24-hour step is always served in full",
        otpSendWaitSeconds({ count: 5, first: t0, last: t0 + 23 * HOUR }, t0 + 24 * HOUR), 82800);
      expect(LADDER, "wait message wording", [formatWait(45), formatWait(120), formatWait(1800), formatWait(86400), formatWait(86340)],
        ["45 seconds", "2 minutes", "30 minutes", "24 hours", "23 hours 59 minutes"]);

      // The real thing, on the throwaway address.
      expect(LADDER, "a first send is allowed", (await beginOtpSend(email, "withdraw")).ok, true);
      const second = await beginOtpSend(email, "withdraw");
      expect(LADDER, "a second send at the same moment is refused", second.ok === false && second.busy === true, true);
      expect(LADDER, "a failed email does not start the wait", await finishOtpSend(email, "withdraw", false), 0);
      expect(LADDER, "so the retry is allowed", (await beginOtpSend(email, "withdraw")).ok, true);
      expect(LADDER, "a delivered email starts the 2-minute wait", await finishOtpSend(email, "withdraw", true), 120);
      const blocked = await beginOtpSend(email, "withdraw");
      expect(LADDER, "the next request is refused with the time left", blocked.ok === false && blocked.retryAfter > 110 && blocked.retryAfter <= 120, true);
      expect(LADDER, "a withdrawal wait does not block a payment-details OTP", (await beginOtpSend(email, "payment")).ok, true);
      expect(LADDER, "and the payment-details wait starts on its own", await finishOtpSend(email, "payment", true), 120);
    });
  } finally {
    await clearOtpSendState(email, "withdraw").catch(() => {});
    await clearOtpSendState(email, "payment").catch(() => {});
    await cleanup(email).catch(() => {});
  }

  return { store, results };
}
