"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { verifySessionToken } from "@/lib/jwt";
import { referralSlugBase, referralSlugCandidates } from "@/lib/referralSlug";

// Returns the signed-in user's short referral code (e.g. "cedrickr"), creating it the first
// time. Kept separate from getSessionUser so a failure here only affects the referral link.
export async function getReferralSlugAction(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("xnite_session")?.value;
    const email = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!email) return null;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, firstName: true, lastName: true, name: true, referralSlug: true },
    });
    if (!user) return null;
    if (user.referralSlug) return user.referralSlug;

    const base = referralSlugBase(user.firstName, user.lastName, user.name);
    for (let attempt = 0; attempt < 3; attempt++) {
      const slug = await findFreeSlug(base, user.id);
      try {
        // referralSlug: null so a slug set meanwhile (e.g. another tab) isn't replaced
        await prisma.user.updateMany({ where: { id: user.id, referralSlug: null }, data: { referralSlug: slug } });
      } catch (err) {
        if ((err as { code?: string })?.code === "P2002") continue; // someone else took this slug just now; pick again
        throw err;
      }
      const saved = await prisma.user.findUnique({ where: { id: user.id }, select: { referralSlug: true } });
      return saved?.referralSlug ?? null;
    }
    return null;
  } catch (err) {
    console.error("getReferralSlugAction failed:", err);
    return null;
  }
}

// First free slug from base, base2, base3, ... Another user's username also counts as taken,
// because /r/[code] checks slugs first and would otherwise send their old /r/<username> links here.
async function findFreeSlug(base: string, userId: string): Promise<string> {
  for (let from = 1; ; from += 25) {
    const candidates = referralSlugCandidates(base, from, 25);
    const taken = await prisma.user.findMany({
      where: {
        id: { not: userId },
        OR: [{ referralSlug: { in: candidates } }, { username: { in: candidates, mode: "insensitive" } }],
      },
      select: { referralSlug: true, username: true },
    });
    const takenSet = new Set(taken.flatMap((u) => [u.referralSlug, u.username?.toLowerCase()]));
    const free = candidates.find((c) => !takenSet.has(c));
    if (free) return free;
  }
}
