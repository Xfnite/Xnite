"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { verifySessionToken } from "@/lib/jwt";
import { getPeriodStart, isNewPeriod, getPeriodKey, getWeekRange, getWeekKey } from "@/lib/questPeriod";
import { resolveQuestRank } from "@/lib/questRank";
import { getRecruiterEmails } from "@/lib/recruits";
import { isGamificationPreviewVisible } from "@/config/permissions";

import {
  TORCH_QUEST_ID,
  DJ_QUEST_ID,
  DJ_TARGET_MINUTES,
  RECRUIT_QUEST_ID,
  RECRUIT_WEEKLY_TARGET,
  RECRUIT_WEEKLY_LXP,
  BOUNTY_QUEST_ID,
  CHECKIN_QUEST_ID,
  DAILY_QUESTS,
} from "@/config/quests";

// ─── Helper: get authenticated user email ───────────────────────────────────
async function getAuthEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("xnite_session")?.value;
  return sessionToken ? await verifySessionToken(sessionToken) : null;
}

// ─── Helper: append a claim to the LXP history ──────────────────────────────
// Called after the LXP has already been awarded. Deliberately non-fatal: a
// failed history write must never fail (or roll back) a claim the user was
// already paid for. Not exported — it takes any email.
async function recordLxpClaim(email: string, questId: string, questType: "daily" | "weekly", lxp: number) {
  try {
    await prisma.lxpClaimHistory.create({ data: { email, questId, questType, lxp } });
  } catch (err) {
    console.error("recordLxpClaim failed:", err);
  }
}

