-- ============================================================================
-- 🔴 Fixes a real RLS-recursion bug in 20260718000008's supervisor_id
-- branch (already merged, `evaluations_select`), discovered while
-- extending the same pattern to `goals`/`bau_tasks` in this migration --
-- NOT caught in 20260718000008's own verification, because that test used
-- `scope_type='all'` for the test supervisor, which ALSO grants
-- `employeeData` view over every profile unconditionally, masking the bug.
--
-- The bug: 20260718000008's supervisor branch reads
-- `EXISTS (SELECT 1 FROM profiles emp WHERE emp.id = <target> AND
-- emp.supervisor_id = (SELECT id FROM profiles WHERE auth_user_id =
-- auth.uid()))`. That inner `SELECT ... FROM profiles emp` is itself
-- subject to `profiles_select`'s own RLS (self-row OR
-- check_vpra('employeeData','view',...)) -- to prove "this employee's
-- supervisor_id points at me," the caller first has to be ALLOWED to read
-- that employee's profile row at all, which is exactly the thing an
-- `org_unit`-scoped supervisor (not `'all'`-scope) may NOT have if the
-- report's org_unit falls outside that scope, or the report has no
-- org_unit_id at all. Verified directly: a real `org_unit`-scoped
-- supervisor test user could not even `SELECT` their real direct report's
-- bare profile row (0 rows) -- so the "am I their supervisor" EXISTS
-- clause silently evaluated to false, defeating the whole point of the
-- feature in exactly the scenario it exists to solve.
--
-- Fixed with `is_my_direct_report()`, a SECURITY DEFINER function -- same
-- established pattern as `check_vpra()`/`get_my_role_codes()` -- that
-- bypasses `profiles_select`'s RLS specifically to answer "is this
-- specific employee my direct report," not a general workaround.
-- `evaluations_select` is redefined here to use it (replacing
-- 20260718000008's flawed inline subquery); `goals_select`/
-- `bau_tasks_select` are defined correctly with it from the start.
--
-- 🔴 SECOND bug caught before this migration was ever committed (not
-- shipped, so no separate fix-up needed): the first draft additionally
-- required `check_vpra(<area>,'view', target_org_unit)` on top of
-- `is_my_direct_report()`, as "defense in depth." That is ITSELF
-- org-unit-scope-gated -- `check_vpra()` always evaluates scope, and for
-- an `'org_unit'`-scoped role it requires the target org unit to be
-- non-NULL and in-scope. So the same org-unit-mismatch scenario
-- `supervisor_id` exists to solve (report has no org_unit_id, or one
-- outside the supervisor's scoped subtree) made this "extra" check fail
-- too, silently defeating the fix a second time -- caught by testing the
-- exact adversarial case again after the first fix, not assumed fixed.
-- Resolved by dropping the additional check_vpra requirement entirely:
-- `profiles.supervisor_id` can only be set via a `profiles` UPDATE, which
-- itself requires `check_vpra('employeeData','prepare',...)` -- i.e. only
-- an already-authorized administrator can create the relationship in the
-- first place. Trusting the relationship alone, with no further VPRA
-- gate, is the same trust model this schema already uses for self-row
-- bypasses everywhere else (`profiles_select`, `evaluations_select`'s
-- self branch, etc.) -- "being the administratively-designated supervisor
-- of this person" is itself the authorization fact, not something that
-- additionally needs re-proving via a separate, scope-bound VPRA check.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION is_my_direct_report(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles emp
    WHERE emp.id = target_employee_id
      AND emp.supervisor_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );
$$;

COMMENT ON FUNCTION is_my_direct_report IS 'Bypasses profiles_select''s RLS to answer "is target_employee_id my direct report" (profiles.supervisor_id) -- see this migration''s header for the real recursion bug this fixes.';

-- Same lesson as check_vpra()/get_my_role_codes(): REVOKE FROM PUBLIC
-- alone is not enough in this project (ALTER DEFAULT PRIVILEGES
-- auto-grants EXECUTE to anon/authenticated on every new function).
REVOKE ALL ON FUNCTION is_my_direct_report(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION is_my_direct_report(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION is_my_direct_report(UUID) TO authenticated;

-- Fix: evaluations_select (replaces 20260718000008's flawed inline
-- subquery with the SECURITY DEFINER function).
DROP POLICY evaluations_select ON evaluations;

CREATE POLICY evaluations_select ON evaluations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = evaluations.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('evaluation', 'approve', (SELECT org_unit_id FROM profiles WHERE id = evaluations.employee_id))
    OR is_my_direct_report(evaluations.employee_id)
  );

-- New: goals_select.
DROP POLICY goals_select ON goals;

CREATE POLICY goals_select ON goals FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = goals.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('goalAssignment', 'prepare', (SELECT org_unit_id FROM profiles WHERE id = goals.employee_id))
    OR is_my_direct_report(goals.employee_id)
  );

-- New: bau_tasks_select.
DROP POLICY bau_tasks_select ON bau_tasks;

CREATE POLICY bau_tasks_select ON bau_tasks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = bau_tasks.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('bauTasks', 'approve', (SELECT org_unit_id FROM profiles WHERE id = bau_tasks.employee_id))
    OR is_my_direct_report(bau_tasks.employee_id)
  );

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: anon = false, authenticated = true.
-- SELECT has_function_privilege('anon', 'is_my_direct_report(uuid)', 'EXECUTE');
-- SELECT has_function_privilege('authenticated', 'is_my_direct_report(uuid)', 'EXECUTE');

-- Expect (SET ROLE authenticated + simulated JWT): a real `org_unit`-scoped
-- supervisor test user (scope NOT covering their report's org unit --
-- the exact scenario that exposed the bug) can now see their real direct
-- report's evaluation/goal/BAU task, where 20260718000008's version could
-- not; an unrelated employee's rows remain invisible in all three cases.
