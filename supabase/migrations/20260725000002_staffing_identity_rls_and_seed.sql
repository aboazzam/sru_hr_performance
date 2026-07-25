-- ============================================================================
-- Point org_structure_assignments' RLS at the new `staffing` area and
-- org_identity's RLS at the new `identity` area (both previously checked
-- `orgStructure`), and reseed role_permissions accordingly.
--
-- Also implements a separate, explicit request from the same feedback
-- round: "الغاء تاب الصلاحيات والهوية من hr_admin" (remove the Permissions
-- and Identity tabs from hr_admin) — hr_admin's `userManagement` grant is
-- removed entirely (deleted, matching the established sparse-row-means-none
-- convention) and no `identity` row is ever inserted for hr_admin, so both
-- the /admin (Positions/Permissions) and /admin/identity nav tabs stop
-- showing for that role. hr_admin keeps `orgStructure` at 'recommend'
-- (unchanged — still builds levels/positions) and gains `staffing` at
-- 'recommend' (the Excel-import/staffing capability it already had bundled
-- under `orgStructure` before this split, now explicit).
--
-- super_admin gains explicit `staffing`/`identity` grants at 'approve' —
-- previously its access to both came for free via `orgStructure='approve'`
-- satisfying the (now-replaced) shared check; without this it would lose
-- both capabilities the moment the RLS switches to the new dedicated areas.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- org_structure_assignments -> 'staffing'
-- ----------------------------------------------------------------------------
DROP POLICY org_structure_assignments_select ON org_structure_assignments;
CREATE POLICY org_structure_assignments_select ON org_structure_assignments FOR SELECT TO authenticated
  USING (
    check_vpra_global('staffing', 'view')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = employee_id AND p.auth_user_id = auth.uid())
  );

DROP POLICY org_structure_assignments_insert ON org_structure_assignments;
CREATE POLICY org_structure_assignments_insert ON org_structure_assignments FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('staffing', 'recommend'));

DROP POLICY org_structure_assignments_update ON org_structure_assignments;
CREATE POLICY org_structure_assignments_update ON org_structure_assignments FOR UPDATE TO authenticated
  USING (check_vpra_global('staffing', 'recommend'))
  WITH CHECK (check_vpra_global('staffing', 'recommend'));

-- ----------------------------------------------------------------------------
-- org_identity -> 'identity'
-- ----------------------------------------------------------------------------
DROP POLICY org_identity_select ON org_identity;
CREATE POLICY org_identity_select ON org_identity FOR SELECT TO authenticated
  USING (check_vpra_global('identity', 'view'));

DROP POLICY org_identity_insert ON org_identity;
CREATE POLICY org_identity_insert ON org_identity FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('identity', 'approve'));

DROP POLICY org_identity_update ON org_identity;
CREATE POLICY org_identity_update ON org_identity FOR UPDATE TO authenticated
  USING (check_vpra_global('identity', 'approve'))
  WITH CHECK (check_vpra_global('identity', 'approve'));

-- ----------------------------------------------------------------------------
-- role_permissions reseed
-- ----------------------------------------------------------------------------
INSERT INTO role_permissions (role_id, process_area, vpra_level)
SELECT id, 'staffing'::process_area, 'recommend'::vpra_level FROM roles WHERE role_code = 'hr_admin';

INSERT INTO role_permissions (role_id, process_area, vpra_level)
SELECT id, 'staffing'::process_area, 'approve'::vpra_level FROM roles WHERE role_code = 'super_admin';

INSERT INTO role_permissions (role_id, process_area, vpra_level)
SELECT id, 'identity'::process_area, 'approve'::vpra_level FROM roles WHERE role_code = 'super_admin';

-- hr_admin loses userManagement entirely (sparse convention: missing row = 'none').
DELETE FROM role_permissions
WHERE process_area = 'userManagement'
  AND role_id = (SELECT id FROM roles WHERE role_code = 'hr_admin');

COMMIT;

-- ============================================================================
-- Verification — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: hr_admin has no userManagement row and no identity row; has
-- orgStructure='recommend' and staffing='recommend'.
-- SELECT process_area, vpra_level FROM role_permissions
--   WHERE role_id = (SELECT id FROM roles WHERE role_code = 'hr_admin')
--   AND process_area IN ('userManagement','identity','orgStructure','staffing');

-- Expect: super_admin has orgStructure/staffing/identity/userManagement all 'approve'.
-- SELECT process_area, vpra_level FROM role_permissions
--   WHERE role_id = (SELECT id FROM roles WHERE role_code = 'super_admin')
--   AND process_area IN ('userManagement','identity','orgStructure','staffing');
