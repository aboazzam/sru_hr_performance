-- ============================================================================
-- Add `employeeDataSubordinates` as a new process_area value (17th; the DB
-- enum already carries an unused `reports` value from 20260725000006, so
-- this is the 17th enum label but the 16th one actually referenced by the
-- application).
--
-- Real feedback (2026-07-25): "في الصلاحيات قسم بيانات الموظفين الى (بيانات
-- جميع الموظفين وبيانات الموظفين التابعين)" -- split "Employee Data" into
-- two independently-grantable areas: the existing `employeeData` stays
-- exactly as-is ("بيانات جميع الموظفين تظهر فقط لمن لديه صلاحيات ... بيانات
-- الموظفين كما هي عليه الان" -- explicit confirmation from the project
-- owner that this area's own meaning/behavior does not change), and this
-- new area governs visibility into an employee's OWN reporting chain
-- (a manager's direct reports, their reports' reports, and so on --
-- "من ارتبط بمن ارتبط به"), independent of org-unit scope entirely.
--
-- Split into its own migration/transaction, same precedent as every prior
-- process_area addition (staffing/identity/orgStructure/reports): Postgres
-- forbids using a value added via `ALTER TYPE ... ADD VALUE` in the same
-- transaction that added it.
--
-- Per CLAUDE.md §4-B rule 4 ("new roles inherit none on all process areas by
-- default"), no role_permissions rows are seeded here -- every role starts
-- at 'none' on this new area until the project owner configures it via
-- /admin's role editor. This is a real, deliberate consequence: the
-- previously-shipped free "supervisor sees their direct report" bypass
-- (is_my_direct_report() in profiles_select, 20260725000007) is REPLACED in
-- the next migration by a gated recursive check requiring this new area --
-- so supervisor/manager/field_supervisor will need to be explicitly granted
-- at least 'view' here before they can see their teams again.
-- ============================================================================

BEGIN;

ALTER TYPE process_area ADD VALUE 'employeeDataSubordinates';

COMMIT;

-- ============================================================================
-- Verification — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 17 values, including 'employeeDataSubordinates'.
-- SELECT enumlabel FROM pg_enum WHERE enumtypid = 'process_area'::regtype ORDER BY enumsortorder;
