import { prisma } from "@/lib/db";

export const IRU_FALLBACK_EMAIL = "iru.xfnite@gmail.com";

export type ReferralSourceType =
  | "referral_link"
  | "direct_referral"
  | "linked_recruiter"
  | "fallback_iru"
  | "organic";

export interface RecruiterResolution {
  email: string | null;
  source: ReferralSourceType;
  sourceLabel: string;
}

export interface ResolvedReferralBonusItem {
  id: string;
  amount: number;
  cutoff: string;
  status: string;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
  gingerUsername?: string | null;
  // Recruit Info (xfnite username, name, email)
  recruit: {
    id?: string;
    username?: string | null;
    name: string;
    email: string;
  } | null;
  // Recruiter Info
  recruiter: {
    id?: string;
    name: string;
    email: string;
    username?: string | null;
  } | null;
  source: ReferralSourceType;
  sourceLabel: string;
}

/**
 * Determine recruiter email and source from a recruit's database record.
 * Priority rule:
 * 1. Referral Link (labelerRefererEmail) - Top priority
 * 2. Direct Referrer (refererEmail), if not iru.xfnite
 * 3. Linked Recruiter (linkedRecruiterEmail), if not iru.xfnite
 * 4. Fallback (iru.xfnite@gmail.com)
 * 5. Organic / Unknown
 */
export function resolveRecruiterEmail(user: {
  labelerRefererEmail?: string | null;
  refererEmail?: string | null;
  linkedRecruiterEmail?: string | null;
}): RecruiterResolution {
  const linkRef = user.labelerRefererEmail?.trim().toLowerCase();
  const directRef = user.refererEmail?.trim().toLowerCase();
  const linkedRef = user.linkedRecruiterEmail?.trim().toLowerCase();

  // 1. Prioritize referral using links
  if (linkRef) {
    return {
      email: linkRef,
      source: "referral_link",
      sourceLabel: "Referral Link",
    };
  }

  // 2. Direct referral from earlier signups (if not iru fallback)
  if (directRef && directRef !== IRU_FALLBACK_EMAIL) {
    return {
      email: directRef,
      source: "direct_referral",
      sourceLabel: "Direct Referral",
    };
  }

  // 3. Linked recruiter (if not iru fallback)
  if (linkedRef && linkedRef !== IRU_FALLBACK_EMAIL) {
    return {
      email: linkedRef,
      source: "linked_recruiter",
      sourceLabel: "Linked Recruiter",
    };
  }

  // 4. Fallback to iru.xfnite
  if (directRef === IRU_FALLBACK_EMAIL || linkedRef === IRU_FALLBACK_EMAIL) {
    return {
      email: IRU_FALLBACK_EMAIL,
      source: "fallback_iru",
      sourceLabel: "Fallback (iru.xfnite)",
    };
  }

  // 5. Organic / unknown
  return {
    email: null,
    source: "organic",
    sourceLabel: "Organic / Unassigned",
  };
}

/**
 * Given a list of ReferralBonus records from the database, batch resolves
 * the recruits and recruiters to produce enriched items.
 */
