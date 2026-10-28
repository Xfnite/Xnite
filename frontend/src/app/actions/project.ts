"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { redis, isRedisReady } from "@/lib/redis";
import { verifySessionToken } from "@/lib/jwt";
import { getSessionUser } from "@/app/actions/auth";
import { getStaffUser } from "@/lib/authGuard";
import { toUserFacingError } from "@/lib/userFacingError";

async function getSessionEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("xnite_session")?.value;
  return sessionToken ? await verifySessionToken(sessionToken) : null;
}

export async function getProjectRulesStatus(): Promise<{
  accepted: boolean;
  progress: {
    currentStep: number;
    maxStepVisited: number;
    videoProgress: Record<string, number>;
    formAnswers: Record<string, string>;
  } | null;
}> {
  const email = await getSessionEmail();
  if (!email) return { accepted: false, progress: null };

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { isRulesAndGuidelinesCompleted: true, onRulesAndGuidelinesProgress: true },
    });
    if (!user) return { accepted: false, progress: null };

    const isDev = process.env.NEXT_PUBLIC_APP_ENV === "development" || (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_APP_ENV !== "production");
    if (user.isRulesAndGuidelinesCompleted || isDev) {
      return { accepted: true, progress: null };
    }

    let redisData = null;
    if (redis && isRedisReady()) {
      try {
        redisData = await redis.get(`project_rules_progress:${email}`);
      } catch {
        // ignore
      }
    }
    
    let progress = null;
    if (redisData) {
      try {
        progress = JSON.parse(redisData);
      } catch {
        // ignore parse errors
      }
    }

    if (!progress && user.onRulesAndGuidelinesProgress) {
      progress = user.onRulesAndGuidelinesProgress as {
        currentStep: number;
        maxStepVisited: number;
        videoProgress: Record<string, number>;
        formAnswers: Record<string, string>;
      };
    }

    return { accepted: false, progress };
  } catch {
    return { accepted: false, progress: null };
  }
}

export async function saveRulesAndGuidelinesProgress(
  progress: {
    currentStep: number;
    maxStepVisited: number;
    videoProgress: Record<string, number>;
    formAnswers: Record<string, string>;
  },
  syncToPostgres: boolean = false
): Promise<{ success: boolean }> {
  const email = await getSessionEmail();
  if (!email) return { success: false };

  try {
    const tasks: Promise<any>[] = [];
    
    if (redis && isRedisReady()) {
      tasks.push(redis.setex(`project_rules_progress:${email}`, 86400 * 7, JSON.stringify(progress)));
    }
    
    if (syncToPostgres) {
      tasks.push(
        prisma.user.update({
          where: { email },
          data: { onRulesAndGuidelinesProgress: progress as any },
        })
      );
    }
    
    await Promise.all(tasks);
    return { success: true };
  } catch (err) {
    console.error("Save progress error:", err);
    return { success: false };
  }
}

export async function acceptProjectRules(): Promise<{ success: boolean; error?: string }> {
  const email = await getSessionEmail();
  if (!email) return { success: false, error: "Not authenticated" };

  try {
    await prisma.user.update({
      where: { email },
      data: { isRulesAndGuidelinesCompleted: true, onRulesAndGuidelinesProgress: Prisma.DbNull },
    });
    
    if (redis && isRedisReady()) {
      try {
        await redis.del(`project_rules_progress:${email}`);
      } catch {}
    }
    
    return { success: true };
  } catch (err: any) {
    return { success: false, error: toUserFacingError(err, "Couldn't save your acceptance of the project rules. Please try again.") };
  }
}

