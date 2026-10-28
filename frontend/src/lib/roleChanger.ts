const ROLE_TIERS: Record<string, number> = {
    applicant: 1,
    labeler: 2,
    "old-labeler": 3,
    recruiter: 4,
    checker: 5,
    judger: 6,
    admin: 7,
};

/**
 * Calculates the appropriate role for a user based on their current role
 * and the roles returned by the Ginger API.
 * 
 * Rules:
 * - Always picks the highest tiered role from the Ginger API.
 * - Always upgrades the user if the Ginger role is higher than their current role.
 * - Downgrades the user ONLY if they currently hold a standard Ginger role (labeler, checker, judger).
 *   Manual roles like "old-labeler", "admin", "recruiter" are protected from being downgraded.
 * - Recruiters may be promoted by the sync (e.g. to checker or judger) but are never
 *   demoted, so a recruiter whose Ginger role is lower keeps "recruiter".
 *
 * @param currentRole The user's current role in the database
 * @param gingerRole The role string from the Ginger API
 * @returns The new role string to save in the database
 */
export function calculateNewRole(
    currentRole: string | null | undefined,
    gingerRole: string | null | undefined
): string {
    const current = currentRole?.toLowerCase() || "applicant";
    let newRole = current;

    // Applicants are handled internally and should never be overwritten by Bitmap sync
    if (current === "applicant") {
        return newRole;
    }

    const rName = gingerRole?.toLowerCase();
    
    if (rName && ROLE_TIERS[rName]) {
        const currentUserTier = ROLE_TIERS[current] || 0;
        const highestGingerTier = ROLE_TIERS[rName];
        const isStandardGingerRole = ["labeler", "checker"].includes(current);

        if (highestGingerTier > currentUserTier) {
            // Upgrade
            newRole = rName;
        } else if (highestGingerTier < currentUserTier && isStandardGingerRole) {
            // Downgrade only if they are currently holding a standard ginger role
            if (current === "checker" && rName === "labeler") {
                newRole = "old-labeler";
            } else {
                newRole = rName;
            }
        }
    }

    return newRole;
}
