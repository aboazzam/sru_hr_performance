-- ============================================================================
-- get_my_supervisor() — narrow SECURITY DEFINER self-lookup, same established
-- pattern as get_my_role_codes() (20260718000007) and get_my_permissions()
-- (20260722000001).
--
-- Found live while building the "My Data" section of /profile (2026-07-22):
-- the project owner explicitly asked for the employee's supervisor name to
-- show there. A plain `profiles` query for the supervisor's row (by
-- supervisor_id) silently returns nothing for a plain `employee`, because
-- `profiles_select`'s RLS requires either the self-row, a direct-report
-- relationship in the OTHER direction (is_my_direct_report() answers "is
-- TARGET my report", not "is auth.uid() a report of TARGET"), or an
-- `employeeData` grant — and `employee` holds no `employeeData` row in the
-- seeded role_permissions matrix at all (confirmed live: zero rows for
-- role_code='employee', process_area='employeeData'). Verified the failure
-- directly before writing this: querying the supervisor's profile row as a
-- real logged-in employee test account returned null even though
-- `supervisor_id` was genuinely set on the employee's own row.
--
-- Same authorization reasoning already established for
-- is_my_direct_report() (20260718000009's second fix): supervisor_id can
-- only be set via a `profiles` UPDATE that itself requires
-- `employeeData`-`prepare` (hr_admin today), so the relationship's mere
-- existence already is the authorization fact — no extra check_vpra layer
-- needed on top. This function answers a narrower question than
-- is_my_direct_report() (only "who is auth.uid()'s own supervisor", not a
-- general relationship test), and returns only display-safe fields
-- (full_name_ar/full_name_en), not the supervisor's whole row.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION get_my_supervisor()
RETURNS TABLE(full_name_ar TEXT, full_name_en TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sup.full_name_ar, sup.full_name_en
  FROM profiles me
  JOIN profiles sup ON sup.id = me.supervisor_id
  WHERE me.auth_user_id = auth.uid()
    AND sup.deleted_at IS NULL;
$$;

COMMENT ON FUNCTION get_my_supervisor IS 'SECURITY DEFINER so a plain employee (no employeeData grant) can read their own supervisor''s display name despite profiles_select''s RLS. Mirrors get_my_role_codes()/get_my_permissions()''s established self-lookup pattern.';

REVOKE ALL ON FUNCTION get_my_supervisor() FROM PUBLIC;
REVOKE ALL ON FUNCTION get_my_supervisor() FROM anon;
GRANT EXECUTE ON FUNCTION get_my_supervisor() TO authenticated;

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 1 row, prosecdef = true.
-- SELECT proname, prosecdef FROM pg_proc WHERE proname = 'get_my_supervisor';

-- Expect: anon has no EXECUTE privilege (empty result / permission error when
-- attempted as anon).
-- SELECT has_function_privilege('anon', 'get_my_supervisor()', 'EXECUTE');