export async function syncUserTrainingsAction(
  trainings: any[]
): Promise<{ success: boolean; error?: string }> {
  const email = await getSessionEmail();
  if (!email) return { success: false, error: "Not authenticated" };

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) return { success: false, error: "User not found" };

    await prisma.training.upsert({
      where: {
        userId: user.id,
      },
      update: {
        trainings: trainings,
      },
      create: {
        userId: user.id,
        trainings: trainings,
      },
    });

    return { success: true };
  } catch (err: any) {
    console.error("Error syncing user trainings:", err);
    return { success: false, error: toUserFacingError(err, "Couldn't sync your trainings. Please try again.") };
  }
}

export async function getUserTrainingsFromDbAction() {
  const email = await getSessionEmail();
  if (!email) return { success: false, error: "Not authenticated" };

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        trainings: true
      }
    });

    if (!user) return { success: false, error: "User not found" };

    const trainingsList = (user.trainings?.trainings as any[]) || [];
    return {
      success: true,
      data: trainingsList
    };
  } catch (err: any) {
    console.error("getUserTrainingsFromDbAction error:", err);
    return { success: false, error: toUserFacingError(err, "Couldn't load your trainings. Please try again.") };
  }
}

export async function getLandCoverProgressAction(): Promise<{
  courseStep: number;
  videoUnlockStatus: Record<string, boolean>;
} | null> {
  const email = await getSessionEmail();
  if (!email) return null;

  try {
    let redisData = null;
    if (redis && isRedisReady()) {
      try {
        redisData = await redis.get(`land_cover_progress:${email}`);
      } catch (err) {
        console.error("Redis get land cover progress error:", err);
      }
    }

    let progress = null;
    if (redisData) {
      try {
        progress = JSON.parse(redisData);
      } catch (err) {
        console.error("Failed to parse redis land cover progress:", err);
      }
    }

    if (!progress) {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { landCoverProgress: true },
      });
      if (user && user.landCoverProgress) {
        progress = user.landCoverProgress as {
          courseStep: number;
          videoUnlockStatus: Record<string, boolean>;
        };

        // Cache back to Redis
        if (redis && isRedisReady()) {
          try {
            await redis.setex(`land_cover_progress:${email}`, 86400 * 7, JSON.stringify(progress));
          } catch (err) {
            console.error("Redis set land cover progress error:", err);
          }
        }
      }
    }

    return progress;
  } catch (err) {
    console.error("Get land cover progress error:", err);
    return null;
  }
}

export async function saveLandCoverProgressAction(
  progress: {
    courseStep: number;
    videoUnlockStatus: Record<string, boolean>;
  },
  syncToPostgres: boolean = false
): Promise<{ success: boolean }> {
  const email = await getSessionEmail();
  if (!email) return { success: false };

  try {
    const tasks: Promise<any>[] = [];

    if (redis && isRedisReady()) {
      tasks.push(
        redis.setex(`land_cover_progress:${email}`, 86400 * 7, JSON.stringify(progress))
      );
    }

    if (syncToPostgres) {
      tasks.push(
        prisma.user.update({
          where: { email },
          data: { landCoverProgress: progress as any },
        })
      );
    }

    await Promise.all(tasks);
    return { success: true };
  } catch (err) {
    console.error("Save land cover progress error:", err);
    return { success: false };
  }
}

export async function getTransportationProgressAction(): Promise<{
  completed: boolean;
} | null> {
  const email = await getSessionEmail();
  if (!email) return null;

  try {
    let redisData = null;
    if (redis && isRedisReady()) {
      try {
        redisData = await redis.get(`transportation_progress:${email}`);
      } catch (err) {
        console.error("Redis get transportation progress error:", err);
      }
    }

    let progress = null;
    if (redisData) {
      try {
        progress = JSON.parse(redisData);
      } catch (err) {
        console.error("Failed to parse redis transportation progress:", err);
      }
    }

    if (!progress) {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { transportationProgress: true },
      });
      if (user && user.transportationProgress) {
        progress = user.transportationProgress as {
          completed: boolean;
        };

        // Cache back to Redis
        if (redis && isRedisReady()) {
          try {
            await redis.setex(`transportation_progress:${email}`, 86400 * 7, JSON.stringify(progress));
          } catch (err) {
            console.error("Redis set transportation progress error:", err);
          }
        }
      }
    }

    return progress;
  } catch (err) {
    console.error("Get transportation progress error:", err);
    return null;
  }
}

