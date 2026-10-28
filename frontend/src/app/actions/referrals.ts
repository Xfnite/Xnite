/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { Prisma } from "@prisma/client";

interface MappedTraining {
  id: string;
  projectId: string;
  name: string;
  projectStatus: string;
  trainingStatus: string;
  passedTask: number;
  totalTask: number;
}

function hasPassedTraining(trainings: MappedTraining[], type: "landcover" | "3d" | "transpo" | "roof"): boolean {
  let target: MappedTraining | undefined;
  if (type === "landcover") {
    target = trainings.find((t) => t.name.toLowerCase().includes("landcover") || t.name.toLowerCase().includes("land cover"));
  } else if (type === "3d") {
    target = trainings.find((t) => t.name.toLowerCase().includes("3d_match") || t.name.toLowerCase().includes("3d match"));
  } else if (type === "transpo") {
    target = trainings.find((t) => t.name.toLowerCase().includes("transportation") || t.name.toLowerCase().includes("transport"));
  } else if (type === "roof") {
    target = trainings.find((t) => t.name.toLowerCase().includes("roof"));
  }

  if (!target) return false;

  const isPassed = target.trainingStatus === "STATUS_PASSED";
  if (type === "transpo" || type === "roof") {
    return isPassed;
  }

  const passed = Number(target.passedTask || 0);
  let total = Number(target.totalTask || 0);
  if (type === "landcover" && total === 0) total = 18;
  if (type === "3d" && total === 0) total = 7;

  const pct = total > 0 ? Math.round((passed / total) * 100) : (isPassed ? 100 : 0);
  return pct === 100;
}

import { prisma } from "@/lib/db";
import { getGroupStaffNamesAction } from "@/app/actions/auth";
import { getAuthedUser, getStaffUser, type AuthedUser } from "@/lib/authGuard";
import { listActiveReferrers } from "@/lib/referrers";
import { getRecruiterEmails, expandAllRecruiterEmails, recruitsOfWhere } from "@/lib/recruits";
import { toUserFacingError } from "@/lib/userFacingError";

// A recruiter's "my recruits" scope is their own email or the recruiter account
// they are linked to (what the applicants/recruits pages send). Anything else
// falls back to their own email, and the role always comes from the database.
function resolveRecruitScope(staff: AuthedUser, requestedEmail?: string) {
  const allowed = [staff.email, staff.linkedRecruiterEmail]
    .filter((e): e is string => !!e)
    .map((e) => e.toLowerCase());
  const currentUserEmail = requestedEmail && allowed.includes(requestedEmail.toLowerCase()) ? requestedEmail : staff.email;
  return { currentUserEmail, currentUserRole: staff.role ?? undefined };
}

// Date Started "custom" range. The client sends exact ISO times for the picked days in the
// viewer's timezone, so the server's own timezone doesn't matter. Invalid values are ignored.
function customCreatedAtRange(createdFrom?: string, createdTo?: string): { gte?: Date; lte?: Date } | null {
  const from = createdFrom ? new Date(createdFrom) : null;
  const to = createdTo ? new Date(createdTo) : null;
  const range: { gte?: Date; lte?: Date } = {};
  if (from && !isNaN(from.getTime())) range.gte = from;
  if (to && !isNaN(to.getTime())) range.lte = to;
  return range.gte || range.lte ? range : null;
}

export async function getReferralsAction(): Promise<{ success: boolean; data?: any[]; error?: string }> {
  if (!(await getAuthedUser())) return { success: false, error: "Not authorized" };
  return listActiveReferrers();
}

export async function getGroupsListAction() {
  try {
    if (!(await getStaffUser())) return { success: false, error: "Not authorized" };
    const groups = await prisma.group.findMany({
      select: { groupId: true, groupName: true },
      orderBy: { groupName: "asc" },
    });

    return { success: true, data: groups };
  } catch (error) {
    console.error("Error fetching groups list:", error);
    return {
      success: false,
      error: toUserFacingError(error, "Couldn't load groups. Please refresh the page."),
    };
  }
}

export async function getRecruiterDetailsAction(email: string) {
  try {
    if (!(await getStaffUser())) return { success: false, error: "Not authorized" };
    const referal = await prisma.referal.findUnique({
      where: { email },
      select: {
        code: true,
        status: true,
        howManyUse: true,
        name: true,
      },
    });

    return { success: true, data: referal };
  } catch (error) {
    console.error("Error fetching recruiter details:", error);
    return {
      success: false,
      error: toUserFacingError(error, "Couldn't load recruiter details. Please refresh the page."),
    };
  }
}


