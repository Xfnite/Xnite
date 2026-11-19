-- Creates CheckRecording and LivestreamRoom tables (and their indexes) to match
-- schema.prisma without touching unrelated schema drift (e.g. ReferralBonus).
-- Additive only; safe to run more than once.
--
--   npx prisma db execute --file prisma/sql/livestream_tables.sql

CREATE TABLE IF NOT EXISTS "public"."CheckRecording" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "projectType" TEXT NOT NULL DEFAULT 'Standard Building',
    "description" TEXT,
    "checkerEmail" TEXT NOT NULL,
    "checkerName" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "qualities" TEXT[] DEFAULT ARRAY['1080p', '720p', '360p']::TEXT[],
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckRecording_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."LivestreamRoom" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "projectType" TEXT NOT NULL DEFAULT 'Standard Building',
    "checkerEmail" TEXT NOT NULL,
    "checkerName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "streamUrl" TEXT,
    "viewerLimit" INTEGER NOT NULL DEFAULT 10,
    "currentViewers" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LivestreamRoom_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CheckRecording_checkerEmail_idx"
    ON "public"."CheckRecording"("checkerEmail");

CREATE INDEX IF NOT EXISTS "CheckRecording_projectType_idx"
    ON "public"."CheckRecording"("projectType");

CREATE INDEX IF NOT EXISTS "CheckRecording_createdAt_idx"
    ON "public"."CheckRecording"("createdAt");

CREATE INDEX IF NOT EXISTS "LivestreamRoom_checkerEmail_idx"
    ON "public"."LivestreamRoom"("checkerEmail");

CREATE INDEX IF NOT EXISTS "LivestreamRoom_status_idx"
    ON "public"."LivestreamRoom"("status");
