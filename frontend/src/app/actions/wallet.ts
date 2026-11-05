"use server";

import { prisma } from "@/lib/db";
import { getSessionUser } from "@/app/actions/auth";
import { getRecruiterEmails, recruitsOfWhere } from "@/lib/recruits";
import { enrichReferralBonuses, resolveRecruiterEmail } from "@/lib/referralBonus";
import { isLabelerOrOldLabeler, REFERRAL_BONUS_MIN_WITHDRAW } from "@/config/permissions";
import { Prisma } from "@prisma/client";

export async function getTeamSalariesAction(params?: {
  page?: number;
  limit?: number;
  searchQuery?: string;
  selectedFrom?: string[];
  selectedRoles?: string[];
  cutoffFilter?: string;
}) {
  try {
    const { page = 1, limit = 20, searchQuery = "", selectedFrom = [], selectedRoles = [], cutoffFilter = "Current Cutoff" } = params || {};
    const skip = (page - 1) * limit;

    const currentUser = await getSessionUser();
    if (!currentUser) return { success: false, error: "Not authenticated" };

    const role = currentUser.role?.toLowerCase() || "";
    if (!["admin", "judger", "checker", "recruiter"].includes(role)) {
      return { success: false, error: "Unauthorized" };
    }

    const currentEmail = currentUser.email.toLowerCase();

    // 1. Find groups if judger or admin
    let gsGroupIds: number[] = [];
    if (["judger", "admin"].includes(role)) {
      const groupAliases = [
        currentUser.gingerUsername?.toLowerCase(),
        currentUser.username?.toLowerCase()
      ].filter(Boolean) as string[];

      if (groupAliases.length > 0) {
        const groups = await prisma.group.findMany({
          select: { groupId: true, judgerName: true }
        });

        gsGroupIds = groups
          .filter(g => g.judgerName && groupAliases.includes(g.judgerName.trim().toLowerCase()))
          .map(g => g.groupId);
      }
    }

    // 2. Build Where Conditions
    const matchEmails = [
      ...(await getRecruiterEmails(currentEmail)),
      currentUser.gingerUsername?.toLowerCase(),
    ].filter(Boolean) as string[];

    const baseOr: any[] = [];
    const wantsRecruit = selectedFrom.length === 0 || selectedFrom.includes("Recruit");
    const wantsGS = selectedFrom.length === 0 || selectedFrom.includes("GS");

    if (wantsRecruit) {
      matchEmails.forEach(email => {
        baseOr.push({ refererEmail: { equals: email, mode: "insensitive" } });
        baseOr.push({ labelerRefererEmail: { equals: email, mode: "insensitive" } });
        baseOr.push({ linkedRecruiterEmail: { equals: email, mode: "insensitive" } });
      });
    }

    if (wantsGS && gsGroupIds.length > 0) {
      baseOr.push({ group_id: { in: gsGroupIds } });
      baseOr.push({ team_id: { in: gsGroupIds } });
    }

    if (baseOr.length === 0) {
      return { success: true, data: [], totalItems: 0, totalPages: 0, currentUserRole: role };
    }

    const isCurrentCutoff = cutoffFilter === "Current Cutoff";

    const salaryCondition = isCurrentCutoff
      ? { currentIncome: { estimatedAmount: { gt: 0 } } }
      : {
        incomeHistory: {
          some: {
            amountPaid: { gt: 0 },
            rawComputation: {
              path: ['_note1'],
              string_contains: cutoffFilter
            }
          }
        }
      };

    const searchConditions = searchQuery ? {
      OR: [
        { name: { contains: searchQuery, mode: "insensitive" } },
        { gingerUsername: { contains: searchQuery, mode: "insensitive" } },
        { email: { contains: searchQuery, mode: "insensitive" } }
      ]
    } : null;

    let roleCondition = null;
    if (selectedRoles.length > 0) {
      roleCondition = {
        OR: selectedRoles.map(r => ({ role: { equals: r, mode: "insensitive" } }))
      };
    }

    const finalWhere = {
      AND: [
        { OR: baseOr },
        salaryCondition,
        ...(searchConditions ? [searchConditions] : []),
        ...(roleCondition ? [roleCondition] : [])
      ]
    };

    // 3. Fetch with Pagination
    const [totalItems, teamUsers] = await prisma.$transaction([
      prisma.user.count({ where: finalWhere }),
      prisma.user.findMany({
        where: finalWhere,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          gingerUsername: true,
          group_id: true,
          team_id: true,
          refererEmail: true,
          labelerRefererEmail: true,
          linkedRecruiterEmail: true,
          currentIncome: { select: { estimatedAmount: true, status: true, rawComputation: true } },
          incomeHistory: isCurrentCutoff ? false : {
            where: {
              rawComputation: {
                path: ['_note1'],
                string_contains: cutoffFilter
              }
            },
            select: {
              id: true,
              amountPaid: true,
              payoutDate: true,
              periodStart: true,
              periodEnd: true,
              status: true,
              transactionId: true,
              rawComputation: true,
            },
            orderBy: { payoutDate: 'desc' },
            take: 1
          },
        }
      })
    ]);

    // 4. Transform data
    const data = teamUsers.map(u => {
      const isRecruit =
        (u.refererEmail && matchEmails.includes(u.refererEmail.toLowerCase())) ||
        (u.labelerRefererEmail && matchEmails.includes(u.labelerRefererEmail.toLowerCase())) ||
        (u.linkedRecruiterEmail && matchEmails.includes(u.linkedRecruiterEmail.toLowerCase()));

      const isGS =
        (u.group_id != null && gsGroupIds.includes(u.group_id)) ||
        (u.team_id != null && gsGroupIds.includes(u.team_id));

      const type = isRecruit && isGS ? "Recruit & GS" : isRecruit ? "Recruit" : isGS ? "GS" : "Unknown";

      const totalPaid = u.incomeHistory?.reduce((sum, h) => sum + h.amountPaid, 0) || 0;
      const currentEst = u.currentIncome?.estimatedAmount || 0;

      let targetRawComputation = null;
      if (isCurrentCutoff) {
        targetRawComputation = u.currentIncome?.rawComputation || null;
      } else if (u.incomeHistory && u.incomeHistory.length > 0) {
        targetRawComputation = u.incomeHistory[0].rawComputation;
      }

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        gingerUsername: u.gingerUsername,
        type,
        currentEstimatedSalary: currentEst,
        totalPaidOut: totalPaid,
        targetRawComputation,
        // Payout status for the selected cutoff (e.g. Sending, Sent, Fill-out ClaimForm)
        payoutStatus: (isCurrentCutoff ? u.currentIncome?.status : u.incomeHistory?.[0]?.status) || null,
      };
    });

    const totalPages = Math.ceil(totalItems / limit);

    return { success: true, data, totalItems, totalPages, currentUserRole: role };
  } catch (err) {
    console.error("getTeamSalariesAction error:", err);
    return { success: false, error: "Unexpected server error" };
  }
}

