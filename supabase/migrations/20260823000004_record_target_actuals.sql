-- ============================================================================
-- تسجيل القيمة الفعلية على مستوى المستهدف والجهة والموظف
--
-- The three tables have carried `actual_value` since 20260823000001, but
-- nothing could write it — so the achievement ring had no way to ever leave
-- "لم تُسجَّل قيمة فعلية". These are the three writes that fill it.
--
-- ---------------------------------------------------------------------------
-- WHY FUNCTIONS AND NOT JUST WIDER RLS
-- ---------------------------------------------------------------------------
-- The obvious move would be to widen `executive_plan_target_org_units_update`
-- so a department manager can record their own unit's actual. That would be
-- wrong: RLS filters ROWS, not COLUMNS, so the same widening would also let
-- that manager rewrite their own `percentage` — the strategy admin's decision
-- about how much of the target their unit carries. A manager who can raise
-- their own share and then report against it is not a permission model.
--
-- So each write is a narrow SECURITY DEFINER function that updates
-- `actual_value` ALONE, after checking the caller itself. The tables' UPDATE
-- policies are left exactly as they are.
--
-- ---------------------------------------------------------------------------
-- WHO RECORDS WHAT  [استنتاج، مبني على اتجاه التسلسل نفسه]
-- ---------------------------------------------------------------------------
--   target level (the whole KPI)  — strategicPlanning='approve' (the planner)
--   unit level                    — approve, OR the scoped 'prepare' on THAT
--                                   unit: the dean/manager who carries it
--   employee level                — the same people as the unit level
--
-- The employee does NOT record their own achievement. Assignment flows down
-- and measurement is confirmed by the unit that owns the share, which is why
-- the profile screen shows it read-only. Not a technical limit — a deliberate
-- reading of "وعليها يقاس أداؤه"; say so and it becomes one more branch here.
--
-- NULL is a valid value everywhere: clearing a figure entered by mistake must
-- be possible, and "not recorded" is different from zero — the ring already
-- distinguishes them.
-- ============================================================================

CREATE OR REPLACE FUNCTION record_executive_plan_target_actual(p_target_id UUID, p_actual NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT check_vpra_global('strategicPlanning', 'approve') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE executive_plan_targets
     SET actual_value = p_actual
   WHERE id = p_target_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target not found' USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

COMMENT ON FUNCTION record_executive_plan_target_actual(UUID, NUMERIC) IS
  'تسجيل القيمة الفعلية للمستهدف كاملًا. تحدّث actual_value وحدها، ولا تفتح تعديل بقية الحقول.';

CREATE OR REPLACE FUNCTION record_target_org_unit_actual(p_share_id UUID, p_actual NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_unit UUID;
BEGIN
  SELECT org_unit_id INTO v_org_unit
    FROM executive_plan_target_org_units
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

  UPDATE executive_plan_target_org_units
     SET actual_value = p_actual
   WHERE id = p_share_id
     AND deleted_at IS NULL;
END;
$$;

COMMENT ON FUNCTION record_target_org_unit_actual(UUID, NUMERIC) IS
  'تسجيل القيمة الفعلية لحصة الجهة، من مدير الجهة نفسها أو من صاحب الاعتماد. تحدّث actual_value وحدها فلا تُمكِّن أحدًا من تعديل نسبته.';

CREATE OR REPLACE FUNCTION record_target_employee_actual(p_assignment_id UUID, p_actual NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_unit UUID;
BEGIN
  SELECT u.org_unit_id INTO v_org_unit
    FROM executive_plan_target_employees e
    JOIN executive_plan_target_org_units u ON u.id = e.target_org_unit_id
   WHERE e.id = p_assignment_id
     AND e.deleted_at IS NULL
     AND u.deleted_at IS NULL;

  IF v_org_unit IS NULL THEN
    RAISE EXCEPTION 'assignment not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (
    check_vpra_global('strategicPlanning', 'approve')
    OR check_vpra('strategicPlanning', 'prepare', v_org_unit)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE executive_plan_target_employees
     SET actual_value = p_actual
   WHERE id = p_assignment_id
     AND deleted_at IS NULL;
END;
$$;

COMMENT ON FUNCTION record_target_employee_actual(UUID, NUMERIC) IS
  'تسجيل القيمة الفعلية لحصة الموظف، من الجهة التي تملك الحصة. الموظف لا يسجّل إنجاز نفسه.';

REVOKE EXECUTE ON FUNCTION record_executive_plan_target_actual(UUID, NUMERIC) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION record_target_org_unit_actual(UUID, NUMERIC) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION record_target_employee_actual(UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_executive_plan_target_actual(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION record_target_org_unit_actual(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION record_target_employee_actual(UUID, NUMERIC) TO authenticated;
