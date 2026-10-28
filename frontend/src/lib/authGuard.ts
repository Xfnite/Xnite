import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { verifySessionToken } from "@/lib/jwt";
import { isStaff, canEarnInnerCouncil, INNER_COUNCIL_MIN_PASSERS } from "@/config/permissions";
import { getRecruiterEmails, recruitsOfWhere } from "@/lib/recruits";

export type AuthedUser = {
  email: string;
  role: string | null;
  linkedRecruiterEmail: string | null;
};

// Resolves the signed-in user from the xnite_session cookie. Server actions are
// public endpoints, so every action that reads or writes user data must call this
// (or getStaffUser) instead of trusting identities passed in from the client.
export async function getAuthedUser(): Promise<AuthedUser | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("xnite_session")?.value;
  const email = sessionToken ? await verifySessionToken(sessionToken) : null;
  if (!email) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { email: true, role: true, linkedRecruiterEmail: true },
  });
  return user;
}

// Same as getAuthedUser, but only for staff (admin, checker, judger, recruiter) —
// the roles that can open the /recruiter pages.
export async function getStaffUser(): Promise<AuthedUser | null> {
  const user = await getAuthedUser();
  if (!user || !isStaff(user.role ?? undefined)) return null;
  return user;
}

// Staff, or a labeler / old labeler with at least INNER_COUNCIL_MIN_PASSERS
// passers among their recruits — who can open Top Mentors. A passer is counted
// like the Top Mentors "passers" column: an Active recruit past "applicant".
export async function getInnerCouncilUser(): Promise<AuthedUser | null> {
  const user = await getAuthedUser();
  if (!user) return null;
  if (isStaff(user.role ?? undefined)) return user;
  if (!canEarnInnerCouncil(user.role ?? undefined)) return null;

  const count = await prisma.user.count({
    where: {
      AND: [
        recruitsOfWhere(await getRecruiterEmails(user.email)),
        { status: "Active" },
        { NOT: { role: { equals: "applicant", mode: "insensitive" } } },
      ],
    },
  });
  return count >= INNER_COUNCIL_MIN_PASSERS ? user : null;
}
