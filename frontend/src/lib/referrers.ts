/* eslint-disable @typescript-eslint/no-explicit-any */
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { toUserFacingError } from "@/lib/userFacingError";

// A user is added to the sign-up page's referrer list automatically once this many
// people have signed up under them (the same count their sidebar referral card shows).
export const AUTO_REFERRER_MIN_RECRUITS = 5;
// ...and at least this many of those recruits have become labelers. Until then they
// are not an active referrer and stay off (or drop off) the list.
export const AUTO_REFERRER_MIN_LABELER_RECRUITS = 1;

// ---- Recruiter identity ----
// The referal table is the source of truth for who a recruiter is: its email is the
// recruiter's account on Ginger, so it is what new recruits are saved under and what
// Ginger receives as referal_email. A recruiter's Xfnite account points at that row
// through linkedRecruiterEmail, or its Ginger email is the referal email itself.
// Referral links carry the Xfnite login email, so picks are mapped back with this.
type RecruiterAccount = { linkedRecruiterEmail: string | null; gingerEmail: string | null };

function referalEmailsOf(account: RecruiterAccount | null | undefined): string[] {
  return [account?.linkedRecruiterEmail, account?.gingerEmail]
    .map((e) => e?.trim().toLowerCase())
    .filter((e): e is string => !!e);
}

// The referal row for a picked referrer email (referal, login or Ginger email), or
// null when the recruiter has none (e.g. a labeler who refers without a referal row).
export async function findReferalFor(email: string) {
  const picked = email.trim().toLowerCase();
  const select = { email: true, code: true, sitename: true } as const;
  const direct = await prisma.referal.findUnique({ where: { email: picked }, select });
  if (direct) return direct;

  const account = await prisma.user.findUnique({
    where: { email: picked },
    select: { linkedRecruiterEmail: true, gingerEmail: true },
  });
  for (const alias of referalEmailsOf(account)) {
    if (alias === picked) continue;
    const row = await prisma.referal.findUnique({ where: { email: alias }, select });
    if (row) return row;
  }
  return null;
}

// Collapses recruiters listed twice (their referal row + their Xfnite login) into one
// row. The login email is kept so the page can still match the signed-in user; the
// referal row's name is kept. canonical() maps either email to that row's key.
// Referal rows are told apart by their code (every referal row has one; the login
// rows listActiveReferrers adds have code: null).
export async function mergeRecruiterRows<T extends { email: string; name?: string | null; code?: string | null; createdAt?: Date | string }>(rows: T[]) {
  const referalEmails = new Set(rows.filter((r) => r.code).map((r) => r.email.toLowerCase()));
  const logins = rows.filter((r) => !r.code).map((r) => r.email.toLowerCase());
  const accounts = logins.length > 0
    ? await prisma.user.findMany({
        where: { email: { in: logins, mode: "insensitive" } },
        select: { email: true, linkedRecruiterEmail: true, gingerEmail: true },
      })
    : [];

  const loginOf = new Map<string, string>(); // referal email -> login email
  accounts.forEach((a) => {
    const alias = referalEmailsOf(a).find((e) => referalEmails.has(e));
    if (alias) loginOf.set(alias, a.email.toLowerCase());
  });
  const canonical = (email: string) => loginOf.get(email.toLowerCase()) || email.toLowerCase();

  const merged = new Map<string, T>();
  rows.forEach((row) => {
    const key = canonical(row.email);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...row, email: key });
      return;
    }
    if (row.code) {
      existing.name = row.name || existing.name;
      existing.code = row.code;
    }
    if (row.createdAt && existing.createdAt && new Date(row.createdAt) < new Date(existing.createdAt)) existing.createdAt = row.createdAt;
  });
  return { rows: Array.from(merged.values()), canonical };
}

// Emails (lowercased) of everyone at or over the thresholds. This is the only part
// that scans the User table, so it is cached briefly; the rest of the list is live.
const getAutoReferrerEmails = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await prisma.$queryRaw<{ email: string }[]>`
      SELECT LOWER(u."labelerRefererEmail") AS email
      FROM "User" u
      WHERE u."labelerRefererEmail" IS NOT NULL
      GROUP BY LOWER(u."labelerRefererEmail")
      HAVING COUNT(*) >= ${AUTO_REFERRER_MIN_RECRUITS}
        AND COUNT(*) FILTER (
          WHERE LOWER(TRIM(u."role")) IN ('labeler', 'old-labeler', 'old-laber', 'old labeler')
        ) >= ${AUTO_REFERRER_MIN_LABELER_RECRUITS}
    `;
    return rows.map((r) => r.email);
  },
  ["signup-auto-referrer-emails"],
  { revalidate: 300 }
);

