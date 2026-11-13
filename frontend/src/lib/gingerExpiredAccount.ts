/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { generateUniqueCredentials } from "@/lib/generateUniqueCredentials";
import { splitFullName } from "@/lib/nameUtils";
import { findReferalFor } from "@/lib/referrers";
import { redis, isRedisReady } from "@/lib/redis";
import { performGingerSignup } from "@/app/actions/auth";

const GINGER_BASE = process.env.NEXT_PUBLIC_GINGER_API_URL || "https://ginger.bitmappro.com";
const GINGER_LOGIN_ENDPOINT = `${GINGER_BASE}/bac/login`;
const GINGER_USER_DETAIL_ENDPOINT = `${GINGER_BASE}/bac/eam/sale/user/detail`;

export const EXEMPT_EXPIRED_EMAILS = new Set([
  "iru.xfnite@gmail.com",
]);

export function isExemptFromGingerExpiration(email?: string | null, role?: string | null): boolean {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  if (EXEMPT_EXPIRED_EMAILS.has(cleanEmail)) return true;
  const cleanRole = (role || "").trim().toLowerCase();
  if (cleanRole === "admin" || cleanRole === "inner council" || cleanRole === "superadmin" || cleanRole === "checker" || cleanRole === "judger") {
    return true;
  }
  return false;
}

/**
 * Checks if a Ginger API response indicates that the user's Ginger account is expired.
 */
export function isGingerExpiredResponse(data: any): boolean {
  if (!data) return false;
  const target = data?.data?.koala_user_details || data?.koala_user_details || data?.data || data;
  if (target?.expired === 1 || target?.expired === "1" || target?.expired === true) {
    return true;
  }
  const errStr = String(data?.error || data?.msg || data?.message || "").toLowerCase();
  if (errStr.includes("expired") || errStr.includes("user expired")) {
    return true;
  }
  return false;
}

/**
 * Checks Ginger login & user detail endpoint to determine if an account is expired on Ginger.
 */
export async function checkGingerAccountExpired(
  gingerEmail: string,
  gingerPassword: string,
  existingAccessToken?: string | null,
  userEmail?: string | null,
  userRole?: string | null
): Promise<{ isExpired: boolean; accessToken?: string | null; gingerData?: any }> {
  if (isExemptFromGingerExpiration(userEmail || gingerEmail, userRole)) {
    return { isExpired: false, accessToken: existingAccessToken, gingerData: null };
  }

  let token = existingAccessToken || null;
  let gingerData: any = {};

  if (!token) {
    try {
      const loginRes = await fetch(GINGER_LOGIN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: gingerEmail, password: gingerPassword }),
      });
      gingerData = await loginRes.json().catch(() => ({}));
      if (isGingerExpiredResponse(gingerData)) {
        return { isExpired: true, gingerData };
      }
      if (loginRes.ok && gingerData?.credential?.access_token) {
        token = gingerData.credential.access_token;
      }
    } catch (err) {
      console.warn("Ginger login fetch error during expired check:", err);
      return { isExpired: false, gingerData };
    }
  }

  if (token) {
    try {
      const detailRes = await fetch(GINGER_USER_DETAIL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const detailData = await detailRes.json().catch(() => ({}));
      if (isGingerExpiredResponse(detailData)) {
        return { isExpired: true, accessToken: token, gingerData: detailData };
      }
    } catch (err) {
      console.warn("Ginger detail fetch error during expired check:", err);
    }
  }

  return { isExpired: false, accessToken: token, gingerData };
}

/**
 * Resets a user whose Ginger account got expired:
 * 1. Archives old Ginger account into previousGingerAccounts.
 * 2. Generates new unique Ginger credentials and registers them on Ginger.
 * 3. Sets role to 'applicant' and deletes old trainings so they do trainings again.
 * 4. Sets isDashboardCompleted: true, hasCompletedPreCourse: true (NO onboarding).
 * 5. Pre-fills all tutorial walkthrough flags as completed so tutorials NEVER show.
 */
