import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withRateLimit } from "@/lib/rateLimit";
import { getNormalizedRole, isStaff } from "@/config/permissions";

// The latest payout-status update and everyone's pending totals are the same for
// every user, and each scans the payout tables, so compute them at most once a
// minute instead of on every wallet load.
const SHARED_TTL_MS = 60 * 1000;
let lastUpdateCache: { at: number; data: Promise<Date | null> } | null = null;
let pendingTotalsCache: { at: number; data: Promise<QueueEntry[]> } | null = null;

type QueueEntry = { total: number; tier: number };

// Queue priority: Inner Council (staff) first, then old labelers, then labelers.
// Anyone whose current-period income is below the priority balance goes after
// all of them, regardless of role. Within a tier, larger pending balances go first.
const QUEUE_PRIORITY_MIN_BALANCE = 1500;

function getQueueTier(role: string | null | undefined, currentIncome: number) {
  if (currentIncome < QUEUE_PRIORITY_MIN_BALANCE) return 3;
  if (isStaff(role ?? undefined)) return 0;
  if (getNormalizedRole(role ?? undefined) === "old-labeler") return 1;
  return 2;
}

function isAheadInQueue(a: QueueEntry, b: QueueEntry) {
  return a.tier < b.tier || (a.tier === b.tier && a.total > b.total);
}

function getGlobalLastUpdatedAt() {
  if (lastUpdateCache && Date.now() - lastUpdateCache.at < SHARED_TTL_MS) return lastUpdateCache.data;
  const data = prisma.incomeHistory
    .findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } })
    .then((row) => row?.updatedAt ?? null);
  lastUpdateCache = { at: Date.now(), data };
  data.catch(() => { lastUpdateCache = null; });
  return data;
}

// Every user's pending total that is above zero, with their queue tier.
function getPendingTotals() {
  if (pendingTotalsCache && Date.now() - pendingTotalsCache.at < SHARED_TTL_MS) return pendingTotalsCache.data;
  const data = prisma.$queryRaw<{ total_pending: unknown; current_income: unknown; role: string | null }[]>`
    WITH PendingAmounts AS (
      SELECT email, "estimatedAmount" as amount, "estimatedAmount" as current FROM "CurrentIncome" WHERE "estimatedAmount" > 0
      UNION ALL
      SELECT email, "amountPaid" as amount, 0 as current FROM "IncomeHistory" WHERE status NOT ILIKE '%Sent%'
    ),
    UserBalances AS (
      SELECT email, SUM(amount) as total_pending, SUM(current) as current_income
      FROM PendingAmounts
      GROUP BY email
    )
    SELECT b.total_pending, b.current_income, u.role
    FROM UserBalances b
    LEFT JOIN "User" u ON u.email = b.email
    WHERE b.total_pending > 0
  `.then((rows) => rows.map((r) => ({
    total: Number(r.total_pending),
    tier: getQueueTier(r.role, Number(r.current_income)),
  })));
  pendingTotalsCache = { at: Date.now(), data };
  data.catch(() => { pendingTotalsCache = null; });
  return data;
}

