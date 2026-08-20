-- ============================================================================
-- المبادرات الاستراتيجية (strategic initiatives)
--
-- Requested 2026-08-19: "وبعد اضافة المستهدفات اضف المبادرات (المبادرات التي
-- ستحقق تلك المستهدفات) بحيث تكون المبادرات في تاب آخر ولكن يكون مربوطا
-- بالمستهدفات من تاب الاهداف الاستراتيجية".
--
-- Scope: schema + RLS only, mirroring how strategic_goals/sub_goals and
-- calibration/promotions each started as their own slice before any UI.
-- Programs (برامج الاستراتيجية), the executive-plan module and initiative
-- assignment to departments are separate, later slices — nothing here
-- anticipates them.
--
-- ---------------------------------------------------------------------------
-- WHAT "المستهدف" MEANS HERE — the one genuinely ambiguous point
-- ---------------------------------------------------------------------------
-- The plan screen shows targets at TWO levels, and the request's wording
-- fits both: `strategic_kpis.plan_target_value` (labelled "مستهدف الخطة" in
-- the UI) and `kpi_annual_targets.target_value` (the per-cycle "المستهدفات
-- السنوية"). Rather than guess, `strategic_initiative_targets` links to
-- EITHER via an XOR — the same pattern strategic_kpis itself already uses
-- for (strategic_goal_id XOR sub_goal_id) and evaluation_scores for
-- (competency_id XOR goal_id). This also keeps the feature usable today:
-- production currently has ZERO evaluation_cycles and therefore ZERO
-- kpi_annual_targets (verified directly), so an annual-target-only link
-- would have shipped a tab nobody could use.
--
-- The link is many-to-many and OPTIONAL: an initiative may serve several
-- targets, and may start life linked to none (it is still owned by the plan
-- via plan_id).
--
-- [استنتاج] start_date/end_date live on the initiative itself. The request
-- states the executive plan must show "المبادرات المحددة في نفس توقيت
-- الخطة التنفيذية", which is impossible without the initiative carrying its
-- own period; both are nullable so an initiative can be recorded before its
-- schedule is set.
--
-- process_area: reuses `strategicPlanning` (no new area) — initiatives are
-- part of the strategic-plan module, the same reuse-don't-duplicate
-- reasoning already applied to feedback_360 -> 'evaluation' and
-- rewards -> 'promotions'.
-- ============================================================================

CREATE TABLE strategic_initiatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES strategic_plans(id) ON DELETE RESTRICT,
  -- Nullable: an initiative can be recorded before its owning position is
  -- decided. When set, it also widens SELECT to that position's holder
  -- (mirroring sub_goals.owner_position_id's own visibility branch).
  owner_position_id UUID REFERENCES org_structure_positions(id) ON DELETE RESTRICT,
  title_ar TEXT NOT NULL,
  title_en TEXT,
  description_ar TEXT,
  description_en TEXT,
  start_date DATE,
  end_date DATE,
  -- Free TEXT with no CHECK enum: no vocabulary is documented anywhere for
  -- initiative status, same precedent as goals.status / promotions.status /
  -- calibration_sessions.status.
  status TEXT NOT NULL DEFAULT 'planned',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT strategic_initiatives_dates_valid CHECK (
    start_date IS NULL OR end_date IS NULL OR end_date >= start_date
  )
);

COMMENT ON TABLE strategic_initiatives IS 'المبادرات التي تحقق مستهدفات الخطة الاستراتيجية. ترتبط بمستهدف سنوي أو بمؤشر عبر strategic_initiative_targets.';

CREATE INDEX strategic_initiatives_plan_idx ON strategic_initiatives (plan_id) WHERE deleted_at IS NULL;

CREATE TABLE strategic_initiative_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id UUID NOT NULL REFERENCES strategic_initiatives(id) ON DELETE CASCADE,
  kpi_id UUID REFERENCES strategic_kpis(id) ON DELETE CASCADE,
  kpi_annual_target_id UUID REFERENCES kpi_annual_targets(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT strategic_initiative_targets_parent_xor CHECK (
    (kpi_id IS NOT NULL AND kpi_annual_target_id IS NULL)
    OR (kpi_id IS NULL AND kpi_annual_target_id IS NOT NULL)
  )
);

COMMENT ON TABLE strategic_initiative_targets IS 'ربط المبادرة بمستهدف: إمّا مؤشر (مستهدف الخطة) أو مستهدف سنوي لدورة معيّنة.';

-- TWO partial indexes, not one compound UNIQUE: with a nullable column in
-- the key, a plain UNIQUE silently permits duplicates whenever that column
-- is NULL — the same NULL-uniqueness trap already hit by evaluation_scores,
-- org_units' single-root constraint and user_roles' scope uniqueness.
CREATE UNIQUE INDEX strategic_initiative_targets_kpi_uidx
  ON strategic_initiative_targets (initiative_id, kpi_id)
  WHERE kpi_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX strategic_initiative_targets_annual_uidx
  ON strategic_initiative_targets (initiative_id, kpi_annual_target_id)
  WHERE kpi_annual_target_id IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- RLS — mirrors strategic_goals/sub_goals exactly
-- ---------------------------------------------------------------------------
ALTER TABLE strategic_initiatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategic_initiative_targets ENABLE ROW LEVEL SECURITY;

-- SELECT: the module-wide 'view' grant, OR the holder of the initiative's
-- own owning position (is_my_strategic_position, the same helper sub_goals
-- uses) so a position holder sees their own initiatives without a
-- strategicPlanning grant.
CREATE POLICY strategic_initiatives_select ON strategic_initiatives FOR SELECT TO authenticated
  USING (
    check_vpra_global('strategicPlanning', 'view')
    OR (owner_position_id IS NOT NULL AND is_my_strategic_position(owner_position_id))
  );

CREATE POLICY strategic_initiatives_insert ON strategic_initiatives FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

CREATE POLICY strategic_initiatives_update ON strategic_initiatives FOR UPDATE TO authenticated
  USING (check_vpra_global('strategicPlanning', 'approve'))
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

-- No DELETE policy: soft-delete via deleted_at only (CLAUDE.md §5-A rule 7),
-- same as every other table in this module.

-- The link row is visible exactly when its initiative is: re-deriving the
-- condition here instead would be a second copy to keep in sync.
CREATE POLICY strategic_initiative_targets_select ON strategic_initiative_targets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM strategic_initiatives i
      WHERE i.id = strategic_initiative_targets.initiative_id
    )
  );

CREATE POLICY strategic_initiative_targets_insert ON strategic_initiative_targets FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

CREATE POLICY strategic_initiative_targets_update ON strategic_initiative_targets FOR UPDATE TO authenticated
  USING (check_vpra_global('strategicPlanning', 'approve'))
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));