export async function saveTransportationProgressAction(
  progress: {
    completed: boolean;
  },
  syncToPostgres: boolean = false
): Promise<{ success: boolean }> {
  const email = await getSessionEmail();
  if (!email) return { success: false };

  try {
    const tasks: Promise<any>[] = [];

    if (redis && isRedisReady()) {
      tasks.push(
        redis.setex(`transportation_progress:${email}`, 86400 * 7, JSON.stringify(progress))
      );
    }

    if (syncToPostgres) {
      tasks.push(
        prisma.user.update({
          where: { email },
          data: { transportationProgress: progress as any },
        })
      );
    }

    await Promise.all(tasks);
    return { success: true };
  } catch (err) {
    console.error("Save transportation progress error:", err);
    return { success: false };
  }
}

export async function cacheGingerDataAction(key: string, data: any): Promise<{ success: boolean }> {
  const email = await getSessionEmail();
  if (!email) return { success: false };

  try {
    if (redis && isRedisReady()) {
      await redis.setex(`ginger_cache_${key}:${email}`, 86400 * 7, JSON.stringify(data));
      return { success: true };
    }
    return { success: false };
  } catch (err) {
    console.error(`Error caching ginger data for key ${key}:`, err);
    return { success: false };
  }
}

export async function getCachedGingerDataAction(key: string): Promise<any | null> {
  const email = await getSessionEmail();
  if (!email) return null;

  try {
    if (redis && isRedisReady()) {
      const data = await redis.get(`ginger_cache_${key}:${email}`);
      if (data) {
        return JSON.parse(data);
      }
    }
    return null;
  } catch (err) {
    console.error(`Error getting cached ginger data for key ${key}:`, err);
    return null;
  }
}

// The platform-wide "allLogs" sample is identical for every user, so share it
// briefly across requests instead of re-reading 5000 rows on every page load.
const ALL_LOGS_TTL_MS = 60 * 1000;
let allLogsCache: { at: number; data: Promise<any[]> } | null = null;

const getRecentPlatformLogs = () => {
  if (allLogsCache && Date.now() - allLogsCache.at < ALL_LOGS_TTL_MS) return allLogsCache.data;
  const data = prisma.workLog.findMany({
    orderBy: { id: "desc" },
    take: 5000,
    // Only the fields the averages/"last updated" consumers read.
    select: {
      id: true,
      ownerName: true,
      projectId: true,
      role: true,
      worktime: true,
      taskNum: true,
      features: true,
      updatedAt: true,
    },
  });
  allLogsCache = { at: Date.now(), data };
  data.catch(() => { allLogsCache = null; });
  return data;
};

type PlatformStat = { overallSpeed: number; overallPace: number };
let platformStatsCache: { source: Promise<any[]>; data: Promise<Record<string, PlatformStat>> } | null = null;

