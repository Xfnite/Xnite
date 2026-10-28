"use server";

import { prisma } from "@/lib/db";
import { verifySessionToken } from "@/lib/jwt";
import { cookies } from "next/headers";
import { getRecruiterEmails, recruitsOfWhere } from "@/lib/recruits";
import { getInnerCouncilUser } from "@/lib/authGuard";

// Whether the signed-in user can see the Inner Council link / Top Mentors page.
export async function getInnerCouncilAccessAction() {
  return { hasAccess: !!(await getInnerCouncilUser()) };
}

export async function getUserSidebarBanner() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("xnite_session")?.value;
  const email = sessionToken ? await verifySessionToken(sessionToken) : null;

  if (!email) {
    return { success: false, error: "Not authenticated" };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { sidebarBannerUrl: true }
  });

  if (!user) {
    return { success: false, error: "User not found" };
  }

  return { success: true, url: user.sidebarBannerUrl };
}

// Simple in-memory rate limiter
const bannerUpdateRateLimit = new Map<string, number>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute

export async function updateUserSidebarBanner(url: string) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("xnite_session")?.value;
  const email = sessionToken ? await verifySessionToken(sessionToken) : null;

  if (!email) {
    return { success: false, error: "Not authenticated" };
  }

  // Rate Limiting Check
  const now = Date.now();
  const lastUpdate = bannerUpdateRateLimit.get(email);
  if (lastUpdate && now - lastUpdate < RATE_LIMIT_WINDOW_MS) {
    const remainingSeconds = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - lastUpdate)) / 1000);
    return { success: false, error: `Please wait ${remainingSeconds}s before updating again.` };
  }
  bannerUpdateRateLimit.set(email, now);

  await prisma.user.update({
    where: { email },
    data: { sidebarBannerUrl: url }
  });

  return { success: true };
}

export async function getLabelerRecruitCount() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("xnite_session")?.value;
  const email = sessionToken ? await verifySessionToken(sessionToken) : null;

  if (!email) return { success: false, count: 0 };

  const count = await prisma.user.count({
    where: recruitsOfWhere(await getRecruiterEmails(email)),
  });

  return { success: true, count };
}

export async function checkIsSquireAction() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("xnite_session")?.value;
  const email = sessionToken ? await verifySessionToken(sessionToken) : null;

  if (!email) return { success: false, isSquire: false };

  const user = await prisma.user.findUnique({
    where: { email },
    select: { trainings: true }
  });

  if (!user || !user.trainings) return { success: true, isSquire: false };

  const dbTrainings = Array.isArray(user.trainings) ? (user.trainings[0] as any)?.trainings || user.trainings : (user.trainings as any)?.trainings;
  if (!Array.isArray(dbTrainings)) return { success: true, isSquire: false };

  const getTrainingName = (t: any) => (t.name || t.annotate_sub_project_name || "").toLowerCase();
  const getTrainingStatus = (t: any) => t.trainingStatus || t.training_status_desc || "";

  // Check Landcover passed
  const lcTarget = dbTrainings.find((t: any) => {
    const n = getTrainingName(t);
    return n.includes("landcover") || n.includes("land cover");
  });
  if (!lcTarget) return { success: true, isSquire: false };
  const lcIsPassed = getTrainingStatus(lcTarget) === "STATUS_PASSED";
  const lcPassed = Number(lcTarget.passedTask || lcTarget.passed_task_num || 0);
  let lcTotal = Number(lcTarget.totalTask || lcTarget.total_task || 0);
  if (lcTotal === 0) lcTotal = 18;
  const lcPct = lcTotal > 0 ? Math.round((lcPassed / lcTotal) * 100) : (lcIsPassed ? 100 : 0);
  if (lcPct !== 100) return { success: true, isSquire: false };

  // Check Transpo passed
  const tpTarget = dbTrainings.find((t: any) => {
    const n = getTrainingName(t);
    return n.includes("transportation") || n.includes("transport");
  });
  if (!tpTarget) return { success: true, isSquire: false };
  if (getTrainingStatus(tpTarget) !== "STATUS_PASSED") return { success: true, isSquire: false };

  return { success: true, isSquire: true };
}

