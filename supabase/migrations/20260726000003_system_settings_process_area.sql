-- ============================================================================
-- Add `systemSettings` as a new process_area value (17th).
--
-- Real feedback (2026-07-26): the project owner noticed the "أنشطة
-- المستخدمين" (User Activity) tab's last-sign-in timestamps render in the
-- server's own timezone (UK) instead of Saudi Arabia time, and asked for a
-- new "إعدادات النظام" (System Settings) tab under الإدارة where the
-- timezone can be freely chosen, rather than a second hardcoded fix.
--
-- Split into its own migration/transaction, same established precedent as
-- every prior process-area addition (orgStructure, staffing/identity,
-- employeeDataSubordinates): Postgres forbids using a value added via
-- `ALTER TYPE ... ADD VALUE` in the same transaction that added it. The
-- table + RLS + role_permissions seed that actually use this value are in
-- the next migration.
-- ============================================================================

BEGIN;

ALTER TYPE process_area ADD VALUE 'systemSettings';

COMMIT;

-- ============================================================================
-- Verification — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 17 values, including 'systemSettings'.
-- SELECT enumlabel FROM pg_enum WHERE enumtypid = 'process_area'::regtype ORDER BY enumsortorder;
