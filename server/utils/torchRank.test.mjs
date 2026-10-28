// node --test utils/torchRank.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { isTorchEligible, getTorchRank, getQuestRankFloor, getTorchQuota, TORCH_DAILY_CAP } from "./torchRank.js";

// Ladder (top -> bottom), matching the live User.role values.
const LADDER = ["admin", "judger", "checker", "recruiter", "old-labeler", "labeler", "applicant"];

test("the ladder is strictly ordered, admin highest", () => {
  const ranks = LADDER.map(getTorchRank);
  for (let i = 1; i < ranks.length; i++) assert.ok(ranks[i] < ranks[i - 1], `${LADDER[i]} must rank below ${LADDER[i - 1]}`);
  assert.equal(getTorchRank("applicant"), 1);
});

test("judger outranks checker (no longer tied)", () => {
  assert.ok(getTorchRank("judger") > getTorchRank("checker"));
  assert.ok(isTorchEligible("judger", "checker"));   // judger helps checker -> earns
  assert.ok(!isTorchEligible("checker", "judger"));   // checker helps up -> nothing
});

test("a higher role earns only by replying strictly downward", () => {
  assert.ok(isTorchEligible("checker", "labeler"));
  assert.ok(isTorchEligible("admin", "applicant"));
  assert.ok(isTorchEligible("recruiter", "old-labeler"));
});

test("replying UP the ladder never earns", () => {
  assert.ok(!isTorchEligible("labeler", "checker"));
  assert.ok(!isTorchEligible("applicant", "admin"));
  assert.ok(!isTorchEligible("old-labeler", "recruiter"));
});

test("same-rank replies earn ONLY for the lowest rank (peers help)", () => {
  assert.ok(isTorchEligible("applicant", "applicant"));   // novices help each other
  assert.ok(!isTorchEligible("labeler", "labeler"));
  assert.ok(!isTorchEligible("checker", "checker"));
  assert.ok(!isTorchEligible("admin", "admin"));
});

test("the lowest rank earns from peers only, never upward", () => {
  assert.ok(isTorchEligible("applicant", "applicant"));
  assert.ok(!isTorchEligible("applicant", "labeler"));
});

test("unranked roles neither earn nor count as a target", () => {
  assert.ok(!isTorchEligible("moderator", "applicant")); // moderator is off-ladder
  assert.ok(!isTorchEligible("checker", "moderator"));
  assert.ok(!isTorchEligible("", "applicant"));
  assert.ok(!isTorchEligible("labeler", "ghost-role"));
});

test("role matching is case/space tolerant", () => {
  assert.ok(isTorchEligible("  Checker ", "LABELER"));
  assert.equal(getTorchRank("Old-Labeler"), getTorchRank("old-labeler"));
});

test("the daily cap is 20", () => {
  assert.equal(TORCH_DAILY_CAP, 20);
});

// ─── Quest rank floor (auto-promotion into the LoyaltyRank ladder) ───────────
// Distinct from the eligibility ladder above: this is the 0-5 LXP ladder.

test("each role starts at its mapped quest rank", () => {
  assert.equal(getQuestRankFloor("applicant"), 0);   // Novice
  assert.equal(getQuestRankFloor("labeler"), 0);     // Challenger
  assert.equal(getQuestRankFloor("old-labeler"), 1); // Scout
  assert.equal(getQuestRankFloor("recruiter"), 2);   // Vanguard
  assert.equal(getQuestRankFloor("checker"), 3);     // Grandmaster
  assert.equal(getQuestRankFloor("judger"), 4);      // Immortal
  assert.equal(getQuestRankFloor("admin"), 5);       // Transcendence
});

test("quest rank floor never decreases as role seniority rises", () => {
  const bottomUp = ["applicant", "labeler", "old-labeler", "recruiter", "checker", "judger", "admin"];
  const floors = bottomUp.map(getQuestRankFloor);
  for (let i = 1; i < floors.length; i++) {
    assert.ok(floors[i] >= floors[i - 1], `${bottomUp[i]} must not floor below ${bottomUp[i - 1]}`);
  }
});

