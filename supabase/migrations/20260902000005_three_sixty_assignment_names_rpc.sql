-- ============================================================================
-- get_three_sixty_assignment_names(cycle_id) -- resolves {id, employee_number,
-- full_name_ar} for every profile referenced (as subject OR rater) by a
-- cycle's `three_sixty_assignments` rows, for screen 1's identity-detail
-- table (cycle owner / threeSixty>=approve only).
--
-- Found live during this session's own end-to-end verification, not
-- assumed correct from code review: `three_sixty_assignments_select`
-- (20260902000002) correctly lets the cycle's owner_id or a
-- threeSixty>=approve holder read the ASSIGNMENT rows themselves, but
-- rendering "فلان قيّم فلانًا" also means reading each `profiles` row via a
-- PostgREST embed -- and `profiles_select`'s own RLS has no branch for
-- "I hold threeSixty>=approve," only employeeData/employeeDataSubordinates/
-- self/created_by. A verification script confirmed this directly: a real
-- temporary HR test role holding ONLY threeSixty=approve (deliberately no
-- employeeData grant, matching this migration's own least-privilege
-- seeding) got back `null` for the embedded subject name on a real
-- assignment row it was otherwise correctly authorized to see. Same class
-- of gap this project has hit and fixed repeatedly (job_titles_select,
-- org_units_select, the org-unit-employees rollup, get_my_direct_reports()
-- and get_three_sixty_nomination_candidates() earlier this session).
--
-- SECURITY DEFINER, matching the established pattern; internally re-checks
-- the SAME authorization three_sixty_assignments_select already grants for
-- row-level identity on this cycle (owner_id OR threeSixty>=approve) before
-- resolving anything -- reveals nothing to a caller who could not already
-- see the assignment rows themselves via that policy.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION get_three_sixty_assignment_names(p_cycle_id UUID)
RETURNS TABLE (id UUID, employee_number TEXT, full_name_ar TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    check_vpra_global('threeSixty'::process_area, 'approve'::vpra_level)
    OR EXISTS (
      SELECT 1 FROM three_sixty_cycles c
      WHERE c.id = p_cycle_id
        AND c.owner_id = (SELECT profiles.id FROM profiles WHERE profiles.auth_user_id = auth.uid())
    )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT p.id, p.employee_number, p.full_name_ar
  FROM three_sixty_assignments a
  JOIN profiles p ON p.id IN (a.subject_employee_id, a.rater_employee_id)
  WHERE a.cycle_id = p_cycle_id AND a.deleted_at IS NULL;
END;
$$;

COMMENT ON FUNCTION get_three_sixty_assignment_names IS 'Resolves subject/rater names for the 360-review cycle-detail identity table -- bypasses profiles_select''s RLS only after re-checking the same owner_id/threeSixty>=approve authorization three_sixty_assignments_select already grants for this cycle.';

REVOKE ALL ON FUNCTION get_three_sixty_assignment_names(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_three_sixty_assignment_names(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION get_three_sixty_assignment_names(UUID) TO authenticated;

COMMIT;

-- ============================================================================
-- Verification -- run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: a real threeSixty=approve test user (no employeeData grant) gets
-- back real names for a cycle's real assignment subjects/raters; a
-- threeSixty=view-only test user (not the cycle owner) gets zero rows.
