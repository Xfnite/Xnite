"use server";

import { prisma } from "@/lib/db";
import { getSessionUser } from "@/app/actions/auth";
import { getRecruiterEmails } from "@/lib/recruits";

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