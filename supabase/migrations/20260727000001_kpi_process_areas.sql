-- ============================================================================
-- Add `kpiLibrary` and `kpiAssignment` as new process_area values (18th/19th).
--
-- New "مؤشرات الأداء" (KPI) module, requested 2026-07-27: a sidebar page
-- where an employee sees the KPIs cascaded onto them by their direct
-- supervisor/department manager, plus a KPI bank/catalog module managed by
-- `strategy_admin` who distributes catalog entries to departments (org
-- units) — the direct supervisor then sets the actual per-employee KPI
-- (target/actual value) from what's been distributed to their department.
--
-- Confirmed directly with the project owner, mirroring the already-existing
-- goalsLibrary/goalAssignment split exactly (same two-tier shape: a
-- strategy_admin-owned catalog + a supervisor-cascaded per-employee
-- assignment):
--   - "بنك الأهداف يديره مدير الاستراتيجية ونضع هذه الصلاحية في جدول
--     الصلاحيات" -> a new process area (`kpiLibrary`) for the catalog,
--     strategy_admin as sole 'approve' owner, seeded into role_permissions.
--   - "مدير الاستراتيجية يوزعها على الادارات" -> kpi_library rows carry a
--     nullable org_unit_id (distribution target), same shape as
--     `vacancies`/`evaluations`' real per-row org scoping.
--   - "الرئيس المباشر هو الذي يحدد مؤشرات الاداء على مستوى الموظف" -> a
--     second process area (`kpiAssignment`) for the per-employee cascade,
--     VPRA levels mirroring `goalAssignment`'s exact seeded matrix (the
--     project owner confirmed this proposed VPRA shape directly: "ما
--     اقترحته من vpra مناسب جدا").
--
-- Split into its own migration/transaction, same established precedent as
-- every prior process-area addition (orgStructure, staffing/identity,
-- employeeDataSubordinates, systemSettings): Postgres forbids using a value
-- added via `ALTER TYPE ... ADD VALUE` in the same transaction that added
-- it. The tables/RLS/seed that actually use these two values are in the
-- next migration.
-- ============================================================================

BEGIN;

ALTER TYPE process_area ADD VALUE 'kpiLibrary';
ALTER TYPE process_area ADD VALUE 'kpiAssignment';

COMMIT;

-- ============================================================================
-- Verification — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 19 values, including 'kpiLibrary' and 'kpiAssignment'.
-- SELECT enumlabel FROM pg_enum WHERE enumtypid = 'process_area'::regtype ORDER BY enumsortorder;