async function attachLabelerNames(users: any[]) {
  const emailsToFetch = new Set<string>();
  users.forEach((u) => {
    if (u.labelerRefererEmail) emailsToFetch.add(u.labelerRefererEmail);
    if (u.refererEmail) emailsToFetch.add(u.refererEmail);
  });

  if (emailsToFetch.size === 0) {
    return users.map((u) => ({
      ...u,
      labelerRefererName: null,
      labelerRefererFacebook: null,
      resolvedRefererName: null,
      resolvedRefererFacebook: null,
    }));
  }

  const [labelers, referals] = await Promise.all([
    prisma.user.findMany({
      where: { email: { in: Array.from(emailsToFetch) } },
      select: { email: true, name: true, firstName: true, lastName: true, gingerUsername: true, facebook: true },
    }),
    prisma.referal.findMany({
      where: { email: { in: Array.from(emailsToFetch) } },
      select: { email: true, name: true, username: true },
    })
  ]);

  const nameByEmail = new Map<string, string>();
  const facebookByEmail = new Map<string, string>();

  // Fallback 1: Referal table
  referals.forEach((r) => {
    if (r.name) nameByEmail.set(r.email, r.name);
    else if (r.username) nameByEmail.set(r.email, r.username);
  });

  // Fallback 2: User table (higher priority)
  labelers.forEach((l) => {
    let name = l.name;
    if (l.firstName && l.lastName) {
      name = l.firstName + ' ' + l.lastName;
    } else if (l.gingerUsername) {
      name = l.gingerUsername;
    }
    
    // Only overwrite if it's a real name or we don't have one yet
    if (name && (!name.includes('@') || !nameByEmail.has(l.email))) {
      nameByEmail.set(l.email, name);
    }

    if (l.facebook) {
      facebookByEmail.set(l.email, l.facebook);
    }
  });

  const formatName = (email: string) => {
    const found = nameByEmail.get(email);
    if (found && !found.includes("@")) return found;
    return email.split("@")[0]; // Fallback to stripping the domain from the email
  };

  return users.map((u) => ({
    ...u,
    labelerRefererName: u.labelerRefererEmail ? formatName(u.labelerRefererEmail) : null,
    labelerRefererFacebook: u.labelerRefererEmail ? (facebookByEmail.get(u.labelerRefererEmail) || null) : null,
    resolvedRefererName: u.refererEmail ? formatName(u.refererEmail) : null,
    resolvedRefererFacebook: u.refererEmail ? (facebookByEmail.get(u.refererEmail) || null) : null,
  }));
}

function formatUserTrainings(users: any[]) {
  return users.map((user) => {
    const dbTrainingRecord = Array.isArray(user.trainings) ? user.trainings[0] : user.trainings;
    const trainingArray = (dbTrainingRecord?.trainings as any[]) || [];
    const mappedTrainings = trainingArray.map((t: any, index: number) => ({
      id: `${dbTrainingRecord?.id || user.id}-${index}`,
      projectId: String(t.projectId || t.annotate_project_id || t.annotate_sub_project_id || ""),
      name: t.name || t.annotate_sub_project_name || "",
      projectStatus: t.projectStatus || (t.is_online === 1 ? "Running" : "Closed"),
      trainingStatus: t.trainingStatus || t.training_status_desc || "",
      passedTask: Number(t.passedTask ?? t.passed_task_num ?? 0),
      totalTask: Number(t.totalTask ?? t.total_task ?? 0),
    }));
    return {
      ...user,
      trainings: mappedTrainings,
    };
  });
}

// User.group_id / team_id have no Prisma relation to Group, so resolve names manually.
// When a user has both a group and a team, the group name takes priority.
async function attachGroupOrTeamNames(users: any[]) {
  const ids = new Set<number>();
  users.forEach((u) => {
    if (u.group_id != null && u.group_id !== 0 && u.group_id !== -1) ids.add(u.group_id);
    if (u.team_id != null && u.team_id !== 0 && u.team_id !== -1) ids.add(u.team_id);
  });

  if (ids.size === 0) {
    return users.map((u) => ({
      ...u,
      groupOrTeamName: null,
      checkerName: null,
      checkerFacebook: null,
      checkerPhone: null,
      judgerName: null,
      judgerFacebook: null,
      judgerPhone: null,
    }));
  }

  // Fetch all groups/teams by groupId
  const groups = await prisma.group.findMany({
    where: { groupId: { in: Array.from(ids) } },
    select: { groupId: true, groupName: true, groupType: true, checkerName: true, judgerName: true, parentGroupId: true },
  });

  // If some parentGroupIds are not already in our groups query, we need to fetch them too!
  const parentIdsToFetch = new Set<number>();
  groups.forEach((g) => {
    if (g.parentGroupId != null && g.parentGroupId !== 0 && !groups.some((existing) => existing.groupId === g.parentGroupId)) {
      parentIdsToFetch.add(g.parentGroupId);
    }
  });

  if (parentIdsToFetch.size > 0) {
    const parentGroups = await prisma.group.findMany({
      where: { groupId: { in: Array.from(parentIdsToFetch) } },
      select: { groupId: true, groupName: true, groupType: true, checkerName: true, judgerName: true, parentGroupId: true },
    });
    groups.push(...parentGroups);
  }

  // Fetch contact details (Facebook and Phone) for all checkers and judgers from User table
  const usernames = new Set<string>();
  groups.forEach((g) => {
    if (g.checkerName) usernames.add(g.checkerName.trim().toLowerCase());
    if (g.judgerName) usernames.add(g.judgerName.trim().toLowerCase());
  });

  let userDetailsMap = new Map<string, { name: string; facebook: string | null; phone: string | null }>();

  if (usernames.size > 0) {
    const dbUsers = await prisma.user.findMany({
      where: {
        OR: [
          { gingerUsername: { in: Array.from(usernames), mode: "insensitive" } },
          { username: { in: Array.from(usernames), mode: "insensitive" } }
        ]
      },
      select: { name: true, username: true, gingerUsername: true, facebook: true, phone: true }
    });

    dbUsers.forEach((u) => {
      if (u.gingerUsername) {
        userDetailsMap.set(u.gingerUsername.trim().toLowerCase(), { name: u.name, facebook: u.facebook, phone: u.phone });
      }
      if (u.username) {
        userDetailsMap.set(u.username.trim().toLowerCase(), { name: u.name, facebook: u.facebook, phone: u.phone });
      }
    });
  }

  const groupMap = new Map(groups.map((g) => [g.groupId, g]));

  return users.map((u) => {
    const validGroupId = u.group_id != null && u.group_id !== 0 && u.group_id !== -1 ? u.group_id : null;
    const validTeamId = u.team_id != null && u.team_id !== 0 && u.team_id !== -1 ? u.team_id : null;
    
    let groupOrTeamName: string | null = null;
    let checkerName: string | null = null;
    let checkerFacebook: string | null = null;
    let checkerPhone: string | null = null;
    let judgerName: string | null = null;
    let judgerFacebook: string | null = null;
    let judgerPhone: string | null = null;

    if (validGroupId) {
      const groupRecord = groupMap.get(validGroupId);
      if (groupRecord) {
        groupOrTeamName = groupRecord.groupName;
        checkerName = groupRecord.checkerName;
        
        if (checkerName) {
          const details = userDetailsMap.get(checkerName.trim().toLowerCase());
          if (details) {
            checkerName = details.name || checkerName;
            checkerFacebook = details.facebook;
            checkerPhone = details.phone;
          }
        }

        // Resolve judger from parent team first
        if (groupRecord.parentGroupId != null) {
          const parentRecord = groupMap.get(groupRecord.parentGroupId);
          if (parentRecord) {
            judgerName = parentRecord.judgerName;
            if (judgerName) {
              const details = userDetailsMap.get(judgerName.trim().toLowerCase());
              if (details) {
                judgerName = details.name || judgerName;
                judgerFacebook = details.facebook;
                judgerPhone = details.phone;
              }
            }
          }
        }
      }
    }

    // Fallbacks if not resolved by group_id (e.g. if the user only has team_id, or parentGroupId was not linked)
    if (validTeamId) {
      const teamRecord = groupMap.get(validTeamId);
      if (teamRecord) {
        if (!groupOrTeamName) {
          groupOrTeamName = teamRecord.groupName;
        }
        if (!judgerName) {
          judgerName = teamRecord.judgerName;
          if (judgerName) {
            const details = userDetailsMap.get(judgerName.trim().toLowerCase());
            if (details) {
              judgerName = details.name || judgerName;
              judgerFacebook = details.facebook;
              judgerPhone = details.phone;
            }
          }
        }
      }
    }

    return {
      ...u,
      groupOrTeamName,
      checkerName,
      checkerFacebook,
      checkerPhone,
      judgerName,
      judgerFacebook,
      judgerPhone,
    };
  });
}


