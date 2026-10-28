import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recruiterEmailsOf } from "@/lib/recruiterEmails";

// A recruiter's recruits can be stored under any of these (see recruiterEmailsOf).
export async function getRecruiterEmails(email: string): Promise<string[]> {
  const normalized = email.trim().toLowerCase();
  const me = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: normalized, mode: "insensitive" } },
        { linkedRecruiterEmail: { equals: normalized, mode: "insensitive" } },
        { gingerEmail: { equals: normalized, mode: "insensitive" } },
      ],
    },
    select: { email: true, gingerEmail: true, linkedRecruiterEmail: true },
  });
  return me ? recruiterEmailsOf(me) : [normalized];
}

// Expands a list of recruiter emails to include all their linked aliases (login, linked, and ginger emails)
export async function expandAllRecruiterEmails(emails: string[]): Promise<string[]> {
  if (emails.length === 0) return [];
  const normalized = emails.map((e) => e.trim().toLowerCase());
  const accounts = await prisma.user.findMany({
    where: {
      OR: [
        { email: { in: normalized, mode: "insensitive" } },
        { linkedRecruiterEmail: { in: normalized, mode: "insensitive" } },
        { gingerEmail: { in: normalized, mode: "insensitive" } },
      ],
    },
    select: { email: true, linkedRecruiterEmail: true, gingerEmail: true },
  });
  const all = new Set(normalized);
  accounts.forEach((a) => {
    recruiterEmailsOf(a).forEach((e) => all.add(e));
  });
  return Array.from(all);
}

// labelerRefererEmail is the real recruiter; refererEmail only counts when it's
// unset (older signups), since newer ones park iru there.
export function recruitsOfWhere(emails: string[]): Prisma.UserWhereInput {
  return {
    OR: [
      { labelerRefererEmail: { in: emails, mode: "insensitive" } },
      { labelerRefererEmail: null, refererEmail: { in: emails, mode: "insensitive" } },
    ],
  };
}
