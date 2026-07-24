-- ============================================================================
-- Split orgStructure into two real tiers: hr_admin can build/upload the
-- structure (levels/positions/staffing, including the Excel import), but
-- final approval authority stays with super_admin only.
--
-- Real feedback (2026-07-24): the previous migration (20260724000003)
-- raised super_admin's orgStructure level to 'approve' to match hr_admin
-- exactly (fixing a bug where super_admin's imports silently failed to
-- write structure data). The project owner has now clarified the intended
-- shape: "صلاحية الرفع تكون لـ super_admin & hr_admin لكن الاعتماد فقط لدى
-- super_admin" (upload permission for both, approval only for super_admin)
-- -- and explicitly asked for this to live in the permissions matrix for
-- flexibility, not be hardcoded.
--
-- Implementation: org_structure_levels/positions/assignments' own
-- INSERT/UPDATE policies are lowered from 'approve' to 'recommend' (their
-- SELECT/self-row branches are untouched). hr_admin is set to 'recommend'
-- (still satisfies the lowered write bar -- can build/upload everything:
-- levels, positions, staffing, the Excel import, edits, and soft-deletes).
-- super_admin stays at 'approve' (set 2026-07-24 by the previous
-- migration), which also satisfies 'recommend' via VPRA's rank ordering
-- (none < view < prepare < recommend < approve), so nothing regresses for
-- super_admin either. This is a deliberate, minimal-scope choice: no
-- separate "approval" action/status exists yet on org_structure_* (it's
-- plain CRUD, no draft/published state) -- inventing one wasn't asked for
-- here. What this migration DOES achieve concretely: the matrix now
-- correctly encodes "hr_admin builds, super_admin approves" as distinct
-- VPRA levels, so any future approve-only action (e.g. "publish/finalize
-- structure") can gate on 'approve' specifically without hr_admin
-- satisfying it, with zero further hardcoding.
-- ============================================================================

BEGIN;

DROP POLICY org_structure_levels_insert ON org_structure_levels;
CREATE POLICY org_structure_levels_insert ON org_structure_levels FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('orgStructure', 'recommend'));

DROP POLICY org_structure_levels_update ON org_structure_levels;
CREATE POLICY org_structure_levels_update ON org_structure_levels FOR UPDATE TO authenticated
  USING (check_vpra_global('orgStructure', 'recommend'))
  WITH CHECK (check_vpra_global('orgStructure', 'recommend'));

DROP POLICY org_structure_positions_insert ON org_structure_positions;
CREATE POLICY org_structure_positions_insert ON org_structure_positions FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('orgStructure', 'recommend'));

DROP POLICY org_structure_positions_update ON org_structure_positions;
CREATE POLICY org_structure_positions_update ON org_structure_positions FOR UPDATE TO authenticated
  USING (check_vpra_global('orgStructure', 'recommend'))
  WITH CHECK (check_vpra_global('orgStructure', 'recommend'));

DROP POLICY org_structure_assignments_insert ON org_structure_assignments;
CREATE POLICY org_structure_assignments_insert ON org_structure_assignments FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('orgStructure', 'recommend'));

DROP POLICY org_structure_assignments_update ON org_structure_assignments;
CREATE POLICY org_structure_assignments_update ON org_structure_assignments FOR UPDATE TO authenticated
  USING (check_vpra_global('orgStructure', 'recommend'))
  WITH CHECK (check_vpra_global('orgStructure', 'recommend'));

UPDATE role_permissions
SET vpra_level = 'recommend'
WHERE process_area = 'orgStructure'
  AND role_id = (SELECT id FROM roles WHERE role_code = 'hr_admin');

COMMIT;

-- ============================================================================
-- Verification -- run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: hr_admin='recommend', super_admin='approve'.
-- SELECT r.role_code, rp.vpra_level FROM role_permissions rp
--   JOIN roles r ON r.id = rp.role_id
--   WHERE rp.process_area = 'orgStructure' AND r.role_code IN ('hr_admin','super_admin');

-- Expect: both hr_admin and super_admin can still INSERT/UPDATE
-- org_structure_levels/positions/assignments (recommend/approve both
-- satisfy the lowered 'recommend' bar).
