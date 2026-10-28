// Shared pieces of the "Activate Users" form: reading emails out of pasted lines, and
// deciding which users a staff member is allowed to activate. Kept free of database
// access so the rules can be checked on their own.

import { getNormalizedRole } from "@/config/permissions";
import { checkTrainingPassedFromList } from "@/lib/trainingStatus";
import { recruiterEmailsOf } from "@/lib/recruiterEmails";

export const ACTIVATION_MAX_BATCH = 200;

// A deactivated labeler / old labeler paid more than this in total (income history)
// who passed only Standard Building is not reactivated as-is: they get a new Ginger
// account and redo the training tasks.
export const GINGER_RESET_MIN_CUMULATIVE_SALARY = 50000;

export function needsNewGingerAccount(target: {
  role: string | null;
  status: string | null;
  cumulativeSalary: number;
  trainings: unknown[] | null;
}): boolean {
  // Only deactivated accounts (same test as the login blacklist), not e.g. "Activated".
  const status = (target.status || "").trim().toLowerCase();
  if (status !== "deactivated" && status !== "inactive") return false;
  const role = getNormalizedRole(target.role ?? undefined);
  if (role !== "labeler" && role !== "old-labeler") return false;
  if (target.cumulativeSalary <= GINGER_RESET_MIN_CUMULATIVE_SALARY) return false;
  // No synced training list means we can't tell what they passed — activate normally.
  if (!target.trainings || target.trainings.length === 0) return false;
  const t = target.trainings;
  return !checkTrainingPassedFromList(t, "landcover") &&
    !checkTrainingPassedFromList(t, "roof") &&
    !checkTrainingPassedFromList(t, "3d");
}

// Characters an email can be made of; anything else (brackets, quotes, bullets,
// "mailto:", slashes) is treated as a separator.
const EMAIL_PATTERN = "[a-z0-9._%+\\-]+@[a-z0-9\\-]+(?:\\.[a-z0-9\\-]+)+";

// Undoes what copy-pasting from chats and spreadsheets does to emails: invisible
// characters inside them, non-breaking spaces, and spaces around the "@".
function cleanPasted(text: string): string {
  return String(text || "")
    .replace(/[​-‍⁠﻿]/g, "")
    .replace(/ /g, " ")
    .replace(/\s*[@＠]\s*/g, "@");
}

// Splits whatever was pasted into one entry per email, whether the emails are one per
// line, comma/semicolon/tab separated, numbered, or mixed in with names
// ("Juan <juan@x.com>"). A word that has an "@" but isn't a readable email is kept as
// its own entry so the result can report it instead of silently dropping it.
export function splitPastedEmails(text: string): string[] {
  const entries: string[] = [];
  for (const chunk of cleanPasted(text).split(/[\s,;]+/)) {
    if (!chunk.includes("@")) continue;
    const found = chunk.match(new RegExp(EMAIL_PATTERN, "gi"));
    if (found) entries.push(...found);
    else entries.push(chunk);
  }
  return entries;
}

// Emails to look up for one pasted line, most likely first. The email is always tried
// exactly as written before anything is stripped, so an address that really starts
// with digits is never mistaken for a different account. A list number stuck to the
// email is then dropped: "12.name@x.com" tries "12.name@x.com", then "name@x.com";
// "36. 1.name@x.com" tries "1.name@x.com", then "name@x.com".
export function extractEmailCandidates(line: string): string[] {
  const match = cleanPasted(line).match(new RegExp(EMAIL_PATTERN, "i"));
  if (!match) return [];
  const email = match[0].toLowerCase().replace(/[.,;]+$/, "");
  const candidates = [email];
  let rest = email;
  while (/^\d+[.)\-:]/.test(rest)) {
    rest = rest.replace(/^\d+[.)\-:]/, "");
    if (rest.indexOf("@") > 0) candidates.push(rest);
  }
  return candidates;
}

export type ActivationStaff = {
  email: string;
  role: string | null;
  gingerEmail: string | null;
  gingerUsername: string | null;
  username: string | null;
  linkedRecruiterEmail: string | null;
};

export type ActivationGroup = {
  groupId: number;
  parentGroupId: number | null;
  checkerName: string | null;
  judgerName: string | null;
  managerEmail: string | null;
  ownerEmail: string | null;
};

export type ActivationTarget = {
  refererEmail: string | null;
  labelerRefererEmail: string | null;
  group_id: number | null;
  team_id: number | null;
};

const lower = (v: string | null | undefined) => (v || "").trim().toLowerCase();

// The groups and teams this staff member is responsible for: ones naming them as
// checker or judger, ones they manage or own, and the groups under a team they hold.
export function ownedGroupIds(staff: ActivationStaff, groups: ActivationGroup[]): Set<number> {
  const names = [staff.gingerUsername, staff.username].map(lower).filter(Boolean);
  const emails = [staff.email, staff.gingerEmail].map(lower).filter(Boolean);

  const ids = new Set<number>();
  for (const g of groups) {
    if (
      (g.checkerName && names.includes(lower(g.checkerName))) ||
      (g.judgerName && names.includes(lower(g.judgerName))) ||
      (g.managerEmail && emails.includes(lower(g.managerEmail))) ||
      (g.ownerEmail && emails.includes(lower(g.ownerEmail)))
    ) {
      ids.add(g.groupId);
    }
  }
  for (const g of groups) {
    if (g.parentGroupId != null && ids.has(g.parentGroupId)) ids.add(g.groupId);
  }
  return ids;
}

// Admins may activate anyone. Everyone else only users they recruited, or users in a
// group or team they are responsible for.
export function canActivate(staff: ActivationStaff, target: ActivationTarget, myGroupIds: Set<number>): boolean {
  if (lower(staff.role) === "admin") return true;

  const myEmails = recruiterEmailsOf(staff);
  if (myEmails.includes(lower(target.refererEmail)) || myEmails.includes(lower(target.labelerRefererEmail))) {
    return true;
  }

  const isRealId = (id: number | null) => typeof id === "number" && id !== 0 && id !== -1;
  return (isRealId(target.group_id) && myGroupIds.has(target.group_id as number)) ||
    (isRealId(target.team_id) && myGroupIds.has(target.team_id as number));
}

// The checker and judger usernames (lowercased) responsible for a user: the checker of
// their group, and the judger of their team — taken from the group's parent team first,
// the same way the recruiter pages resolve it.
export function groupStaffNames(target: ActivationTarget, groups: ActivationGroup[]): { checker: string | null; judger: string | null } {
  const byId = new Map(groups.map((g) => [g.groupId, g]));
  const isRealId = (id: number | null) => typeof id === "number" && id !== 0 && id !== -1;
  const group = isRealId(target.group_id) ? byId.get(target.group_id as number) : undefined;
  const team = isRealId(target.team_id) ? byId.get(target.team_id as number) : undefined;
  const parent = group?.parentGroupId != null ? byId.get(group.parentGroupId) : undefined;

  const checker = lower(group?.checkerName) || null;
  const judger = lower(parent?.judgerName) || lower(team?.judgerName) || lower(group?.judgerName) || null;
  return { checker, judger };
}
