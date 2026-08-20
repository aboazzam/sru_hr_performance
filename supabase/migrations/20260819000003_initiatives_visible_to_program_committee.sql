-- ============================================================================
-- A program's committee must be able to READ that program's initiatives
--
-- Found live while verifying 20260819000002, not by review: a committee
-- member with no strategicPlanning grant could open the program page (their
-- membership grants that) but its dashboard showed "المبادرات المدرجة: 0"
-- and the detail tab was empty — for exactly the audience the program page
-- was built for.
--
-- Cause: `strategic_program_initiatives_select` only asks whether the
-- PROGRAM is visible, so the link rows came back fine; but each linked
-- initiative is then read from `strategic_initiatives`, whose own policy
-- (20260819000001) only accepts the module-wide 'view' grant or the
-- initiative's owning position. The member had neither, so every initiative
-- was filtered out and the counts collapsed to zero.
--
-- Fix: one more OR branch — an initiative is readable if it belongs to a
-- program whose committee you sit on. Read only; writing still requires
-- strategicPlanning='approve', unchanged.
--
-- A SECURITY DEFINER helper is used rather than an inline EXISTS so that
-- reading an initiative does not cascade into evaluating the policies of
-- strategic_program_initiatives and strategic_programs on every row — the
-- same reason is_my_strategic_position()/is_my_direct_report() exist.
-- ============================================================================

CREATE FUNCTION is_initiative_in_my_program(p_initiative_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_initiative_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM strategic_program_initiatives spi
    JOIN strategic_program_committee_members m ON m.program_id = spi.program_id
    JOIN profiles p ON p.id = m.member_profile_id
    WHERE spi.initiative_id = p_initiative_id
      AND spi.deleted_at IS NULL
      AND m.deleted_at IS NULL
      AND p.auth_user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION is_initiative_in_my_program IS 'TRUE iff p_initiative_id is included in a program whose committee the caller is an active member of. SECURITY DEFINER, mirroring is_my_strategic_position().';

REVOKE EXECUTE ON FUNCTION is_initiative_in_my_program(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_initiative_in_my_program(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION is_initiative_in_my_program(UUID) TO authenticated;

DROP POLICY strategic_initiatives_select ON strategic_initiatives;

CREATE POLICY strategic_initiatives_select ON strategic_initiatives FOR SELECT TO authenticated
  USING (
    check_vpra_global('strategicPlanning', 'view')
    OR (owner_position_id IS NOT NULL AND is_my_strategic_position(owner_position_id))
    OR is_initiative_in_my_program(id)
  );

-- Its target links follow the same rule, otherwise the committee would see
-- an initiative with no indication of what it serves.
DROP POLICY strategic_initiative_targets_select ON strategic_initiative_targets;

CREATE POLICY strategic_initiative_targets_select ON strategic_initiative_targets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM strategic_initiatives i
      WHERE i.id = strategic_initiative_targets.initiative_id
    )
  );
