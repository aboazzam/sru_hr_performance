-- Found live while building the نتائج التقييم dashboard's "حسب الوحدة
-- التنظيمية" tree-breakdown view (2026-09-08, same session as
-- 20260908000001's profiles_select fix): `org_units_select` has no branch
-- for the new `evaluationResultsReports` area either, only
-- employeeData/vacancies/recruitmentPlan/recruitmentBudget/
-- recruitmentRequests/is_org_unit_assigned_to_me -- a report-only holder
-- would see zero org_units rows, so the tree-breakdown view (which needs
-- unit names + the real parent_id chain to build the hierarchy) would
-- render completely empty for exactly the audience it's built for. Same
-- class of gap as profiles_select, same fix shape: one more narrow,
-- SELECT-only, org-unit-scoped OR-branch.

BEGIN;

DROP POLICY IF EXISTS org_units_select ON org_units;
CREATE POLICY org_units_select ON org_units
  FOR SELECT
  USING (
    check_vpra('employeeData', 'view', id)
    OR check_vpra('vacancies', 'view', id)
    OR check_vpra('recruitmentPlan', 'view', id)
    OR check_vpra('recruitmentBudget', 'view', id)
    OR check_vpra('recruitmentRequests', 'view', id)
    OR is_org_unit_assigned_to_me(id)
    OR check_vpra('evaluationResultsReports', 'view', id)
  );

COMMIT;

-- ============================================================================
-- Verification -- run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect the new branch present in the policy definition.
-- SELECT qual FROM pg_policies WHERE tablename='org_units' AND policyname='org_units_select';
