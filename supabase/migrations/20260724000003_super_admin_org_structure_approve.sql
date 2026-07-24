-- ============================================================================
-- Raise super_admin's orgStructure level from 'view' to 'approve'.
--
-- Real bug report (2026-07-24): the project owner tested the Excel import
-- as the real super_admin and the org structure (levels/positions/staffing)
-- silently failed to get created, while the employees part succeeded.
-- Root cause: super_admin's employeeData grant was already raised to
-- 'approve' on 2026-07-21 (so profiles upsert during import succeeds), but
-- orgStructure was left at 'view' (20260722000004) -- org_structure_levels/
-- positions/assignments' INSERT/UPDATE policies all require
-- check_vpra_global('orgStructure','approve'), so those writes were
-- rejected by RLS for super_admin, landing silently in the import's own
-- positionErrors/assignmentErrors arrays rather than a loud failure.
--
-- Same precedent as the 2026-07-21 employeeData widening: hr_admin remains
-- the primary intended owner of this capability, but super_admin (the
-- account the project owner actually uses) needs to be able to use the
-- same import/build UI without a partial, confusing failure.
-- ============================================================================

BEGIN;

UPDATE role_permissions
SET vpra_level = 'approve'
WHERE process_area = 'orgStructure'
  AND role_id = (SELECT id FROM roles WHERE role_code = 'super_admin');

COMMIT;

-- ============================================================================
-- Verification -- run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 'approve'.
-- SELECT rp.vpra_level FROM role_permissions rp
--   JOIN roles r ON r.id = rp.role_id
--   WHERE r.role_code = 'super_admin' AND rp.process_area = 'orgStructure';
