"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { verifySessionToken } from "@/lib/jwt";
import { isStaff, getNormalizedRole } from "@/config/permissions";
import { generateUniqueCredentials } from "@/lib/generateUniqueCredentials";
import {
  ACTIVATION_MAX_BATCH, extractEmailCandidates, ownedGroupIds, canActivate, groupStaffNames, needsNewGingerAccount,
  type ActivationGroup, type ActivationTarget,
} from "@/lib/userActivation";

export type ActivationOutcome = "activated" | "new_ginger_account" | "already_active" | "not_found" | "not_allowed" | "duplicate" | "invalid";

export type ActivationResult = {
  input: string;
  email: string | null;
  outcome: ActivationOutcome;
  message: string;
};

// Activates deactivated users from a pasted list of emails. Staff only (recruiter,
// checker, judger, admin). Non-admins can only activate their own recruits or members
// of a group/team they are responsible for; for anyone else the result names who can
// activate that account. Every activation is written to UserActivationLog together
// with who did it.
//
// A labeler / old labeler paid over GINGER_RESET_MIN_CUMULATIVE_SALARY who passed only
// Standard Building is not reactivated as-is: they get new Ginger credentials and go
// back to applicant, so they redo the training tasks. Their Ginger account is created
// on their next login (registerWithGingerAction); wallet, income history and the old
// Ginger credentials (previousGingerAccounts) are kept.
export async function activateUsersAction(lines: string[]): Promise<
  { success: true; results: ActivationResult[]; activated: number } | { success: false; error: string }
