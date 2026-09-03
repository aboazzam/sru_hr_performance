-- ============================================================================
-- get_three_sixty_nomination_candidates(cycle, subject) -- resolves the
-- {id, employee_number, full_name_ar} of every rater a given employee has
-- nominated in a given cycle, for the approvals screen (screen 2's second
-- half: "اعتماد الرئيس المباشر للقائمة").
--
-- Without this, a direct supervisor reviewing their report's nomination
-- list would see the RATER names blank: `three_sixty_nominations_select`'s
-- own `is_my_direct_report(subject_employee_id)` branch (this session's
-- 20260902000002 migration) correctly lets the supervisor read the
-- NOMINATION rows themselves, but rendering "رشّح فلانًا زميلًا" also means
-- reading the RATER's own `profiles` row -- and `profiles_select`'s RLS has
-- no bypass at all for "someone my report nominated," only for the
-- subject/report relationship itself. Same class of gap this project has
-- hit and fixed several times before (job_titles/salary_scale, the
-- org-unit-employees rollup, get_my_direct_reports() earlier this session).
--
-- SECURITY DEFINER, matching the established pattern; internally re-checks
-- the SAME authorization `three_sixty_nominations_select` already grants
-- for this subject (self, is_my_direct_report, or threeSixty>=view) before
-- resolving anything -- this function reveals nothing to a caller who
-- could not already see the nomination rows themselves via that policy.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION get_three_sixty_nomination_candidates(p_cycle_id UUID, p_subject_employee_id UUID)
RETURNS TABLE (rater_employee_id UUID, employee_number TEXT, full_name_ar TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    p_subject_employee_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR is_my_direct_report(p_subject_employee_id)
    OR check_vpra_global('threeSixty'::process_area, 'view'::vpra_level)
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT p.id, p.employee_number, p.full_name_ar
  FROM three_sixty_nominations n
  JOIN profiles p ON p.id = n.rater_employee_id
  WHERE n.cycle_id = p_cycle_id
    AND n.subject_employee_id = p_subject_employee_id
    AND n.deleted_at IS NULL;
END;
$$;

COMMENT ON FUNCTION get_three_sixty_nomination_candidates IS 'Resolves rater names for the 360-review approvals screen -- bypasses profiles_select''s RLS only after re-checking the same authorization three_sixty_nominations_select already grants for this (cycle, subject) pair.';

REVOKE ALL ON FUNCTION get_three_sixty_nomination_candidates(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_three_sixty_nomination_candidates(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION get_three_sixty_nomination_candidates(UUID, UUID) TO authenticated;

COMMIT;

-- ============================================================================
-- Verification -- run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: a real supervisor test user with a real direct report who has
-- nominated a real rater gets that rater's name back; an unrelated employee
-- (not the subject, not their supervisor, no threeSixty grant) gets zero
-- rows for the same (cycle, subject) pair.
