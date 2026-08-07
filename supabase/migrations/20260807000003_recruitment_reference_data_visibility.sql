-- ============================================================================
-- إتاحة البيانات المرجعية لأدوار التوظيف
-- (Reference data visibility for the recruitment workflow roles)
--
-- Found live, not predicted: a real temporary section-head account holding
-- exactly `recruitmentPlan='prepare'` (org-unit scoped) — the role the
-- demand-request form is built FOR — opened /recruitment/requests/new and
-- got "لا توجد وحدات تنظيمية متاحة لك". The form was unusable by its own
-- intended user.
--
-- Cause, confirmed by reading the live policies rather than guessing:
--   org_units_select   : employeeData    OR vacancies
--   job_titles_select  : careerPath      OR employeeData
--   competencies_select: competencyFramework
-- A role granted only a recruitment area satisfies none of them, so all
-- three dropdowns came back empty and the request could not be filled in.
--
-- This is the exact class of gap this project has already hit and fixed
-- twice, with the same shape of fix each time:
--   * 20260719000008 — org_units_select gained a `vacancies` branch, because
--     a vacancies-only role saw a posting with a blank org unit name.
--   * migration 14 — job_titles_select gained an `employeeData` branch,
--     because a committee member saw salary figures with a blank job title.
-- Adding a recruitment branch to each is the same precedent, not a new idea.
--
-- Levels chosen:
--   `view` (not `prepare`) — a finance reviewer holding only
--   `recruitmentBudget` must read the same unit and job-title names to
--   review the plan they are approving a budget for, and they never hold
--   `prepare` on anything here. Gating at `prepare` would blank out exactly
--   the columns the reviewer needs.
--
-- org_units keeps its ORG-SCOPED `check_vpra(..., id)` form for the new
-- branch, deliberately: an org-unit-scoped section head then sees only their
-- own subtree in the dropdown, which is precisely the set of units
-- `recruitment_requests_insert` will actually accept from them. The picker
-- and the write gate agree by construction instead of by luck.
--
-- job_titles and competencies are university-wide catalogues with no per-row
-- org unit, so they use `check_vpra_global`, matching how those two policies
-- are already written (and the 20260719000011 catalogue-scope fix).
--
-- Nothing is removed: every existing branch is preserved verbatim, so no
-- role loses any visibility it has today.
-- ============================================================================

BEGIN;

DROP POLICY org_units_select ON org_units;
CREATE POLICY org_units_select ON org_units
  FOR SELECT TO authenticated
  USING (
    check_vpra('employeeData'::process_area, 'view'::vpra_level, id)
    OR check_vpra('vacancies'::process_area, 'view'::vpra_level, id)
    OR check_vpra('recruitmentPlan'::process_area, 'view'::vpra_level, id)
    OR check_vpra('recruitmentBudget'::process_area, 'view'::vpra_level, id)
  );

DROP POLICY job_titles_select ON job_titles;
CREATE POLICY job_titles_select ON job_titles
  FOR SELECT TO authenticated
  USING (
    check_vpra_global('careerPath'::process_area, 'view'::vpra_level)
    OR check_vpra_global('employeeData'::process_area, 'view'::vpra_level)
    OR check_vpra_global('recruitmentPlan'::process_area, 'view'::vpra_level)
    OR check_vpra_global('recruitmentBudget'::process_area, 'view'::vpra_level)
  );

-- Only the plan side: attaching required competencies is part of AUTHORING a
-- request. A budget reviewer has no reason to read the competency framework,
-- so `recruitmentBudget` is deliberately not added here.
DROP POLICY competencies_select ON competencies;
CREATE POLICY competencies_select ON competencies
  FOR SELECT TO authenticated
  USING (
    check_vpra_global('competencyFramework'::process_area, 'view'::vpra_level)
    OR check_vpra_global('recruitmentPlan'::process_area, 'view'::vpra_level)
  );

COMMIT;

-- ============================================================================
-- Verification -- run AFTER applying.
-- ============================================================================
-- As a real account holding ONLY recruitmentPlan='prepare':
--   SELECT count(*) FROM org_units;    -- > 0, limited to its own subtree
--   SELECT count(*) FROM job_titles;   -- > 0
--   SELECT count(*) FROM competencies; -- > 0
-- As a real account holding ONLY recruitmentBudget='recommend':
--   SELECT count(*) FROM job_titles;   -- > 0
--   SELECT count(*) FROM competencies; -- 0 (deliberately not granted)
-- As an account with none of these areas: all still 0.
