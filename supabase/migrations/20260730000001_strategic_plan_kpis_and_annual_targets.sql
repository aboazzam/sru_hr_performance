-- ============================================================================
-- Strategic plan container + multi-KPI-per-goal + two-layer targets
-- (plan-long vs. annual). Restructures the cascade introduced in
-- 20260727000005 per the project owner's explicit answers (2026-07-30):
--
--   "قد يوجد اكثر من مؤشر للهدف الواحد ولكل مؤشر مستهدف"
--   "الاهداف والمؤشرات لا تتغير على طوال سنوات الخطة الا بقرار من صاحب
--    الصلاحية"
--   "اما المستهدف ففيه مستهدف على طول الخطة وهذا لايغير الا من قبل صاحب
--    الصلاحية ومستهدف سنوي وعليه يتم التقييم سواء للفرد او الادارة"
--
-- Three structural consequences, each a direct reading of the above:
--
-- 1. A strategic goal spans the WHOLE plan, not one evaluation cycle --
--    so `strategic_goals.cycle_id` is wrong and is replaced by
--    `plan_id` -> the new `strategic_plans` (a multi-year container).
--    Evaluation cycles keep their role, but as the ANNUAL measurement
--    period (see 3), not as the goal's owner.
--
-- 2. KPIs move OFF the goal row into their own `strategic_kpis` table
--    (many per goal), since "أكثر من مؤشر للهدف الواحد" is impossible with
--    the single inline unit_ar/target_value shape 20260727000005 used
--    ("one KPI per strategic goal", explicitly confirmed at the time --
--    now superseded). One table with an XOR on
--    (strategic_goal_id, sub_goal_id) rather than two near-identical
--    tables, because sub-goals need the same "مؤشرها الخاص" treatment --
--    same established XOR pattern as targets_assignee_xor and `goals`'
--    own title-source CHECK.
--
-- 3. A KPI carries TWO target layers:
--      - plan_target_value on the KPI row itself = "مستهدف على طول الخطة",
--        approve-only to change.
--      - `kpi_annual_targets` (kpi_id, cycle_id) = "مستهدف سنوي وعليه يتم
--        التقييم", one row per KPI per cycle, carrying its own
--        actual_value. This is the organization-level annual figure --
--        the per-department/per-employee annual figures remain `targets`
--        rows (the cascade), which gain `kpi_id`/`cycle_id` below so each
--        cascaded figure states which KPI it serves and for which year.
--
-- SAFE TO RESTRUCTURE RATHER THAN DATA-MIGRATE: strategic_goals,
-- sub_goals, targets and evaluation_cycles were all verified EMPTY in the
-- real database immediately before writing this (0 rows each), so the
-- dropped columns carry no production data. `strategic_values` (5 real
-- rows) and `strategic_identity` are untouched by this migration.
--
-- ----------------------------------------------------------------------------
-- Authorization -- unchanged model, extended to the new tables:
--   * Goals and KPIs are DEFINITIONAL and stable across the plan, so
--     INSERT/UPDATE on strategic_plans/strategic_kpis/kpi_annual_targets is
--     check_vpra_global('strategicPlanning','approve') -- strategy_admin
--     only, the literal "لا تغير إلا بقرار من صاحب الصلاحية".
--   * SELECT reuses the existing per-row ownership model rather than a flat
--     grant: can_view_strategic_kpi() answers "is this KPI's goal/sub-goal
--     or any cascaded target under it mine" via the already-verified
--     is_my_strategic_position()/is_in_my_strategic_subtree() helpers.
--     SECURITY DEFINER specifically so its inner lookups do NOT re-enter
--     RLS -- the same recursion hazard 20260727000005's own header
--     documents hitting live on targets_insert.
--
-- [استنتاج] flagged, not stated by the project owner:
--   * start_year/end_year as INTEGERs rather than dates -- "سنوات الخطة" is
--     expressed in years, and the exact annual boundaries already live on
--     evaluation_cycles.
--   * targets.kpi_id / targets.cycle_id are NULLABLE, not NOT NULL. The
--     cascade UI (AssignTargetForm/assignTarget) does not yet supply them;
--     making them required in this migration would break every cascade
--     insert between this schema change and that UI change. Tightening
--     both to NOT NULL once the UI supplies them is a deliberate
--     follow-up, not an oversight.
--   * kpi_annual_targets INSERT/UPDATE gated at 'approve' (org-level annual
--     figures are a strategy_admin act). Whether a sub-goal owner should
--     set their OWN annual figure directly on the KPI, rather than via a
--     cascaded `targets` row, was not specified -- the cascade path is
--     assumed, matching the existing design.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. strategic_plans -- the multi-year container
-- ----------------------------------------------------------------------------
CREATE TABLE strategic_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL,
  name_en TEXT,
  start_year INTEGER NOT NULL,
  end_year INTEGER NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT strategic_plans_year_order CHECK (end_year >= start_year),
  CONSTRAINT strategic_plans_year_sane CHECK (start_year BETWEEN 2000 AND 2200)
);

