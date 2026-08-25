-- =========================================================================
-- "الخطة التنفيذية" becomes "الخطة التشغيلية" — the schema side.
--
-- The UI label was renamed on 2026-08-25; this carries the same rename into
-- the tables so the schema does not keep contradicting the screens.
--
-- Renamed: the four tables, and every policy / index / constraint whose NAME
-- carries the old word. A rename keeps the objects themselves attached and
-- the data untouched — this is purely what things are called.
--
-- Deliberately NOT renamed, each for a reason:
--   * the column executive_plan_target_id — columns were not asked for, and
--     every select that names it would have to change with it.
--   * the functions record_executive_plan_target_actual and
--     save_executive_plan_target_* — the app calls them by name through rpc().
--     Their BODIES are rewritten below, which is not optional: a plpgsql body
--     resolves its table names at execution, so leaving them would break every
--     one of these functions the moment the tables move.
-- =========================================================================

BEGIN;

-- 1) the tables
ALTER TABLE executive_plans RENAME TO operational_plans;
ALTER TABLE executive_plan_targets RENAME TO operational_plan_targets;
ALTER TABLE executive_plan_target_org_units RENAME TO operational_plan_target_org_units;
ALTER TABLE executive_plan_target_employees RENAME TO operational_plan_target_employees;

-- 2) policy names (12)
ALTER POLICY executive_plan_target_employees_insert ON operational_plan_target_employees RENAME TO operational_plan_target_employees_insert;
ALTER POLICY executive_plan_target_employees_select ON operational_plan_target_employees RENAME TO operational_plan_target_employees_select;
ALTER POLICY executive_plan_target_employees_update ON operational_plan_target_employees RENAME TO operational_plan_target_employees_update;
ALTER POLICY executive_plan_target_org_units_insert ON operational_plan_target_org_units RENAME TO operational_plan_target_org_units_insert;
ALTER POLICY executive_plan_target_org_units_select ON operational_plan_target_org_units RENAME TO operational_plan_target_org_units_select;
ALTER POLICY executive_plan_target_org_units_update ON operational_plan_target_org_units RENAME TO operational_plan_target_org_units_update;
ALTER POLICY executive_plan_targets_insert ON operational_plan_targets RENAME TO operational_plan_targets_insert;
ALTER POLICY executive_plan_targets_select ON operational_plan_targets RENAME TO operational_plan_targets_select;
ALTER POLICY executive_plan_targets_update ON operational_plan_targets RENAME TO operational_plan_targets_update;
ALTER POLICY executive_plans_insert ON operational_plans RENAME TO operational_plans_insert;
ALTER POLICY executive_plans_select ON operational_plans RENAME TO operational_plans_select;
ALTER POLICY executive_plans_update ON operational_plans RENAME TO operational_plans_update;

-- 2) index names (13)
ALTER INDEX executive_plan_target_employees_employee_idx RENAME TO operational_plan_target_employees_employee_idx;
ALTER INDEX executive_plan_target_employees_pkey RENAME TO operational_plan_target_employees_pkey;
ALTER INDEX executive_plan_target_employees_share_idx RENAME TO operational_plan_target_employees_share_idx;
ALTER INDEX executive_plan_target_employees_uidx RENAME TO operational_plan_target_employees_uidx;
ALTER INDEX executive_plan_target_org_units_pkey RENAME TO operational_plan_target_org_units_pkey;
ALTER INDEX executive_plan_target_org_units_target_idx RENAME TO operational_plan_target_org_units_target_idx;
ALTER INDEX executive_plan_target_org_units_uidx RENAME TO operational_plan_target_org_units_uidx;
ALTER INDEX executive_plan_targets_pkey RENAME TO operational_plan_targets_pkey;
ALTER INDEX executive_plan_targets_plan_idx RENAME TO operational_plan_targets_plan_idx;
ALTER INDEX executive_plan_targets_uidx RENAME TO operational_plan_targets_uidx;
ALTER INDEX executive_plans_cycle_uidx RENAME TO operational_plans_cycle_uidx;
ALTER INDEX executive_plans_pkey RENAME TO operational_plans_pkey;
ALTER INDEX executive_plans_strategic_plan_idx RENAME TO operational_plans_strategic_plan_idx;

