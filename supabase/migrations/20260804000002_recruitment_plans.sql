-- ============================================================================
-- "خطة التوظيف" (Recruitment Plan) -- the first real content behind the
-- التوظيف module's first tab (20260804000001 added its `recruitmentPlan`
-- process area; the page itself has been a gated placeholder until now).
--
-- Shape confirmed with the project owner before writing anything ("نعم لكل
-- المقترحات، والصلاحية لـ hr_admin اعتماد و super_admin اطلاع"), after a
-- proposal grounded in what this database ALREADY holds rather than a
-- generic HR template:
--   * `org_structure_positions` has 49 real positions, only 5 staffed via
--     `org_structure_assignments` -> 44 genuinely vacant, every one of them
--     carrying a real `org_unit_id` and 41 of 44 a real `job_title_id`.
--   * `salary_scale` has 336 real rows keyed by job title, so a planned
--     hire's cost is derived from real figures, never typed from thin air.
-- The plan is therefore built FROM the org chart (import the vacant
-- positions) and flows INTO `vacancies` (publish an item as a real
-- posting), rather than being a free-standing list retyped by hand.
--
-- Two tables:
--   recruitment_plans       -- one plan per year (header + approval state)
--   recruitment_plan_items  -- one row per planned hire
--
-- [استنتاج] flags -- inferred, not documented anywhere, called out so they
-- can be corrected rather than discovered later:
--  * `status` on both tables is TEXT with no CHECK enum, same precedent as
--    `promotions.status`/`rewards.status`/`vacancies.status` (no confirmed
--    vocabulary exists). Plans default 'draft'; items default 'planned'.
--  * `UNIQUE(plan_year) WHERE deleted_at IS NULL` -- "خطة التوظيف السنوية"
--    reads as one plan per year; a soft-deleted plan doesn't block a
--    replacement (same partial-unique-index pattern as `evaluations`,
--    `calibration_results`, `org_structure_assignments`).
--  * `target_quarter` (1-4) rather than a specific month -- the project
--    owner picked quarterly explicitly.
--  * `job_title_id` is NULLABLE precisely because 3 of the 44 real vacant
--    positions (عمداء الكليات / المجلس العلمي / المشرفة على القسم النسائي)
--    genuinely have no job title linked -- making it NOT NULL would make
--    the "import vacant positions" flow silently drop them.
--  * `org_unit_id` IS NOT NULL -- all 44 real vacant positions have one,
--    checked before deciding, and every item needs a unit to be meaningful.
--  * `estimated_monthly_cost` is stored, not computed on read: it is
--    SEEDED from `salary_scale.step_a` for the chosen job title but stays
--    editable, so a plan approved last quarter keeps the number it was
--    approved with even if the salary scale is later revised. No currency
--    column (this database has none anywhere; `rewards.amount` set the
--    precedent), and only a non-negative CHECK -- a monetary figure has no
--    natural upper bound, unlike the 0-100 percentage columns elsewhere.
--
-- RLS uses `check_vpra_global('recruitmentPlan', ...)` (the established
-- tool for university-wide tables with no per-row org unit, 20260719000011)
-- rather than the org-scoped `check_vpra()`. Deliberate: a recruitment plan
-- is one university-wide document. Items DO carry an `org_unit_id`, but
-- gating them per-unit while their parent plan is global would let an
-- org-unit-scoped role see a plan whose totals it cannot reconcile from the
-- items it is allowed to read -- worse than either consistent choice. If
-- per-unit scoping is wanted later, that's a deliberate follow-up on BOTH
-- tables, not a silent asymmetry introduced here.
--
--   select : view      -- anyone granted the area can read the plan
--   insert : prepare   -- preparing the plan (hr_admin)
--   update : prepare   -- editing items/plan; approving is a status change
--                         guarded in the Server Action at 'approve', since
--                         VPRA has no per-column policy (documented in
--                         `approveRecruitmentPlan`)
--   delete : none      -- soft-delete via `deleted_at` only (§5-A rule 7)
--
-- Seeded grants, exactly as requested: hr_admin='approve',
-- super_admin='view'. No other role gains anything (least privilege,
-- CLAUDE.md §4-B) -- further roles are granted through the /admin editor.
-- ============================================================================

BEGIN;

CREATE TABLE recruitment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL,
  name_en TEXT,
  plan_year INTEGER NOT NULL CHECK (plan_year BETWEEN 2020 AND 2100),
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by UUID REFERENCES profiles (id) ON DELETE SET NULL,
  approved_by UUID REFERENCES profiles (id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX recruitment_plans_year_uidx
  ON recruitment_plans (plan_year)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE recruitment_plans IS 'خطة التوظيف السنوية -- one plan per year; items live in recruitment_plan_items.';

CREATE TABLE recruitment_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES recruitment_plans (id) ON DELETE CASCADE,
  org_unit_id UUID NOT NULL REFERENCES org_units (id) ON DELETE RESTRICT,
  job_title_id UUID REFERENCES job_titles (id) ON DELETE RESTRICT,
  -- The org-chart node this planned hire fills, when the item came from
  -- (or was matched to) the real structure. SET NULL rather than RESTRICT:
  -- restructuring the chart must not be blocked by an old plan, and the
  -- item still carries its own org unit/job title/headcount.
  position_id UUID REFERENCES org_structure_positions (id) ON DELETE SET NULL,
  headcount INTEGER NOT NULL DEFAULT 1 CHECK (headcount > 0),
  target_quarter SMALLINT CHECK (target_quarter BETWEEN 1 AND 4),
  priority TEXT,
  estimated_monthly_cost NUMERIC(12, 2) CHECK (estimated_monthly_cost IS NULL OR estimated_monthly_cost >= 0),
  justification TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  -- Set when the item is published as a real posting, linking plan ->
  -- execution. SET NULL so deleting a posting doesn't erase the plan item.
  vacancy_id UUID REFERENCES vacancies (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Same position can't be planned twice inside one plan (the "import vacant
-- positions" action relies on this to stay idempotent). Positions-less rows
-- (manually added items) are unconstrained, hence the partial index.
CREATE UNIQUE INDEX recruitment_plan_items_plan_position_uidx
  ON recruitment_plan_items (plan_id, position_id)
  WHERE position_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX recruitment_plan_items_plan_idx ON recruitment_plan_items (plan_id);

COMMENT ON TABLE recruitment_plan_items IS 'بنود خطة التوظيف -- one planned hire each; optionally linked to a vacant org-chart position and to the vacancy it was published as.';

ALTER TABLE recruitment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruitment_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY recruitment_plans_select ON recruitment_plans
  FOR SELECT TO authenticated
  USING (check_vpra_global('recruitmentPlan'::process_area, 'view'::vpra_level));

CREATE POLICY recruitment_plans_insert ON recruitment_plans
  FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('recruitmentPlan'::process_area, 'prepare'::vpra_level));

CREATE POLICY recruitment_plans_update ON recruitment_plans
  FOR UPDATE TO authenticated
  USING (check_vpra_global('recruitmentPlan'::process_area, 'prepare'::vpra_level))
  WITH CHECK (check_vpra_global('recruitmentPlan'::process_area, 'prepare'::vpra_level));

CREATE POLICY recruitment_plan_items_select ON recruitment_plan_items
  FOR SELECT TO authenticated
  USING (check_vpra_global('recruitmentPlan'::process_area, 'view'::vpra_level));

CREATE POLICY recruitment_plan_items_insert ON recruitment_plan_items
  FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('recruitmentPlan'::process_area, 'prepare'::vpra_level));

CREATE POLICY recruitment_plan_items_update ON recruitment_plan_items
  FOR UPDATE TO authenticated
  USING (check_vpra_global('recruitmentPlan'::process_area, 'prepare'::vpra_level))
  WITH CHECK (check_vpra_global('recruitmentPlan'::process_area, 'prepare'::vpra_level));

-- Requested grants: hr_admin owns and approves the plan, super_admin reads it.
INSERT INTO role_permissions (role_id, process_area, vpra_level)
SELECT id, 'recruitmentPlan'::process_area, 'approve'::vpra_level
FROM roles WHERE role_code = 'hr_admin'
ON CONFLICT (role_id, process_area) DO UPDATE SET vpra_level = EXCLUDED.vpra_level;

INSERT INTO role_permissions (role_id, process_area, vpra_level)
SELECT id, 'recruitmentPlan'::process_area, 'view'::vpra_level
FROM roles WHERE role_code = 'super_admin'
ON CONFLICT (role_id, process_area) DO UPDATE SET vpra_level = EXCLUDED.vpra_level;

COMMIT;

-- ============================================================================
-- Verification -- run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect exactly 2 grants: hr_admin=approve, super_admin=view.
-- SELECT r.role_code, rp.vpra_level FROM role_permissions rp
--   JOIN roles r ON r.id = rp.role_id
--   WHERE rp.process_area = 'recruitmentPlan' ORDER BY r.role_code;

-- Expect RLS enabled with 3 policies on each table.
-- SELECT tablename, count(*) FROM pg_policies
--   WHERE tablename IN ('recruitment_plans','recruitment_plan_items')
--   GROUP BY tablename;

-- Expect: an hr_admin test user can insert/select/update both tables; a
-- super_admin test user can select but every insert is rejected (42501) and
-- every update affects 0 rows; a role with no recruitmentPlan grant sees 0
-- rows on both.