export async function getRecruitedUsersAction(recruiterEmail: string) {
  try {
    if (!(await getStaffUser())) return { success: false, error: "Not authorized" };
    const recruited = await prisma.user.findMany({
      where: {
        refererEmail: recruiterEmail,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        isRegistered: true,
        hasCompletedPreCourse: true,
        isDashboardCompleted: true,
        lastLogin: true,
        refererEmail: true,
        labelerRefererEmail: true,
        referer: {
          select: {
            name: true,
          },
        },
        onboardingProgress: true,
        isRulesAndGuidelinesCompleted: true,
        onRulesAndGuidelinesProgress: true,
        facebook: true,
        gingerUsername: true,
        trainings: {
          select: {
            id: true,
            trainings: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return { success: true, data: await attachLabelerNames(formatUserTrainings(recruited)) };
  } catch (error) {
    console.error("Error fetching recruited users:", error);
    return {
      success: false,
      error: toUserFacingError(error, "Couldn't load your recruits. Please refresh the page."),
    };
  }
}

export async function getAllUsersAction() {
  try {
    if (!(await getStaffUser())) return { success: false, error: "Not authorized" };
    const users = await prisma.user.findMany({
      select: {
        id: true,
        createdAt: true,
        refererEmail: true,
        labelerRefererEmail: true,
        linkedRecruiterEmail: true,
        role: true,
        status: true,
        trainings: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return { success: true, data: users };
  } catch (error) {
    console.error("Error fetching all users:", error);
    return {
      success: false,
      error: toUserFacingError(error, "Couldn't load users. Please refresh the page."),
    };
  }
}

export interface GetPaginatedUsersParams {
  page: number;
  limit: number;
  searchQuery?: string;
  selectedRecruiters?: string[];
  selectedStatuses?: string[];
  selectedGroups?: number[];
  dateFilter?: string;
  onlyMyRecruits?: boolean;
  currentUserEmail?: string;
  currentUserRole?: string;
  selectedRoles?: string[];
  missingQrCode?: boolean;
  hasPaymentDetails?: boolean;
  selectedUserStatuses?: string[];
  // dateFilter "custom": start of the first / end of the last picked day, as ISO times
  createdFrom?: string;
  createdTo?: string;
}

export async function getPaginatedUsersAction(params: GetPaginatedUsersParams) {
  try {
    const staff = await getStaffUser();
    if (!staff) return { success: false, error: "Not authorized" };

    const {
      page,
      limit,
      searchQuery,
      selectedRecruiters = [],
      selectedStatuses = [],
      selectedGroups = [],
      dateFilter = "all",
      onlyMyRecruits = false,
      currentUserEmail: requestedUserEmail,
      selectedRoles = [],
      missingQrCode = false,
      hasPaymentDetails = false,
      selectedUserStatuses = [],
      createdFrom,
      createdTo
    } = params;

    // Role and "my recruits" email come from the session, not the client.
    const { currentUserEmail, currentUserRole } = resolveRecruitScope(staff, requestedUserEmail);
    const isAdmin = currentUserRole?.toLowerCase() === "admin";
    // Account status (filter and counts): admins always; other roles only on their "my recruits"
    // list (My Apprentices), i.e. whatever the recruits filter below gives them.
    const canSeeAccountStatus = isAdmin || onlyMyRecruits;

    const skip = (page - 1) * limit;

    const whereClause: Prisma.UserWhereInput = {};

    // Search query
    if (searchQuery && searchQuery.trim()) {
      const searchTerms = searchQuery.trim().split(/\s+/).filter(Boolean);
      if (searchTerms.length > 0) {
        whereClause.OR = searchTerms.flatMap((term) => [
          { name: { contains: term, mode: "insensitive" } },
          { email: { contains: term, mode: "insensitive" } },
          { username: { contains: term, mode: "insensitive" } },
          { gingerUsername: { contains: term, mode: "insensitive" } },
          { facebook: { contains: term, mode: "insensitive" } },
        ]);
      }
    }

    // Role / Recruiter filter
    if (onlyMyRecruits && currentUserEmail) {
      const myRecruitsCondition: Prisma.UserWhereInput = currentUserRole !== "admin" && currentUserRole !== "judger"
        ? recruitsOfWhere(await getRecruiterEmails(staff.email))
        : { OR: [{ refererEmail: { not: null } }, { labelerRefererEmail: { not: null } }] };

      if (whereClause.AND) {
        whereClause.AND = [...(whereClause.AND as Prisma.UserWhereInput[]), myRecruitsCondition];
      } else if (whereClause.OR) {
        whereClause.AND = [{ OR: whereClause.OR }, myRecruitsCondition];
        delete whereClause.OR;
      } else {
        whereClause.AND = [myRecruitsCondition];
      }
    } else if (selectedRecruiters.length > 0) {
      const conditions: Prisma.UserWhereInput[] = [];
      const rawEmails = selectedRecruiters.filter(r => r !== "organic");
      if (rawEmails.length > 0) {
        const emails = await expandAllRecruiterEmails(rawEmails);
        conditions.push({
          OR: [
            { refererEmail: { in: emails }, labelerRefererEmail: null },
            { labelerRefererEmail: { in: emails } }
          ]
        });
      }
      if (selectedRecruiters.includes("organic")) {
        conditions.push({ refererEmail: null, labelerRefererEmail: null });
      }

      if (conditions.length > 0) {
        if (whereClause.AND) {
          whereClause.AND = [...(whereClause.AND as Prisma.UserWhereInput[]), { OR: conditions }];
        } else if (whereClause.OR) {
          whereClause.AND = [{ OR: whereClause.OR }, { OR: conditions }];
          delete whereClause.OR;
        } else {
          whereClause.AND = [{ OR: conditions }];
        }
      }
    }

    // Group / Team filter
    if (selectedGroups.length > 0) {
      const groupCondition: Prisma.UserWhereInput = {
        OR: [
          { group_id: { in: selectedGroups } },
          { team_id: { in: selectedGroups } },
        ],
      };
      if (whereClause.AND) {
        whereClause.AND = [...(whereClause.AND as Prisma.UserWhereInput[]), groupCondition];
      } else if (whereClause.OR) {
        whereClause.AND = [{ OR: whereClause.OR }, groupCondition];
        delete whereClause.OR;
      } else {
        whereClause.AND = [groupCondition];
      }
    }

    // Status filter
    if (selectedStatuses.length > 0) {
      if (selectedStatuses.includes("onboarding")) {
        whereClause.isDashboardCompleted = true;
      }
      if (selectedStatuses.includes("rules")) {
        whereClause.isRulesAndGuidelinesCompleted = true;
      }

      const trainFilters = selectedStatuses.filter(s => s.startsWith("train_"));
      if (trainFilters.length > 0) {
        let conditions: string[] = [];
        if (trainFilters.includes("train_landcover")) {
          conditions.push(`(t.value->>'name' ILIKE '%land cover%' OR t.value->>'name' ILIKE '%landcover%') AND (t.value->>'trainingStatus' = 'STATUS_PASSED' OR t.value->>'training_status_desc' = 'STATUS_PASSED')`);
        }
        if (trainFilters.includes("train_transpo")) {
          conditions.push(`(t.value->>'name' ILIKE '%transportation%' OR t.value->>'name' ILIKE '%transport%') AND (t.value->>'trainingStatus' = 'STATUS_PASSED' OR t.value->>'training_status_desc' = 'STATUS_PASSED')`);
        }
        if (trainFilters.includes("train_3d")) {
          conditions.push(`(t.value->>'name' ILIKE '%3d_match%' OR t.value->>'name' ILIKE '%3d match%') AND (t.value->>'trainingStatus' = 'STATUS_PASSED' OR t.value->>'training_status_desc' = 'STATUS_PASSED')`);
        }
        if (trainFilters.includes("train_roof")) {
          conditions.push(`(t.value->>'name' ILIKE '%roof%') AND (t.value->>'trainingStatus' = 'STATUS_PASSED' OR t.value->>'training_status_desc' = 'STATUS_PASSED')`);
        }

        if (conditions.length > 0) {
          try {
            const conditionsSql = conditions.map(c => `(${c})`).join(" OR ");
            const rawSql = `SELECT DISTINCT "userId" FROM "Training", unnest("trainings") as t(value) WHERE ${conditionsSql}`;
            
            const result = await prisma.$queryRawUnsafe<{userId: string}[]>(rawSql);
            const matchingUserIds = result.map(r => r.userId);

            if (whereClause.id) {
               if (typeof whereClause.id === "object" && whereClause.id.in && Array.isArray(whereClause.id.in)) {
                   const existingIn = whereClause.id.in;
                   whereClause.id.in = matchingUserIds.filter(id => existingIn.includes(id));
               }
            } else {
               whereClause.id = { in: matchingUserIds };
            }
          } catch (e) {
            console.error("Error filtering by training:", e);
          }
        }
      }
    }

    // Role filter
    if (selectedRoles.length > 0) {
      const roleCondition: Prisma.UserWhereInput = {
        role: { in: selectedRoles }
      };
      if (whereClause.AND) {
        whereClause.AND = [...(whereClause.AND as Prisma.UserWhereInput[]), roleCondition];
      } else if (whereClause.OR) {
        whereClause.AND = [{ OR: whereClause.OR }, roleCondition];
        delete whereClause.OR;
      } else {
        whereClause.AND = [roleCondition];
      }
    }

    // User Status filter
    if (canSeeAccountStatus && selectedUserStatuses.length > 0) {
      const statusCondition: Prisma.UserWhereInput = {
        status: { in: selectedUserStatuses }
      };
      if (whereClause.AND) {
        whereClause.AND = [...(whereClause.AND as Prisma.UserWhereInput[]), statusCondition];
      } else if (whereClause.OR) {
        whereClause.AND = [{ OR: whereClause.OR }, statusCondition];
        delete whereClause.OR;
      } else {
        whereClause.AND = [statusCondition];
      }
    }

    // Has Payment Details filter
    if (hasPaymentDetails) {
      const paymentCondition: Prisma.UserWhereInput = {
        paymentDetails: { isNot: null }
      };
      if (whereClause.AND) {
         whereClause.AND = [...(whereClause.AND as Prisma.UserWhereInput[]), paymentCondition];
      } else if (whereClause.OR) {
         whereClause.AND = [{ OR: whereClause.OR }, paymentCondition];
         delete whereClause.OR;
      } else {
         whereClause.AND = [paymentCondition];
      }
    }

    // Missing QR Code filter
    if (missingQrCode) {
      const qrCondition: Prisma.UserWhereInput = {
        OR: [
          { paymentDetails: null },
          { paymentDetails: { qrImageUrl: null } },
          { paymentDetails: { qrImageUrl: "" } }
        ]
      };
      if (whereClause.AND) {
         whereClause.AND = [...(whereClause.AND as Prisma.UserWhereInput[]), qrCondition];
      } else if (whereClause.OR) {
         whereClause.AND = [{ OR: whereClause.OR }, qrCondition];
         delete whereClause.OR;
      } else {
         whereClause.AND = [qrCondition];
      }
    }

    // Date Started filter
    if (dateFilter !== "all") {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        
        if (dateFilter === "today") {
            whereClause.createdAt = { gte: todayStart };
        } else if (dateFilter === "yesterday") {
            whereClause.createdAt = { gte: yesterdayStart, lt: todayStart };
        } else if (dateFilter === "week") {
            const limitTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            whereClause.createdAt = { gte: limitTime };
        } else if (dateFilter === "month") {
            const limitTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            whereClause.createdAt = { gte: limitTime };
        } else if (dateFilter === "three_months") {
            const limitTime = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            whereClause.createdAt = { gte: limitTime };
        } else if (dateFilter === "custom") {
            const range = customCreatedAtRange(createdFrom, createdTo);
            if (range) whereClause.createdAt = range;
        }
    }

    const trainingFilters = selectedStatuses.filter((s) =>
      ["landcover_passed", "3d_passed", "transpo_passed", "roof_passed"].includes(s)
    );
    const hasTrainingFilter = trainingFilters.length > 0;

    if (hasTrainingFilter) {
      const users = await prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          role: true,
          createdAt: true,
          isRegistered: true,
          hasCompletedPreCourse: true,
          isDashboardCompleted: true,
          lastLogin: true,
          refererEmail: true,
        labelerRefererEmail: true,
          referer: { select: { name: true } },
          onboardingProgress: true,
          isRulesAndGuidelinesCompleted: true,
          onRulesAndGuidelinesProgress: true,
          facebook: true,
          phone: true,
          gingerUsername: true,
          group_id: true,
          team_id: true,
          trainings: { select: { id: true, trainings: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      let formattedUsers = formatUserTrainings(users);
      formattedUsers = formattedUsers.filter((user) => {
        return trainingFilters.every((filter) => {
          const tList = (user.trainings as MappedTraining[]) || [];
          if (filter === "landcover_passed") {
            return hasPassedTraining(tList, "landcover");
          }
          if (filter === "3d_passed") {
            return hasPassedTraining(tList, "3d");
          }
          if (filter === "transpo_passed") {
            return hasPassedTraining(tList, "transpo");
          }
          if (filter === "roof_passed") {
            return hasPassedTraining(tList, "roof");
          }
          return true;
        });
      });

      const total = formattedUsers.length;
      const totalOnboarding = formattedUsers.filter((u) => u.isDashboardCompleted).length;
      const totalRules = formattedUsers.filter((u) => u.isRulesAndGuidelinesCompleted).length;
      const totalDeactivated = canSeeAccountStatus ? formattedUsers.filter((u) => u.status === "Deactivated").length : null;
      const totalActive = canSeeAccountStatus ? formattedUsers.filter((u) => u.status === "Active").length : null;
      const data = await attachLabelerNames(await attachGroupOrTeamNames(formattedUsers.slice(skip, skip + limit)));
      return { success: true, data, total, totalOnboarding, totalRules, totalDeactivated, totalActive };
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        role: true,
        createdAt: true,
        isRegistered: true,
        hasCompletedPreCourse: true,
        isDashboardCompleted: true,
        lastLogin: true,
        refererEmail: true,
        labelerRefererEmail: true,
        referer: { select: { name: true } },
        onboardingProgress: true,
        isRulesAndGuidelinesCompleted: true,
        onRulesAndGuidelinesProgress: true,
        facebook: true,
        phone: true,
        gingerUsername: true,
        group_id: true,
        team_id: true,
        trainings: { select: { id: true, trainings: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    // The Account Status filter lives in whereClause.AND, so adding status here only narrows it further.
    const [total, totalOnboarding, totalRules, totalDeactivated, totalActive] = await Promise.all([
      prisma.user.count({ where: whereClause }),
      prisma.user.count({ where: { ...whereClause, isDashboardCompleted: true } }),
      prisma.user.count({ where: { ...whereClause, isRulesAndGuidelinesCompleted: true } }),
      canSeeAccountStatus ? prisma.user.count({ where: { ...whereClause, status: "Deactivated" } }) : null,
      canSeeAccountStatus ? prisma.user.count({ where: { ...whereClause, status: "Active" } }) : null,
    ]);
    const data = await attachLabelerNames(await attachGroupOrTeamNames(formatUserTrainings(users)));
    return { success: true, data, total, totalOnboarding, totalRules, totalDeactivated, totalActive };
  } catch (error) {
    console.error("Error fetching paginated users:", error);
    return { success: false, error: toUserFacingError(error, "Something went wrong while loading users. Please refresh the page. If it keeps happening, contact an admin.") };
  }
}

export interface GetExportUsersParams {
  searchQuery?: string;
  selectedRecruiters?: string[];
  selectedStatuses?: string[];
  selectedGroups?: number[];
  dateFilter?: string;
  onlyMyRecruits?: boolean;
  currentUserEmail?: string;
  currentUserRole?: string;
  selectedRoles?: string[];
  missingQrCode?: boolean;
  hasPaymentDetails?: boolean;
  selectedUserStatuses?: string[];
  // dateFilter "custom": start of the first / end of the last picked day, as ISO times
  createdFrom?: string;
  createdTo?: string;
}

export async function getFilteredUsersForExportAction(params: GetExportUsersParams) {
  try {
    const staff = await getStaffUser();
    if (!staff) return { success: false, error: "Not authorized" };

    const {
      searchQuery,
      selectedRecruiters = [],
      selectedStatuses = [],
      selectedGroups = [],
      dateFilter = "all",
      onlyMyRecruits = false,
      currentUserEmail: requestedUserEmail,
      selectedRoles = [],
      missingQrCode = false,
      hasPaymentDetails = false,
      selectedUserStatuses = [],
      createdFrom,
      createdTo
    } = params;

    // Role and "my recruits" email come from the session, not the client.
    const { currentUserEmail, currentUserRole } = resolveRecruitScope(staff, requestedUserEmail);
    const isAdmin = currentUserRole?.toLowerCase() === "admin";
    // Account status (filter and counts): admins always; other roles only on their "my recruits"
    // list (My Apprentices), i.e. whatever the recruits filter below gives them.
    const canSeeAccountStatus = isAdmin || onlyMyRecruits;

    const whereClause: Prisma.UserWhereInput = {};

    // Search query
    if (searchQuery && searchQuery.trim()) {
      const searchTerms = searchQuery.trim().split(/\s+/).filter(Boolean);
      if (searchTerms.length > 0) {
        whereClause.OR = searchTerms.flatMap((term) => [
          { name: { contains: term, mode: "insensitive" } },
          { email: { contains: term, mode: "insensitive" } },
          { username: { contains: term, mode: "insensitive" } },
          { gingerUsername: { contains: term, mode: "insensitive" } },
          { facebook: { contains: term, mode: "insensitive" } },
        ]);
      }
    }

    // Role / Recruiter filter
    if (onlyMyRecruits && currentUserEmail) {
      const myRecruitsCondition: Prisma.UserWhereInput = currentUserRole !== "admin" && currentUserRole !== "judger"
        ? recruitsOfWhere(await getRecruiterEmails(staff.email))
        : { OR: [{ refererEmail: { not: null } }, { labelerRefererEmail: { not: null } }] };

      if (whereClause.AND) {
        whereClause.AND = [...(whereClause.AND as Prisma.UserWhereInput[]), myRecruitsCondition];
      } else if (whereClause.OR) {
        whereClause.AND = [{ OR: whereClause.OR }, myRecruitsCondition];
        delete whereClause.OR;
      } else {
        whereClause.AND = [myRecruitsCondition];
      }
    } else if (selectedRecruiters.length > 0) {
      const conditions: Prisma.UserWhereInput[] = [];
      const rawEmails = selectedRecruiters.filter(r => r !== "organic");
      if (rawEmails.length > 0) {
        const emails = await expandAllRecruiterEmails(rawEmails);
        conditions.push({
          OR: [
            { refererEmail: { in: emails }, labelerRefererEmail: null },
            { labelerRefererEmail: { in: emails } }
          ]
        });
      }
      if (selectedRecruiters.includes("organic")) {
        conditions.push({ refererEmail: null, labelerRefererEmail: null });
      }

      if (conditions.length > 0) {
        if (whereClause.AND) {
          whereClause.AND = [...(whereClause.AND as Prisma.UserWhereInput[]), { OR: conditions }];
        } else if (whereClause.OR) {
          whereClause.AND = [{ OR: whereClause.OR }, { OR: conditions }];
          delete whereClause.OR;
        } else {
          whereClause.AND = [{ OR: conditions }];
        }
      }
    }

    // Group / Team filter
    if (selectedGroups.length > 0) {
      const groupCondition: Prisma.UserWhereInput = {
        OR: [
          { group_id: { in: selectedGroups } },
          { team_id: { in: selectedGroups } },
        ],
      };
      if (whereClause.AND) {
        whereClause.AND = [...(whereClause.AND as Prisma.UserWhereInput[]), groupCondition];
      } else if (whereClause.OR) {
        whereClause.AND = [{ OR: whereClause.OR }, groupCondition];
        delete whereClause.OR;
      } else {
        whereClause.AND = [groupCondition];
      }
    }

    // Status filter
    if (selectedStatuses.length > 0) {
      if (selectedStatuses.includes("onboarding")) {
        whereClause.isDashboardCompleted = true;
      }
      if (selectedStatuses.includes("rules")) {
        whereClause.isRulesAndGuidelinesCompleted = true;
      }

      const trainFilters = selectedStatuses.filter(s => s.startsWith("train_"));
      if (trainFilters.length > 0) {
        let conditions: string[] = [];
        if (trainFilters.includes("train_landcover")) {
          conditions.push(`(t.value->>'name' ILIKE '%land cover%' OR t.value->>'name' ILIKE '%landcover%') AND (t.value->>'trainingStatus' = 'STATUS_PASSED' OR t.value->>'training_status_desc' = 'STATUS_PASSED')`);
        }
        if (trainFilters.includes("train_transpo")) {
          conditions.push(`(t.value->>'name' ILIKE '%transportation%' OR t.value->>'name' ILIKE '%transport%') AND (t.value->>'trainingStatus' = 'STATUS_PASSED' OR t.value->>'training_status_desc' = 'STATUS_PASSED')`);
        }
        if (trainFilters.includes("train_3d")) {
          conditions.push(`(t.value->>'name' ILIKE '%3d_match%' OR t.value->>'name' ILIKE '%3d match%') AND (t.value->>'trainingStatus' = 'STATUS_PASSED' OR t.value->>'training_status_desc' = 'STATUS_PASSED')`);
        }
        if (trainFilters.includes("train_roof")) {
          conditions.push(`(t.value->>'name' ILIKE '%roof%') AND (t.value->>'trainingStatus' = 'STATUS_PASSED' OR t.value->>'training_status_desc' = 'STATUS_PASSED')`);
        }

        if (conditions.length > 0) {
          try {
            const conditionsSql = conditions.map(c => `(${c})`).join(" OR ");
            const rawSql = `SELECT DISTINCT "userId" FROM "Training", unnest("trainings") as t(value) WHERE ${conditionsSql}`;
            
            const result = await prisma.$queryRawUnsafe<{userId: string}[]>(rawSql);
            const matchingUserIds = result.map(r => r.userId);

            if (whereClause.id) {
               if (typeof whereClause.id === "object" && whereClause.id.in && Array.isArray(whereClause.id.in)) {
                   const existingIn = whereClause.id.in;
                   whereClause.id.in = matchingUserIds.filter(id => existingIn.includes(id));
               }
            } else {
               whereClause.id = { in: matchingUserIds };
            }
          } catch (e) {
            console.error("Error filtering by training for export:", e);
          }
        }
      }
    }

    // Role filter
    if (selectedRoles.length > 0) {
      const roleCondition: Prisma.UserWhereInput = {
        role: { in: selectedRoles }
      };
      if (whereClause.AND) {
        whereClause.AND = [...(whereClause.AND as Prisma.UserWhereInput[]), roleCondition];
      } else if (whereClause.OR) {
        whereClause.AND = [{ OR: whereClause.OR }, roleCondition];
        delete whereClause.OR;
      } else {
        whereClause.AND = [roleCondition];
      }
    }

    // User Status filter
    if (canSeeAccountStatus && selectedUserStatuses.length > 0) {
      const statusCondition: Prisma.UserWhereInput = {
        status: { in: selectedUserStatuses }
      };
      if (whereClause.AND) {
        whereClause.AND = [...(whereClause.AND as Prisma.UserWhereInput[]), statusCondition];
      } else if (whereClause.OR) {
        whereClause.AND = [{ OR: whereClause.OR }, statusCondition];
        delete whereClause.OR;
      } else {
        whereClause.AND = [statusCondition];
      }
    }

    // Has Payment Details filter
    if (hasPaymentDetails) {
      const paymentCondition: Prisma.UserWhereInput = {
        paymentDetails: { isNot: null }
      };
      if (whereClause.AND) {
         whereClause.AND = [...(whereClause.AND as Prisma.UserWhereInput[]), paymentCondition];
      } else if (whereClause.OR) {
         whereClause.AND = [{ OR: whereClause.OR }, paymentCondition];
         delete whereClause.OR;
      } else {
         whereClause.AND = [paymentCondition];
      }
    }

    // Missing QR Code filter
    if (missingQrCode) {
      const qrCondition: Prisma.UserWhereInput = {
        OR: [
          { paymentDetails: null },
          { paymentDetails: { qrImageUrl: null } },
          { paymentDetails: { qrImageUrl: "" } }
        ]
      };
      if (whereClause.AND) {
         whereClause.AND = [...(whereClause.AND as Prisma.UserWhereInput[]), qrCondition];
      } else if (whereClause.OR) {
         whereClause.AND = [{ OR: whereClause.OR }, qrCondition];
         delete whereClause.OR;
      } else {
         whereClause.AND = [qrCondition];
      }
    }

    // Date Started filter
    if (dateFilter !== "all") {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        
        if (dateFilter === "today") {
            whereClause.createdAt = { gte: todayStart };
        } else if (dateFilter === "yesterday") {
            whereClause.createdAt = { gte: yesterdayStart, lt: todayStart };
        } else if (dateFilter === "week") {
            const limitTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            whereClause.createdAt = { gte: limitTime };
        } else if (dateFilter === "month") {
            const limitTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            whereClause.createdAt = { gte: limitTime };
        } else if (dateFilter === "three_months") {
            const limitTime = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            whereClause.createdAt = { gte: limitTime };
        } else if (dateFilter === "custom") {
            const range = customCreatedAtRange(createdFrom, createdTo);
            if (range) whereClause.createdAt = range;
        }
    }

    const trainingFilters = selectedStatuses.filter((s) =>
      ["landcover_passed", "3d_passed", "transpo_passed", "roof_passed"].includes(s)
    );
    const hasTrainingFilter = trainingFilters.length > 0;

    // OMIT trainings to save massive amounts of memory and bandwidth, unless they are needed for filtering!
    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        isRegistered: true,
        hasCompletedPreCourse: true,
        isDashboardCompleted: true,
        lastLogin: true,
        refererEmail: true,
        labelerRefererEmail: true,
        referer: { select: { name: true } },
        onboardingProgress: true,
        isRulesAndGuidelinesCompleted: true,
        onRulesAndGuidelinesProgress: true,
        facebook: true,
        phone: true,
        gingerUsername: true,
        group_id: true,
        team_id: true,
        ...(hasTrainingFilter ? { trainings: { select: { id: true, trainings: true } } } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    let data = users;
    if (hasTrainingFilter) {
      let formattedUsers = formatUserTrainings(users);
      formattedUsers = formattedUsers.filter((user) => {
        return trainingFilters.every((filter) => {
          const tList = (user.trainings as MappedTraining[]) || [];
          if (filter === "landcover_passed") {
            return hasPassedTraining(tList, "landcover");
          }
          if (filter === "3d_passed") {
            return hasPassedTraining(tList, "3d");
          }
          if (filter === "transpo_passed") {
            return hasPassedTraining(tList, "transpo");
          }
          if (filter === "roof_passed") {
            return hasPassedTraining(tList, "roof");
          }
          return true;
        });
      });
      data = formattedUsers;
    }

    // Resolve recruiter emails to display names so the export can show a name.
    const withNames = await attachLabelerNames(data);

    // Everything else the export needs is resolved here rather than round-tripping
    // from the client: worklogs and staff names for exactly this result set.
    const logNames = new Set<string>();
    const groupIds = new Set<number>();
    const teamIds = new Set<number>();
    const isRealId = (id: number | null | undefined) => typeof id === "number" && id !== 0 && id !== -1;
    withNames.forEach((u: any) => {
      if (u.name) logNames.add(u.name.trim());
      if (u.email) logNames.add(u.email.trim());
      if (u.gingerUsername) logNames.add(u.gingerUsername.trim());
      if (isRealId(u.group_id)) groupIds.add(u.group_id);
      if (isRealId(u.team_id)) teamIds.add(u.team_id);
    });

    const [workLogs, staffNames] = await Promise.all([
      findExportWorkLogs(Array.from(logNames)),
      getGroupStaffNamesAction(Array.from(groupIds), Array.from(teamIds)),
    ]);

    return { success: true, data: withNames, workLogs, staffNames };
  } catch (error) {
    console.error("Error fetching users for export:", error);
    return { success: false, error: toUserFacingError(error, "Something went wrong while preparing the list. Please try again. If it keeps happening, contact an admin.") };
  }
}

// Postgres allows at most 32,767 values per query, and each name is one value.
// With ~13k users (name + email + Ginger username each) a single query goes over,
// so look the names up in batches.
const WORKLOG_NAME_BATCH_SIZE = 10000;
const EXPORT_WORKLOG_SELECT = { id: true, ownerName: true, projectId: true, role: true, worktime: true, taskNum: true, features: true } satisfies Prisma.WorkLogSelect;

async function findExportWorkLogs(names: string[]) {
  const byId = new Map<number, Prisma.WorkLogGetPayload<{ select: typeof EXPORT_WORKLOG_SELECT }>>();
  for (let i = 0; i < names.length; i += WORKLOG_NAME_BATCH_SIZE) {
    const logs = await prisma.workLog.findMany({
      where: { ownerName: { in: names.slice(i, i + WORKLOG_NAME_BATCH_SIZE), mode: "insensitive" } },
      select: EXPORT_WORKLOG_SELECT,
    });
    // Names that differ only by case can land in different batches and match the same log
    logs.forEach((log) => byId.set(log.id, log));
  }
  return Array.from(byId.values()).sort((a, b) => b.id - a.id);
}

// Admin-only. Promotes a user below the recruiter tier to "recruiter". Users
// already at or above it (recruiter, checker, judger, admin) are left untouched.
export async function promoteUserToRecruiterAction(userId: string) {
  try {
    const admin = await getAuthedUser();
    if (!admin || admin.role?.toLowerCase() !== "admin") {
      return { success: false, error: "Not authorized" };
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
    if (!target) return { success: false, error: "User not found" };
    if (target.status === "Deactivated") {
      return { success: false, error: "This account is deactivated" };
    }

    const targetRole = target.role?.toLowerCase() || "applicant";
    if (!["applicant", "labeler", "old-labeler"].includes(targetRole)) {
      return { success: false, error: `User is already a ${targetRole}` };
    }

    await prisma.user.update({
      where: { id: target.id },
      data: { role: "recruiter" },
    });
    return { success: true };
  } catch (error) {
    console.error("Error promoting user to recruiter:", error);
    return { success: false, error: toUserFacingError(error, "Couldn't promote this user to recruiter. Please try again.") };
  }
}

// Admin-only. Undoes a recruiter promotion. The previous role is not stored, so
// the admin chooses which sub-recruiter role to restore.
export async function demoteRecruiterAction(userId: string, newRole: string) {
  try {
    const admin = await getAuthedUser();
    if (!admin || admin.role?.toLowerCase() !== "admin") {
      return { success: false, error: "Not authorized" };
    }

    if (!["applicant", "labeler", "old-labeler"].includes(newRole)) {
      return { success: false, error: "Invalid role" };
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!target) return { success: false, error: "User not found" };
    if (target.role?.toLowerCase() !== "recruiter") {
      return { success: false, error: "User is not a recruiter" };
    }

    await prisma.user.update({
      where: { id: target.id },
      data: { role: newRole },
    });
    return { success: true };
  } catch (error) {
    console.error("Error demoting recruiter:", error);
    return { success: false, error: toUserFacingError(error, "Couldn't remove recruiter access. Please try again.") };
  }
}
