-- Found live while verifying the new "نتائج التقييم" dashboard/employee-
-- results tables (2026-09-07 foundation): a holder of `evaluationResultsReports`
-- + `evaluation>=recommend` could see a real evaluation row's weighted score,
-- but the embedded `profiles(full_name_ar, employee_number, org_unit_id)`
-- came back NULL for every row -- `profiles_select` has no branch for this
-- new area at all, only `employeeData`/`employeeDataSubordinates`/self.
-- Confirmed directly: a raw REST call with the service-role key returned the
-- real name/number/org_unit_id; the same query through the caller's own
-- RLS-respecting client (as the actual app does) returned an empty embed --
-- proof this is `profiles_select`, not the evaluations/PostgREST embed shape
-- (already correctly cast per this project's own established discipline).
--
-- Without this, the employee-results table's whole point -- knowing WHOSE
-- score is WHOSE -- is broken for any viewer who holds the new report area
-- but not the separate, broader `employeeData` grant, exactly the situation
-- CLAUDE.md/HANDOVER.md flags repeatedly for this app's per-table RLS model
-- (job_titles_select/salary_scale_select, org_units_select/vacancies, etc.):
-- a report surface needs a narrow, additive SELECT-only OR-branch onto the
-- table it displays identifying data FROM, not a broader grant.
--
-- Scoped by org_unit_id (check_vpra, not check_vpra_global) -- the same
-- scoping semantics `employeeData`'s own branch already uses, so a
-- report-holder only sees identifying info for employees within whatever
-- scope (all / one org unit) their `evaluationResultsReports` grant covers.
-- This does NOT widen evaluations/evaluation_scores visibility at all --
-- those keep their own existing RLS untouched, gated on `evaluation`
-- separately, per this module's own foundation migration
-- (20260907000001)'s explicit design note.

BEGIN;

DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles
  FOR SELECT
  USING (
    auth_user_id = auth.uid()
    OR check_vpra('employeeData', 'view', org_unit_id)
    OR (check_vpra_global('employeeDataSubordinates', 'view') AND is_my_subordinate(id))
    OR created_by = auth.uid()
    OR check_vpra('evaluationResultsReports', 'view', org_unit_id)
  );

COMMIT;

-- ============================================================================
-- Verification -- run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect the new branch present in the policy definition.
-- SELECT qual FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_select';
