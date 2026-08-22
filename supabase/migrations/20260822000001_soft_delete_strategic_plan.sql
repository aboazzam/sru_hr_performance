-- ============================================================================
-- حذف الخطة الاستراتيجية بكل ما تحتها (soft delete, one transaction)
--
-- Requested 2026-08-22: the plans list gained a delete action, and the warning
-- it shows promises that deleting a plan removes everything under it. That
-- promise has to be kept in ONE transaction — an application-code cascade
-- would need ~10 sequential round trips, and a failure halfway would leave a
-- half-deleted plan, which is worse than not deleting at all.
--
-- SECURITY INVOKER (the default) on purpose: every table touched here already
-- gates UPDATE at check_vpra_global('strategicPlanning','approve') — the same
-- level `strategic_plans_update` itself requires — so RLS stays the real
-- boundary and this function grants nothing new. A caller who cannot delete
-- the plan simply updates zero rows and gets the explicit failure below.
--
-- SOFT delete only: `deleted_at`, never a real DELETE (CLAUDE.md §5-A rule 7).
-- Every FK in this subtree is RESTRICT or CASCADE on a hard delete, so a real
-- DELETE would either be refused or silently destroy history.
--
-- NOT deleted, and this is deliberate: `strategic_identity` (vision/mission)
-- and `strategic_values` are UNIVERSITY-WIDE singletons with no plan_id —
-- they appear on a plan's screen but they are not owned by it, so deleting a
-- plan must not take the university's vision with it. The confirmation text
-- in the UI says so rather than implying otherwise.
-- ============================================================================

CREATE OR REPLACE FUNCTION soft_delete_strategic_plan(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_goal_ids UUID[];
  v_sub_goal_ids UUID[];
  v_kpi_ids UUID[];
  v_initiative_ids UUID[];
  v_program_ids UUID[];
  v_counts JSONB := '{}'::JSONB;
  v_n INTEGER;
  v_plan_rows INTEGER;
BEGIN
  SELECT array_agg(id) INTO v_goal_ids
    FROM strategic_goals WHERE plan_id = p_plan_id AND deleted_at IS NULL;
  v_goal_ids := COALESCE(v_goal_ids, ARRAY[]::UUID[]);

  SELECT array_agg(id) INTO v_sub_goal_ids
    FROM sub_goals WHERE strategic_goal_id = ANY(v_goal_ids) AND deleted_at IS NULL;
  v_sub_goal_ids := COALESCE(v_sub_goal_ids, ARRAY[]::UUID[]);

  SELECT array_agg(id) INTO v_kpi_ids
    FROM strategic_kpis
    WHERE (strategic_goal_id = ANY(v_goal_ids) OR sub_goal_id = ANY(v_sub_goal_ids))
      AND deleted_at IS NULL;
  v_kpi_ids := COALESCE(v_kpi_ids, ARRAY[]::UUID[]);

  SELECT array_agg(id) INTO v_initiative_ids
    FROM strategic_initiatives WHERE plan_id = p_plan_id AND deleted_at IS NULL;
  v_initiative_ids := COALESCE(v_initiative_ids, ARRAY[]::UUID[]);

  SELECT array_agg(id) INTO v_program_ids
    FROM strategic_programs WHERE plan_id = p_plan_id AND deleted_at IS NULL;
  v_program_ids := COALESCE(v_program_ids, ARRAY[]::UUID[]);

  -- Deepest rows first, so nothing is left pointing at a row that is already
  -- gone from every screen.
  UPDATE initiative_activities SET deleted_at = v_now
    WHERE initiative_id = ANY(v_initiative_ids) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('activities', v_n);

  UPDATE initiative_assignments SET deleted_at = v_now
    WHERE initiative_id = ANY(v_initiative_ids) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('assignments', v_n);

  -- Both directions: a dependency ON a deleted initiative is just as dead as
  -- one FROM it.
  UPDATE initiative_dependencies SET deleted_at = v_now
    WHERE (initiative_id = ANY(v_initiative_ids) OR depends_on_initiative_id = ANY(v_initiative_ids))
      AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('dependencies', v_n);

  UPDATE strategic_initiative_targets SET deleted_at = v_now
    WHERE (initiative_id = ANY(v_initiative_ids) OR kpi_id = ANY(v_kpi_ids)) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('initiativeTargets', v_n);

  UPDATE strategic_program_initiatives SET deleted_at = v_now
    WHERE (program_id = ANY(v_program_ids) OR initiative_id = ANY(v_initiative_ids)) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('programInitiatives', v_n);

  UPDATE strategic_program_committee_members SET deleted_at = v_now
    WHERE program_id = ANY(v_program_ids) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('committeeMembers', v_n);

  UPDATE kpi_annual_targets SET deleted_at = v_now
    WHERE kpi_id = ANY(v_kpi_ids) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('annualTargets', v_n);

  UPDATE targets SET deleted_at = v_now
    WHERE sub_goal_id = ANY(v_sub_goal_ids) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('assignedTargets', v_n);

  UPDATE strategic_kpis SET deleted_at = v_now
    WHERE id = ANY(v_kpi_ids) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('kpis', v_n);

  UPDATE strategic_programs SET deleted_at = v_now
    WHERE id = ANY(v_program_ids) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('programs', v_n);

  UPDATE strategic_initiatives SET deleted_at = v_now
    WHERE id = ANY(v_initiative_ids) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('initiatives', v_n);

  UPDATE sub_goals SET deleted_at = v_now
    WHERE id = ANY(v_sub_goal_ids) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('subGoals', v_n);

  UPDATE strategic_goals SET deleted_at = v_now
    WHERE id = ANY(v_goal_ids) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('goals', v_n);

  UPDATE executive_plans SET deleted_at = v_now
    WHERE strategic_plan_id = p_plan_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('executivePlans', v_n);

  UPDATE strategic_plans SET deleted_at = v_now
    WHERE id = p_plan_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_plan_rows = ROW_COUNT;

  -- Zero rows means RLS refused (or the plan was already deleted). Raising
  -- rolls the whole cascade back — a caller who cannot delete the plan must
  -- not be able to empty it either.
  IF v_plan_rows = 0 THEN
    RAISE EXCEPTION 'forbidden_or_missing'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'The plan row was not updated: either it does not exist, it is already deleted, or strategic_plans_update refused it.';
  END IF;

  RETURN v_counts || jsonb_build_object('plan', v_plan_rows);
END;
$$;

COMMENT ON FUNCTION soft_delete_strategic_plan(UUID) IS
  'حذف ناعم للخطة الاستراتيجية وكل ما تحتها في معاملة واحدة. لا يمس الرؤية والرسالة والقيم لأنها بيانات عامة للجامعة لا تخص خطة بعينها.';

REVOKE EXECUTE ON FUNCTION soft_delete_strategic_plan(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION soft_delete_strategic_plan(UUID) TO authenticated;
