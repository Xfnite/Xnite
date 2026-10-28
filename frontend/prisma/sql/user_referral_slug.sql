-- Short referral links (join.xfnite.cloud/<slug>, e.g. join.xfnite.cloud/cedrickr). Each user gets one
-- unique slug, made from first name + last initial the first time they open the dashboard
-- (getReferralSlugAction). /r/[code] looks it up before the username.
-- Additive only: adds one nullable column and its unique index, touches no existing data.
-- Safe to run more than once. Run it BEFORE deploying the code that uses it.
-- CONCURRENTLY keeps the table writable while the index builds; run each statement on its
-- own, not inside a transaction.

ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "referralSlug" text;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "User_referralSlug_key"
    ON "public"."User" USING btree ("referralSlug");
