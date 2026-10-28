-- Keeps the Ginger credentials a user had before they were given a new Ginger account
-- on reactivation (Activate Users page). A list of
-- { gingerEmail, gingerUsername, gingerPassword, replacedAt }, oldest first.
-- Additive only: adds one nullable column, touches no existing data.
-- Safe to run more than once. Run it BEFORE deploying the code that uses it.

ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "previousGingerAccounts" jsonb;
