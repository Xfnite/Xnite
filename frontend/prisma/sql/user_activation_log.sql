-- Adds the table that records who activated which user from the "Activate Users" form.
-- Additive only: creates one new table and two indexes, touches nothing that exists.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS "public"."UserActivationLog" (
    "id" text DEFAULT gen_random_uuid() NOT NULL,
    "userId" text NOT NULL,
    "userEmail" text NOT NULL,
    "previousStatus" text,
    "activatedByEmail" text NOT NULL,
    "activatedByRole" text NOT NULL,
    "createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "UserActivationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UserActivationLog_activatedByEmail_createdAt_idx"
    ON "public"."UserActivationLog" USING btree ("activatedByEmail", "createdAt");

CREATE INDEX IF NOT EXISTS "UserActivationLog_userEmail_idx"
    ON "public"."UserActivationLog" USING btree ("userEmail");