> {
  let isAdmin = false; // known once the session is checked; decides how much the error says
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("xnite_session")?.value;
    const sessionEmail = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!sessionEmail) return { success: false, error: "Not authorized" };

    const staff = await prisma.user.findUnique({
      where: { email: sessionEmail },
      select: { email: true, role: true, status: true, gingerEmail: true, gingerUsername: true, username: true, linkedRecruiterEmail: true },
    });
    if (!staff || staff.status !== "Active" || !isStaff(staff.role ?? undefined)) {
      return { success: false, error: "Not authorized" };
    }

    if (!Array.isArray(lines)) return { success: false, error: "Invalid input" };
    const inputs = lines.map((l) => String(l ?? "").slice(0, 320)).filter((l) => l.trim() !== "");
    if (inputs.length === 0) return { success: false, error: "Paste at least one email." };
    if (inputs.length > ACTIVATION_MAX_BATCH) {
      return { success: false, error: `Up to ${ACTIVATION_MAX_BATCH} emails at a time. You pasted ${inputs.length}.` };
    }

    const candidatesByLine = inputs.map(extractEmailCandidates);
    const allCandidates = Array.from(new Set(candidatesByLine.flat()));

    isAdmin = staff.role?.toLowerCase() === "admin";
    const [users, groups] = await Promise.all([
      allCandidates.length > 0
        ? prisma.user.findMany({
            where: {
              OR: [
                { email: { in: allCandidates, mode: "insensitive" } },
                { gingerEmail: { in: allCandidates, mode: "insensitive" } },
              ],
            },
            select: {
              id: true, email: true, gingerEmail: true, status: true, role: true,
              gingerUsername: true, gingerPassword: true, previousGingerAccounts: true,
              name: true, firstName: true, lastName: true, referer: { select: { sitename: true } },
              refererEmail: true, labelerRefererEmail: true, group_id: true, team_id: true,
            },
          })
        : Promise.resolve([]),
      isAdmin
        ? Promise.resolve([] as ActivationGroup[])
        : prisma.group.findMany({
            select: { groupId: true, parentGroupId: true, checkerName: true, judgerName: true, managerEmail: true, ownerEmail: true },
          }),
    ]);

    // Primary email wins over Ginger email when both could match.
    const byEmail = new Map<string, (typeof users)[number]>();
    users.forEach((u) => { if (u.gingerEmail) byEmail.set(u.gingerEmail.trim().toLowerCase(), u); });
    users.forEach((u) => byEmail.set(u.email.trim().toLowerCase(), u));

    const myGroupIds = ownedGroupIds(staff, groups);

    const seen = new Set<string>();
    const toActivate: (typeof users)[number][] = [];
    const notAllowed = new Map<number, (typeof users)[number]>(); // result index -> user
    const results: ActivationResult[] = inputs.map((input, i) => {
      const candidates = candidatesByLine[i];
      if (candidates.length === 0) {
        return { input, email: null, outcome: "invalid", message: "Not a readable email" };
      }
      const user = candidates.map((c) => byEmail.get(c)).find((u) => !!u);
      if (!user) {
        return { input, email: candidates[0], outcome: "not_found", message: "No account with this email" };
      }
      if (!canActivate(staff, user, myGroupIds)) {
        notAllowed.set(i, user);
        return { input, email: user.email, outcome: "not_allowed", message: "Only Admins can activate this account" };
      }
      if (seen.has(user.id)) {
        return { input, email: user.email, outcome: "duplicate", message: "Already listed above" };
      }
      seen.add(user.id);
      if (user.status === "Active") {
        return { input, email: user.email, outcome: "already_active", message: "Already active" };
      }
      toActivate.push(user);
      return { input, email: user.email, outcome: "activated", message: "Activated" };
    });

    // Tell the staff member who can activate the accounts they were refused.
    if (notAllowed.size > 0) {
      const messages = await describeActivators(Array.from(notAllowed.values()), groups);
      notAllowed.forEach((user, index) => {
        results[index].message = messages.get(user.id) || results[index].message;
      });
    }

    // Split off the ones who need a new Ginger account instead of a plain reactivation.
    const resetIds = await findGingerResetIds(toActivate);
    const toReset = toActivate.filter((u) => resetIds.has(u.id));
    const toReactivate = toActivate.filter((u) => !resetIds.has(u.id));

    const resets: { user: (typeof users)[number]; creds: { gingerUsername: string; gingerEmail: string; password: string } }[] = [];
    for (const u of toReset) {
      const nameParts = (u.name || u.email.split("@")[0]).split(" ");
      const firstName = u.firstName || nameParts[0] || "User";
      const lastName = u.lastName || nameParts.slice(1).join(" ") || "User";
      resets.push({ user: u, creds: await generateUniqueCredentials(u.referer?.sitename || "XFd_", firstName, lastName, u.email) });
    }

    if (toActivate.length > 0) {
      // One transaction: a user is never activated without the record of who did it.
      await prisma.$transaction([
        prisma.user.updateMany({
          where: { id: { in: toReactivate.map((u) => u.id) } },
          data: { status: "Active" },
        }),
        ...resets.flatMap(({ user: u, creds }) => [
          prisma.user.update({
            where: { id: u.id },
            data: {
              status: "Active",
              role: "applicant",
              // The old Ginger account is kept, never deleted (also still in SoftwareCredential).
              previousGingerAccounts: [
                ...(Array.isArray(u.previousGingerAccounts) ? u.previousGingerAccounts : []),
                {
                  gingerEmail: u.gingerEmail,
                  gingerUsername: u.gingerUsername,
                  gingerPassword: u.gingerPassword,
                  replacedAt: new Date().toISOString(),
                },
              ],
              gingerEmail: creds.gingerEmail,
              gingerUsername: creds.gingerUsername,
              gingerPassword: creds.password,
              isRegistered: false, // the next login creates the Ginger account
              hasClickedLandCoverTraining: false,
              hasClickedTransportationTraining: false,
            },
          }),
          prisma.softwareCredential.upsert({
            where: { softwareUid: creds.gingerEmail },
            update: { role: "applicant", password: creds.password },
            create: { role: "applicant", softwareUid: creds.gingerEmail, password: creds.password },
          }),
          // Old account's trainings; the new account's list is synced once they log in.
          prisma.training.deleteMany({ where: { userId: u.id } }),
        ]),
        prisma.userActivationLog.createMany({
          data: toActivate.map((u) => ({
            id: crypto.randomUUID(),
            userId: u.id,
            userEmail: u.email,
            previousStatus: resetIds.has(u.id) ? `${u.status} (new Ginger account)` : u.status,
            activatedByEmail: staff.email,
            activatedByRole: staff.role || "",
          })),
        }),
      ]);

      results.forEach((r) => {
        const reset = resets.find(({ user }) => user.email === r.email);
        if (r.outcome !== "activated" || !reset) return;
        r.outcome = "new_ginger_account";
        r.message = `New Ginger account (${reset.creds.gingerEmail}): must redo the training tasks`;
      });
    }

    return { success: true, results, activated: toActivate.length };
  } catch (err) {
    console.error("activateUsersAction error:", err);
    // Activation and its record are saved together, so a failure here means no account
    // was changed. Admins also get the technical reason; other roles don't.
    const reason = isAdmin && err instanceof Error ? ` Reason: ${err.message.replace(/\s+/g, " ").slice(0, 200)}` : "";
    return {
      success: false,
      error: `Nothing was activated: the server hit an error while saving. Please try again, and report it if it keeps happening.${reason}`,
    };
  }
}

