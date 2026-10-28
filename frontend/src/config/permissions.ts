export type SystemRole =
  | "admin"
  | "checker"
  | "judger"
  | "recruiter"
  | "labeler"
  | "applicant"
  | "old-labeler"
  | "unknown";

export interface UserPermissionsContext {
  role?: string;
  isStandardBuildingPassed?: boolean;
  onboardingDone?: boolean;
  isRulesAndGuidelinesCompleted?: boolean;
  // Labeler / old labeler who reached INNER_COUNCIL_MIN_PASSERS (resolved server-side).
  hasInnerCouncilAccess?: boolean;
}

// Labelers and old labelers with at least this many passers among their recruits
// get the sidebar "Inner Council" link (Top Mentors). Staff always have it.
export const INNER_COUNCIL_MIN_PASSERS = 5;

// 1. Core Role Normalizers
export function getNormalizedRole(role?: string): SystemRole {
  const clean = role?.trim()?.toLowerCase() || "";
  if (clean === "admin") return "admin";
  if (clean === "checker") return "checker";
  if (clean === "judger") return "judger";
  if (clean === "recruiter") return "recruiter";
  if (clean === "labeler") return "labeler";
  if (clean === "applicant") return "applicant";
  if (clean === "old-labeler" || clean === "old-laber" || clean === "old labeler") return "old-labeler";
  return "unknown";
}

export function isStaff(role?: string): boolean {
  const norm = getNormalizedRole(role);
  return norm === "admin" || norm === "checker" || norm === "judger" || norm === "recruiter";
}

export function isOldLabeler(role?: string): boolean {
  return getNormalizedRole(role) === "old-labeler";
}

export function isApplicant(role?: string): boolean {
  return getNormalizedRole(role) === "applicant";
}

// Roles that can earn Inner Council access through their recruit count.
export function canEarnInnerCouncil(role?: string): boolean {
  const norm = getNormalizedRole(role);
  return norm === "labeler" || norm === "old-labeler";
}

// Unreleased gamification (Xfnite GP, rank-scaled Pass the Torch)
// is admin-only while it's being checked. To go public, return true here.
export function isGamificationPreviewVisible(role?: string | null): boolean {
  return getNormalizedRole(role ?? undefined) === "admin";
}

// 2. Centrally Managed Gating Logic
export const GATES = {
  // Checks if the onboarding process is incomplete for members
  isAccountLocked: (ctx: UserPermissionsContext) => {
    return !ctx.onboardingDone && !isStaff(ctx.role);
  },

  // Checks if the user cannot access projects / core app because standard building is not passed
  isTrainingLocked: (ctx: UserPermissionsContext) => {
    if (isStaff(ctx.role)) return false;
    return !ctx.onboardingDone || !ctx.isStandardBuildingPassed;
  },

  // Checks if the user cannot access rankings
  isRankingLocked: (ctx: UserPermissionsContext) => {
    if (isStaff(ctx.role)) return false;
    const trainingLocked = !ctx.onboardingDone || !ctx.isStandardBuildingPassed;
    return trainingLocked || !ctx.isRulesAndGuidelinesCompleted;
  },

  // Determines if the social media links & group chat highlights should be visible
  isSocialsVisible: (ctx: UserPermissionsContext) => {
    if (isOldLabeler(ctx.role)) return false;
    const accountLocked = !ctx.onboardingDone && !isStaff(ctx.role);
    const trainingLocked = (!ctx.onboardingDone || !ctx.isStandardBuildingPassed) && !isStaff(ctx.role);
    return !accountLocked && !trainingLocked && !!ctx.isRulesAndGuidelinesCompleted;
  },

  // Gating access to specific frontend routes
  canAccessRoute: (pathname: string, ctx: UserPermissionsContext): boolean => {
    const roleNorm = getNormalizedRole(ctx.role);

    // Attendance rules
    if (pathname.startsWith("/attendance")) {
      if (roleNorm === "applicant") return false;
      return isStaff(ctx.role) || !!ctx.isStandardBuildingPassed;
    }

    // Ranking rules
    if (pathname.startsWith("/ranking")) {
      if (isStaff(ctx.role)) return true;
      return !!ctx.isStandardBuildingPassed && !!ctx.isRulesAndGuidelinesCompleted;
    }

    // Xfnite GP is unreleased — admin-only until it goes public.
    if (pathname.startsWith("/wallet/xgp")) {
      return isGamificationPreviewVisible(ctx.role);
    }

    // Project and Wallet rules
    if (pathname.startsWith("/project") || pathname.startsWith("/wallet")) {
      if (isStaff(ctx.role)) return true;
      return !!ctx.isStandardBuildingPassed;
    }

    // Recruiter Management hub subroutes
    if (pathname.startsWith("/recruiter/group")) {
      const roleNorm = getNormalizedRole(ctx.role);
      return roleNorm === "admin" || roleNorm === "checker" || roleNorm === "judger";
    }

    // Top Mentors is the Inner Council page for labelers who earned it
    if (pathname.startsWith("/recruiter/ranking")) {
      return isStaff(ctx.role) || !!ctx.hasInnerCouncilAccess;
    }

    if (pathname.startsWith("/recruiter")) {
      return isStaff(ctx.role);
    }

    return true;
  },

  // Gating access to specific tabs in the chat widget
  canAccessChatTab: (tab: "applicants" | "passers" | "old" | "checker" | "judger" | "inner-council", ctx: UserPermissionsContext): boolean => {
    const roleNorm = getNormalizedRole(ctx.role);

    if (tab === "applicants") {
      return true;
    }

    if (tab === "passers") {
      if (roleNorm === "old-labeler" || roleNorm === "applicant") return false;
      return isStaff(ctx.role) || (roleNorm === "labeler" && !!ctx.isStandardBuildingPassed);
    }

    if (tab === "old") {
      return roleNorm === "old-labeler" || isStaff(ctx.role);
    }

    if (tab === "checker") {
      return roleNorm === "checker" || roleNorm === "judger" || roleNorm === "admin";
    }

    if (tab === "judger") {
      return roleNorm === "judger" || roleNorm === "admin";
    }

    if (tab === "inner-council") {
      return roleNorm === "checker" || roleNorm === "recruiter" || roleNorm === "judger" || roleNorm === "admin";
    }

    return false;
  }
};

export function getGamifiedRoleLabel(role?: string): string {
  const clean = role?.trim()?.toLowerCase() || "";
  if (clean === "admin") return "Grandmaster";
  if (clean === "checker") return "Overseer";
  if (clean === "judger") return "Arbiter";
  if (clean === "recruiter") return "Mentor";
  if (clean === "labeler") return "Challenger";
  if (clean === "applicant") return "Novice";
  if (clean === "old-labeler" || clean === "old-laber" || clean === "old labeler" || clean === "old") return "Veteran";
  if (clean === "moderator") return "Moderator";
  return role || "";
}