COMMENT ON TABLE strategic_plans IS 'Multi-year strategic plan container. Strategic goals belong to a plan (stable across its years), while evaluation_cycles supply the annual measurement periods.';

-- ----------------------------------------------------------------------------
-- 2. strategic_goals: belong to a PLAN, and no longer carry an inline KPI
-- ----------------------------------------------------------------------------
ALTER TABLE strategic_goals
  ADD COLUMN plan_id UUID REFERENCES strategic_plans(id) ON DELETE RESTRICT;

-- Safe: table verified empty. cycle_id is dropped rather than kept
-- alongside plan_id, so there is exactly one answer to "what period does
-- this goal cover" instead of two contradictory ones.
ALTER TABLE strategic_goals DROP COLUMN cycle_id;
ALTER TABLE strategic_goals ALTER COLUMN plan_id SET NOT NULL;

-- The inline single-KPI shape, superseded by strategic_kpis below.
ALTER TABLE strategic_goals
  DROP COLUMN target_value,
  DROP COLUMN actual_value,
  DROP COLUMN unit_ar,
  DROP COLUMN unit_en;

-- Same for sub_goals: their KPIs also move into strategic_kpis.
ALTER TABLE sub_goals
  DROP COLUMN target_value,
  DROP COLUMN actual_value,
  DROP COLUMN unit_ar,
  DROP COLUMN unit_en;

-- ----------------------------------------------------------------------------
-- 3. strategic_kpis -- many per goal OR per sub-goal (XOR)
-- ----------------------------------------------------------------------------
CREATE TABLE strategic_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategic_goal_id UUID REFERENCES strategic_goals(id) ON DELETE CASCADE,
  sub_goal_id UUID REFERENCES sub_goals(id) ON DELETE CASCADE,
  title_ar TEXT NOT NULL,
  title_en TEXT,
  unit_ar TEXT NOT NULL,
  unit_en TEXT,
  plan_target_value NUMERIC(14,2),
  weight NUMERIC(5,2),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT strategic_kpis_weight_range CHECK (weight IS NULL OR (weight > 0 AND weight <= 100)),
  CONSTRAINT strategic_kpis_parent_xor CHECK (
    (strategic_goal_id IS NOT NULL AND sub_goal_id IS NULL)
    OR (strategic_goal_id IS NULL AND sub_goal_id IS NOT NULL)
  )
);

COMMENT ON COLUMN strategic_kpis.plan_target_value IS 'مستهدف على طول الخطة -- the whole-plan target for this KPI, changed only by an approve-level holder. The annual figures live in kpi_annual_targets.';

