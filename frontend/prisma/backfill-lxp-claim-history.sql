-- One-time backfill for "LxpClaimHistory". Run AFTER `prisma db push` has
-- created the table. Safe to re-run: rows that already exist are skipped.
--
--   npx prisma db execute --file prisma/backfill-lxp-claim-history.sql
--
-- Limits: daily claims were never stored historically — only each user's most
-- recent period survives in "UserLoyalty"."completedQuests", so that is all that
-- can be recovered (timestamped with the row's updatedAt). Weekly claims are
-- exact, from "WeeklyQuestClaim". Pass the Torch's reward scales with rank, so
-- it is approximated from the user's current LXP rank (fallback 10).

BEGIN;

-- Weekly claims (exact)
INSERT INTO "LxpClaimHistory" (email, "questId", "questType", lxp, "claimedAt")
SELECT w.email, w."questId", 'weekly', w.lxp, w."createdAt"
FROM "WeeklyQuestClaim" w
WHERE NOT EXISTS (
  SELECT 1 FROM "LxpClaimHistory" h
  WHERE h.email = w.email AND h."questId" = w."questId"
    AND h."questType" = 'weekly' AND h."claimedAt" = w."createdAt"
);

-- Daily claims from each user's last stored period (rewards from src/config/quests.ts)
INSERT INTO "LxpClaimHistory" (email, "questId", "questType", lxp, "claimedAt")
SELECT ul.email, q.quest_id, 'daily',
  CASE q.quest_id
    WHEN 'daily_q1' THEN COALESCE((
      SELECT r."torchXp" FROM "LoyaltyRank" r
      WHERE r."minLxp" <= ul."totalLxp" ORDER BY r."minLxp" DESC LIMIT 1
    ), 10)
    WHEN 'daily_q3' THEN 1
    WHEN 'daily_q_bounty' THEN 10
    WHEN 'daily_q_harmony' THEN 1
    WHEN 'daily_q_checkin' THEN 1
  END,
  ul."updatedAt"
FROM "UserLoyalty" ul
CROSS JOIN LATERAL jsonb_array_elements_text(ul."completedQuests") AS q(quest_id)
WHERE q.quest_id IN ('daily_q1', 'daily_q3', 'daily_q_bounty', 'daily_q_harmony', 'daily_q_checkin')
  AND NOT EXISTS (
    SELECT 1 FROM "LxpClaimHistory" h
    WHERE h.email = ul.email AND h."questId" = q.quest_id
      AND h."questType" = 'daily' AND h."claimedAt" = ul."updatedAt"
  );

COMMIT;