export async function enrichReferralBonuses(
  rawBonuses: Array<{
    id: string;
    userId?: string | null;
    gingerUsername?: string | null;
    user_name?: string | null;
    amount?: number | null;
    share?: number | null;
    cutoff?: string | null;
    status?: string | null;
    recruiterEmail?: string | null;
    recruitEmail?: string | null;
    source?: string | null;
    note?: string | null;
    createdAt: Date;
    updatedAt: Date;
    user?: {
      id: string;
      name: string;
      email: string;
      username?: string | null;
      gingerUsername?: string | null;
      labelerRefererEmail?: string | null;
      refererEmail?: string | null;
      linkedRecruiterEmail?: string | null;
    } | null;
  }>
): Promise<ResolvedReferralBonusItem[]> {
  if (rawBonuses.length === 0) return [];

  // 1. Find any recruits that aren't already joined via user relation
  const missingUsernames: string[] = [];
  rawBonuses.forEach((b) => {
    if (!b.user) {
      const g = (b.gingerUsername || b.user_name || "").trim().toLowerCase();
      if (g) missingUsernames.push(g);
    }
  });

  const uniqueMissing = Array.from(new Set(missingUsernames));
  const fallbackRecruits = uniqueMissing.length > 0
    ? await prisma.user.findMany({
        where: {
          OR: [
            { gingerUsername: { in: uniqueMissing, mode: "insensitive" } },
            { gingerEmail: { in: uniqueMissing, mode: "insensitive" } },
            { email: { in: uniqueMissing, mode: "insensitive" } },
            { username: { in: uniqueMissing, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          gingerUsername: true,
          labelerRefererEmail: true,
          refererEmail: true,
          linkedRecruiterEmail: true,
        },
      })
    : [];

  const recruitMap = new Map<string, typeof fallbackRecruits[0]>();
  fallbackRecruits.forEach((u) => {
    if (u.gingerUsername) recruitMap.set(u.gingerUsername.trim().toLowerCase(), u);
    if (u.username) recruitMap.set(u.username.trim().toLowerCase(), u);
    if (u.email) recruitMap.set(u.email.trim().toLowerCase(), u);
  });

  // 2. Resolve recruiter emails
  const resolutionMap = new Map<string, RecruiterResolution>();
  const recruiterEmailsToFetch = new Set<string>();

  rawBonuses.forEach((b) => {
    const recruit = b.user || recruitMap.get((b.gingerUsername || b.user_name || "").trim().toLowerCase());

    let res: RecruiterResolution;
    if (recruit) {
      res = resolveRecruiterEmail(recruit);
    } else if (b.recruiterEmail) {
      res = {
        email: b.recruiterEmail.trim().toLowerCase(),
        source: (b.source as ReferralSourceType) || "referral_link",
        sourceLabel: b.source === "fallback_iru" ? "Fallback (iru.xfnite)" : "Referral Link",
      };
    } else {
      res = {
        email: null,
        source: "organic",
        sourceLabel: "Organic / Unassigned",
      };
    }

    resolutionMap.set(b.id, res);
    if (res.email && res.email !== IRU_FALLBACK_EMAIL) {
      recruiterEmailsToFetch.add(res.email);
    }
  });

  // 3. Batch find recruiter accounts
  const recruiterEmailsList = Array.from(recruiterEmailsToFetch);
  const recruiterUsers = recruiterEmailsList.length > 0
    ? await prisma.user.findMany({
        where: {
          OR: [
            { email: { in: recruiterEmailsList, mode: "insensitive" } },
            { linkedRecruiterEmail: { in: recruiterEmailsList, mode: "insensitive" } },
            { gingerEmail: { in: recruiterEmailsList, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          linkedRecruiterEmail: true,
          gingerEmail: true,
        },
      })
    : [];

  const recruiterMap = new Map<string, typeof recruiterUsers[0]>();
  recruiterUsers.forEach((r) => {
    if (r.email) recruiterMap.set(r.email.trim().toLowerCase(), r);
    if (r.linkedRecruiterEmail) recruiterMap.set(r.linkedRecruiterEmail.trim().toLowerCase(), r);
    if (r.gingerEmail) recruiterMap.set(r.gingerEmail.trim().toLowerCase(), r);
  });

  const iruRecruiterProfile = {
    id: "system-iru",
    name: "Iru (Fallback System)",
    email: IRU_FALLBACK_EMAIL,
    username: "iru.xfnite",
  };

  // 4. Build enriched items (exposing only Xfnite username, name, email)
  return rawBonuses.map((b) => {
    const recruit = b.user || recruitMap.get((b.gingerUsername || b.user_name || "").trim().toLowerCase());
    const res = resolutionMap.get(b.id) || {
      email: null,
      source: "organic" as ReferralSourceType,
      sourceLabel: "Organic / Unassigned",
    };

    let recruiterInfo: ResolvedReferralBonusItem["recruiter"] = null;
    if (res.email === IRU_FALLBACK_EMAIL) {
      recruiterInfo = iruRecruiterProfile;
    } else if (res.email) {
      const found = recruiterMap.get(res.email);
      if (found) {
        recruiterInfo = {
          id: found.id,
          name: found.name,
          email: found.email,
          username: found.username,
        };
      } else {
        recruiterInfo = {
          name: res.email.split("@")[0],
          email: res.email,
          username: res.email.split("@")[0],
        };
      }
    }

    const finalAmount = typeof b.amount === "number" && b.amount > 0 ? b.amount : (b.share || 0);

    return {
      id: b.id,
      amount: finalAmount,
      cutoff: b.cutoff || "Current Cutoff",
      status: b.status || "Active",
      note: b.note,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
      gingerUsername: b.gingerUsername || b.user_name || null,
      recruit: recruit
        ? {
            id: recruit.id,
            username: recruit.username || recruit.name?.split(" ")[0]?.toLowerCase() || null,
            name: recruit.name,
            email: recruit.email,
          }
        : null,
      recruiter: recruiterInfo,
      source: res.source,
      sourceLabel: res.sourceLabel,
    };
  });
}