CREATE INDEX strategic_kpis_goal_idx ON strategic_kpis (strategic_goal_id) WHERE deleted_at IS NULL;
CREATE INDEX strategic_kpis_sub_goal_idx ON strategic_kpis (sub_goal_id) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 4. kpi_annual_targets -- "مستهدف سنوي وعليه يتم التقييم" (org level)
-- ----------------------------------------------------------------------------
CREATE TABLE kpi_annual_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id UUID NOT NULL REFERENCES strategic_kpis(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES evaluation_cycles(id) ON DELETE RESTRICT,
  target_value NUMERIC(14,2) NOT NULL,
  actual_value NUMERIC(14,2),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Partial (not a plain compound UNIQUE) so a soft-deleted row never blocks
-- a replacement -- the same NULL-safety reasoning as
-- evaluations_employee_cycle_active_uidx.
CREATE UNIQUE INDEX kpi_annual_targets_kpi_cycle_active_uidx
  ON kpi_annual_targets (kpi_id, cycle_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE kpi_annual_targets IS 'One annual target per KPI per evaluation cycle -- the organization-level "مستهدف سنوي" that evaluation is measured against. Per-department/per-employee annual figures are `targets` rows instead.';

-- ----------------------------------------------------------------------------
-- 5. targets: state which KPI and which year each cascaded figure serves
-- ----------------------------------------------------------------------------
ALTER TABLE targets
  ADD COLUMN kpi_id UUID REFERENCES strategic_kpis(id) ON DELETE RESTRICT,
  ADD COLUMN cycle_id UUID REFERENCES evaluation_cycles(id) ON DELETE RESTRICT;

CREATE INDEX targets_kpi_idx ON targets (kpi_id) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 6. Visibility helper -- SECURITY DEFINER so its lookups never re-enter
--    RLS (see this file's header on the recursion hazard).
-- ----------------------------------------------------------------------------
CREATE FUNCTION can_view_strategic_kpi(p_kpi_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM strategic_kpis k
    LEFT JOIN sub_goals sg ON sg.id = k.sub_goal_id
    WHERE k.id = p_kpi_id
      AND (
        is_my_strategic_position(sg.owner_position_id)
        OR EXISTS (
          SELECT 1 FROM sub_goals s2
          WHERE s2.strategic_goal_id = k.strategic_goal_id
            AND is_my_strategic_position(s2.owner_position_id)
        )
        OR EXISTS (
          SELECT 1 FROM targets t
          WHERE t.kpi_id = k.id
            AND (
              is_in_my_strategic_subtree(t.id)
              OR EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = t.assigned_employee_id AND p.auth_user_id = auth.uid()
              )
            )
        )
      )
  );
$$;

COMMENT ON FUNCTION can_view_strategic_kpi IS 'TRUE iff the caller owns the KPI''s parent sub-goal, owns any sub-goal under the KPI''s parent strategic goal, or owns/is assigned any cascaded target under the KPI. SECURITY DEFINER so the inner lookups bypass RLS (avoids the policy-recursion hazard documented in 20260727000005).';

REVOKE ALL ON FUNCTION can_view_strategic_kpi(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION can_view_strategic_kpi(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION can_view_strategic_kpi(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. RLS
-- ----------------------------------------------------------------------------
ALTER TABLE strategic_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategic_kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_annual_targets ENABLE ROW LEVEL SECURITY;

-- The plan itself is the shared frame of reference for everyone with any
-- cascade involvement, so SELECT is deliberately broad ('view' OR owning
-- anything at all in the tree would be equivalent in practice here);
-- writes stay approve-only.
CREATE POLICY strategic_plans_select ON strategic_plans FOR SELECT TO authenticated
  USING (
    check_vpra_global('strategicPlanning', 'view')
    OR EXISTS (
      SELECT 1 FROM strategic_goals g
      WHERE g.plan_id = strategic_plans.id
    )
  );

CREATE POLICY strategic_plans_insert ON strategic_plans FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

CREATE POLICY strategic_plans_update ON strategic_plans FOR UPDATE TO authenticated
  USING (check_vpra_global('strategicPlanning', 'approve'))
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

CREATE POLICY strategic_kpis_select ON strategic_kpis FOR SELECT TO authenticated
  USING (
    check_vpra_global('strategicPlanning', 'view')
    OR can_view_strategic_kpi(id)
  );

CREATE POLICY strategic_kpis_insert ON strategic_kpis FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

CREATE POLICY strategic_kpis_update ON strategic_kpis FOR UPDATE TO authenticated
  USING (check_vpra_global('strategicPlanning', 'approve'))
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

CREATE POLICY kpi_annual_targets_select ON kpi_annual_targets FOR SELECT TO authenticated
  USING (
    check_vpra_global('strategicPlanning', 'view')
    OR can_view_strategic_kpi(kpi_id)
  );

CREATE POLICY kpi_annual_targets_insert ON kpi_annual_targets FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

CREATE POLICY kpi_annual_targets_update ON kpi_annual_targets FOR UPDATE TO authenticated
  USING (check_vpra_global('strategicPlanning', 'approve'))
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

COMMIT;
