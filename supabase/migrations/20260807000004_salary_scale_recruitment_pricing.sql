-- ============================================================================
-- إتاحة سلم الرواتب لجهة تسعير خطة التوظيف
-- (salary_scale visibility for the recruitment pricing tier)
--
-- Found live during the end-to-end walkthrough of the consolidation screen,
-- NOT predicted: a real temporary HR account holding exactly
-- `recruitmentPlan='recommend'` merged a request whose job title has a real
-- `salary_scale` row (محلل بيانات, step_a = 4802), with both cost estimates
-- deliberately left NULL — and the resulting plan item came out with
-- `estimated_monthly_cost = NULL` instead of 4802.
--
-- Cause: `consolidateRequestsIntoPlan` (and `addRecruitmentPlanItem` before
-- it) read `salary_scale` through the CALLER'S own RLS-respecting client, by
-- design. But `salary_scale_select` requires `careerPath` OR `employeeData`,
-- and a recruitment-only role holds neither — so the lookup returned zero
-- rows and the code's `?? null` fallback silently produced an unpriced item.
-- The seeding logic was correct; it was reading a table it could not see.
--
-- This is the same gap 20260807000003 fixed for org_units/job_titles/
-- competencies. `salary_scale` was missed there because the request FORM
-- never queries it — only the merge does, one screen later.
--
-- Gated at `recommend`, deliberately NOT `view` or `prepare`:
-- full salary-scale figures are more sensitive than a job-title name (the
-- same judgement already recorded for the Salary Scale nav tab, which checks
-- `employeeData` rather than the weaker grant its own page accepts). Pricing
-- the plan is HR's act, and `recommend` is exactly the tier that performs
-- it — a section head at `prepare` never reads this table, so granting them
-- the whole salary scale would widen exposure for no functional gain.
--
-- `recruitmentBudget` is deliberately NOT added either: finance reviews the
-- costs already stored on the plan's items, and nothing in this module makes
-- finance query the scale itself.
--
-- Existing branches are preserved verbatim; no role loses visibility.
-- ============================================================================

BEGIN;

DROP POLICY salary_scale_select ON salary_scale;
CREATE POLICY salary_scale_select ON salary_scale
  FOR SELECT TO authenticated
  USING (
    check_vpra_global('careerPath'::process_area, 'view'::vpra_level)
    OR check_vpra_global('employeeData'::process_area, 'view'::vpra_level)
    OR check_vpra_global('recruitmentPlan'::process_area, 'recommend'::vpra_level)
  );

COMMIT;

-- ============================================================================
-- Verification -- run AFTER applying.
-- ============================================================================
-- As an account holding ONLY recruitmentPlan='recommend':
--   SELECT count(*) FROM salary_scale;  -- > 0 (was 0 before this migration)
-- As an account holding ONLY recruitmentPlan='prepare':
--   SELECT count(*) FROM salary_scale;  -- still 0, deliberately
-- Then re-run the merge: the plan item's estimated_monthly_cost must equal
-- the job title's real salary_scale.step_a instead of NULL.
