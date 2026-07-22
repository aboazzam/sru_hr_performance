-- Closes a real gap the project owner reported: NavBar renders all 14 tabs
-- unconditionally for every logged-in user, regardless of role -- a plain
-- `employee` sees "الموظفون"/"سلم الرواتب"/"بنك الأهداف" tabs despite having
-- no meaningful access to them. General fix requested: filter nav items by
-- the current user's actual VPRA level, applying uniformly to every role.
--
-- The nav needs to know the caller's OWN effective VPRA level per process
-- area (the highest level across all their roles, ignoring scope -- the nav
-- tab is just a shortcut/affordance, the destination page's own RLS still
-- enforces the real scope-aware check). role_permissions/roles both require
-- a `userManagement` grant to read directly (migration 6), which `employee`
-- does not hold -- the exact same problem `get_my_role_codes()` (20260718)
-- solved for `user_roles`/`roles`. Same SECURITY DEFINER pattern here.
--
-- MAX(vpra_level) works directly on the enum: vpra_level's declared order
-- is none < view < prepare < recommend < approve (confirmed via \dT+), so
-- Postgres's built-in enum ordering gives the correct "highest level" result
-- without a CASE/rank workaround.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS TABLE(process_area process_area, vpra_level vpra_level)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT rp.process_area, MAX(rp.vpra_level) AS vpra_level
  FROM user_roles ur
  JOIN role_permissions rp ON rp.role_id = ur.role_id
  WHERE ur.user_id = auth.uid()
  GROUP BY rp.process_area;
$$;

REVOKE ALL ON FUNCTION public.get_my_permissions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_permissions() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;

COMMIT;