// IDs of the users to activate who need a new Ginger account (needsNewGingerAccount).
// Not exported: every export of a "use server" file is a public endpoint.
async function findGingerResetIds(
  targets: { id: string; email: string; role: string | null; status: string | null }[]
): Promise<Set<string>> {
  const candidates = targets.filter((t) => {
    const role = getNormalizedRole(t.role ?? undefined);
    return role === "labeler" || role === "old-labeler";
  });
  if (candidates.length === 0) return new Set();

  const [salaries, trainings] = await Promise.all([
    prisma.incomeHistory.groupBy({
      by: ["email"],
      where: { email: { in: candidates.map((c) => c.email) } },
      _sum: { amountPaid: true },
    }),
    prisma.training.findMany({
      where: { userId: { in: candidates.map((c) => c.id) } },
      select: { userId: true, trainings: true },
    }),
  ]);
  const salaryByEmail = new Map(salaries.map((s) => [s.email, s._sum.amountPaid || 0]));
  const trainingsById = new Map(trainings.map((t) => [t.userId, t.trainings]));

  return new Set(
    candidates
      .filter((c) => needsNewGingerAccount({
        role: c.role,
        status: c.status,
        cumulativeSalary: salaryByEmail.get(c.email) || 0,
        trainings: trainingsById.get(c.id) || null,
      }))
      .map((c) => c.id)
  );
}

// Builds, per refused user, "Only Admins, <judger> (Judger), <checker> (Checker),
// <recruiter> (Recruiter) can activate this account". Not exported: every export of a
// "use server" file is a public endpoint.
async function describeActivators(
  targets: (ActivationTarget & { id: string })[],
  groups: ActivationGroup[]
): Promise<Map<string, string>> {
  const perUser = targets.map((t) => ({
    id: t.id,
    ...groupStaffNames(t, groups),
    recruiterEmail: (t.labelerRefererEmail || t.refererEmail || "").trim().toLowerCase() || null,
  }));

  const usernames = Array.from(new Set(perUser.flatMap((u) => [u.checker, u.judger]).filter((v): v is string => !!v)));
  const emails = Array.from(new Set(perUser.map((u) => u.recruiterEmail).filter((v): v is string => !!v)));

  const [staffByUsername, recruiterUsers, recruiterReferals] = await Promise.all([
    usernames.length > 0
      ? prisma.user.findMany({
          where: {
            OR: [
              { gingerUsername: { in: usernames, mode: "insensitive" } },
              { username: { in: usernames, mode: "insensitive" } },
            ],
          },
          select: { name: true, firstName: true, lastName: true, gingerUsername: true, username: true },
        })
      : Promise.resolve([]),
    emails.length > 0
      ? prisma.user.findMany({
          where: { email: { in: emails, mode: "insensitive" } },
          select: { email: true, name: true, firstName: true, lastName: true },
        })
      : Promise.resolve([]),
    emails.length > 0
      ? prisma.referal.findMany({
          where: { email: { in: emails, mode: "insensitive" } },
          select: { email: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const display = (u: { name: string | null; firstName: string | null; lastName: string | null }) =>
    (u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.name || "").trim();

  const nameByUsername = new Map<string, string>();
  staffByUsername.forEach((u) => {
    const shown = display(u);
    if (!shown) return;
    if (u.gingerUsername) nameByUsername.set(u.gingerUsername.trim().toLowerCase(), shown);
    if (u.username) nameByUsername.set(u.username.trim().toLowerCase(), shown);
  });
  const nameByEmail = new Map<string, string>();
  recruiterReferals.forEach((r) => { if (r.name) nameByEmail.set(r.email.trim().toLowerCase(), r.name.trim()); });
  recruiterUsers.forEach((u) => {
    const shown = display(u);
    if (shown && !shown.includes("@")) nameByEmail.set(u.email.trim().toLowerCase(), shown);
  });

  const messages = new Map<string, string>();
  for (const u of perUser) {
    const who = ["Admins"];
    if (u.judger) who.push(`${nameByUsername.get(u.judger) || u.judger} (Judger)`);
    if (u.checker) who.push(`${nameByUsername.get(u.checker) || u.checker} (Checker)`);
    if (u.recruiterEmail) who.push(`${nameByEmail.get(u.recruiterEmail) || u.recruiterEmail.split("@")[0]} (Recruiter)`);
    messages.set(u.id, `Only ${who.join(", ")} can activate this account`);
  }
  return messages;
}