test("old-labeler spelling variants all floor to Scout", () => {
  for (const variant of ["old-labeler", "old-laber", "old labeler", "old", "  Old-Labeler "]) {
    assert.equal(getQuestRankFloor(variant), 1, `${variant} should floor to Scout`);
  }
});

test("unknown, empty and nullish roles floor to rank 0", () => {
  assert.equal(getQuestRankFloor("moderator"), 0);
  assert.equal(getQuestRankFloor("ghost-role"), 0);
  assert.equal(getQuestRankFloor(""), 0);
  assert.equal(getQuestRankFloor(undefined), 0);
  assert.equal(getQuestRankFloor(null), 0);
});

// ─── getTorchQuota: MAX(rank earned by LXP, rank granted by role) ────────────

const RANKS = [
  { rankNum: 0, name: "Squire", minLxp: 0, torchTarget: 1, torchXp: 1 },
  { rankNum: 1, name: "Scout", minLxp: 150, torchTarget: 2, torchXp: 2 },
  { rankNum: 2, name: "Vanguard", minLxp: 600, torchTarget: 3, torchXp: 3 },
  { rankNum: 3, name: "Grandmaster", minLxp: 1500, torchTarget: 4, torchXp: 4 },
  { rankNum: 4, name: "Immortal", minLxp: 3500, torchTarget: 5, torchXp: 5 },
  { rankNum: 5, name: "Transcendence", minLxp: 10000, torchTarget: 6, torchXp: 6 },
];

const fakePrisma = (totalLxp, ranks = RANKS) => ({
  userLoyalty: { findUnique: async () => (totalLxp === null ? null : { totalLxp }) },
  loyaltyRank: { findMany: async () => ranks },
});

test("role floors a user above the rank their LXP alone would give", async () => {
  const q = await getTorchQuota(fakePrisma(0), "a@x.com", "checker");
  assert.equal(q.rankNum, 3);      // Grandmaster by role, despite 0 LXP
  assert.equal(q.torchTarget, 4);
});

test("LXP still climbs past the role floor", async () => {
  const q = await getTorchQuota(fakePrisma(700), "a@x.com", "old-labeler");
  assert.equal(q.rankNum, 2);      // floor is Scout(1), LXP earned Vanguard(2)
  assert.equal(q.torchTarget, 3);
});

test("a labeler with no LXP stays at rank 0", async () => {
  const q = await getTorchQuota(fakePrisma(0), "a@x.com", "labeler");
  assert.equal(q.rankNum, 0);
  assert.equal(q.torchTarget, 1);
});

test("a labeler earns their way up with LXP alone", async () => {
  assert.equal((await getTorchQuota(fakePrisma(150), "a@x.com", "labeler")).rankNum, 1);
  assert.equal((await getTorchQuota(fakePrisma(10000), "a@x.com", "labeler")).rankNum, 5);
});

test("admin is floored at the top rank", async () => {
  const q = await getTorchQuota(fakePrisma(0), "a@x.com", "admin");
  assert.equal(q.rankNum, 5);
  assert.equal(q.torchTarget, 6);
});

test("a missing UserLoyalty row falls back to the role floor", async () => {
  const q = await getTorchQuota(fakePrisma(null), "a@x.com", "judger");
  assert.equal(q.rankNum, 4);
});

test("an unseeded LoyaltyRank table falls back to the flat legacy cap", async () => {
  const q = await getTorchQuota(fakePrisma(0, []), "a@x.com", "admin");
  assert.equal(q.rankNum, 0);
  assert.equal(q.torchTarget, TORCH_DAILY_CAP);
});

test("a role floor missing from the rank table cannot lower the earned rank", async () => {
  // Table has no rank 5 row; admin floors to 5, which findIndex can't resolve.
  const q = await getTorchQuota(fakePrisma(600, RANKS.slice(0, 3)), "a@x.com", "admin");
  assert.equal(q.rankNum, 2);      // keeps the LXP-earned rank rather than dropping
});
