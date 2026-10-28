-- Lets the per-user work-log lookup (getMyPerformanceLogsAction, run on every page
-- load) use an index. It matches owner_name case-insensitively, which Prisma sends
-- as LOWER("owner_name") IN (...), so the existing plain owner_name index can't be
-- used and every call scans the whole table.
-- Additive only: creates one index, touches nothing that exists. Safe to run more than once.
-- CONCURRENTLY keeps the table writable while it builds; run it on its own, not
-- inside a transaction.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "work_logs_owner_name_lower_idx"
    ON "public"."work_logs" USING btree (LOWER("owner_name"));
