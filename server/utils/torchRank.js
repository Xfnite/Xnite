// ─── Pass the Torch: role ladder & eligibility ───────────────────────────────
// Decides whether a reply earns a "Pass the Torch" point. The rule:
//   • Non-lowest ranks earn only by replying to a STRICTLY LOWER rank.
//   • The lowest rank (Applicant/Novice) — who has nobody below — earns by
//     replying to the SAME rank (peer help).
//   • Never yourself. Unranked roles neither earn nor count as a valid target.
//
// The ladder (higher number = more senior), mapped to the actual User.role
// values in the database:
//   admin > judger > checker > recruiter > old-labeler > labeler > applicant
// Note: judger outranks checker here (they are NOT tied). "moderator" is not a
// role on this ladder and is treated as unranked.

const RANK_BY_ROLE = {
  admin: 7,          // Grandmaster
  judger: 6,         // Arbiter
  checker: 5,        // Overseer
  recruiter: 4,      // Mentor
  "old-labeler": 3,  // Veteran / OGXF
  "old-laber": 3,    // (known misspellings / spacing variants)
  "old labeler": 3,
  old: 3,
  labeler: 2,        // Builder / Challenger
  applicant: 1,      // Novice (lowest)
};

// The lowest rank on the ladder — the only rank allowed to earn from a peer.
const LOWEST_RANK = 1;

export function getTorchRank(role) {
  const clean = role?.trim()?.toLowerCase() || "";
  return RANK_BY_ROLE[clean] || 0; // 0 = unranked / ineligible
}

// Returns true if `helperRole` replying to `helpedRole` should earn a point.
// (Self-reply is guarded by the caller via email comparison.)
export function isTorchEligible(helperRole, helpedRole) {
  const helperRank = getTorchRank(helperRole);
  const helpedRank = getTorchRank(helpedRole);

  // Both parties must be on the ladder.
  if (helperRank < LOWEST_RANK || helpedRank < LOWEST_RANK) return false;

  // Lowest rank earns only from an equal-rank peer.
  if (helperRank === LOWEST_RANK) return helpedRank === LOWEST_RANK;

  // Everyone else earns only from a strictly lower rank.
  return helpedRank < helperRank;
}

// Fallback daily cap, used only if the LoyaltyRank table has no row for the
// helper's LXP rank (e.g. table not yet seeded). Normal operation reads the
// per-rank target from LoyaltyRank.torchTarget instead — see getTorchQuota.
export const TORCH_DAILY_CAP = 20;
const FALLBACK_TORCH_XP = 10;

// ─── Quest rank floor by role ────────────────────────────────────────────────
// NOTE: this is NOT the same ladder as RANK_BY_ROLE above. RANK_BY_ROLE (1-7) is
// the seniority ladder that decides torch ELIGIBILITY. This map (0-5) is the
// LoyaltyRank quest ladder, and says how far up it each role starts. A role
// auto-promotes a user into the ladder; LXP can still carry them higher, so this
// is a floor, never a cap.
//
//   applicant → 0 Novice        labeler   → 0 Challenger
//   old-labeler → 1 Scout       recruiter → 2 Vanguard
//   checker   → 3 Grandmaster   judger    → 4 Immortal
//   admin     → 5 Transcendence
//
// Mirrors frontend/src/lib/questRank.ts — the two runtimes each need their own
// copy, same as questPeriod.js / questPeriod.ts. Keep them in step.
const QUEST_RANK_FLOOR_BY_ROLE = {
  applicant: 0,
  labeler: 0,
  "old-labeler": 1,
  "old-laber": 1,
  "old labeler": 1,
  old: 1,
  recruiter: 2,
  checker: 3,
  judger: 4,
  admin: 5,
};

export function getQuestRankFloor(role) {
  const clean = role?.trim()?.toLowerCase() || "";
  return QUEST_RANK_FLOOR_BY_ROLE[clean] ?? 0;
}

// Resolves the helper's quest rank as MAX(rank earned by LXP, rank granted by
// role) and returns that rank's Pass the Torch target + reward. Higher ranks ask
// for more unique players but pay more LXP per completion. Falls back to the flat
// legacy numbers if LoyaltyRank isn't seeded; a helper with no UserLoyalty row
// simply reads 0 LXP and leans on their role floor.
export async function getTorchQuota(prisma, helperEmail, helperRole) {
  const [loyalty, ranks] = await Promise.all([
    prisma.userLoyalty.findUnique({ where: { email: helperEmail }, select: { totalLxp: true } }),
    prisma.loyaltyRank.findMany({ orderBy: { minLxp: "asc" } }),
  ]);

  if (ranks.length === 0) {
    return { rankNum: 0, torchTarget: TORCH_DAILY_CAP, torchXp: FALLBACK_TORCH_XP };
  }

  // Highest rank whose LXP threshold the helper has actually reached.
  const totalLxp = loyalty?.totalLxp ?? 0;
  let currentIdx = 0;
  for (let i = ranks.length - 1; i >= 0; i--) {
    if (totalLxp >= ranks[i].minLxp) {
      currentIdx = i;
      break;
    }
  }

  // Auto-promotion by role. This has to match the frontend exactly: the UI shows
  // the user their rank's torchTarget, and the caller enforces that same number
  // as a hard cap — if the two disagree, the quest promises more than it pays.
  const floorIdx = ranks.findIndex((r) => r.rankNum === getQuestRankFloor(helperRole));
  if (floorIdx > currentIdx) currentIdx = floorIdx;

  const current = ranks[currentIdx];
  return { rankNum: current.rankNum, torchTarget: current.torchTarget, torchXp: current.torchXp };
}