export async function resetExpiredGingerUser(user: {
  id: string;
  email: string;
  name?: string | null;
  role?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  password?: string | null;
  refererEmail?: string | null;
  labelerRefererEmail?: string | null;
  gingerEmail?: string | null;
  gingerUsername?: string | null;
  gingerPassword?: string | null;
  labelerId?: string | null;
  labelerPassword?: string | null;
  previousGingerAccounts?: any;
}) {
  // Always query fresh user from DB to guarantee we capture all existing credentials
  const dbUser = await prisma.user.findUnique({
    where: { email: user.email },
  });

  if (isExemptFromGingerExpiration(user.email, user.role || dbUser?.role)) {
    console.log(`[resetExpiredGingerUser] User ${user.email} is exempt from expired resets.`);
    return {
      success: false,
      signupSucceeded: false,
      newGingerToken: null,
      newGingerData: {},
      finalGingerEmail: dbUser?.gingerEmail || user.gingerEmail || null,
      finalGingerUsername: dbUser?.gingerUsername || user.gingerUsername || null,
    };
  }

  // Preserve their role (e.g. labeler, old-labeler) so users are not demoted to applicant
  const userCurrentRole = (dbUser?.role || user.role || "labeler").trim();
  const targetRole = userCurrentRole === "applicant" ? "applicant" : userCurrentRole;

  const existingPrevious = Array.isArray(dbUser?.previousGingerAccounts)
    ? (dbUser?.previousGingerAccounts as any[])
    : Array.isArray(user.previousGingerAccounts)
    ? (user.previousGingerAccounts as any[])
    : [];

  const oldGingerEmail = dbUser?.gingerEmail || user.gingerEmail || null;
  const oldGingerUsername = dbUser?.gingerUsername || user.gingerUsername || null;
  const oldGingerPassword = dbUser?.gingerPassword || user.gingerPassword || dbUser?.password || user.password || null;
  const oldLabelerId = dbUser?.labelerId || (user as any).labelerId || null;
  const oldLabelerPassword = dbUser?.labelerPassword || (user as any).labelerPassword || null;

  const previousGingerAccounts = [
    ...existingPrevious,
    {
      gingerEmail: oldGingerEmail,
      gingerUsername: oldGingerUsername,
      gingerPassword: oldGingerPassword,
      labelerId: oldLabelerId,
      labelerPassword: oldLabelerPassword,
      replacedAt: new Date().toISOString(),
      reason: "expired",
    },
  ];

  const split = splitFullName(user.name || user.email.split("@")[0]);
  const firstName = user.firstName || split.firstName || "User";
  const lastName = user.lastName || split.lastName || "User";

  const IRU_REFERER_EMAIL = "iru.xfnite@gmail.com";
  const IRU_IMITATION_CODE = "MJRS0F";

  let sitename = "XFd_";
  let preferredReferer = "";
  let preferredCode = IRU_IMITATION_CODE;

  // 1. Look up if their used referer was directly a valid referrer in the Referal table
  if (user.refererEmail) {
    const directReferal = await prisma.referal.findFirst({
      where: { email: { equals: user.refererEmail.trim(), mode: "insensitive" } },
      select: { email: true, code: true, sitename: true },
    });
    if (directReferal) {
      preferredReferer = directReferal.email;
      preferredCode = directReferal.code || IRU_IMITATION_CODE;
      if (directReferal.sitename) sitename = directReferal.sitename;
    }
  }

  // 2. If not matched yet, check candidate via findReferalFor or recruiter gingerEmail
  if (!preferredReferer) {
    const candidate = (user.labelerRefererEmail || user.refererEmail || "").trim();
    if (candidate) {
      const referal = await findReferalFor(candidate);
      if (referal) {
        preferredReferer = referal.email;
        preferredCode = referal.code || IRU_IMITATION_CODE;
        if (referal.sitename) sitename = referal.sitename;
      } else {
        // Check if candidate matches a recruiter with a gingerEmail
        const refererAccount = await prisma.user.findFirst({
          where: {
            OR: [
              { email: { equals: candidate, mode: "insensitive" } },
              { gingerEmail: { equals: candidate, mode: "insensitive" } },
            ],
          },
          select: { gingerEmail: true },
        });
        const refererGingerEmail = refererAccount?.gingerEmail?.trim().toLowerCase();
        if (refererGingerEmail) {
          preferredReferer = refererGingerEmail;
        }
      }
    }
  }

  let usingIruReferer = !preferredReferer || preferredReferer === IRU_REFERER_EMAIL;
  if (usingIruReferer) {
    preferredReferer = IRU_REFERER_EMAIL;
    preferredCode = IRU_IMITATION_CODE;
  }

  const creds = await generateUniqueCredentials(sitename, firstName, lastName, user.email);

  const payload = {
    contact: user.phone || " ",
    email: creds.gingerEmail,
    graduate_date: " ",
    imitation_code: usingIruReferer ? IRU_IMITATION_CODE : preferredCode,
    occupied: " ",
    password: creds.password,
    password_conf: creds.password,
    payee_name: "",
    payee_uid: "",
    referal_email: usingIruReferer ? IRU_REFERER_EMAIL : preferredReferer,
    username: creds.gingerUsername,
  };

  let finalGingerUsername = creds.gingerUsername;
  let finalGingerEmail = creds.gingerEmail;
  let finalPassword = creds.password;
  let signupSucceeded = false;

  for (let attempt = 1; attempt <= 6; attempt++) {
    const signupRes = await performGingerSignup(payload);
    if (signupRes.success) {
      signupSucceeded = true;
      break;
    }
    if (!usingIruReferer && attempt === 1) {
      usingIruReferer = true;
      payload.referal_email = IRU_REFERER_EMAIL;
      payload.imitation_code = IRU_IMITATION_CODE;
      continue;
    }
    const regenerated = await generateUniqueCredentials(sitename, firstName, lastName, user.email);
    finalGingerUsername = regenerated.gingerUsername;
    finalGingerEmail = regenerated.gingerEmail;
    finalPassword = regenerated.password;
    payload.email = finalGingerEmail;
    payload.username = finalGingerUsername;
    payload.password = finalPassword;
    payload.password_conf = finalPassword;
  }

  // Pre-fill tutorial progress so all tutorials are completed and never show
  const completedTutorialProgress = {
    project_walkthrough_completed: true,
    project_walkthrough_step: -1,
    active_projects_start_walkthrough_completed: true,
    account_walkthrough_completed: true,
    tut_lc_opened: true,
    tut_lc_closed: true,
    tut_roof_opened: true,
    tut_roof_closed: true,
    tut_ts_opened: true,
    tut_ts_closed: true,
  };

  // Pre-fill onboarding progress so onboarding is marked complete
  const completedOnboardingProgress = {
    stage1Complete: true,
    stage2Complete: true,
    onboardingComplete: true,
    modulesComplete: {
      download: true,
      install: true,
      "videos-basic": true,
      "videos-3d": true,
      "answer-key": true,
      "answer-key-lib": true,
    },
    checklistItems: {
      "install::7zip": true,
      "install::extract-vc": true,
      "install::run-bat": true,
      "install::extract-ginger": true,
    },
    answerKeyCompleted: true,
  };

  await prisma.$transaction([
    prisma.user.update({
      where: { email: user.email },
      data: {
        status: "Active",
        role: targetRole,
        gingerEmail: finalGingerEmail,
        gingerUsername: finalGingerUsername,
        gingerPassword: finalPassword,
        previousGingerAccounts,
        isRegistered: signupSucceeded,
        isDashboardCompleted: true,
        hasCompletedPreCourse: true,
        onboardingProgress: completedOnboardingProgress,
        hasClickedLandCoverTraining: false,
        hasClickedTransportationTraining: false,
        landCoverProgress: Prisma.DbNull,
        transportationProgress: Prisma.DbNull,
        activeProjectsTutorialProgress: completedTutorialProgress,
        lastLogin: new Date(),
      },
    }),
    prisma.training.deleteMany({ where: { userId: user.id } }),
    prisma.softwareCredential.upsert({
      where: { softwareUid: finalGingerEmail },
      update: { role: targetRole, password: finalPassword },
      create: { role: targetRole, softwareUid: finalGingerEmail, password: finalPassword },
    }),
    prisma.directMessage.create({
      data: {
        toEmail: user.email,
        fromName: "XFNITE System",
        subject: "Account Expired",
        message: "Your account has expired. Please do the trainings again. Thank you!",
        isRead: false,
      },
    }),
  ]);

  if (isRedisReady()) {
    try {
      await redis.set(`walkthrough_completed:${user.email}`, "true");
    } catch (e) {
      console.warn("Failed to set redis walkthrough_completed for expired reset:", e);
    }
  }

  // Send automated alert to Checker, Judger/Manager, or Recruiter
  try {
    const displayName =
      dbUser?.name?.trim() ||
      [dbUser?.firstName, dbUser?.lastName].filter(Boolean).join(" ").trim() ||
      user.name?.trim() ||
      user.email.split("@")[0];

    const effectiveGroupId = dbUser?.group_id ?? (user as any).group_id ?? null;
    const effectiveTeamId = dbUser?.team_id ?? (user as any).team_id ?? null;

    let groupName = "N/A";
    let groupEntity: any = null;
    let teamEntity: any = null;

    if (effectiveGroupId && Number(effectiveGroupId) > 0) {
      groupEntity = await prisma.group.findUnique({
        where: { groupId: Number(effectiveGroupId) },
      });
      if (groupEntity?.groupName) {
        groupName = groupEntity.groupName;
      }
    }

    if (effectiveTeamId && Number(effectiveTeamId) > 0) {
      teamEntity = await prisma.group.findUnique({
        where: { groupId: Number(effectiveTeamId) },
      });
      if (groupName === "N/A" && teamEntity?.groupName) {
        groupName = teamEntity.groupName;
      }
    }

    const recipientEmails = new Set<string>();

    // 1. Recruiter
    const recruiterCandidates = [
      dbUser?.labelerRefererEmail,
      dbUser?.refererEmail,
      user.labelerRefererEmail,
      user.refererEmail,
    ].filter(Boolean) as string[];

    for (const rc of recruiterCandidates) {
      const trimmed = rc.trim().toLowerCase();
      if (trimmed.includes("@")) {
        recipientEmails.add(trimmed);
      }
    }

    // 2. Group / Team Manager and Owner
    if (groupEntity?.managerEmail?.trim()?.includes("@")) {
      recipientEmails.add(groupEntity.managerEmail.trim().toLowerCase());
    }
    if (groupEntity?.ownerEmail?.trim()?.includes("@")) {
      recipientEmails.add(groupEntity.ownerEmail.trim().toLowerCase());
    }
    if (teamEntity?.managerEmail?.trim()?.includes("@")) {
      recipientEmails.add(teamEntity.managerEmail.trim().toLowerCase());
    }
    if (teamEntity?.ownerEmail?.trim()?.includes("@")) {
      recipientEmails.add(teamEntity.ownerEmail.trim().toLowerCase());
    }

    // 3. Checker & Judger
    const staffNamesToResolve = [
      groupEntity?.checkerName,
      groupEntity?.judgerName,
      teamEntity?.checkerName,
      teamEntity?.judgerName,
    ].filter(Boolean) as string[];

    if (staffNamesToResolve.length > 0) {
      const matchedStaffUsers = await prisma.user.findMany({
        where: {
          OR: [
            { gingerUsername: { in: staffNamesToResolve, mode: "insensitive" } },
            { username: { in: staffNamesToResolve, mode: "insensitive" } },
            { name: { in: staffNamesToResolve, mode: "insensitive" } },
          ],
        },
        select: { email: true },
      });
      for (const su of matchedStaffUsers) {
        if (su.email?.trim()?.includes("@")) {
          recipientEmails.add(su.email.trim().toLowerCase());
        }
      }
    }

    // Do not notify the user themselves here (they receive their own notice)
    recipientEmails.delete(user.email.trim().toLowerCase());

    if (recipientEmails.size > 0) {
      const renewalAlertMessage = `Member ${displayName} (${user.email}) had an expired Ginger account and was reset for retraining.
• New Ginger ID: ${finalGingerUsername}
• Old Ginger ID: ${oldGingerUsername || "N/A"}
• Group: ${groupName}`;

      await Promise.all(
        Array.from(recipientEmails).map((toEmail) =>
          prisma.directMessage.create({
            data: {
              toEmail,
              fromName: "XFNITE System",
              subject: `Member Account Renewal: ${displayName}`,
              message: renewalAlertMessage,
              isRead: false,
            },
          }).catch((dmErr) => console.warn(`Failed to send renewal alert to ${toEmail}:`, dmErr))
        )
      );
    }
  } catch (notifyErr) {
    console.warn("Failed to dispatch staff renewal alerts:", notifyErr);
  }

  let newGingerToken: string | null = null;
  let newGingerData: any = {};

  if (signupSucceeded) {
    try {
      const loginRes = await fetch(GINGER_LOGIN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: finalGingerEmail, password: finalPassword }),
      });
      newGingerData = await loginRes.json().catch(() => ({}));
      if (loginRes.ok && newGingerData?.credential?.access_token) {
        newGingerToken = newGingerData.credential.access_token;
      }
    } catch (loginErr) {
      console.warn("Failed to login to newly created Ginger account:", loginErr);
    }
  }

  return {
    success: true,
    signupSucceeded,
    newGingerToken,
    newGingerData,
    finalGingerEmail,
    finalGingerUsername,
  };
}
