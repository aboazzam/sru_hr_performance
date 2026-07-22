-- ============================================================================
-- Organizational Structure builder: levels -> positions -> staffing
--
-- Per the project owner's explicit instruction (2026-07-22): built as three
-- brand-new tables, deliberately independent of `org_units` (58-row static
-- college/department tree) and `job_titles` (career-ladder catalog with
-- grade_level 1-14) — "لا أريدك أن تعتمد على الجداول السابقة ... وهذه ليست
-- لها علاقة بالدرجات الوظيفية". Levels are a flat, sequentially-ordered list
-- ("إدراج المستويات أولا بأول" — insert levels one after another), not a
-- branching tree; positions belong to exactly one level; staffing assigns
-- profiles to positions with no fixed headcount cap (a position can have
-- zero, one, or several people assigned) since no cap was requested.
-- [استنتاج] Flagged as an interpretation, not confirmed: if the project
-- owner actually wanted branching (multiple parallel nodes per level, each
-- with its own parent), that would need a parent_id column added later.
--
-- org_structure_levels(id, name_ar, name_en, level_order UNIQUE, deleted_at)
-- org_structure_positions(id, level_id FK, name_ar, name_en, deleted_at)
-- org_structure_assignments(id, position_id FK, employee_id FK->profiles,
--   assigned_at, deleted_at) — partial-unique on (position_id, employee_id)
--   WHERE deleted_at IS NULL, same NULL-safe pattern this project always
--   uses for soft-deletable uniqueness (org_units' single-root constraint,
--   user_roles' scope uniqueness, evaluations' per-cycle uniqueness, ...).
--
-- RLS uses check_vpra_global('orgStructure', level) — no org_unit_id exists
-- on any of these three tables (this structure is explicitly NOT organized
-- by org_unit), so the org_unit-scoped branch check_vpra() has doesn't apply
-- here; check_vpra_global() is the correct, already-established tool for
-- exactly this "university-wide catalog, no per-row org unit" shape
-- (20260719000011). SELECT is 'view' on all three (org_structure_assignments
-- additionally allows an employee to see their own assignment row, matching
-- the self-visibility convention already used everywhere else in this
-- schema); INSERT/UPDATE require 'approve'; no DELETE policy (soft-delete
-- only, per CLAUDE.md §5-A rule 7).
--
-- role_permissions seeded: hr_admin='approve' (the specific ask), plus
-- super_admin='view' (consistent with the established pattern of
-- super_admin seeing but not automatically holding blanket approve
-- elsewhere in this schema — CLAUDE.md's own §4-A comment: "no role gets an
-- undocumented implicit bypass"). No other role granted anything here;
-- flagged as the default seed, not separately confirmed with the project
-- owner beyond the hr_admin ask itself.
-- ============================================================================

BEGIN;

CREATE TABLE org_structure_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL,
  name_en TEXT,
  level_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX org_structure_levels_order_uidx
  ON org_structure_levels (level_order) WHERE deleted_at IS NULL;

COMMENT ON TABLE org_structure_levels IS 'A flat, sequentially-ordered tier in the new from-scratch organizational structure (independent of org_units). level_order is the display/insertion sequence, not a career grade.';

CREATE TABLE org_structure_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level_id UUID NOT NULL REFERENCES org_structure_levels (id) ON DELETE RESTRICT,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE org_structure_positions IS 'A named position belonging to exactly one org_structure_levels row. Independent of job_titles (career-ladder catalog) — this is a distinct, purpose-built concept per the project owner''s explicit instruction.';

CREATE TABLE org_structure_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES org_structure_positions (id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX org_structure_assignments_uidx
  ON org_structure_assignments (position_id, employee_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE org_structure_assignments IS '"تسكين الأشخاص على الوظائف" — staffs a profile onto an org_structure_positions row. No fixed headcount cap: a position may have zero, one, or several active assignments, since none was requested.';

ALTER TABLE org_structure_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_structure_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_structure_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_structure_levels_select ON org_structure_levels FOR SELECT TO authenticated
  USING (check_vpra_global('orgStructure', 'view'));

CREATE POLICY org_structure_levels_insert ON org_structure_levels FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('orgStructure', 'approve'));

CREATE POLICY org_structure_levels_update ON org_structure_levels FOR UPDATE TO authenticated
  USING (check_vpra_global('orgStructure', 'approve'))
  WITH CHECK (check_vpra_global('orgStructure', 'approve'));

CREATE POLICY org_structure_positions_select ON org_structure_positions FOR SELECT TO authenticated
  USING (check_vpra_global('orgStructure', 'view'));

CREATE POLICY org_structure_positions_insert ON org_structure_positions FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('orgStructure', 'approve'));

CREATE POLICY org_structure_positions_update ON org_structure_positions FOR UPDATE TO authenticated
  USING (check_vpra_global('orgStructure', 'approve'))
  WITH CHECK (check_vpra_global('orgStructure', 'approve'));

CREATE POLICY org_structure_assignments_select ON org_structure_assignments FOR SELECT TO authenticated
  USING (
    check_vpra_global('orgStructure', 'view')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = employee_id AND p.auth_user_id = auth.uid())
  );

CREATE POLICY org_structure_assignments_insert ON org_structure_assignments FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('orgStructure', 'approve'));

CREATE POLICY org_structure_assignments_update ON org_structure_assignments FOR UPDATE TO authenticated
  USING (check_vpra_global('orgStructure', 'approve'))
  WITH CHECK (check_vpra_global('orgStructure', 'approve'));

INSERT INTO role_permissions (role_id, process_area, vpra_level)
SELECT r.id, 'orgStructure'::process_area, 'approve'::vpra_level
FROM roles r WHERE r.role_code = 'hr_admin';

INSERT INTO role_permissions (role_id, process_area, vpra_level)
SELECT r.id, 'orgStructure'::process_area, 'view'::vpra_level
FROM roles r WHERE r.role_code = 'super_admin';

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 3 rows, rowsecurity = true for all.
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'org_structure_%';

-- Expect: 2 rows (hr_admin=approve, super_admin=view).
-- SELECT r.role_code, rp.vpra_level FROM role_permissions rp
--   JOIN roles r ON r.id = rp.role_id WHERE rp.process_area = 'orgStructure';

-- Expect: false for a fresh session with no orgStructure grant.
-- SELECT check_vpra_global('orgStructure', 'view');
