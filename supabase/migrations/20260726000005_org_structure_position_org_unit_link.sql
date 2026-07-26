-- ============================================================================
-- Links `org_structure_positions` to `org_units`, closing a real gap the
-- project owner reported: "بالنسبة للموظفين لا يوجد ربط بين الوحدة
-- التنظيمية التابعين لها والهيكل التنظيمي لذلك لا نجد الموظفين التابعين
-- لمدير ادارة معينة" (for employees, there's no link between the org unit
-- they belong to and the org structure, so we can't find the employees
-- belonging to a specific department's manager).
--
-- `org_units` (58-unit college/department tree, drives `profiles.org_unit_id`
-- and the whole VPRA org-unit-scope model) and `org_structure_positions`
-- (the newer org-chart tree, staffed via `org_structure_assignments`) have
-- been two completely independent models since the org-structure feature
-- was first built (2026-07-22) -- there was no way to go from a position in
-- the chart to "which real employees sit under it" via their own org unit.
--
-- Confirmed directly with the project owner rather than guessed: the link
-- is `org_unit_id` on `org_structure_positions` (a position node CAN
-- represent a department), OPTIONAL per position (nullable -- not every
-- position, e.g. "نائب الرئيس التنفيذي", corresponds to a whole
-- department), and set manually, NOT by automatic name-matching against the
-- 58 existing units ("اختياري لكل منصب بدون مطابقة تلقائية"). No
-- uniqueness constraint -- the project owner didn't state one, and several
-- leadership positions could plausibly share one department.
-- ============================================================================

BEGIN;

ALTER TABLE org_structure_positions
  ADD COLUMN org_unit_id uuid REFERENCES org_units(id) ON DELETE SET NULL;

COMMIT;

-- ============================================================================
-- Verification — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: column exists, nullable, FK to org_units, ON DELETE SET NULL.
-- SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_name = 'org_structure_positions' AND column_name = 'org_unit_id';
