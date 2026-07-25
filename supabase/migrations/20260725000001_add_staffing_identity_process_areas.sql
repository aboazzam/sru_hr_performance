-- ============================================================================
-- Add `staffing` and `identity` as new process_area values (14th/15th).
--
-- Real feedback (2026-07-25): the project owner granted a test role
-- `orgStructure=view` and found it also surfaced the Staffing and Identity
-- nav tabs plus the Add Level/Add Position builder forms — all of which
-- were bundled under the single `orgStructure` area, differentiated only
-- by VPRA level (view vs prepare vs approve). Explicit request: "أضف
-- صلاحية الهوية والتسكين إلى مصفوفة الصلاحيات" (add Identity and Staffing
-- permission to the permissions matrix) — i.e. split these into their own
-- independently-grantable areas rather than deriving their visibility from
-- `orgStructure`'s level alone.
--
-- Split into its own migration/transaction deliberately, same precedent as
-- `orgStructure` itself (20260722000003): Postgres forbids using a value
-- added via `ALTER TYPE ... ADD VALUE` in the same transaction that added
-- it. The RLS/role_permissions changes that actually use these two values
-- are in the next migration.
-- ============================================================================

BEGIN;

ALTER TYPE process_area ADD VALUE 'staffing';
ALTER TYPE process_area ADD VALUE 'identity';

COMMIT;

-- ============================================================================
-- Verification — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 15 values, including 'staffing' and 'identity'.
-- SELECT enumlabel FROM pg_enum WHERE enumtypid = 'process_area'::regtype ORDER BY enumsortorder;
