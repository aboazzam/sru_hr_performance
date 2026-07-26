-- ============================================================================
-- Recursive subordinate-chain visibility, gated behind the new
-- `employeeDataSubordinates` process area (previous migration).
--
-- `is_my_direct_report()` (20260718000009) only ever answers "is this
-- profile MY direct report" -- one level. The project owner explicitly
-- asked for the full chain: "من ارتبط بمن ارتبط به كرئيس قسم تابع لادارة
-- تحت ادارته" (whoever is linked to whoever is linked to them -- e.g. a
-- department head under a division under their authority). `is_my_subordinate()`
-- walks UP from the target via supervisor_id with a recursive CTE, checking
-- whether the caller's own profile id appears anywhere in that ancestor
-- chain -- not just the immediate link. A depth cap (20) is a defensive
-- guard against a corrupted/cyclical supervisor_id chain hanging the query;
-- normal org hierarchies are nowhere near that deep.
--
-- profiles_select's ungated is_my_direct_report() bypass (added
-- 20260725000007, free for every supervisor regardless of any VPRA grant)
-- is REPLACED here with a gated check requiring
-- `check_vpra_global('employeeDataSubordinates', 'view')` AND
-- `is_my_subordinate(id)`. This is a deliberate behavior change, not an
-- oversight -- see the previous migration's header for why. `employeeData`'s
-- own branch (check_vpra('employeeData', 'view', org_unit_id)) is
-- completely untouched, per the project owner's explicit confirmation that
-- area's behavior stays exactly as today.
-- ============================================================================

BEGIN;

-- `created_by` is added here (not the next migration) because this same
-- transaction's profiles_select policy references it directly -- unlike an
-- enum value, a plain column can be added and used within one transaction.
-- Tracks who prepared an employee record (for the "طلباتي" / preparer's own
-- pending-submission visibility in the next migration's approval workflow).
ALTER TABLE profiles ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN profiles.created_by IS 'Who prepared this employee record (the caller at insert time) -- lets a prepare/recommend-level preparer see their own pending submission even without a general employeeData view grant.';

CREATE OR REPLACE FUNCTION is_my_subordinate(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE chain AS (
    SELECT id, supervisor_id, 0 AS depth FROM profiles WHERE id = target_employee_id
    UNION ALL
    SELECT p.id, p.supervisor_id, c.depth + 1
    FROM profiles p
    JOIN chain c ON p.id = c.supervisor_id
    WHERE c.depth < 20
  )
  SELECT EXISTS (
    SELECT 1 FROM chain WHERE supervisor_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );
$$;

COMMENT ON FUNCTION is_my_subordinate IS 'Bypasses profiles_select''s RLS (SECURITY DEFINER) to answer "is target_employee_id anywhere in my subordinate chain" -- recursive, unlike is_my_direct_report() which is one level only. Depth-capped at 20 as a defensive guard.';

REVOKE ALL ON FUNCTION is_my_subordinate(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION is_my_subordinate(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION is_my_subordinate(UUID) TO authenticated;

DROP POLICY profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR check_vpra('employeeData', 'view', org_unit_id)
    OR (check_vpra_global('employeeDataSubordinates', 'view') AND is_my_subordinate(id))
    OR created_by = auth.uid()
  );

COMMIT;

-- ============================================================================
-- Verification — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: false for anon.
-- SELECT has_function_privilege('anon', 'is_my_subordinate(uuid)', 'EXECUTE');
-- Expect: true for authenticated.
-- SELECT has_function_privilege('authenticated', 'is_my_subordinate(uuid)', 'EXECUTE');

-- Expect: profiles_select's qual includes is_my_subordinate and created_by.
-- SELECT policyname, qual FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_select';
