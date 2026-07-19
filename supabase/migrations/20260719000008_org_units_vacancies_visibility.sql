-- ============================================================================
-- Fixes a real RLS gap found live while verifying the vacancies UI
-- (migration 20260719000007): a plain `employee` test user, who
-- legitimately holds `vacancies=view` per the real seeded matrix, could
-- see a real vacancy row but its embedded org unit name rendered blank,
-- because `org_units_select` only checks `employeeData`, not `vacancies`.
-- Showing an open position with no visible department defeats the whole
-- point of vacancies being visible to all staff.
--
-- Same fix shape as migration 14's `job_titles_select` ->
-- `salary_scale_select` mirror ("careerPath OR employeeData") --
-- `org_units_select` now also accepts `vacancies=view`, not extended to
-- any other process area not directly embedded next to an
-- `employeeData`-gated view.
-- ============================================================================

BEGIN;

DROP POLICY org_units_select ON org_units;
CREATE POLICY org_units_select ON org_units
  FOR SELECT
  TO authenticated
  USING (
    check_vpra('employeeData'::process_area, 'view'::vpra_level, id)
    OR check_vpra('vacancies'::process_area, 'view'::vpra_level, id)
  );

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: a plain `employee` test user (vacancies=view, no employeeData)
-- can now SELECT the org unit referenced by a real vacancy row (0 rows
-- before this fix, 1 row after). Regression: employeeData-only roles
-- (e.g. hr_admin) still see org_units exactly as before.
