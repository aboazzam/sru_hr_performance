-- ============================================================================
-- get_my_role_codes() — SECURITY DEFINER function so ANY authenticated
-- user can read their OWN assigned role_code(s), regardless of whether
-- they hold a `userManagement` grant.
--
-- Real bug found while building the evaluations state-transition Server
-- Action (src/app/[locale]/(app)/evaluations/[id]/actions.ts), not
-- theoretical: that action needs to know the caller's own role_code(s) to
-- check `src/lib/vpra.ts`'s `canAdvanceEvaluationState()`. The obvious
-- approach — a client-side embed query,
-- `supabase.from('user_roles').select('roles(role_code)')` — silently
-- fails for almost everyone: `user_roles_select`'s RLS (20260716000006)
-- does grant unconditional self-row visibility (`user_id = auth.uid()`),
-- but `roles_select` does NOT — it requires
-- `check_vpra('userManagement','view')`, with no self-role exemption. So
-- a plain `employee`/`supervisor`/`manager`/`committee` user (none of whom
-- hold any `userManagement` grant per the seeded matrix) can see their own
-- `user_roles` row but the joined `roles.role_code` comes back empty —
-- verified directly: a SQL simulation of this exact join as a real
-- `employee`-role test user returned 0 rows, while the same join as
-- `super_admin` (userManagement=approve) returned the expected role_code.
--
-- Fixed with a SECURITY DEFINER function -- the same established pattern
-- as `check_vpra()`/`is_org_unit_in_scope()` (20260716000004): a narrow,
-- purpose-built bypass of RLS to answer an identity question about the
-- CALLER THEMSELVES, not a general workaround. Deliberately NOT fixed by
-- widening `roles_select`'s policy instead — that would be a broader,
-- less obviously-scoped change to an existing table's authorization rules
-- for a need that only requires "tell me my own role codes."
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION get_my_role_codes()
RETURNS SETOF TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.role_code::text
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id AND r.deleted_at IS NULL
  WHERE ur.user_id = auth.uid();
$$;

COMMENT ON FUNCTION get_my_role_codes IS 'Returns the current auth.uid()''s own role_code(s), bypassing roles_select''s RLS (which has no self-role exemption) — see this migration''s header for the real bug this fixes.';

-- Same lesson learned in 20260716000005: REVOKE FROM PUBLIC alone is not
-- enough in this project — ALTER DEFAULT PRIVILEGES auto-grants EXECUTE
-- to anon/authenticated/service_role on every new function. Explicit
-- REVOKE FROM anon required.
REVOKE ALL ON FUNCTION get_my_role_codes() FROM PUBLIC;
REVOKE ALL ON FUNCTION get_my_role_codes() FROM anon;
GRANT EXECUTE ON FUNCTION get_my_role_codes() TO authenticated;

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: anon = false, authenticated = true.
-- SELECT has_function_privilege('anon', 'get_my_role_codes()', 'EXECUTE');
-- SELECT has_function_privilege('authenticated', 'get_my_role_codes()', 'EXECUTE');

-- Expect (SET ROLE authenticated + simulated JWT): a real `employee`-role
-- test user calling `SELECT * FROM get_my_role_codes()` gets back exactly
-- ('employee'), even though a plain SELECT-join against user_roles/roles
-- would return 0 rows for the same user.