// Platform averages per "projectId_role", worked out from the shared sample the
// same way the performance pop-up used to do it in the browser: latest log per
// owner/project/role, projects 1-5 skipped, the slowest and fastest 10% (at most
// 10 each) trimmed. Recomputed only when the shared sample refreshes.
const getPlatformProjectStats = () => {
  const source = getRecentPlatformLogs();
  if (platformStatsCache && platformStatsCache.source === source) return platformStatsCache.data;

  const data = source.then((logs) => {
    const latest = new Map<string, any>();
    for (const log of logs) {
      if (log.projectId >= 1 && log.projectId <= 5) continue;
      const key = `${log.ownerName}_${log.projectId}_${log.role}`;
      const existing = latest.get(key);
      if (!existing || log.id > existing.id) latest.set(key, log);
    }

    const byPair = new Map<string, any[]>();
    for (const log of latest.values()) {
      const pairKey = `${log.projectId}_${log.role}`;
      const list = byPair.get(pairKey);
      if (list) list.push(log);
      else byPair.set(pairKey, [log]);
    }

    const speed = (l: any) => (l.worktime > 0 ? l.features / l.worktime : 0);
    const stats: Record<string, PlatformStat> = {};
    for (const [pairKey, pairLogs] of byPair) {
      const sorted = pairLogs.slice().sort((a, b) => speed(a) - speed(b));
      const trimCount = Math.min(10, Math.floor(sorted.length * 0.1));
      const kept = trimCount > 0 ? sorted.slice(trimCount, -trimCount) : sorted;
      const worktime = kept.reduce((acc, l) => acc + l.worktime, 0);
      const features = kept.reduce((acc, l) => acc + l.features, 0);
      const tasks = kept.reduce((acc, l) => acc + l.taskNum, 0);
      stats[pairKey] = {
        overallSpeed: worktime > 0 ? features / worktime : 0,
        overallPace: worktime > 0 && tasks > 0 ? (worktime * 60) / tasks : 0,
      };
    }
    return stats;
  });
  platformStatsCache = { source, data };
  return data;
};

// includePlatformStats returns just those averages, so a caller that only needs
// them doesn't have to download the 5000-row sample (includeAllLogs).
export async function getMyPerformanceLogsAction(options: { includeAllLogs?: boolean; includePlatformStats?: boolean } = {}) {
  const { includeAllLogs = true, includePlatformStats = false } = options;
  const user = await getSessionUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const names = [
    user.name?.trim(),
    user.gingerUsername?.trim(),
    (user as any).gingerEmail?.trim(),
    user.email?.trim()
  ].filter(Boolean) as string[];

  try {
    const [myLogs, allLogs, dbUser, platformStats] = await Promise.all([
      prisma.workLog.findMany({
        where: {
          ownerName: {
            in: names,
            mode: "insensitive",
          },
        },
        orderBy: { id: "desc" },
      }),
      includeAllLogs ? getRecentPlatformLogs() : Promise.resolve([]),
      prisma.user.findUnique({
        where: { email: user.email },
        select: { acknowledgedPerformanceAlerts: true }
      }),
      includePlatformStats ? getPlatformProjectStats() : Promise.resolve(undefined),
    ]);

    let ackedAlerts: string[] = [];
    if (dbUser?.acknowledgedPerformanceAlerts) {
      if (Array.isArray(dbUser.acknowledgedPerformanceAlerts)) {
        ackedAlerts = dbUser.acknowledgedPerformanceAlerts as string[];
      } else if (typeof dbUser.acknowledgedPerformanceAlerts === 'string') {
        try {
          const parsed = JSON.parse(dbUser.acknowledgedPerformanceAlerts);
          if (Array.isArray(parsed)) ackedAlerts = parsed;
        } catch (e) {}
      }
    }

    return { success: true, myLogs, allLogs, ackedAlerts, platformStats };
  } catch (err: any) {
    console.error("Error fetching work logs:", err);
    return { success: false, error: toUserFacingError(err, "Couldn't load performance logs. Please try again.") };
  }
}

