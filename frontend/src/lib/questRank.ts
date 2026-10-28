import { TORCH_DAILY_CAP } from "@/config/quests";

// ─── Quest ranking (the LXP ladder) ──────────────────────────────────────────
// This module is deliberately ISOLATED from the role-label system in
// @/config/permissions and must not import from it. The two are different
// domains that happen to reuse some words:
//
//   • getGamifiedRoleLabel()  — names a user's JOB role. `admin` is "Grandmaster".
//   • this module             — names a user's QUEST rank. Rank 3 is "Grandmaster".
//
// Those two "Grandmaster"s are unrelated and are meant to stay that way. A DB
// role is an INPUT here (it sets the starting rank), but no naming, normalizing,
// or gating logic is shared between the two systems.

// How far up the quest ladder each DB role starts. Role auto-promotes a user
// into the ladder; LXP can still carry them higher (see resolveQuestRank), so
// this is a floor, never a cap.
//
//   role (label)          → quest rank
//   applicant  (Novice)   → 0  Novice        — cannot quest
//   labeler    (Challenger)→ 0  Challenger
//   old-labeler(Veteran)  → 1  Scout
//   recruiter  (Mentor)   → 2  Vanguard
//   checker    (Overseer) → 3  Grandmaster
//   judger     (Arbiter)  → 4  Immortal
//   admin      (Grandmaster)→ 5 Transcendence
//
// The old-labeler spelling variants are all mapped on purpose: the role column
// is free-text and these forms exist in the data.
const QUEST_RANK_FLOOR_BY_ROLE: Record<string, number> = {
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

// Rank 0 is the only rank whose name depends on the user rather than the rank
// row: an applicant is a Novice, everyone else there is a Challenger.
const RANK_0_TITLE_APPLICANT = "Novice";
const RANK_0_TITLE_DEFAULT = "Challenger";

// Reward used only when the LoyaltyRank table has no rows at all.
const FALLBACK_TORCH_XP = 10;
const FALLBACK_NEXT_LXP = 150;

/** One row of the LoyaltyRank table, in the shape the resolver needs. */
export interface QuestRankRow {
  rankNum: number;
  name: string;
  recruiterName: string | null;
  minLxp: number;
  torchTarget: number;
  torchXp: number;
}

export interface ResolvedQuestRank {
  level: number;
  title: string;
  minLxp: number;
  nextLxp: number | null;
  progress: number;
  torchTarget: number;
  torchXp: number;
}

function cleanRole(role?: string | null): string {
  return role?.trim().toLowerCase() || "";
}

/** The lowest quest rank this DB role is entitled to. Unknown roles start at 0. */
export function getQuestRankFloor(role?: string | null): number {
  return QUEST_RANK_FLOOR_BY_ROLE[cleanRole(role)] ?? 0;
}

/** Rank 0's display name, which is role-derived rather than rank-derived. */
export function getRank0Title(role?: string | null): string {
  return cleanRole(role) === "applicant"
    ? RANK_0_TITLE_APPLICANT
    : RANK_0_TITLE_DEFAULT;
}

/**
 * Resolves a user's quest rank as MAX(rank earned by LXP, rank granted by role).
 *
 * `ranks` must be ordered by minLxp ascending — every caller queries it that way.
 */
export function resolveQuestRank(
  totalLxp: number,
  ranks: QuestRankRow[],
  role?: string | null,
  // false = the live (pre-rank-scaling) Pass the Torch: flat 20 players / 10 XP.
  useRankScaling = true,
): ResolvedQuestRank {
  if (ranks.length === 0) {
    // LoyaltyRank isn't seeded — fall back to the bottom of the ladder.
    return {
      level: 0,
      title: getRank0Title(role),
      minLxp: 0,
      nextLxp: FALLBACK_NEXT_LXP,
      progress: 0,
      torchTarget: TORCH_DAILY_CAP,
      torchXp: FALLBACK_TORCH_XP,
    };
  }

  // Highest rank whose LXP threshold the user has actually reached.
  let currentIdx = 0;
  for (let i = ranks.length - 1; i >= 0; i--) {
    if (totalLxp >= ranks[i].minLxp) {
      currentIdx = i;
      break;
    }
  }

  // Auto-promotion: never sit below the rank the user's role entitles them to.
  // findIndex returning -1 (a rank row missing from the table) can't lower them.
  const floorIdx = ranks.findIndex((r) => r.rankNum === getQuestRankFloor(role));
  if (floorIdx > currentIdx) currentIdx = floorIdx;

  const current = ranks[currentIdx];
  const next = currentIdx < ranks.length - 1 ? ranks[currentIdx + 1] : null;

  let progress = 100;
  if (next) {
    const range = next.minLxp - current.minLxp;
    // `earned` goes NEGATIVE for a user auto-promoted above their LXP (e.g. a
    // checker floored to Grandmaster holding 0 LXP), so clamp at both ends —
    // the bar reads empty rather than inverted.
    const earned = totalLxp - current.minLxp;
    progress = range > 0 ? Math.min(Math.max((earned / range) * 100, 0), 100) : 100;
  }

  // Recruiters keep their own names for the same ranks (LoyaltyRank.recruiterName
  // — "Vanguard Captain", "Warlord", …): same rank, same mechanics, different label.
  const isRecruiter = cleanRole(role) === "recruiter";
  const title =
    current.rankNum === 0
      ? getRank0Title(role)
      : (isRecruiter && current.recruiterName) || current.name;

  return {
    level: current.rankNum,
    title,
    minLxp: current.minLxp,
    nextLxp: next ? next.minLxp : null,
    progress,
    torchTarget: useRankScaling ? current.torchTarget : TORCH_DAILY_CAP,
    torchXp: useRankScaling ? current.torchXp : FALLBACK_TORCH_XP,
  };
}
