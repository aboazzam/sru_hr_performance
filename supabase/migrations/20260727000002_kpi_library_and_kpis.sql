-- ============================================================================
-- `kpi_library` (KPI catalog, managed/distributed by strategy_admin) and
-- `kpis` (per-employee KPI cascaded by the direct supervisor) — see this
-- session's exchange with the project owner, transcribed in the previous
-- migration's header. This is the schema half of the new "مؤشرات الأداء"
-- sidebar module; UI/Server Actions follow in a separate change.
--
-- Two-tier shape, deliberately mirroring `goal_library`/`goals`
-- (20260718000002/3) exactly — same reasoning for every design choice below
-- unless noted otherwise:
--
-- 1. `kpi_library` (the "بنك مؤشرات الأداء"):
--    - title_ar/en, description_ar/en, default_weight: identical shape/
--      CHECK to goal_library's own columns.
--    - unit_ar/en: [استنتاج] a KPI is meaningless without a measurement
--      unit ("%", "عدد", "ريال", ...) — not requested as a separate field
--      explicitly, but implied by "قيمة مستهدفة"/"قيمة فعلية" needing units
--      to be legible. NOT NULL on unit_ar (a library entry must define
--      what it measures), unit_en optional like every other bilingual pair.
--    - org_unit_id UUID NULL REFERENCES org_units: the literal "يوزعها على
--      الادارات" (distributes it to departments) mechanism — [استنتاج]
--      nullable, not NOT NULL like `vacancies.org_unit_id`, to allow a
--      draft/general entry before strategy_admin distributes it to a
--      specific department; an 'org_unit'-scoped role can never see a
--      NULL-org_unit row (check_vpra's own documented behavior — see
--      20260719000011's header), so an undistributed entry is invisible to
--      anyone but an 'all'-scoped role until actually distributed. This is
--      genuinely a per-row-org-scoped table (unlike goal_library's
--      job_family_id, which never gated RLS) — check_vpra(...,
--      org_unit_id), NOT check_vpra_global, is used throughout.
--
-- 2. `kpis` (the per-employee cascade — "الرئيس المباشر هو الذي يحدد
--    مؤشرات الاداء على مستوى الموظف"):
--    - employee_id/cycle_id/kpi_library_id/custom_title_ar/en: identical
--      shape (including the library-vs-custom mutually-exclusive CHECK) to
--      `goals`.
--    - target_value NUMERIC NOT NULL: the whole point of a KPI cascade — a
--      KPI without a target is meaningless, unlike `goals.target_ar` which
--      stayed optional free text.
--    - actual_value NUMERIC NULL: the achieved figure, filled in later
--      (not at assignment time) by whoever holds write access — see RLS
--      note below on who that is.
--    - unit_ar/en: copied onto the assignment row (not just referenced via
--      kpi_library) because a CUSTOM kpi (no kpi_library_id) has no library
--      row to source a unit from — same reasoning `goals` already applies
--      to target_ar/en living on the assignment row, not the library.
--    - weight/status: identical shape to `goals.weight`/`goals.status`.
--
-- 3. process_area = 'kpiLibrary' for kpi_library, 'kpiAssignment' for kpis —
--    direct facts from the previous migration's confirmed design, not
--    inferred.
--
-- 4. RLS for `kpis` mirrors `goals`' FINAL, already-corrected shape (after
--    20260718000009's is_my_direct_report() fix and 20260718000010's write
--    extension), built in from the start rather than repeating that same
--    incremental bug history:
--      kpis_select: self-row (EXISTS employee_id=caller) OR
--        check_vpra('kpiAssignment','prepare', org_unit_id) OR
--        is_my_direct_report(employee_id).
--      kpis_insert/update: check_vpra('kpiAssignment','prepare',
--        org_unit_id) OR is_my_direct_report(employee_id) — NO self-row
--        bypass, matching `goals` exactly: per the confirmed seeded matrix
--        (mirroring goalAssignment's), `employee` holds only 'view' on
--        kpiAssignment, one tier below supervisor/field_supervisor's
--        'prepare' — cascading a KPI onto yourself is not a thing an
--        employee can do, matching "المسقطة عليه" (cascaded ONTO them),
--        not self-authored. This also answers "who updates actual_value":
--        only supervisor/manager (via UPDATE), never the employee
--        themselves — the same write gate covers both the initial cascade
--        and any later actual-value entry.
--      No additional check_vpra layered onto the is_my_direct_report()
--      branch, for the exact reason 20260718000010 established:
--      profiles.supervisor_id can only be set via an already-authorized
--      profiles UPDATE (employeeData=prepare), so the relationship itself
--      is the authorization fact.
--
-- 5. kpi_library seeded role_permissions mirror goalsLibrary's exact matrix
--    (super_admin/ceo/cxo/hr_admin/manager/supervisor/employee/
--    field_supervisor = 'view', strategy_admin = 'approve' as sole owner);
--    kpis seeded role_permissions mirror goalAssignment's exact matrix
--    (super_admin/ceo/cxo/hr_admin/strategy_admin = 'view',
--    manager = 'approve', supervisor/field_supervisor = 'prepare',
--    employee = 'view') — both confirmed directly with the project owner
--    ("ما اقترحته من vpra مناسب جدا").
--
-- No unique constraint on (employee_id, cycle_id) on `kpis` — same as
-- `goals`, an employee can have several KPIs cascaded in one cycle.
-- ============================================================================

BEGIN;

CREATE TABLE kpi_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_ar TEXT NOT NULL,
  title_en TEXT,
  description_ar TEXT,
  description_en TEXT,
  default_weight NUMERIC(5,2),
  unit_ar TEXT NOT NULL,
  unit_en TEXT,
  org_unit_id UUID REFERENCES org_units(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT kpi_library_default_weight_range
    CHECK (default_weight IS NULL OR (default_weight > 0 AND default_weight <= 100))
);

ALTER TABLE kpi_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY kpi_library_select ON kpi_library FOR SELECT TO authenticated
  USING (check_vpra('kpiLibrary', 'view', org_unit_id));

CREATE POLICY kpi_library_insert ON kpi_library FOR INSERT TO authenticated
  WITH CHECK (check_vpra('kpiLibrary', 'approve', org_unit_id));

CREATE POLICY kpi_library_update ON kpi_library FOR UPDATE TO authenticated
  USING (check_vpra('kpiLibrary', 'approve', org_unit_id))
  WITH CHECK (check_vpra('kpiLibrary', 'approve', org_unit_id));

CREATE TABLE kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES evaluation_cycles(id) ON DELETE RESTRICT,
  kpi_library_id UUID REFERENCES kpi_library(id) ON DELETE RESTRICT,
  custom_title_ar TEXT,
  custom_title_en TEXT,
  target_value NUMERIC(14,2) NOT NULL,
  actual_value NUMERIC(14,2),
  unit_ar TEXT NOT NULL,
  unit_en TEXT,
  weight NUMERIC(5,2),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT kpis_weight_range
    CHECK (weight IS NULL OR (weight > 0 AND weight <= 100)),
  CONSTRAINT kpis_title_source
    CHECK (
      (kpi_library_id IS NOT NULL AND custom_title_ar IS NULL)
      OR (kpi_library_id IS NULL AND custom_title_ar IS NOT NULL)
    )
);

ALTER TABLE kpis ENABLE ROW LEVEL SECURITY;

CREATE POLICY kpis_select ON kpis FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = kpis.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('kpiAssignment', 'prepare', (SELECT org_unit_id FROM profiles WHERE id = kpis.employee_id))
    OR is_my_direct_report(kpis.employee_id)
  );

