-- ============================================================================
-- الموظف يرى اسم المستهدف المسنَد إليه واسم جهته
--
-- Found live while verifying the employee hop (2026-08-23): the split saved
-- correctly and the employee's profile showed "100% of the unit's share (60%
-- of the target), value 60" — but the TARGET'S OWN NAME and the unit's name
-- both rendered as "—".
--
-- Why: `strategic_kpis_select` requires a `strategicPlanning` grant and
-- `org_units_select` requires `employeeData` / `vacancies` — neither of which
-- a plain employee holds. So the person being MEASURED on a target could not
-- read what the target is called. That defeats the whole point of showing it
-- to them ("وعليها يقاس أداؤه وتظهر في صفحة التقييم الخاصة بالموظف").
--
-- The fix is the same shape this schema has used twice before for exactly
-- this class of gap — migration 14 (`job_titles_select` widened so salary
-- figures were not shown without the title they belong to) and 20260719000008
-- (`org_units_select` widened for vacancies): add ONE narrow OR branch, no
-- broader than the case that is actually broken.
--
-- The branch is "this row is behind a target share assigned to ME", so it
-- reveals a KPI's name only to someone who already sees their own percentage
-- of it, and a unit's name only to someone assigned inside that unit. It is
-- not a general read grant: an employee still cannot list the plan's other
-- KPIs or the org tree.
--
-- No recursion risk: both branches read
-- executive_plan_target_employees / _org_units / executive_plan_targets,
-- whose own SELECT policies are `USING (true)` (20260823000001) and so cannot
-- re-enter these two.
-- ============================================================================

CREATE OR REPLACE FUNCTION is_kpi_assigned_to_me(p_kpi_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM executive_plan_target_employees e
      JOIN executive_plan_target_org_units u ON u.id = e.target_org_unit_id
      JOIN executive_plan_targets t ON t.id = u.executive_plan_target_id
      JOIN profiles p ON p.id = e.employee_id
     WHERE t.strategic_kpi_id = p_kpi_id
       AND p.auth_user_id = auth.uid()
       AND e.deleted_at IS NULL
       AND u.deleted_at IS NULL
       AND t.deleted_at IS NULL
  );
$$;

COMMENT ON FUNCTION is_kpi_assigned_to_me(UUID) IS
  'هل هذا المؤشر خلف حصة مستهدف مسنَدة للمستخدم الحالي؟ لكشف اسم المستهدف لمن يُقاس عليه، لا أكثر.';

CREATE OR REPLACE FUNCTION is_org_unit_assigned_to_me(p_org_unit_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM executive_plan_target_employees e
      JOIN executive_plan_target_org_units u ON u.id = e.target_org_unit_id
      JOIN profiles p ON p.id = e.employee_id
     WHERE u.org_unit_id = p_org_unit_id
       AND p.auth_user_id = auth.uid()
       AND e.deleted_at IS NULL
       AND u.deleted_at IS NULL
  );
$$;

COMMENT ON FUNCTION is_org_unit_assigned_to_me(UUID) IS
  'هل هذه الوحدة التنظيمية تحمل حصة مستهدف مسنَدة للمستخدم الحالي؟ لكشف اسم الجهة لمن أُسند إليه داخلها.';

REVOKE EXECUTE ON FUNCTION is_kpi_assigned_to_me(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION is_org_unit_assigned_to_me(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_kpi_assigned_to_me(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_org_unit_assigned_to_me(UUID) TO authenticated;

-- The existing conditions are copied VERBATIM from the live policies
-- (read out of pg_policy before writing this, not recalled) — only the new OR
-- is added. `org_units_select` in particular has five branches today, three of
-- them added by the recruitment module; rewriting it from memory would have
-- silently dropped them.
DROP POLICY IF EXISTS strategic_kpis_select ON strategic_kpis;
CREATE POLICY strategic_kpis_select ON strategic_kpis FOR SELECT TO authenticated
  USING (
    check_vpra_global('strategicPlanning', 'view')
    OR can_view_strategic_kpi(id)
    OR is_kpi_assigned_to_me(id)
  );

DROP POLICY IF EXISTS org_units_select ON org_units;
CREATE POLICY org_units_select ON org_units FOR SELECT TO authenticated
  USING (
    check_vpra('employeeData', 'view', id)
    OR check_vpra('vacancies', 'view', id)
    OR check_vpra('recruitmentPlan', 'view', id)
    OR check_vpra('recruitmentBudget', 'view', id)
    OR check_vpra('recruitmentRequests', 'view', id)
    OR is_org_unit_assigned_to_me(id)
  );