export async function acknowledgePerformanceAlertAction(alertKey: string) {
  const user = await getSessionUser();
  if (!user) return { success: false, error: "Not authenticated" };

  try {
    const dbUser = await prisma.user.findUnique({
      where: { email: user.email },
      select: { acknowledgedPerformanceAlerts: true }
    });
    
    let ackedAlerts: string[] = [];
    if (dbUser?.acknowledgedPerformanceAlerts) {
      if (Array.isArray(dbUser.acknowledgedPerformanceAlerts)) {
        ackedAlerts = dbUser.acknowledgedPerformanceAlerts as string[];
      } else if (typeof dbUser.acknowledgedPerformanceAlerts === 'string') {
        try {
          const parsed = JSON.parse(dbUser.acknowledgedPerformanceAlerts);
          if (Array.isArray(parsed)) ackedAlerts = parsed;
        } catch (e) {}
      }
    }

    if (!ackedAlerts.includes(alertKey)) {
      ackedAlerts.push(alertKey);
      await prisma.user.update({
        where: { email: user.email },
        data: { acknowledgedPerformanceAlerts: ackedAlerts }
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error("Error saving alert ack:", err);
    return { success: false, error: toUserFacingError(err, "Couldn't dismiss the alert. Please try again.") };
  }
}

export async function acknowledgePerformanceAlertsAction(alertKeys: string[]) {
  const user = await getSessionUser();
  if (!user) return { success: false, error: "Not authenticated" };

  try {
    const dbUser = await prisma.user.findUnique({
      where: { email: user.email },
      select: { acknowledgedPerformanceAlerts: true }
    });
    
    let ackedAlerts: string[] = [];
    if (dbUser?.acknowledgedPerformanceAlerts) {
      if (Array.isArray(dbUser.acknowledgedPerformanceAlerts)) {
        ackedAlerts = dbUser.acknowledgedPerformanceAlerts as string[];
      } else if (typeof dbUser.acknowledgedPerformanceAlerts === 'string') {
        try {
          const parsed = JSON.parse(dbUser.acknowledgedPerformanceAlerts);
          if (Array.isArray(parsed)) ackedAlerts = parsed;
        } catch (e) {}
      }
    }

    let modified = false;
    for (const key of alertKeys) {
      if (!ackedAlerts.includes(key)) {
        ackedAlerts.push(key);
        modified = true;
      }
    }

    if (modified) {
      await prisma.user.update({
        where: { email: user.email },
        data: { acknowledgedPerformanceAlerts: ackedAlerts }
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error("Error saving bulk alert ack:", err);
    return { success: false, error: toUserFacingError(err, "Couldn't dismiss the alerts. Please try again.") };
  }
}

export async function backupUserProjectsAction(projects: any[]) {
  const email = await getSessionEmail();
  if (!email) return { success: false, error: "Not authenticated" };

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });
    if (!user) return { success: false, error: "User not found" };

    if (!Array.isArray(projects) || projects.length === 0) {
      return { success: true };
    }

    const operations = projects.map(async (p) => {
      const projId = String(p.annotate_project_id || p.annotate_id || p.projectId || p.annotate_sub_project_id || p.id || Math.random());
      const name = p.annotate_name || p.annotate_project_name || p.nameDesignation || p.name || p.annotate_sub_project_name || p.project_name || "Unknown Project";
      const status = p.status || (p.is_online === 1 || p.is_online === "1" ? "Running" : "Closed");
      const endDate = p.endDate ? new Date(p.endDate) : (p.end_date ? new Date(p.end_date) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
      const taskNum = Number(p.taskNum || p.task_num || p.statistics?.total_task || p.passed_task_num || 0);
      const registeredHours = Number(p.registeredHours || p.registered_hours || p.statistics?.registered_hours || 0);

      const existing = await prisma.project.findFirst({
        where: {
          userId: user.id,
          projectId: projId,
        }
      });

      if (existing) {
        return prisma.project.update({
          where: { id: existing.id },
          data: {
            nameDesignation: name,
            status: status,
            endDate: endDate,
            taskNum: taskNum,
            registeredHours: registeredHours,
          }
        });
      } else {
        return prisma.project.create({
          data: {
            projectId: projId,
            nameDesignation: name,
            status: status,
            endDate: endDate,
            taskNum: taskNum,
            registeredHours: registeredHours,
            userId: user.id,
          }
        });
      }
    });

    if (projects.length > 0) {
      operations.push(
        prisma.user.update({
          where: { id: user.id },
          data: { hadProjectBefore: true }
        }) as any
      );
    }

    await Promise.all(operations);
    return { success: true };
  } catch (err: any) {
    console.error("backupUserProjectsAction error:", err);
    return { success: false, error: toUserFacingError(err, "Couldn't save projects. Please try again.") };
  }
}

export async function getUserProjectsFromDbAction() {
  const email = await getSessionEmail();
  if (!email) return { success: false, error: "Not authenticated" };

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        projects: {
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!user) return { success: false, error: "User not found" };

    return {
      success: true,
      data: user.projects
    };
  } catch (err: any) {
    console.error("getUserProjectsFromDbAction error:", err);
    return { success: false, error: toUserFacingError(err, "Couldn't load your projects. Please try again.") };
  }
}

export async function backupSoftwareCredentialAction(softwareUid: string, role: string, password?: string) {
  try {
    if (!(await getStaffUser())) return { success: false, error: "Not authorized" };
    if (!softwareUid) return { success: false, error: "softwareUid is required" };

    await prisma.softwareCredential.upsert({
      where: { softwareUid },
      update: {
        role: role || "labeler",
        ...(password ? { password } : {})
      },
      create: {
        softwareUid,
        role: role || "labeler",
        password: password || "password"
      }
    });

    return { success: true };
  } catch (err: any) {
    console.error("backupSoftwareCredentialAction error:", err);
    return { success: false, error: toUserFacingError(err, "Couldn't save the software account. Please try again.") };
  }
}

export async function getUserSoftwareAccountsFromDbAction() {
  const email = await getSessionEmail();
  if (!email) return { success: false, error: "Not authenticated" };

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        email: true,
        name: true,
        role: true,
        gingerEmail: true,
        gingerUsername: true,
        gingerPassword: true,
        labelerId: true,
        labelerPassword: true,
        trainings: true,
      }
    });

    if (!user) return { success: false, error: "User not found" };

    const softwareCredentials = await prisma.softwareCredential.findMany({
      where: {
        OR: [
          ...(user.gingerEmail ? [{ softwareUid: user.gingerEmail }] : []),
          ...(user.gingerUsername ? [{ softwareUid: user.gingerUsername }] : []),
          ...(user.labelerId ? [{ softwareUid: user.labelerId }] : [])
        ]
      }
    });

    return {
      success: true,
      data: {
        user,
        softwareCredentials
      }
    };
  } catch (err: any) {
    console.error("getUserSoftwareAccountsFromDbAction error:", err);
    return { success: false, error: toUserFacingError(err, "Couldn't load your software accounts. Please try again.") };
  }
}