-- 2) constraint names (17)
ALTER TABLE operational_plan_target_employees RENAME CONSTRAINT executive_plan_target_employees_actual_recorded_by_fkey TO operational_plan_target_employees_actual_recorded_by_fkey;
ALTER TABLE operational_plan_target_employees RENAME CONSTRAINT executive_plan_target_employees_created_by_fkey TO operational_plan_target_employees_created_by_fkey;
ALTER TABLE operational_plan_target_employees RENAME CONSTRAINT executive_plan_target_employees_employee_id_fkey TO operational_plan_target_employees_employee_id_fkey;
ALTER TABLE operational_plan_target_employees RENAME CONSTRAINT executive_plan_target_employees_percentage_valid TO operational_plan_target_employees_percentage_valid;
ALTER TABLE operational_plan_target_employees RENAME CONSTRAINT executive_plan_target_employees_target_org_unit_id_fkey TO operational_plan_target_employees_target_org_unit_id_fkey;
ALTER TABLE operational_plan_target_org_units RENAME CONSTRAINT executive_plan_target_org_units_created_by_fkey TO operational_plan_target_org_units_created_by_fkey;
ALTER TABLE operational_plan_target_org_units RENAME CONSTRAINT executive_plan_target_org_units_executive_plan_target_id_fkey TO operational_plan_target_org_units_executive_plan_target_id_fkey;
ALTER TABLE operational_plan_target_org_units RENAME CONSTRAINT executive_plan_target_org_units_org_unit_id_fkey TO operational_plan_target_org_units_org_unit_id_fkey;
ALTER TABLE operational_plan_target_org_units RENAME CONSTRAINT executive_plan_target_org_units_percentage_valid TO operational_plan_target_org_units_percentage_valid;
ALTER TABLE operational_plan_targets RENAME CONSTRAINT executive_plan_targets_created_by_fkey TO operational_plan_targets_created_by_fkey;
ALTER TABLE operational_plan_targets RENAME CONSTRAINT executive_plan_targets_executive_plan_id_fkey TO operational_plan_targets_executive_plan_id_fkey;
ALTER TABLE operational_plan_targets RENAME CONSTRAINT executive_plan_targets_strategic_kpi_id_fkey TO operational_plan_targets_strategic_kpi_id_fkey;
ALTER TABLE operational_plan_targets RENAME CONSTRAINT executive_plan_targets_weight_range TO operational_plan_targets_weight_range;
ALTER TABLE operational_plans RENAME CONSTRAINT executive_plans_created_by_fkey TO operational_plans_created_by_fkey;
ALTER TABLE operational_plans RENAME CONSTRAINT executive_plans_cycle_id_fkey TO operational_plans_cycle_id_fkey;
ALTER TABLE operational_plans RENAME CONSTRAINT executive_plans_dates_valid TO operational_plans_dates_valid;
ALTER TABLE operational_plans RENAME CONSTRAINT executive_plans_strategic_plan_id_fkey TO operational_plans_strategic_plan_id_fkey;

