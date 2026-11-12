-- Creates the "ReferralWithdrawal" table (matches the Prisma model) and links
-- ReferralBonus rows to it, without pushing any other schema drift.
-- Additive only (new table, new nullable column, trigger). Safe to re-run.
--
--   npx prisma db execute --file prisma/create-referral-withdrawal.sql

-- 1. One row per referral bonus withdrawal request (kept out of IncomeHistory,
--    which is the main-wallet salary history).
CREATE TABLE IF NOT EXISTS "ReferralWithdrawal" (
  "id"            TEXT             NOT NULL DEFAULT gen_random_uuid(),
  "email"         TEXT             NOT NULL,
  "amount"        DOUBLE PRECISION NOT NULL,
  "status"        TEXT             NOT NULL DEFAULT 'Pending',
  "cutoffLabel"   TEXT             NOT NULL,
  "cutoffs"       TEXT[]           NOT NULL DEFAULT ARRAY[]::TEXT[],
  "paymentMethod" TEXT,
  "payeeUid"      TEXT,
  "payeeName"     TEXT,
  "transactionId" TEXT,
  "sentAt"        TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralWithdrawal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ReferralWithdrawal_email_createdAt_idx"
  ON "ReferralWithdrawal" ("email", "createdAt");

CREATE INDEX IF NOT EXISTS "ReferralWithdrawal_status_idx"
  ON "ReferralWithdrawal" ("status");

-- 2. Which withdrawal paid each bonus (NULL = not withdrawn yet).
ALTER TABLE "ReferralBonus" ADD COLUMN IF NOT EXISTS "withdrawalId" TEXT;

CREATE INDEX IF NOT EXISTS "ReferralBonus_withdrawalId_idx"
  ON "ReferralBonus" ("withdrawalId");

-- 3. Keep bonus statuses in sync when a withdrawal's status changes (e.g. the
--    Claimform2 sheet PATCHes only "ReferralWithdrawal" via PostgREST):
--      Sent / Paid          -> bonuses "Sent", sentAt stamped
--      Cancelled / Failed   -> bonuses released back to "Active" (claimable again)
--      anything else        -> bonuses "Sending"
CREATE OR REPLACE FUNCTION referral_withdrawal_sync_bonuses()
RETURNS TRIGGER AS $$
DECLARE
  s TEXT := lower(trim(NEW."status"));
BEGIN
  IF NEW."status" IS NOT DISTINCT FROM OLD."status" THEN
    RETURN NEW;
  END IF;

  IF s IN ('sent', 'paid') THEN
    NEW."sentAt" := COALESCE(NEW."sentAt", CURRENT_TIMESTAMP);
    UPDATE "ReferralBonus"
       SET "status" = 'Sent', "updatedAt" = CURRENT_TIMESTAMP
     WHERE "withdrawalId" = NEW."id";
  ELSIF s IN ('cancelled', 'canceled', 'failed', 'rejected') THEN
    UPDATE "ReferralBonus"
       SET "status" = 'Active', "withdrawalId" = NULL, "updatedAt" = CURRENT_TIMESTAMP
     WHERE "withdrawalId" = NEW."id";
  ELSE
    UPDATE "ReferralBonus"
       SET "status" = 'Sending', "updatedAt" = CURRENT_TIMESTAMP
     WHERE "withdrawalId" = NEW."id";
  END IF;

  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "ReferralWithdrawal_sync_bonuses" ON "ReferralWithdrawal";
CREATE TRIGGER "ReferralWithdrawal_sync_bonuses"
  BEFORE UPDATE OF "status" ON "ReferralWithdrawal"
  FOR EACH ROW EXECUTE FUNCTION referral_withdrawal_sync_bonuses();

-- 4. Permissions for PostgREST
GRANT ALL ON TABLE "ReferralWithdrawal" TO authenticated, anon, web_anon;