export async function getActiveProjectIdsAction(): Promise<{ success: boolean; data: number[] }> {
  try {
    // 1. Check Redis cache first (from ginger sync)
    const cached = await getCachedGingerDataAction("active_projects");
    if (cached && Array.isArray(cached) && cached.length > 0) {
      const ids = cached
        .map((p: any) => Number(p.annotate_project_id || p.annotate_id || p.projectId || p.id))
        .filter((n: number) => !isNaN(n) && n > 0);
      if (ids.length > 0) {
        return { success: true, data: Array.from(new Set(ids)) };
      }
    }

    // 2. Check Database for ongoing/running projects
    const dbProjects = await prisma.project.findMany({
      where: {
        status: {
          in: ["ongoing", "Ongoing", "ONGOING", "running", "Running", "RUNNING"],
        },
      },
      select: {
        projectId: true,
      },
    });

    if (dbProjects && dbProjects.length > 0) {
      const ids = dbProjects
        .map((p) => Number(p.projectId))
        .filter((n) => !isNaN(n) && n > 0);
      if (ids.length > 0) {
        return { success: true, data: Array.from(new Set(ids)) };
      }
    }

    return { success: true, data: [] };
  } catch (err: any) {
    console.error("getActiveProjectIdsAction error:", err);
    return { success: false, data: [] };
  }
}
