-- Creates ONLY the "ReferralBonus" table (matches the Prisma model), without
-- pushing any other schema drift. Safe to re-run.
--
--   npx prisma db execute --file prisma/create-referral-bonus.sql

CREATE TABLE IF NOT EXISTS "ReferralBonus" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid(),
  "gingerUsername" TEXT NOT NULL,
  "amount"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cutoff"         TEXT NOT NULL DEFAULT 'Current Cutoff',
  "status"         TEXT NOT NULL DEFAULT 'Active',
  "recruiterEmail" TEXT,
  "recruitEmail"   TEXT,
  "source"         TEXT,
  "note"           TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralBonus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReferralBonus_gingerUsername_cutoff_key"
  ON "ReferralBonus" ("gingerUsername", "cutoff");

CREATE INDEX IF NOT EXISTS "ReferralBonus_gingerUsername_idx"
  ON "ReferralBonus" ("gingerUsername");

CREATE INDEX IF NOT EXISTS "ReferralBonus_recruiterEmail_idx"
  ON "ReferralBonus" ("recruiterEmail");

CREATE INDEX IF NOT EXISTS "ReferralBonus_cutoff_idx"
  ON "ReferralBonus" ("cutoff");

