-- Two changes, both requested directly by the project owner after testing the real
-- add-employee form as the real super_admin:
--
-- 1. super_admin currently holds only 'view' on employeeData (hr_admin alone holds
--    'approve') -- a deliberate design reviewed and signed off 2026-07-19. The project
--    owner has now explicitly asked to widen it, specifically because no hr_admin user
--    exists yet in production -- super_admin needs to be able to create the very first
--    one. Raised to 'approve', matching hr_admin exactly.
--
-- 2. The add-employee form has no way to assign a system role at invite time, a real
--    gap the project owner asked to close, including support for a role scoped to
--    SEVERAL org units at once (not just one). The blocker: user_roles.user_id
--    references auth.users(id), but an invited employee has no auth.users row yet --
--    profiles.auth_user_id is only backfilled later by link_profile_to_auth_user()
--    (20260716000009) once the invite is accepted. Role assignment therefore can't be
--    written directly to user_roles at invite time.
--
--    Fixed with a small holding table, pending_role_assignments, keyed by profile_id
--    (which exists immediately) instead of auth user id. link_profile_to_auth_user() is
--    extended to promote any pending rows into real user_roles rows (one INSERT per row
--    -- multiple org units are just multiple pending rows, same pattern user_roles
--    itself already uses for scope_type='org_unit') the moment the auth user links up,
--    then delete the pending rows. ON CONFLICT DO NOTHING on the promotion INSERT is a
--    safety net, not expected to trigger in normal operation.

BEGIN;

UPDATE role_permissions
SET vpra_level = 'approve'
WHERE process_area = 'employeeData'
  AND role_id = (SELECT id FROM roles WHERE role_code = 'super_admin');

CREATE TABLE pending_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  scope_type role_scope_type NOT NULL DEFAULT 'all',
  org_unit_id uuid REFERENCES org_units(id) ON DELETE RESTRICT,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (scope_type = 'all' AND org_unit_id IS NULL) OR
    (scope_type = 'org_unit' AND org_unit_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX pending_role_assignments_global_unique
  ON pending_role_assignments (profile_id, role_id) WHERE scope_type = 'all';
CREATE UNIQUE INDEX pending_role_assignments_org_unit_unique
  ON pending_role_assignments (profile_id, role_id, org_unit_id) WHERE scope_type = 'org_unit';

ALTER TABLE pending_role_assignments ENABLE ROW LEVEL SECURITY;

-- Same bar as user_roles itself (userManagement=approve) -- assigning a pending role is
-- the same administrative act as assigning a real one, just earlier in the timeline.
CREATE POLICY pending_role_assignments_select ON pending_role_assignments
  FOR SELECT TO authenticated
  USING (check_vpra_global('userManagement'::process_area, 'approve'::vpra_level));

CREATE POLICY pending_role_assignments_insert ON pending_role_assignments
  FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('userManagement'::process_area, 'approve'::vpra_level));

CREATE POLICY pending_role_assignments_delete ON pending_role_assignments
  FOR DELETE TO authenticated
  USING (check_vpra_global('userManagement'::process_area, 'approve'::vpra_level));

REVOKE ALL ON pending_role_assignments FROM anon;

CREATE OR REPLACE FUNCTION public.link_profile_to_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
BEGIN
  UPDATE profiles
  SET auth_user_id = NEW.id
  WHERE email = NEW.email
    AND auth_user_id IS NULL
  RETURNING id INTO v_profile_id;

  IF v_profile_id IS NOT NULL THEN
    INSERT INTO user_roles (user_id, role_id, scope_type, org_unit_id, assigned_by)
    SELECT NEW.id, pra.role_id, pra.scope_type, pra.org_unit_id, pra.assigned_by
    FROM pending_role_assignments pra
    WHERE pra.profile_id = v_profile_id
    ON CONFLICT DO NOTHING;

    DELETE FROM pending_role_assignments WHERE profile_id = v_profile_id;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
