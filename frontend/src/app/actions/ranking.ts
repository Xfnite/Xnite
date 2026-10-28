"use server";

import { prisma } from "@/lib/db";
import { getSessionUser } from "@/app/actions/auth";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { listActiveReferrers, mergeRecruiterRows } from "@/lib/referrers";
import { getInnerCouncilUser } from "@/lib/authGuard";

function formatWager(balance: number) {
  return `₱${balance.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function getRankingAction() {
  const data = await getCombinedRankingsAction();
  return data.labeller;
}

async function computeRankingsByRoles(validRoles: string[]) {
  // 1. Find the absolute latest record to determine the active cutoff period
  const latestCurrentIncome = await prisma.currentIncome.findFirst({ orderBy: { createdAt: "desc" } });
  const latestIncomeHistory = await prisma.incomeHistory.findFirst({ orderBy: { createdAt: "desc" } });

  let latestRecord: typeof latestCurrentIncome | typeof latestIncomeHistory = latestCurrentIncome;
  if (latestIncomeHistory && (!latestRecord || latestIncomeHistory.createdAt > latestRecord.createdAt)) {
    latestRecord = latestIncomeHistory;
  }

  if (!latestRecord || !latestRecord.rawComputation) {
    return [];
  }

  // Extract active cutoff note
  let latestRawComp = latestRecord.rawComputation;
  if (typeof latestRawComp === "string") latestRawComp = JSON.parse(latestRawComp);
  if (typeof latestRawComp === "string") latestRawComp = JSON.parse(latestRawComp);
  
  const activeCutoffNote = Object.values(latestRawComp).find(v => typeof v === "string" && v.toLowerCase().includes("cutoff"));
  if (!activeCutoffNote) {
    return [];
  }

  // 2. Fetch records created recently (e.g., within 7 days of the latest record) to avoid scanning the entire database
  const fetchSince = new Date(latestRecord.createdAt);
  fetchSince.setDate(fetchSince.getDate() - 7);

  const currentIncomes = await prisma.currentIncome.findMany({
    where: { createdAt: { gte: fetchSince } },
    include: { user: true }
  });

  const incomeHistories = await prisma.incomeHistory.findMany({
    where: { createdAt: { gte: fetchSince } },
    include: { user: true }
  });

  // 3. Filter and group by email
  const latestRecordsByEmail = new Map<string, any>();

  const processRecord = (record: any) => {
    if (!record.user || !record.rawComputation) return;
    if (record.user.status !== "Active") return;

    // Make role checking case-insensitive
    const userRole = (record.user.role || "").toLowerCase();
    if (!validRoles.includes(userRole)) return; // Skip if role doesn't match

    // Extract this record's cutoff note
    let rawComp = record.rawComputation;
    if (typeof rawComp === "string") rawComp = JSON.parse(rawComp);
    if (typeof rawComp === "string") rawComp = JSON.parse(rawComp);
    
    const recordCutoffNote = Object.values(rawComp).find(v => typeof v === "string" && v.toLowerCase().includes("cutoff"));
    
    // Strict Match: only include records that match the latest active cutoff!
    if (recordCutoffNote !== activeCutoffNote) return;

    const email = record.email.toLowerCase();
    const existing = latestRecordsByEmail.get(email);
    if (!existing || existing.createdAt < record.createdAt) {
      latestRecordsByEmail.set(email, record);
    }
  };

  currentIncomes.forEach(processRecord);
  incomeHistories.forEach(processRecord);

  const validRankings = [];

  for (const [email, record] of latestRecordsByEmail.entries()) {
    if (!record.rawComputation) continue;

    let trueValue = 0;
    try {
      // Aggressive parsing to handle nested stringified JSON
      let rawComp = record.rawComputation;
      if (typeof rawComp === "string") {
        rawComp = JSON.parse(rawComp);
      }
      if (typeof rawComp === "string") {
        rawComp = JSON.parse(rawComp);
      }

      if (rawComp && typeof rawComp === "object") {
        const tvKey = Object.keys(rawComp).find(k => k.trim().toLowerCase().replace(/:$/, '') === 'true value');
        if (tvKey) {
          const tv = rawComp[tvKey];
          if (typeof tv === "number") {
            trueValue = tv;
          } else if (typeof tv === "string") {
            trueValue = parseFloat(tv.replace(/,/g, "")) || 0;
          }
        }
      }
    } catch (e) {
      console.warn(`Failed to parse rawComputation for ${email}`, e);
    }

    if (trueValue > 0) {
      let finalName = record.user.name;
      if (!finalName) finalName = record.user.gingerUsername;
      if (!finalName) finalName = record.user.email;

      if (finalName.includes("@")) {
        finalName = finalName.split("@")[0];
      }

      validRankings.push({
        email: record.user.email,
        username: finalName,
        balance: trueValue,
      });
    }
  }

  // Sort descending by true value
  validRankings.sort((a, b) => b.balance - a.balance);

  // Assign rank
  return validRankings.map((r, i) => ({
    ...r,
    rank: i + 1,
  }));
}

export async function getReferrerRankingAction() {
  const data = await getCombinedRankingsAction();
  return data.referrer;
}

const getCachedRankings = (validRoles: string[]) => {
  return unstable_cache(
    async () => {
      return computeRankingsByRoles(validRoles);
    },
    ['user-rankings', validRoles.join('-')],
    { revalidate: 300, tags: ['user-rankings'] }
  )();
};

export async function getCombinedRankingsAction() {
  try {
    const [labellerRows, referrerRows, sessionUser] = await Promise.all([
      getCachedRankings(["labeler", "old-labeler"]),
      getCachedRankings(["recruiter", "checker", "judger", "admin"]),
      getSessionUser(),
    ]);

    const processRankings = async (rows: any[]) => {
      const all = rows.map((r) => ({
        rank: r.rank,
        name: r.username,
        email: r.email,
        balance: r.balance,
        wager: formatWager(r.balance),
        prize: "",
        avatar: "",
      }));

      const top10 = all.slice(0, 10);

      const currentUserRow = sessionUser
        ? all.find((r) => r.email === sessionUser.email) ?? null
        : null;

      const currentUserInTop10 = currentUserRow
        ? currentUserRow.rank <= 10
        : false;

      let cutoffPeriod = "";
      if (top10.length > 0) {
        const topEmail = top10[0].email;
        const history = await prisma.currentIncome.findFirst({ where: { email: topEmail }, orderBy: { createdAt: "desc" } })
          || await prisma.incomeHistory.findFirst({ where: { email: topEmail }, orderBy: { createdAt: "desc" } });
        if (history && history.rawComputation) {
          let rawComp = history.rawComputation;
          if (typeof rawComp === "string") rawComp = JSON.parse(rawComp);
          if (typeof rawComp === "string") rawComp = JSON.parse(rawComp);
          if (rawComp && typeof rawComp === "object") {
            const cutoffNote = Object.values(rawComp).find(v => typeof v === "string" && v.toLowerCase().includes("cutoff"));
            if (cutoffNote) {
              const rawStr = cutoffNote as string;
              const datePart = rawStr.split(/cutoff/i)[0].trim();
              cutoffPeriod = datePart;
            }
          }
        }
      }

      return { top10, currentUserRow, currentUserInTop10, cutoffPeriod };
    };

    // Rankings list every player's email and earnings, so only signed-in users get them.
    if (!sessionUser) {
      return {
        labeller: { top10: [], currentUserRow: null, currentUserInTop10: false, cutoffPeriod: "" },
        referrer: { top10: [], currentUserRow: null, currentUserInTop10: false, cutoffPeriod: "" }
      };
    }

    const [labeller, referrer] = await Promise.all([
      processRankings(labellerRows),
      processRankings(referrerRows),
    ]);

    return { labeller, referrer, sessionUserRole: sessionUser?.role?.toLowerCase() || "" };
  } catch (error) {
    console.error("Error fetching combined rankings:", error);
    return {
      labeller: { top10: [], currentUserRow: null, currentUserInTop10: false, cutoffPeriod: "" },
      referrer: { top10: [], currentUserRow: null, currentUserInTop10: false, cutoffPeriod: "" }
    };
  }
}
const getCachedRecruiterLeaderboards = unstable_cache(
  async (selectedMonth: string) => {
    const [recruitersRes, allUsers] = await Promise.all([
      listActiveReferrers({ merged: false }),
      prisma.user.findMany({
        select: {
          refererEmail: true,
          labelerRefererEmail: true,
          linkedRecruiterEmail: true,
          status: true,
          role: true,
          trainings: true,
          createdAt: true,
        }
      })
    ]);

    // A recruiter can be listed under their referal row and their login; count them as one.
    const { rows: recruiters, canonical } = await mergeRecruiterRows(recruitersRes.success ? (recruitersRes.data || []) : []);

    // Compute availableMonths
    const monthsMap: { [key: string]: { label: string; date: Date } } = {};
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const currentLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    monthsMap[currentKey] = { label: currentLabel, date: now };

    allUsers.forEach((user) => {
      if (!user.refererEmail && !user.labelerRefererEmail) return;
      const date = new Date(user.createdAt);
      const year = date.getFullYear();
      const month = date.getMonth();
      const key = `${year}-${String(month + 1).padStart(2, "0")}`;

      if (!monthsMap[key]) {
        const label = date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
        monthsMap[key] = { label, date };
      }
    });

    const availableMonths = Object.entries(monthsMap)
      .map(([value, { label, date }]) => ({ value, label, date: date.toISOString() }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Filter by month
    const filteredUsers = allUsers.filter((user) => {
      if (user.status !== "Active") return false;
      if (!user.refererEmail && !user.labelerRefererEmail) return false;
      if (selectedMonth === "all") return true;

      const date = new Date(user.createdAt);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const key = `${year}-${String(month).padStart(2, "0")}`;
      return key === selectedMonth;
    });

    const apprenticeCounts: { [email: string]: number } = {};
    const passerCounts: { [email: string]: number } = {};
    const squireCounts: { [email: string]: number } = {};
    
    recruiters.forEach((rec: any) => {
      const recEmail = rec.email.toLowerCase();
      if (recEmail === "iru.xfnite@gmail.com") return;
      apprenticeCounts[recEmail] = 0;
      passerCounts[recEmail] = 0;
      squireCounts[recEmail] = 0;
    });

    filteredUsers.forEach((user) => {
      // A Set of canonical emails, so a recruit pointing at both of someone's emails counts once
      const refs = new Set<string>();
      if (user.refererEmail) refs.add(canonical(user.refererEmail));
      if (user.labelerRefererEmail) refs.add(canonical(user.labelerRefererEmail));
      if (user.linkedRecruiterEmail) refs.add(canonical(user.linkedRecruiterEmail));
      
      const isPasser = (user.role && user.role.toLowerCase() !== "applicant") || (user.status && user.status.toLowerCase().includes("passed"));
      
      const isSquire = (() => {
        const dbTrainings: any = Array.isArray(user.trainings) ? (user.trainings[0] as any)?.trainings || user.trainings : (user.trainings as any)?.trainings;
        if (!Array.isArray(dbTrainings)) return false;

        const getTrainingName = (t: any) => (t.name || t.annotate_sub_project_name || "").toLowerCase();
        const getTrainingStatus = (t: any) => t.trainingStatus || t.training_status_desc || "";

        const lcTarget = dbTrainings.find((t: any) => {
          const n = getTrainingName(t);
          return n.includes("landcover") || n.includes("land cover");
        });
        if (!lcTarget) return false;
        const lcIsPassed = getTrainingStatus(lcTarget) === "STATUS_PASSED";
        const lcPassed = Number(lcTarget.passedTask || lcTarget.passed_task_num || 0);
        let lcTotal = Number(lcTarget.totalTask || lcTarget.total_task || 0);
        if (lcTotal === 0) lcTotal = 18;
        const lcPct = lcTotal > 0 ? Math.round((lcPassed / lcTotal) * 100) : (lcIsPassed ? 100 : 0);
        if (lcPct !== 100) return false;

        const tpTarget = dbTrainings.find((t: any) => {
          const n = getTrainingName(t);
          return n.includes("transportation") || n.includes("transport");
        });
        if (!tpTarget) return false;
        if (getTrainingStatus(tpTarget) !== "STATUS_PASSED") return false;

        return true;
      })();

      refs.forEach(ref => {
        if (apprenticeCounts[ref] !== undefined) {
          apprenticeCounts[ref]++;
          if (isPasser) {
            passerCounts[ref]++;
          }
          if (isSquire) {
            squireCounts[ref]++;
          }
        }
      });
    });

    const rankings = recruiters
      .filter((rec: any) => rec.email.toLowerCase() !== "iru.xfnite@gmail.com")
      .map((rec: any) => ({
        id: rec.email,
        email: rec.email,
        username: rec.name || rec.username || rec.email,
        balance: apprenticeCounts[rec.email.toLowerCase()] || 0,
        passers: passerCounts[rec.email.toLowerCase()] || 0,
        squires: squireCounts[rec.email.toLowerCase()] || 0,
        createdAt: rec.createdAt.toISOString(),
      }))
      .sort((a: any, b: any) => {
        if (b.squires !== a.squires) return b.squires - a.squires;
        if (b.passers !== a.passers) return b.passers - a.passers;
        return b.balance - a.balance;
      })
      .map((item: any, index: number) => ({
        ...item,
        rank: index + 1,
      }));

    return { rankings, availableMonths };
  },
  ['recruiter-leaderboards'],
  { revalidate: 300, tags: ['recruiter-leaderboards'] }
);

export async function getRecruiterLeaderboardsAction(selectedMonth: string) {
  if (!(await getInnerCouncilUser())) return { rankings: [], availableMonths: [] };
  return await getCachedRecruiterLeaderboards(selectedMonth);
}