-- 3) the functions, re-created against the new table names
CREATE OR REPLACE FUNCTION public.is_kpi_assigned_to_me(p_kpi_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM operational_plan_target_employees e
      JOIN operational_plan_target_org_units u ON u.id = e.target_org_unit_id
      JOIN operational_plan_targets t ON t.id = u.executive_plan_target_id
      JOIN profiles p ON p.id = e.employee_id
     WHERE t.strategic_kpi_id = p_kpi_id
       AND p.auth_user_id = auth.uid()
       AND e.deleted_at IS NULL
       AND u.deleted_at IS NULL
       AND t.deleted_at IS NULL
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_org_unit_assigned_to_me(p_org_unit_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM operational_plan_target_employees e
      JOIN operational_plan_target_org_units u ON u.id = e.target_org_unit_id
      JOIN profiles p ON p.id = e.employee_id
     WHERE u.org_unit_id = p_org_unit_id
       AND p.auth_user_id = auth.uid()
       AND e.deleted_at IS NULL
       AND u.deleted_at IS NULL
  );
$function$
;

CREATE OR REPLACE FUNCTION public.record_executive_plan_target_actual(p_target_id uuid, p_actual numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT check_vpra_global('strategicPlanning', 'approve') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE operational_plan_targets
     SET actual_value = p_actual
   WHERE id = p_target_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target not found' USING ERRCODE = 'no_data_found';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_target_employee_actual(p_assignment_id uuid, p_actual numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_unit UUID;
  v_employee UUID;
  v_me UUID;
BEGIN
  SELECT u.org_unit_id, e.employee_id
    INTO v_org_unit, v_employee
    FROM operational_plan_target_employees e
    JOIN operational_plan_target_org_units u ON u.id = e.target_org_unit_id
   WHERE e.id = p_assignment_id
     AND e.deleted_at IS NULL
     AND u.deleted_at IS NULL;

  IF v_org_unit IS NULL THEN
    RAISE EXCEPTION 'assignment not found' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT id INTO v_me FROM profiles WHERE auth_user_id = auth.uid();

  IF NOT (
    check_vpra_global('strategicPlanning', 'approve')
    OR check_vpra('strategicPlanning', 'prepare', v_org_unit)
    -- The assignee themselves (2026-08-24). Their OWN row only.
    OR (v_me IS NOT NULL AND v_me = v_employee)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE operational_plan_target_employees
     SET actual_value = p_actual,
         actual_recorded_by = v_me
   WHERE id = p_assignment_id
     AND deleted_at IS NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_target_org_unit_actual(p_share_id uuid, p_actual numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_unit UUID;
BEGIN
  SELECT org_unit_id INTO v_org_unit
    FROM operational_plan_target_org_units
   WHERE id = p_share_id AND deleted_at IS NULL;

  IF v_org_unit IS NULL THEN
    RAISE EXCEPTION 'share not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (
    check_vpra_global('strategicPlanning', 'approve')
    OR check_vpra('strategicPlanning', 'prepare', v_org_unit)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE operational_plan_target_org_units
     SET actual_value = p_actual
   WHERE id = p_share_id
     AND deleted_at IS NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_executive_plan_target_employees(p_share_id uuid, p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total NUMERIC(7,2);
  v_rows INT;
  v_distinct INT;
  v_me UUID;
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  SELECT id INTO v_me FROM profiles WHERE auth_user_id = auth.uid();

  SELECT coalesce(sum(r.percentage), 0), count(*), count(DISTINCT r.employee_id)
    INTO v_total, v_rows, v_distinct
    FROM jsonb_to_recordset(p_rows) AS r(employee_id UUID, percentage NUMERIC, notes TEXT);

  IF v_rows > 0 THEN
    IF v_rows <> v_distinct THEN
      RAISE EXCEPTION 'duplicate employee in target assignment set';
    END IF;
    -- 100% OF THE UNIT'S SHARE, not of the whole target.
    IF v_total <> 100 THEN
      RAISE EXCEPTION 'assigned percentages must total 100 of the unit share, got %', v_total;
    END IF;
  END IF;

  UPDATE operational_plan_target_employees
     SET deleted_at = now()
   WHERE target_org_unit_id = p_share_id
     AND deleted_at IS NULL;

  INSERT INTO operational_plan_target_employees (target_org_unit_id, employee_id, percentage, notes, created_by)
  SELECT p_share_id, r.employee_id, r.percentage, r.notes, v_me
    FROM jsonb_to_recordset(p_rows) AS r(employee_id UUID, percentage NUMERIC, notes TEXT);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_executive_plan_target_org_units(p_target_id uuid, p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total NUMERIC(7,2);
  v_rows INT;
  v_distinct INT;
  v_me UUID;
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  SELECT id INTO v_me FROM profiles WHERE auth_user_id = auth.uid();

  -- Validate BEFORE touching anything, so a rejected save leaves the existing
  -- split exactly as it was.
  SELECT coalesce(sum(r.percentage), 0), count(*), count(DISTINCT r.org_unit_id)
    INTO v_total, v_rows, v_distinct
    FROM jsonb_to_recordset(p_rows) AS r(org_unit_id UUID, percentage NUMERIC, notes TEXT);

  IF v_rows > 0 THEN
    IF v_rows <> v_distinct THEN
      RAISE EXCEPTION 'duplicate org unit in target assignment set';
    END IF;
    IF v_total <> 100 THEN
      RAISE EXCEPTION 'assigned percentages must total 100, got %', v_total;
    END IF;
  END IF;

  -- Soft-delete then re-insert: these tables never hard-delete, and this runs
  -- under the caller's own RLS, so an unauthorised caller updates zero rows
  -- here and is rejected by the INSERT policy below.
  UPDATE operational_plan_target_org_units
     SET deleted_at = now()
   WHERE executive_plan_target_id = p_target_id
     AND deleted_at IS NULL;

  INSERT INTO operational_plan_target_org_units (executive_plan_target_id, org_unit_id, percentage, notes, created_by)
  SELECT p_target_id, r.org_unit_id, r.percentage, r.notes, v_me
    FROM jsonb_to_recordset(p_rows) AS r(org_unit_id UUID, percentage NUMERIC, notes TEXT);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.soft_delete_strategic_plan(p_plan_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
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

  UPDATE operational_plans SET deleted_at = v_now
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
$function$
;

COMMIT;