// The "Select a Referrer" list on the sign-up page: Active entries of the referal
// table plus anyone who reached AUTO_REFERRER_MIN_RECRUITS, minus recruiters whose
// own account has been deactivated for inactivity. Nothing is written to the
// database — a recruiter appears or drops out as their recruit count / status changes.
export async function listSignupReferrers(): Promise<{ email: string; name: string | null }[]> {
  const [allReferals, autoEmails] = await Promise.all([
    prisma.referal.findMany({
      select: { email: true, name: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    getAutoReferrerEmails().catch((err) => {
      console.error("Failed to load auto referrers:", err);
      return [] as string[];
    }),
  ]);
  const referrals = allReferals
    .filter((r) => r.status === "Active")
    .map((r) => ({ email: r.email, name: r.name }));

  const candidateEmails = Array.from(new Set([...referrals.map((r) => r.email.toLowerCase()), ...autoEmails]));
  const accounts = candidateEmails.length > 0
    ? await prisma.user.findMany({
        where: { email: { in: candidateEmails, mode: "insensitive" } },
        select: { email: true, name: true, firstName: true, lastName: true, status: true, linkedRecruiterEmail: true, gingerEmail: true },
      })
    : [];
  const accountByEmail = new Map(accounts.map((a) => [a.email.toLowerCase(), a]));

  // Same test the login/sign-up flows use for the inactivity blacklist.
  const isInactive = (email: string) => {
    const status = accountByEmail.get(email.toLowerCase())?.status;
    return status === "Deactivated" || status?.toLowerCase() === "inactive";
  };

  const list = referrals.filter((r) => !isInactive(r.email));
  // Every referal row counts as "already decided", Active or not: a recruiter an admin
  // took off the list must not be put back just because they have enough recruits.
  const listed = new Set(allReferals.map((r) => r.email.toLowerCase()));

  for (const email of autoEmails) {
    const account = accountByEmail.get(email);
    if (!account || listed.has(email) || isInactive(email)) continue;
    // Already listed under their referal row
    if (referalEmailsOf(account).some((e) => listed.has(e))) continue;
    list.push({
      email: account.email,
      name: (account.firstName && account.lastName) ? account.firstName + ' ' + account.lastName : (account.name || account.email),
    });
  }

  return list;
}

// Active recruiters (referal table + labelers who refer). Plain server function,
// not a server action, so cached code (unstable_cache) can call it without
// touching cookies. Client-facing callers go through getReferralsAction.
// Pass merged: false to get the raw rows when the caller runs mergeRecruiterRows
// itself — its canonical() needs both the referal row and the login row to map
// recruits saved under the referal email onto the merged recruiter.
export async function listActiveReferrers({ merged = true }: { merged?: boolean } = {}) {
  try {
    const referrals = await prisma.referal.findMany({
      where: { status: "Active" },
      select: {
        email: true,
        name: true,
        code: true,
        howManyUse: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const labelersDb = await prisma.user.findMany({
      where: { labelerRefererEmail: { not: null } },
      select: { labelerRefererEmail: true },
      distinct: ['labelerRefererEmail'],
    });

    const labelerEmails = labelersDb.map(l => l.labelerRefererEmail).filter(Boolean) as string[];
    let labelerRecruiters: any[] = [];
    if (labelerEmails.length > 0) {
      const labelerUsers = await prisma.user.findMany({
        where: { email: { in: labelerEmails } },
        select: { email: true, name: true, firstName: true, lastName: true, gingerUsername: true, createdAt: true },
      });
      labelerRecruiters = labelerUsers.map(l => ({
        email: l.email,
        name: (l.firstName && l.lastName) ? l.firstName + ' ' + l.lastName : (l.name || l.gingerUsername || l.email),
        code: null,
        howManyUse: 0,
        createdAt: l.createdAt,
      }));
    }

    const uniqueRecruiters = new Map<string, any>();
    [...referrals, ...labelerRecruiters].forEach(r => {
      if (!uniqueRecruiters.has(r.email)) {
        uniqueRecruiters.set(r.email, r);
      }
    });

    const rawRows = Array.from(uniqueRecruiters.values());
    if (!merged) return { success: true, data: rawRows };
    const { rows: mergedRows } = await mergeRecruiterRows(rawRows);

    return { success: true, data: mergedRows };
  } catch (error) {
    console.error("Error fetching referrals via action:", error);
    return {
      success: false,
      error: toUserFacingError(error, "Couldn't load recruiters. Please refresh the page.")
    };
  }
}
