-- ============================================================================
-- Add `orgStructure` as a 13th process_area value.
--
-- The project owner explicitly asked for a NEW, standalone capability: build
-- an organizational structure (levels -> positions -> staffing) "from
-- scratch", deliberately NOT reusing `org_units`/`job_titles` and explicitly
-- unrelated to career grades ("ليست لها علاقة بالدرجات الوظيفية"). A
-- dedicated permission was requested specifically for `hr_admin` ("أريد أن
-- تكون هناك صلاحية عند hr_admin") — none of the 12 existing process areas
-- fit this (closest, `employeeData`, is about individual employee master
-- data, not a whole new structure concept), so this adds a new one rather
-- than overloading an existing area the way `feedback_360`/`rewards` reused
-- `evaluation`/`promotions` (those had a documented textual overlap; this
-- doesn't).
--
-- Split into its own migration/transaction deliberately: Postgres forbids
-- using a value added via `ALTER TYPE ... ADD VALUE` in the same transaction
-- that added it. The tables/RLS/role_permissions seed that actually use
-- 'orgStructure' are in the next migration.
-- ============================================================================

BEGIN;

ALTER TYPE process_area ADD VALUE 'orgStructure';

COMMIT;

-- ============================================================================
-- Verification — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 13 values, including 'orgStructure'.
-- SELECT enumlabel FROM pg_enum WHERE enumtypid = 'process_area'::regtype ORDER BY enumsortorder;