CREATE POLICY kpis_insert ON kpis FOR INSERT TO authenticated
  WITH CHECK (
    check_vpra('kpiAssignment', 'prepare', (SELECT org_unit_id FROM profiles WHERE id = kpis.employee_id))
    OR is_my_direct_report(kpis.employee_id)
  );

CREATE POLICY kpis_update ON kpis FOR UPDATE TO authenticated
  USING (
    check_vpra('kpiAssignment', 'prepare', (SELECT org_unit_id FROM profiles WHERE id = kpis.employee_id))
    OR is_my_direct_report(kpis.employee_id)
  )
  WITH CHECK (
    check_vpra('kpiAssignment', 'prepare', (SELECT org_unit_id FROM profiles WHERE id = kpis.employee_id))
    OR is_my_direct_report(kpis.employee_id)
  );

-- ----------------------------------------------------------------------------
-- role_permissions seed — mirrors goalsLibrary/goalAssignment's exact
-- matrices (migration 20260716000007), confirmed with the project owner.
-- ----------------------------------------------------------------------------

INSERT INTO role_permissions (role_id, process_area, vpra_level)
SELECT id, 'kpiLibrary'::process_area, 'view'::vpra_level FROM roles
WHERE role_code IN ('super_admin', 'ceo', 'cxo', 'hr_admin', 'manager', 'supervisor', 'employee', 'field_supervisor');

INSERT INTO role_permissions (role_id, process_area, vpra_level)
SELECT id, 'kpiLibrary'::process_area, 'approve'::vpra_level FROM roles WHERE role_code = 'strategy_admin';

INSERT INTO role_permissions (role_id, process_area, vpra_level)
SELECT id, 'kpiAssignment'::process_area, 'view'::vpra_level FROM roles
WHERE role_code IN ('super_admin', 'ceo', 'cxo', 'hr_admin', 'strategy_admin', 'employee');

INSERT INTO role_permissions (role_id, process_area, vpra_level)
SELECT id, 'kpiAssignment'::process_area, 'approve'::vpra_level FROM roles WHERE role_code = 'manager';

INSERT INTO role_permissions (role_id, process_area, vpra_level)
SELECT id, 'kpiAssignment'::process_area, 'prepare'::vpra_level FROM roles
WHERE role_code IN ('supervisor', 'field_supervisor');

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 2 rows, rowsecurity = true.
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('kpi_library','kpis');

-- Expect: CHECK rejects an out-of-range default_weight/weight; NULL and
-- valid values pass. CHECK rejects both kpi_library_id and custom_title_ar
-- set together on `kpis`, and rejects neither being set.

-- Expect: 9 kpiLibrary rows (8 'view' + strategy_admin 'approve') and 9
-- kpiAssignment rows (6 'view' + manager 'approve' + 2 'prepare').
-- SELECT r.role_code, rp.process_area, rp.vpra_level FROM role_permissions rp
--   JOIN roles r ON r.id = rp.role_id
--   WHERE rp.process_area IN ('kpiLibrary','kpiAssignment') ORDER BY 2, 3;

-- Expect (SET ROLE authenticated + simulated JWT): a `strategy_admin`
-- (kpiLibrary=approve) test user can insert a kpi_library row scoped to a
-- real org unit (distribution); a `supervisor` test user with a real direct
-- report (org_unit-scoped, scope NOT covering the report) can insert/see a
-- `kpis` row for that report via is_my_direct_report(); a plain `employee`
-- test user sees ONLY their own kpis row and cannot insert one for
-- themselves or anyone else.
