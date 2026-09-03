-- ============================================================================
-- get_my_direct_reports() -- a narrow SECURITY DEFINER RPC letting a
-- supervisor read the {id, employee_number, full_name_ar} of their OWN
-- direct reports (profiles.supervisor_id), regardless of whether they hold
-- any `employeeData`/`employeeDataSubordinates` grant.
--
-- Needed for the 360-review module's screens 2/5 ("اعتماد الرئيس المباشر
-- للقائمة" and "تقارير أعضاء فريقه فقط"): `is_my_direct_report(target)`
-- (20260718000009) already lets a supervisor's RLS policies (on
-- three_sixty_nominations/three_sixty_assignments, this same session's
-- migration) reach their reports' ROWS in those tables, but rendering a
-- report's employee NAME still means reading `profiles` itself --
-- `profiles_select`'s own policy (20260725000009) has no plain
-- is_my_direct_report() bypass, only the gated, RECURSIVE
-- `employeeDataSubordinates` branch. A plain `supervisor` role holds
-- neither `employeeData` nor `employeeDataSubordinates` in the seeded
-- matrix, so without this RPC a supervisor approving a report's nomination
-- list or viewing their team's 360 report would see a blank name where
-- "بدر سالم" belongs -- the exact class of bug this project already hit and
-- fixed once for job_titles/salary_scale (migration 14) and once for the
-- org-unit-employees rollup (2026-07-26/27).
--
-- Same established pattern as get_my_supervisor()/get_my_role_codes()/
-- get_my_permissions(): SECURITY DEFINER, self-scoped only (no parameter --
-- always the CALLER's own direct reports, never an arbitrary target), and
-- EXECUTE explicitly revoked from anon/PUBLIC before granting to
-- authenticated (this project's `ALTER DEFAULT PRIVILEGES` auto-grants
-- EXECUTE to anon/authenticated on every new function otherwise).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION get_my_direct_reports()
RETURNS TABLE (id UUID, employee_number TEXT, full_name_ar TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.employee_number, p.full_name_ar
  FROM profiles p
  WHERE p.supervisor_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    AND p.deleted_at IS NULL
  ORDER BY p.full_name_ar;
$$;

COMMENT ON FUNCTION get_my_direct_reports IS 'Bypasses profiles_select''s RLS (SECURITY DEFINER) to let a supervisor read the name/employee_number of their OWN direct reports, regardless of any employeeData/employeeDataSubordinates grant -- built for the 360-review module''s approval/team-report screens.';

REVOKE ALL ON FUNCTION get_my_direct_reports() FROM PUBLIC;
REVOKE ALL ON FUNCTION get_my_direct_reports() FROM anon;
GRANT EXECUTE ON FUNCTION get_my_direct_reports() TO authenticated;

COMMIT;

-- ============================================================================
-- Verification -- run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: a real supervisor test user with a real direct report gets that
-- report back from `SELECT * FROM get_my_direct_reports()`, while a direct
-- `SELECT * FROM profiles WHERE supervisor_id = '<supervisor id>'` as the
-- SAME user (no employeeData/employeeDataSubordinates grant) returns 0 rows
-- -- proving the RPC's SECURITY DEFINER bypass is doing real work, not
-- merely duplicating what RLS already allowed.
