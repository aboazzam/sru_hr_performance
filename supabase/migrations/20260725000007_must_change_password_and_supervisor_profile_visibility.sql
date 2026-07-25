-- ============================================================================
-- Two changes requested directly by the project owner (2026-07-25 feedback
-- round on the Employees screen):
--
-- 1. "التسجيل بنظام الدعوة فقط، اسمح لمن لديه صلاحية المستخدمين انشاء حساب
--    موظف بدون دعوة ... وفي حالة الدخول من قبل صاحب الحساب يطلب منه ادخال
--    رقم سري جديد بدون الرجوع للبريد الالكتروني" -- registration stays
--    invite-only by default; userManagement holders can create an account
--    directly (system-suggested or admin-typed password, no email at all),
--    and the account owner must be forced to set their own new password on
--    first login, in-app, with no recovery-email round trip. Needs a flag on
--    `profiles` the login action can check and a way for the user to clear
--    it themselves once they've changed it.
--
--    `clear_must_change_password()` mirrors the established narrow
--    SECURITY DEFINER self-lookup pattern already used by
--    get_my_role_codes()/get_my_supervisor()/get_my_permissions() -- except
--    this one WRITES (its own row only, no parameters, nothing else
--    reachable through it), which is why it doesn't just reuse
--    `profiles_update`'s RLS: that policy requires
--    check_vpra('employeeData','prepare', org_unit_id), which a plain
--    employee being forced to change their own password very likely does
--    not hold.
--
-- 2. "يظهر لهم فقط الموظفين التابعين لهم" -- a caller without any
--    employeeData grant should still see their own direct reports' profile
--    rows. `is_my_direct_report()` (20260718000009) already answers exactly
--    this question and is already used this way on evaluations/goals/
--    bau_tasks/evaluation_scores -- profiles itself was never extended, so a
--    supervisor with zero employeeData grant currently cannot see their own
--    reports on /employees at all. Adding the same OR-branch here closes
--    that gap; org-unit-scoped cascading ("وان نزلت بحيث يكون لكل ادارة او
--    قسم خاص به") already works today via check_vpra's existing
--    is_org_unit_in_scope() walk, so it needs no change.
-- ============================================================================

BEGIN;

ALTER TABLE profiles ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.must_change_password IS 'Set true when userManagement creates an account directly (no invite email) with a system-suggested or admin-typed password. Checked by the login Server Action to force an in-app password change before reaching the app; cleared via clear_must_change_password() once the user sets their own.';

CREATE OR REPLACE FUNCTION clear_must_change_password()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE profiles SET must_change_password = false WHERE auth_user_id = auth.uid();
$$;

COMMENT ON FUNCTION clear_must_change_password IS 'Self-row-only write, bypassing profiles_update''s employeeData RLS on purpose -- a user forced to change their own password very likely holds no employeeData grant at all. Cannot touch any row but the caller''s own (no parameters, WHERE is hardcoded to auth.uid()).';

REVOKE ALL ON FUNCTION clear_must_change_password() FROM PUBLIC;
REVOKE ALL ON FUNCTION clear_must_change_password() FROM anon;
GRANT EXECUTE ON FUNCTION clear_must_change_password() TO authenticated;

DROP POLICY profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR check_vpra('employeeData', 'view', org_unit_id)
    OR is_my_direct_report(id)
  );

COMMIT;

-- ============================================================================
-- Verification -- run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 1 row, must_change_password boolean not null default false.
-- SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
--   WHERE table_name = 'profiles' AND column_name = 'must_change_password';

-- Expect: false (no PUBLIC/anon execute).
-- SELECT has_function_privilege('anon', 'clear_must_change_password()', 'EXECUTE');
-- Expect: true.
-- SELECT has_function_privilege('authenticated', 'clear_must_change_password()', 'EXECUTE');

-- Expect: profiles_select's qual now includes is_my_direct_report.
-- SELECT policyname, qual FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_select';
