-- Creates ONLY the "LxpClaimHistory" table (matches the Prisma model), without
-- pushing any other schema drift. Safe to re-run.
--
--   npx prisma db execute --file prisma/create-lxp-claim-history.sql

CREATE TABLE IF NOT EXISTS "LxpClaimHistory" (
  "id"        TEXT         NOT NULL DEFAULT gen_random_uuid(),
  "email"     TEXT         NOT NULL,
  "questId"   TEXT         NOT NULL,
  "questType" TEXT         NOT NULL,
  "lxp"       INTEGER      NOT NULL,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LxpClaimHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LxpClaimHistory_email_claimedAt_idx"
  ON "LxpClaimHistory" ("email", "claimedAt");
