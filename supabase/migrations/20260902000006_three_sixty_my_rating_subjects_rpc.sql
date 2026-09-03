-- ============================================================================
-- get_my_three_sixty_rating_subjects() -- resolves the subject's name for
-- every assignment where the CALLER is the rater. Same class of gap as
-- get_three_sixty_assignment_names() (previous migration), found by
-- extending this session's own verification script to the rater-facing
-- screens: screen 3's "تقييماتي المطلوبة" list and the questionnaire page
-- both embed the SUBJECT's `profiles` row via
-- `profiles!three_sixty_assignments_subject_employee_id_fkey`, but an
-- ordinary rater (a plain employee/peer with no employeeData grant) has no
-- `profiles_select` branch letting them read a colleague's name just
-- because they were assigned to rate them.
--
-- Deliberately self-scoped with NO parameter and NO extra permission
-- check: the WHERE clause itself (`rater_employee_id = caller's own
-- profile`) IS the authorization -- being assigned as someone's rater
-- already means `three_sixty_assignments_select`'s self-row branch lets
-- the caller read that exact assignment row; this RPC only adds the name
-- that row's own embed couldn't resolve. Matches the "the relationship
-- itself is the authorization fact" trust model already established
-- throughout this schema (is_my_direct_report, is_my_subordinate, etc.).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION get_my_three_sixty_rating_subjects()
RETURNS TABLE (assignment_id UUID, subject_id UUID, subject_name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, p.id, p.full_name_ar
  FROM three_sixty_assignments a
  JOIN profiles p ON p.id = a.subject_employee_id
  WHERE a.rater_employee_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    AND a.deleted_at IS NULL;
$$;

COMMENT ON FUNCTION get_my_three_sixty_rating_subjects IS 'Resolves the subject name for every 360-review assignment where the caller is the rater -- self-scoped, no extra check needed since being the assignment''s own rater already is the authorization fact (see three_sixty_assignments_select''s self-row branch).';

REVOKE ALL ON FUNCTION get_my_three_sixty_rating_subjects() FROM PUBLIC;
REVOKE ALL ON FUNCTION get_my_three_sixty_rating_subjects() FROM anon;
GRANT EXECUTE ON FUNCTION get_my_three_sixty_rating_subjects() TO authenticated;

COMMIT;

-- ============================================================================
-- Verification -- run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: a real rater test user (no employeeData grant) gets back the
-- real subject name for their own real assignment; a raw
-- `SELECT full_name_ar FROM profiles WHERE id = '<subject id>'` as the SAME
-- user returns 0 rows, proving the RPC does real work.