export async function getAvailableTeamCutoffsAction() {
  try {
    const currentUser = await getSessionUser();
    if (!currentUser) return { success: false, error: "Unauthorized" };

    const role = currentUser.role?.toLowerCase() || "";
    const canAccess = ["recruiter", "checker", "judger", "admin"].includes(role);
    if (!canAccess) return { success: false, error: "Unauthorized access to team payout" };

    // Fetch unique cutoffs using raw SQL for performance
    const cutoffsResult: any = await prisma.$queryRaw`
      SELECT DISTINCT "rawComputation"->>'_note1' as cutoff_note
      FROM "IncomeHistory"
      WHERE "rawComputation"->>'_note1' IS NOT NULL
      ORDER BY cutoff_note DESC
      LIMIT 100
    `;

    const uniqueCutoffs = new Set<string>();

    if (cutoffsResult && Array.isArray(cutoffsResult)) {
      cutoffsResult.forEach((row: any) => {
        if (row.cutoff_note && typeof row.cutoff_note === 'string') {
          // Strip "- Projects 5391..." suffix
          const cleanName = row.cutoff_note.split('- Projects')[0].trim();
          if (cleanName) {
            uniqueCutoffs.add(cleanName);
          }
        }
      });
    }

    const parseCutoffDate = (cutoff: string) => {
      try {
        const parts = cutoff.split("-");
        if (parts.length >= 2) {
          // For "June 30 - July 15, 2026 Cutoff", this extracts "July 15, 2026"
          const dateString = parts[1].replace(/cutoff/i, "").trim();
          const time = new Date(dateString).getTime();
          if (!isNaN(time)) return time;
        }
      } catch (e) { }
      return 0;
    };

    const sortedCutoffs = Array.from(uniqueCutoffs).sort((a, b) => {
      return parseCutoffDate(b) - parseCutoffDate(a); // Descending
    });

    return {
      success: true,
      data: sortedCutoffs
    };

  } catch (err) {
    console.error("getAvailableTeamCutoffsAction error:", err);
    return { success: false, error: "Unexpected server error" };
  }
}

