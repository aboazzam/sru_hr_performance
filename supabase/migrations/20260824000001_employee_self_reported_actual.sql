-- ============================================================================
-- الموظف يسجّل إنجازه بنفسه
--
-- 20260823000004 deliberately kept this out: assignment flows down and the
-- unit that owns the share confirms the measurement. Asked for directly on
-- 2026-08-24, so the branch is added — and it is exactly one branch, on the
-- one function that writes an employee's figure.
--
-- ---------------------------------------------------------------------------
-- WHO RECORDED IT IS NOW PART OF THE ROW
-- ---------------------------------------------------------------------------
-- Letting a person report their own achievement makes a number ambiguous that
-- was not ambiguous before: a manager reading "42" could no longer tell a
-- figure their unit confirmed from one the employee typed about themselves.
-- `audit_log` does answer "who set it", but nothing on the screen reads the
-- audit log, so in practice the distinction would have been invisible.
--
-- `actual_recorded_by` therefore travels with the value, stamped by the
-- function itself (never by the client), and the screens show it. This is not
-- a restriction on self-reporting — it is what makes self-reporting readable.
--
-- The employee may only ever touch THEIR OWN row: the check is
-- `e.employee_id = the caller's own profile`, not a role or a unit.
-- ============================================================================

ALTER TABLE executive_plan_target_employees
  ADD COLUMN IF NOT EXISTS actual_recorded_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN executive_plan_target_employees.actual_recorded_by IS
  'من سجّل القيمة الفعلية: الموظف نفسه أو مدير جهته. تُختم داخل الدالة ولا تُقبل من العميل، لتمييز ما بلّغ به الموظف عن نفسه عمّا أكّدته الجهة.';

CREATE OR REPLACE FUNCTION record_target_employee_actual(p_assignment_id UUID, p_actual NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_unit UUID;
  v_employee UUID;
  v_me UUID;
BEGIN
  SELECT u.org_unit_id, e.employee_id
    INTO v_org_unit, v_employee
    FROM executive_plan_target_employees e
    JOIN executive_plan_target_org_units u ON u.id = e.target_org_unit_id
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

  UPDATE executive_plan_target_employees
     SET actual_value = p_actual,
         actual_recorded_by = v_me
   WHERE id = p_assignment_id
     AND deleted_at IS NULL;
END;
$$;

COMMENT ON FUNCTION record_target_employee_actual(UUID, NUMERIC) IS
  'تسجيل القيمة الفعلية لحصة الموظف: من الجهة المالكة للحصة، أو من الموظف نفسه لصفّه وحده. تختم من سجّلها.';