// ─── Recruit the Realm: qualifying weekly recruit count ──────────────────────
// Counts users this recruiter referred (via refererEmail or labelerRefererEmail)
// whose signup falls in the CURRENT week (Monday–Sunday, anchor tz — see
// getWeekRange) AND who have cleared the app's standard "fully unlocked" gate:
//   onboarding  = isDashboardCompleted
//   training    = Standard Building passed (project id 1, STATUS_PASSED)
//   rules       = isRulesAndGuidelinesCompleted
// Standard Building lives in the mirrored Training table (Json[]), so this joins
// and unnests it — matching how the existing recruiter training filters read it.
// The two element shapes (raw Ginger keys vs. formatted keys) are both handled.
// Fully server-side and derived from live data; the client can't influence it.
// Not exported: an exported function in a "use server" file is a public endpoint,
// and this one takes any email.
async function countQualifyingRecruitsThisWeek(email: string): Promise<number> {
  const { start, end } = getWeekRange();
  // Recruits can be stored under any of the recruiter's emails (login or referal)
  const emails = await getRecruiterEmails(email);
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(DISTINCT u.id)::int AS n
    FROM "User" u
    JOIN "Training" tr ON tr."userId" = u.id, unnest(tr."trainings") AS t(value)
    WHERE (lower(u."refererEmail") = ANY(${emails}) OR lower(u."labelerRefererEmail") = ANY(${emails}))
      AND u."createdAt" >= ${start} AND u."createdAt" < ${end}
      AND u."isDashboardCompleted" = true
      AND u."isRulesAndGuidelinesCompleted" = true
      AND (
        t.value->>'annotate_project_id' = '1'
        OR t.value->>'annotate_sub_project_id' = '1'
        OR t.value->>'projectId' = '1'
      )
      AND (
        t.value->>'training_status_desc' = 'STATUS_PASSED'
        OR t.value->>'trainingStatus' = 'STATUS_PASSED'
      )
  `;
  return Number(rows[0]?.n ?? 0);
}

// Whether this recruiter has already claimed Recruit the Realm for THIS week.
// Matched on createdAt within the current week rather than on weekKey, so rows
// keyed during the brief Sunday-start period (Sunday keys) still count now that
// weeks start on Monday again.
async function hasClaimedRecruitThisWeek(email: string): Promise<boolean> {
  const { start, end } = getWeekRange();
  const claim = await prisma.weeklyQuestClaim.findFirst({
    where: { email, questId: RECRUIT_QUEST_ID, createdAt: { gte: start, lt: end } },
    select: { id: true },
  });
  return !!claim;
}

// ─── The Daily Bounty: live tasks added today ────────────────────────────────
// Difference in tasks completed between today and the most recent previous day,
// summed per project/role. Not exported for the same reason as above.
async function countBountyTasksToday(email: string): Promise<number> {
  const userRec = await prisma.user.findUnique({
    where: { email },
    select: { name: true, gingerUsername: true, gingerEmail: true, email: true }
  });
  const names = [
    userRec?.name?.trim(),
    userRec?.gingerUsername?.trim(),
    userRec?.gingerEmail?.trim(),
    userRec?.email?.trim()
  ].filter(Boolean) as string[];

  const myLogs = await prisma.workLog.findMany({
    where: {
      ownerName: { in: names, mode: "insensitive" }
    },
    orderBy: { id: "desc" },
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const mapToday: Record<string, any> = {};
  const mapYest: Record<string, any> = {};

  myLogs.forEach(log => {
    if (log.projectId >= 1 && log.projectId <= 5) return;
    const logDate = new Date(log.log_date).toISOString().split('T')[0];
    const key = `${log.projectId}_${log.role}`;

    if (logDate === todayStr) {
      if (!mapToday[key] || log.id > mapToday[key].id) mapToday[key] = log;
    } else if (logDate < todayStr) {
      if (!mapYest[key] || log.id > mapYest[key].id) mapYest[key] = log;
    }
  });

  let diff = 0;
  Object.keys(mapToday).forEach(key => {
    const todayTasks = mapToday[key].taskNum;
    const yestTasks = mapYest[key]?.taskNum || 0;
    diff += Math.max(0, todayTasks - yestTasks);
  });
  return diff;
}

// ─── Daily quest eligibility (server-side) ───────────────────────────────────
// Re-derives whether a daily quest is actually finished, from the same sources
// getLoyaltyData reads — the client's "complete" flag is never trusted.
async function isDailyQuestEligible(
  email: string,
  questId: string,
  questProgress: Record<string, number>,
  torchTarget: number
): Promise<boolean> {
  switch (questId) {
    case CHECKIN_QUEST_ID:
      return true; // being authenticated is the check-in
    case TORCH_QUEST_ID:
      return (await prisma.torchHelp.count({ where: { helperEmail: email, periodKey: getPeriodKey() } })) >= torchTarget;
    case DJ_QUEST_ID: {
      const listening = await prisma.jukeboxListening.findUnique({
        where: { userEmail_periodKey: { userEmail: email.toLowerCase(), periodKey: getPeriodKey() } },
        select: { minutes: true },
      });
      return (listening?.minutes ?? 0) >= DJ_TARGET_MINUTES;
    }
    case BOUNTY_QUEST_ID:
      return (await countBountyTasksToday(email)) >= 10;
    default: {
      // Counting quests tracked in questProgress (e.g. The Bards Ballad).
      const quest = DAILY_QUESTS.find((q) => q.id === questId);
      const target = Number(quest?.target.match(/^\d+\/(\d+)/)?.[1] ?? Infinity);
      return (questProgress[questId] || 0) >= target;
    }
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────
export interface LoyaltyData {
  totalLxp: number;
  rank: {
    level: number;
    title: string;
    minLxp: number;
    nextLxp: number | null;
    progress: number;
    torchTarget: number;
    torchXp: number;
  };
  completedQuestIds: string[];
  questProgress: Record<string, number>; // questId -> count for today
  // Weekly quests already claimed this week — the card stays hidden until the
  // next Monday reset, even if progress still reads at/over target.
  weeklyClaimedQuestIds: string[];
}

// ─── Helper: get or create UserLoyalty row + auto-reset for new day ──────────
async function getOrCreateLoyalty(email: string, today: Date) {
  let loyalty = await prisma.userLoyalty.findUnique({
    where: { email },
  });

  if (!loyalty) {
    loyalty = await prisma.userLoyalty.create({
      data: {
        id: crypto.randomUUID(),
        email,
        completionsDate: today,
        completedQuests: [],
        questProgress: {},
        updatedAt: new Date(),
      },
    });
  }

  // If it's a new period (or completionsDate was never set), reset daily data
  // but keep totalLxp. The period boundary is server-authoritative — see
  // isNewPeriod / getPeriodStart in @/lib/questPeriod.
  const needsReset = isNewPeriod(loyalty.completionsDate);
  if (needsReset) {
    loyalty = await prisma.userLoyalty.update({
      where: { id: loyalty.id },
      data: {
        completionsDate: today,
        completedQuests: [],
        questProgress: {},
      },
    });
  }

  return loyalty;
}

// ─── getLoyaltyData ─────────────────────────────────────────────────────────
// Fetches the current user's LXP balance, today's completed quests, and rank.
export async function getLoyaltyData(): Promise<
  { success: true; data: LoyaltyData } | { success: false; error: string }
> {
  try {
    const email = await getAuthEmail();
    if (!email) return { success: false, error: "Not authenticated" };

    const today = getPeriodStart();

    // All of these reads are independent of one another (none needs another's
    // result as input), so they're fired concurrently instead of one-by-one —
    // sequential awaits here were paying full network round-trip latency to the
    // remote DB up to 7 times over, which is what made the quest widget feel
    // slow to load. Recruit the Realm keeps its own internal try/catch so a
    // raw-SQL failure there still can't break the other quests.
    const [loyalty, ranks, user, helpedToday, listening, recruit, bounty] = await Promise.all([
      getOrCreateLoyalty(email, today),
      prisma.loyaltyRank.findMany({ orderBy: { minLxp: "asc" } }),
      prisma.user.findUnique({ where: { email }, select: { role: true } }),
      // Pass the Torch progress is derived from TorchHelp rows for the current
      // period (the socket server records one row per player the user has
      // claimed), so it is never stored in questProgress. Each row = one
      // uniquely-claimed player. The target scales with LXP rank — see
      // LoyaltyRank.torchTarget — clamped against `rank` after this resolves.
      prisma.torchHelp.count({ where: { helperEmail: email, periodKey: getPeriodKey() } }),
      // Same story for "The 60-Minute Harmony": the socket server banks the
      // minutes, so read them back here rather than trusting questProgress. It
      // keys those rows by lowercased email, so match that or a mixed-case
      // session reads 0.
      prisma.jukeboxListening.findUnique({
        where: { userEmail_periodKey: { userEmail: email.toLowerCase(), periodKey: getPeriodKey() } },
        select: { minutes: true },
      }),
      // Recruit the Realm (weekly): progress is the qualifying-recruit count for
      // the current week; completion/claim is tracked in WeeklyQuestClaim, not
      // the daily completedQuests. Once claimed this week the card is hidden
      // until the next Monday (weeklyClaimedQuestIds).
      (async () => {
        try {
          const recruitCount = await countQualifyingRecruitsThisWeek(email);
          const claimed = await hasClaimedRecruitThisWeek(email);
          return { recruitCount, claimed, failed: false };
        } catch (recruitErr) {
          console.error("Recruit the Realm query failed (non-fatal):", recruitErr);
          return { recruitCount: 0, claimed: false, failed: true };
        }
      })(),
      // The Daily Bounty: difference in tasks completed between today and the most recent previous day
      (async () => {
        try {
          return { tasksAdded: await countBountyTasksToday(email), failed: false };
        } catch (err) {
          console.error("Bounty query failed (non-fatal):", err);
          return { tasksAdded: 0, failed: true };
        }
      })(),
    ]);

    const rank = resolveQuestRank(loyalty.totalLxp, ranks, user?.role, isGamificationPreviewVisible(user?.role));
    const completedQuests = (loyalty.completedQuests as string[]) || [];
    const questProgress = (loyalty.questProgress as Record<string, number>) || {};

    questProgress[TORCH_QUEST_ID] = Math.min(helpedToday, rank.torchTarget);

    const djMinutes = listening?.minutes ?? 0;
    questProgress[DJ_QUEST_ID] = Math.min(djMinutes, DJ_TARGET_MINUTES);
    
    questProgress[BOUNTY_QUEST_ID] = Math.min(bounty.tasksAdded, 10);

    // Both of these quests are completed by server-side accrual, so their
    // completion is derived here rather than read from completedQuests.
    const completedQuestIds = [...completedQuests];
    if (helpedToday >= rank.torchTarget && !completedQuestIds.includes(TORCH_QUEST_ID)) {
      completedQuestIds.push(TORCH_QUEST_ID);
    }
    if (djMinutes >= DJ_TARGET_MINUTES && !completedQuestIds.includes(DJ_QUEST_ID)) {
      completedQuestIds.push(DJ_QUEST_ID);
    }
    if (bounty.tasksAdded >= 10 && !completedQuestIds.includes(BOUNTY_QUEST_ID)) {
      completedQuestIds.push(BOUNTY_QUEST_ID);
    }

    const weeklyClaimedQuestIds: string[] = [];
    if (!recruit.failed) {
      questProgress[RECRUIT_QUEST_ID] = Math.min(recruit.recruitCount, RECRUIT_WEEKLY_TARGET);
      if (recruit.claimed) {
        weeklyClaimedQuestIds.push(RECRUIT_QUEST_ID);
      } else if (recruit.recruitCount >= RECRUIT_WEEKLY_TARGET && !completedQuestIds.includes(RECRUIT_QUEST_ID)) {
        completedQuestIds.push(RECRUIT_QUEST_ID);
      }
    } else {
      questProgress[RECRUIT_QUEST_ID] = 0;
    }

    return {
      success: true,
      data: {
        totalLxp: loyalty.totalLxp,
        rank,
        completedQuestIds,
        questProgress,
        weeklyClaimedQuestIds,
      },
    };
  } catch (err) {
    console.error("getLoyaltyData failed:", err);
    return { success: false, error: "Failed to load loyalty data" };
  }
}

// ─── completeQuest ──────────────────────────────────────────────────────────
// Marks a quest as completed for today, awards XP. Overwrites the same row.
// The reward comes from the server config (never the client), eligibility is
// re-verified server-side, and the award is a single conditional UPDATE so two
// concurrent claims (double click, two tabs) can't both pay out.
export async function completeQuest(
  questId: string
): Promise<{ success: true; data: LoyaltyData } | { success: false; error: string }> {
  try {
    const email = await getAuthEmail();
    if (!email) return { success: false, error: "Not authenticated" };

    // Weekly quests claim through claimWeeklyQuest, not here.
    const quest = DAILY_QUESTS.find((q) => q.id === questId);
    if (!quest || questId === RECRUIT_QUEST_ID) {
      return { success: false, error: "Unknown daily quest" };
    }

    const today = getPeriodStart();
    const loyalty = await getOrCreateLoyalty(email, today);

    const completedQuests = (loyalty.completedQuests as string[]) || [];

    // Check if already completed today
    if (completedQuests.includes(questId)) {
      return { success: false, error: "Quest already completed today" };
    }

    const [ranks, user] = await Promise.all([
      prisma.loyaltyRank.findMany({ orderBy: { minLxp: "asc" } }),
      prisma.user.findUnique({ where: { email }, select: { role: true } }),
    ]);

    // Pass the Torch's target/reward scale with the user's current LXP rank,
    // resolved off the pre-award totalLxp.
    const preRank = resolveQuestRank(loyalty.totalLxp, ranks, user?.role, isGamificationPreviewVisible(user?.role));
    const progress = (loyalty.questProgress as Record<string, number>) || {};
    if (!(await isDailyQuestEligible(email, questId, progress, preRank.torchTarget))) {
      return { success: false, error: "Quest not yet completed today" };
    }
    const reward = questId === TORCH_QUEST_ID ? preRank.torchXp : quest.xp;

    // Atomic award on the SAME row: only applies if the row is still on today's
    // period and doesn't already hold this quest. Zero rows = another request won.
    const rows = await prisma.$queryRaw<{ totalLxp: number; completedQuests: string[]; questProgress: Record<string, number> }[]>`
      UPDATE "UserLoyalty"
      SET "totalLxp" = "totalLxp" + ${reward},
          "completedQuests" = "completedQuests" || jsonb_build_array(${questId}::text),
          "updatedAt" = NOW()
      WHERE id = ${loyalty.id}
        AND "completionsDate" = ${getPeriodKey()}::date
        AND NOT ("completedQuests" @> jsonb_build_array(${questId}::text))
      RETURNING "totalLxp", "completedQuests", "questProgress"
    `;
    const updatedLoyalty = rows[0];
    if (!updatedLoyalty) {
      return { success: false, error: "Quest already completed today" };
    }
    await recordLxpClaim(email, questId, "daily", reward);

    const rank = resolveQuestRank(updatedLoyalty.totalLxp, ranks, user?.role, isGamificationPreviewVisible(user?.role));
    const questProgress = updatedLoyalty.questProgress || {};

    return {
      success: true,
      data: {
        totalLxp: updatedLoyalty.totalLxp,
        rank,
        completedQuestIds: updatedLoyalty.completedQuests || [],
        questProgress,
        weeklyClaimedQuestIds: [],
      },
    };
  } catch (err) {
    console.error("completeQuest failed:", err);
    return { success: false, error: "Failed to complete quest" };
  }
}

// ─── claimWeeklyQuest ────────────────────────────────────────────────────────
// Manual claim for weekly quests (currently just Recruit the Realm). Eligibility
// is re-verified server-side — the client's word is never trusted — and the
// reward is the server constant, not a client-supplied amount. The claim is
// recorded once per (email, questId, week); WeeklyQuestClaim's unique makes a
// second claim in the same week a no-op, and the card stays hidden until the
// next Monday. LXP is added to the same UserLoyalty.totalLxp balance.
export async function claimWeeklyQuest(
  questId: string
): Promise<{ success: true; data: LoyaltyData } | { success: false; error: string }> {
  try {
    const email = await getAuthEmail();
    if (!email) return { success: false, error: "Not authenticated" };
    if (questId !== RECRUIT_QUEST_ID) {
      return { success: false, error: "Unknown weekly quest" };
    }

    const [count, alreadyClaimed] = await Promise.all([
      countQualifyingRecruitsThisWeek(email),
      hasClaimedRecruitThisWeek(email),
    ]);
    if (alreadyClaimed) {
      return { success: false, error: "Already claimed this week" };
    }
    if (count < RECRUIT_WEEKLY_TARGET) {
      return { success: false, error: "Quest not yet completed this week" };
    }

    try {
      await prisma.weeklyQuestClaim.create({
        data: { email, questId, weekKey: getWeekKey(), lxp: RECRUIT_WEEKLY_LXP },
      });
    } catch (err) {
      if ((err as { code?: string })?.code === "P2002") {
        return { success: false, error: "Already claimed this week" };
      }
      throw err;
    }

    const [updated, ranks, user] = await Promise.all([
      prisma.userLoyalty.upsert({
        where: { email },
        create: { id: crypto.randomUUID(), email, totalLxp: RECRUIT_WEEKLY_LXP, updatedAt: new Date() },
        update: { totalLxp: { increment: RECRUIT_WEEKLY_LXP } },
      }),
      prisma.loyaltyRank.findMany({ orderBy: { minLxp: "asc" } }),
      prisma.user.findUnique({ where: { email }, select: { role: true } }),
      recordLxpClaim(email, questId, "weekly", RECRUIT_WEEKLY_LXP),
    ]);

    const rank = resolveQuestRank(updated.totalLxp, ranks, user?.role, isGamificationPreviewVisible(user?.role));
    const completedQuestIds = (updated.completedQuests as string[]) || [];
    const questProgress = (updated.questProgress as Record<string, number>) || {};
    questProgress[RECRUIT_QUEST_ID] = RECRUIT_WEEKLY_TARGET;

    // The claim just succeeded above, so this quest is claimed for the week —
    // report that directly instead of re-deriving it with another query.
    return {
      success: true,
      data: {
        totalLxp: updated.totalLxp,
        rank,
        completedQuestIds,
        questProgress,
        weeklyClaimedQuestIds: [RECRUIT_QUEST_ID],
      },
    };
  } catch (err) {
    console.error("claimWeeklyQuest failed:", err);
    return { success: false, error: "Failed to claim weekly quest" };
  }
}

// ─── getLxpClaimHistory ──────────────────────────────────────────────────────
// Paginated, newest-first list of the signed-in user's claimed LXP rewards for
// the Loyalty Points history panel. Always scoped to the session email.
export interface LxpClaimHistoryItem {
  id: string;
  questId: string;
  title: string;
  questType: string;
  lxp: number;
  claimedAt: string;
}

const LXP_HISTORY_MAX_PAGE_SIZE = 50;

export async function getLxpClaimHistory(
  page: number,
  pageSize = 20
): Promise<
  | { success: true; data: { items: LxpClaimHistoryItem[]; total: number; hasMore: boolean } }
  | { success: false; error: string }
> {
  try {
    const email = await getAuthEmail();
    if (!email) return { success: false, error: "Not authenticated" };

    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const take = Math.min(Math.max(Math.floor(pageSize) || 20, 1), LXP_HISTORY_MAX_PAGE_SIZE);

    const [rows, total] = await Promise.all([
      prisma.lxpClaimHistory.findMany({
        where: { email },
        orderBy: { claimedAt: "desc" },
        skip: (safePage - 1) * take,
        take,
      }),
      prisma.lxpClaimHistory.count({ where: { email } }),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      questId: r.questId,
      title: DAILY_QUESTS.find((q) => q.id === r.questId)?.title ?? r.questId,
      questType: r.questType,
      lxp: r.lxp,
      claimedAt: r.claimedAt.toISOString(),
    }));

    return { success: true, data: { items, total, hasMore: safePage * take < total } };
  } catch (err) {
    console.error("getLxpClaimHistory failed:", err);
    return { success: false, error: "Failed to load LXP history" };
  }
}

// ─── trackQuestProgress ─────────────────────────────────────────────────────
// Increments daily progress for counting-based quests (e.g., songs added).
// When count reaches target, auto-completes the quest and awards XP.
// Everything is overwritten on the SAME UserLoyalty row.
export async function trackQuestProgress(
  questId: string,
  xpAmount: number,
  target: number
): Promise<{
  success: true;
  completed: boolean;
  count: number;
  totalLxp: number;
} | { success: false; error: string }> {
  try {
    const email = await getAuthEmail();
    if (!email) return { success: false, error: "Not authenticated" };

    const today = getPeriodStart();
    const loyalty = await getOrCreateLoyalty(email, today);

    const rawProgress = (loyalty.questProgress as Record<string, number>) || {};
    const completedQuests = (loyalty.completedQuests as string[]) || [];

    // Increment progress count for this quest with a fresh object reference for Prisma JSON
    const newCount = (rawProgress[questId] || 0) + 1;
    const updatedQuestProgress = { ...rawProgress, [questId]: newCount };

    // Save progress count only — user must manually click to claim award and LXP
    const updatedLoyalty = await prisma.userLoyalty.update({
      where: { id: loyalty.id },
      data: {
        questProgress: updatedQuestProgress,
      },
    });

    return {
      success: true,
      completed: newCount >= target || completedQuests.includes(questId),
      count: newCount,
      totalLxp: updatedLoyalty.totalLxp,
    };
  } catch (err) {
    console.error("trackQuestProgress failed:", err);
    return { success: false, error: "Failed to track quest progress" };
  }
}