export const GET = withRateLimit(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json({ success: false, error: "Email is required" }, { status: 400 });
    }

    const currentIncome = await prisma.currentIncome.findUnique({
      where: { email },
    });

    const incomeHistory = await prisma.incomeHistory.findMany({
      where: { email },
      orderBy: { payoutDate: 'desc' },
    });

    const user = await prisma.user.findUnique({
      where: { email },
      select: { role: true, createdAt: true },
    });

    const globalLastUpdatedAt = await getGlobalLastUpdatedAt();

    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: [
        "salaries_disabled", 
        "salaries_disabled_roles", 
        "minimum_balance_threshold", 
        "minimum_balance_threshold_enabled", 
        "hide_salaries_new_users_enabled",
        "minimum_balance_threshold_labeler_enabled",
        "minimum_balance_threshold_labeler",
        "minimum_balance_threshold_old_labeler_enabled",
        "minimum_balance_threshold_old_labeler"
      ] } },
    });

    const salariesDisabledSetting = settings.find(s => s.key === "salaries_disabled");
    const salariesDisabledRolesSetting = settings.find(s => s.key === "salaries_disabled_roles");
    const thresholdSetting = settings.find(s => s.key === "minimum_balance_threshold");
    const thresholdEnabledSetting = settings.find(s => s.key === "minimum_balance_threshold_enabled");
    const newUsersSetting = settings.find(s => s.key === "hide_salaries_new_users_enabled");
    
    // Role-specific settings
    const labelerThresholdEnabledSetting = settings.find(s => s.key === "minimum_balance_threshold_labeler_enabled");
    const labelerThresholdSetting = settings.find(s => s.key === "minimum_balance_threshold_labeler");
    const oldLabelerThresholdEnabledSetting = settings.find(s => s.key === "minimum_balance_threshold_old_labeler_enabled");
    const oldLabelerThresholdSetting = settings.find(s => s.key === "minimum_balance_threshold_old_labeler");

    let threshold = thresholdSetting && thresholdSetting.value && !isNaN(Number(thresholdSetting.value))
      ? Number(thresholdSetting.value)
      : 1250;
    let isThresholdEnabled = thresholdEnabledSetting ? thresholdEnabledSetting.value !== "false" : true;
    
    // Apply role-specific overrides if applicable
    if (user?.role === 'labeler') {
      const isLabelerOverride = labelerThresholdEnabledSetting?.value === "true";
      if (isLabelerOverride) {
        isThresholdEnabled = true; // Override to true
        threshold = labelerThresholdSetting && labelerThresholdSetting.value && !isNaN(Number(labelerThresholdSetting.value))
          ? Number(labelerThresholdSetting.value)
          : 1250; // Fallback if no valid value
      }
    } else if (user?.role === 'old-labeler') {
      const isOldLabelerOverride = oldLabelerThresholdEnabledSetting?.value === "true";
      if (isOldLabelerOverride) {
        isThresholdEnabled = true; // Override to true
        threshold = oldLabelerThresholdSetting && oldLabelerThresholdSetting.value && !isNaN(Number(oldLabelerThresholdSetting.value))
          ? Number(oldLabelerThresholdSetting.value)
          : 1250; // Fallback if no valid value
      }
    }

    const isNewUserSalariesDisabledRule = newUsersSetting?.value === "true";

    let isSalariesDisabled = salariesDisabledSetting?.value === "true";

    let isHiddenReason = null;

    if (!isSalariesDisabled && user && salariesDisabledRolesSetting?.value) {
      try {
        const disabledRoles = JSON.parse(salariesDisabledRolesSetting.value);
        if (Array.isArray(disabledRoles) && disabledRoles.includes(user.role)) {
          isSalariesDisabled = true;
          isHiddenReason = "role";
        }
      } catch (e) {
        // ignore JSON parse error
      }
    }

    if (!isSalariesDisabled && isThresholdEnabled && currentIncome && currentIncome.estimatedAmount < threshold) {
      isSalariesDisabled = true;
      isHiddenReason = "threshold";
    }

    if (!isSalariesDisabled && isNewUserSalariesDisabledRule && user?.createdAt && user.role === 'labeler') {
      const fifteenDaysAgo = new Date();
      fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
      if (new Date(user.createdAt) > fifteenDaysAgo) {
        isSalariesDisabled = true;
        isHiddenReason = "new_user";
      }
    }

    let finalCurrentIncome = currentIncome;
    if (currentIncome && isSalariesDisabled) {
      finalCurrentIncome = {
        ...currentIncome,
        estimatedAmount: 0,
        actualEstimatedAmount: currentIncome.estimatedAmount,
        isHiddenReason: isHiddenReason || "global"
      } as any;
    }

    // console.log("DEBUG finalCurrentIncome:", finalCurrentIncome);

    // Calculate queue position based on total pending (CurrentIncome + pending IncomeHistory)
    let queuePosition = null;
    let totalQueueUsers = 0;

    try {
      // 1. Get the current user's pending balance first (indexed and extremely fast)
      const userPendingResult: any = await prisma.$queryRaw`
        SELECT COALESCE(SUM(amount), 0) as total_pending
        FROM (
          SELECT "estimatedAmount" as amount FROM "CurrentIncome" WHERE email = ${email} AND "estimatedAmount" > 0
          UNION ALL
          SELECT "amountPaid" as amount FROM "IncomeHistory" WHERE email = ${email} AND status NOT ILIKE '%Sent%'
        ) as sub
      `;
      const myPending = Number(userPendingResult[0]?.total_pending || 0);

      if (myPending > 0) {
        // 2. Rank against everyone's pending totals (shared, refreshed at most once a minute)
        const totals = await getPendingTotals();
        const me: QueueEntry = { total: myPending, tier: getQueueTier(user?.role, currentIncome?.estimatedAmount ?? 0) };
        queuePosition = totals.filter((t) => isAheadInQueue(t, me)).length + 1;
        totalQueueUsers = totals.length;
      }
    } catch (e) {
      console.error("Queue calculation error:", e);
    }

    return NextResponse.json({
      success: true,
      data: {
        current: finalCurrentIncome,
        history: incomeHistory,
        globalLastUpdatedAt,
        queueInfo: {
          position: queuePosition,
          total: totalQueueUsers
        }
      }
    });
  } catch (err) {
    console.error("GET Income error:", err);
    return NextResponse.json(
      { success: false, error: "Unexpected server error" },
      { status: 500 }
    );
  }
});