export async function getReferralBonusesAction(params?: {
  cutoff?: string;
  searchQuery?: string;
  sourceFilter?: string;
  recruiterEmailFilter?: string;
  onlyMine?: boolean;
  sortBy?: "amount_desc" | "amount_asc" | "name_asc";
  page?: number;
  limit?: number;
}) {
  try {
    const currentUser = await getSessionUser();
    if (!currentUser) return { success: false, error: "Not authenticated" };

    const role = currentUser.role?.toLowerCase() || "";
    // Only labelers and old labelers have the Referral Bonus tab.
    // Inner Council roles (checker, judger, recruiter, admin) have bonuses included directly in their salary payout.
    if (!isLabelerOrOldLabeler(role)) {
      return {
        success: false,
        error: "Referral bonuses for Inner Council are included directly in your team salary payout.",
      };
    }

    const isStaff = ["admin", "judger", "recruiter", "checker"].includes(role);
    const isAdmin = role === "admin" || role === "judger";

    const {
      cutoff = "All",
      searchQuery = "",
      sourceFilter = "all",
      recruiterEmailFilter = "all",
      onlyMine = false,
      sortBy = "amount_desc",
      page = 1,
      limit = 20,
    } = params || {};

    const myRecruiterEmails = (await getRecruiterEmails(currentUser.email)).map((e) =>
      e.toLowerCase()
    );
    if (currentUser.gingerUsername) {
      myRecruiterEmails.push(currentUser.gingerUsername.toLowerCase());
    }

    const whereClause: Prisma.ReferralBonusWhereInput = {};
    if (cutoff && cutoff !== "All") {
      whereClause.cutoff = cutoff;
    }

    const rawBonuses = await prisma.referralBonus.findMany({
      where: whereClause,
      include: {
        user: {
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
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const enriched = await enrichReferralBonuses(rawBonuses);

    let filtered = enriched;

    // Strict user filtering: Each user ONLY sees their own recruits
    filtered = filtered.filter((item) => {
      const recruiterEmail = item.recruiter?.email?.toLowerCase();
      const recruiterGinger = item.recruiter?.username?.toLowerCase();
      return (
        (recruiterEmail && myRecruiterEmails.includes(recruiterEmail)) ||
        (recruiterGinger && myRecruiterEmails.includes(recruiterGinger))
      );
    });

    if (sourceFilter && sourceFilter !== "all") {
      filtered = filtered.filter((item) => item.source === sourceFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.recruit?.username?.toLowerCase().includes(q) ||
          item.recruit?.name?.toLowerCase().includes(q) ||
          item.recruit?.email?.toLowerCase().includes(q) ||
          item.recruiter?.name?.toLowerCase().includes(q) ||
          item.recruiter?.email?.toLowerCase().includes(q)
      );
    }

    // Sort order: Highest to Lowest (amount_desc) by default
    if (sortBy === "amount_desc") {
      filtered.sort((a, b) => (b.amount || 0) - (a.amount || 0));
    } else if (sortBy === "amount_asc") {
      filtered.sort((a, b) => (a.amount || 0) - (b.amount || 0));
    } else if (sortBy === "name_asc") {
      filtered.sort((a, b) =>
        (a.recruit?.name || a.recruit?.username || "").localeCompare(
          b.recruit?.name || b.recruit?.username || ""
        )
      );
    }

    const totalEarned = filtered.reduce((acc, curr) => acc + (curr.amount || 0), 0);
    const uniqueRecruits = new Set(
      filtered
        .map((i) => (i.gingerUsername || i.recruit?.email || i.id || "").toLowerCase())
        .filter(Boolean)
    );
    const parseCutoffDate = (cutoffName: string) => {
      try {
        const parts = cutoffName.split("-");
        const dateString = (parts.length >= 2 ? parts[1] : cutoffName).replace(/cutoff/i, "").trim();
        const time = new Date(dateString).getTime();
        if (!isNaN(time)) return time;
      } catch (e) {}
      return 0;
    };

    const allCutoffsRaw = await prisma.referralBonus.findMany({
      select: { cutoff: true },
      distinct: ["cutoff"],
    });
    const availableCutoffs = allCutoffsRaw
      .map((c) => c.cutoff)
      .filter((c): c is string => Boolean(c))
      .sort((a, b) => parseCutoffDate(b) - parseCutoffDate(a));

    const latestCutoffName = availableCutoffs[0] || "October 15, 2026 Cutoff";
    const activeCutoffName = cutoff && cutoff !== "All" ? cutoff : latestCutoffName;

    const currentCutoffEarned = filtered
      .filter((i) => i.cutoff === activeCutoffName)
      .reduce((acc, curr) => acc + (curr.amount || 0), 0);

    // Calculate next monthly cutoff (monthly every 15th)
    let nextCutoffName = "";
    try {
      const datePart = (activeCutoffName.split("-").pop() || activeCutoffName).replace(/cutoff/i, "").trim();
      const baseDate = new Date(datePart);
      if (!isNaN(baseDate.getTime())) {
        const nextDate = new Date(baseDate);
        nextDate.setMonth(nextDate.getMonth() + 1);
        nextDate.setDate(15);
        const monthName = nextDate.toLocaleString("en-US", { month: "long" });
        nextCutoffName = `${monthName} 15, ${nextDate.getFullYear()} Cutoff`;
      }
    } catch (e) {}

    const sourceBreakdown = {
      referral_link: filtered.filter((i) => i.source === "referral_link").reduce((s, c) => s + c.amount, 0),
      direct_referral: filtered.filter((i) => i.source === "direct_referral").reduce((s, c) => s + c.amount, 0),
      fallback_iru: filtered.filter((i) => i.source === "fallback_iru").reduce((s, c) => s + c.amount, 0),
      organic: filtered.filter((i) => i.source === "organic").reduce((s, c) => s + c.amount, 0),
    };

    const allRecruitersMap = new Map<string, { email: string; name: string }>();
    enriched.forEach((item) => {
      if (item.recruiter?.email) {
        allRecruitersMap.set(item.recruiter.email.toLowerCase(), {
          email: item.recruiter.email,
          name: item.recruiter.name || item.recruiter.email,
        });
      }
    });
    const availableRecruiters = Array.from(allRecruitersMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / limit);
    const paginatedItems = filtered.slice((page - 1) * limit, page * limit);

    const paymentDetails = await prisma.paymentDetails.findUnique({
      where: { email: currentUser.email },
      select: {
        paymentMethod: true,
        payeeUid: true,
        payeeName: true,
      },
    });

    const rawHistory = await prisma.referralWithdrawal.findMany({
      where: { email: currentUser.email },
      select: {
        id: true,
        amount: true,
        status: true,
        cutoffLabel: true,
        createdAt: true,
        sentAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 15,
    });

    const payoutHistory = rawHistory.map((h) => ({
      id: h.id,
      amountPaid: h.amount,
      status: h.status,
      cutoff: h.cutoffLabel,
      createdAt: h.createdAt.toISOString(),
      payoutDate: h.sentAt ? h.sentAt.toISOString() : null,
    }));

    const claimableBonus = filtered
      .filter((i) => (i.status || "Active").toLowerCase() === "active")
      .reduce((s, c) => s + (c.amount || 0), 0);

    const sendingBonus = filtered
      .filter((i) => (i.status || "").toLowerCase() === "sending")
      .reduce((s, c) => s + (c.amount || 0), 0);

    const lifetimeRecruitsCount = await prisma.user.count({
      where: recruitsOfWhere(await getRecruiterEmails(currentUser.email)),
    });

    return {
      success: true,
      data: {
        items: paginatedItems,
        totalItems,
        totalPages,
        currentPage: page,
        summary: {
          totalEarned,
          claimableBonus,
          sendingBonus,
          totalRecruitsCount: uniqueRecruits.size,
          lifetimeRecruitsCount,
          currentCutoffEarned,
          currentCutoffName: activeCutoffName,
          nextCutoffName,
          sourceBreakdown,
          paymentDetails: paymentDetails || null,
          payoutHistory,
        },
        availableCutoffs,
        availableRecruiters,
        currentUser: {
          email: currentUser.email,
          role,
          isAdmin,
          isStaff,
        },
      },
    };
  } catch (err: any) {
    console.error("getReferralBonusesAction error:", err);
    return { success: false, error: err?.message || "Failed to fetch referral bonuses" };
  }
}

export async function withdrawReferralBonusAction(params?: { cutoff?: string }) {
  try {
    const currentUser = await getSessionUser();
    if (!currentUser) return { success: false, error: "Not authenticated" };

    const role = currentUser.role?.toLowerCase() || "";
    // Only labelers and old labelers withdraw referral bonuses here.
    if (!isLabelerOrOldLabeler(role)) {
      return {
        success: false,
        error: "Referral bonuses for Inner Council are included directly in your team salary payout.",
      };
    }

    const myRecruiterEmails = (await getRecruiterEmails(currentUser.email)).map((e) =>
      e.toLowerCase()
    );
    if (currentUser.gingerUsername) myRecruiterEmails.push(currentUser.gingerUsername.toLowerCase());
    if (currentUser.username) myRecruiterEmails.push(currentUser.username.toLowerCase());
    if (currentUser.email) myRecruiterEmails.push(currentUser.email.toLowerCase());

    const paymentDetails = await prisma.paymentDetails.findUnique({
      where: { email: currentUser.email },
    });

    if (!paymentDetails?.paymentMethod || !paymentDetails?.payeeUid) {
      return {
        success: false,
        error: "Please configure your payment method in Wallet > Payment Method before withdrawing.",
      };
    }

    const targetCutoff = params?.cutoff && params.cutoff !== "All" ? params.cutoff : undefined;

    const whereBonus: Prisma.ReferralBonusWhereInput = {
      status: { equals: "Active", mode: "insensitive" },
      withdrawalId: null,
    };
    if (targetCutoff) {
      whereBonus.cutoff = targetCutoff;
    }

    const allActiveBonuses = await prisma.referralBonus.findMany({
      where: whereBonus,
      include: {
        user: {
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
        },
      },
    });

    const enriched = await enrichReferralBonuses(allActiveBonuses);
    const claimableItems = enriched.filter((item) => {
      const recEmail = item.recruiter?.email?.toLowerCase();
      const recGinger = item.recruiter?.username?.toLowerCase();
      return (
        (recEmail && myRecruiterEmails.includes(recEmail)) ||
        (recGinger && myRecruiterEmails.includes(recGinger))
      );
    });

    if (claimableItems.length === 0) {
      return {
        success: false,
        error:
          "No active referral bonus available to withdraw. This cutoff has already been withdrawn or is currently being processed.",
      };
    }

    const totalToClaim = claimableItems.reduce((sum, item) => sum + (item.amount || 0), 0);
    if (totalToClaim <= 0) {
      return {
        success: false,
        error: "Claimable bonus amount must be greater than ₱0.00.",
      };
    }
    if (totalToClaim < REFERRAL_BONUS_MIN_WITHDRAW) {
      return {
        success: false,
        error: `Minimum referral bonus withdrawal is ₱${REFERRAL_BONUS_MIN_WITHDRAW.toLocaleString("en-US", { minimumFractionDigits: 2 })}.`,
      };
    }

    const bonusIdsToUpdate = claimableItems.map((item) => item.id);

    // A withdrawal can span several cutoffs (balances below the minimum carry over).
    const cutoffs = Array.from(new Set(claimableItems.map((i) => i.cutoff).filter(Boolean))).sort(
      (a, b) => parseCutoffTime(a) - parseCutoffTime(b)
    );
    const cutoffLabel =
      cutoffs.length === 0
        ? "Monthly Referral Bonus"
        : cutoffs.length === 1
        ? cutoffs[0]
        : `${stripCutoff(cutoffs[0])} – ${stripCutoff(cutoffs[cutoffs.length - 1])} Cutoffs`;

    // Atomically create the withdrawal and claim the bonuses. The claim only matches
    // rows that are still Active and unclaimed, so a double-click or a second tab
    // cannot withdraw the same bonuses twice.
    const result = await prisma.$transaction(async (tx) => {
      const withdrawal = await tx.referralWithdrawal.create({
        data: {
          email: currentUser.email,
          amount: totalToClaim,
          status: "Pending",
          cutoffLabel,
          cutoffs,
          paymentMethod: paymentDetails.paymentMethod,
          payeeUid: paymentDetails.payeeUid,
          payeeName: paymentDetails.payeeName || currentUser.name || null,
        },
        select: { id: true },
      });

      const claimed = await tx.referralBonus.updateMany({
        where: {
          id: { in: bonusIdsToUpdate },
          status: { equals: "Active", mode: "insensitive" },
          withdrawalId: null,
        },
        data: { status: "Sending", withdrawalId: withdrawal.id },
      });

      if (claimed.count !== bonusIdsToUpdate.length) {
        throw new ReferralClaimConflictError();
      }

      return withdrawal;
    });

    return {
      success: true,
      data: {
        withdrawalId: result.id,
        amount: totalToClaim,
        cutoff: cutoffLabel,
      },
    };
  } catch (err: any) {
    if (err instanceof ReferralClaimConflictError) {
      return {
        success: false,
        error: "Your referral bonus is already being withdrawn. Please refresh the page.",
      };
    }
    console.error("withdrawReferralBonusAction error:", err);
    return { success: false, error: "Failed to process withdrawal" };
  }
}

class ReferralClaimConflictError extends Error {}

function stripCutoff(cutoff: string) {
  return cutoff.replace(/cutoff/i, "").trim();
}

function parseCutoffTime(cutoff: string) {
  const time = new Date(stripCutoff(cutoff.split("-").pop() || cutoff)).getTime();
  return isNaN(time) ? 0 : time;
}
