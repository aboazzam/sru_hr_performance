-- ============================================================================
-- Three fixes to the 360-review module found by a multi-angle code review of
-- this same feature branch before merge (never released to `main`), plus one
-- new narrow RPC needed by an application-layer fix in the same review pass.
--
-- 1. three_sixty_nominations_update let the SUBJECT employee write their own
--    row to ANY status, including 'approved' -- with no restriction, an
--    employee could set their own nomination list to 'approved' via a direct
--    Supabase call, completely bypassing "اعتماد الرئيس المباشر" (the direct
--    supervisor's approval), the entire point of this table's existence (see
--    20260902000002's header, point #4). Fixed by restricting the subject's
--    own WITH CHECK branch to the two states an employee may legitimately
--    write themselves (draft while composing, submitted when done) --
--    'approved'/'returned' are reachable only via the supervisor/threeSixty
--    branches, matching what `reviewThreeSixtyNominations` (the only code
--    path meant to ever write those two values) already does.
--
-- 2. three_sixty_responses_select's oversight branch required only
--    `threeSixty>='view'`, with no cycle-status gate at all -- unlike the
--    subject/manager branch immediately above it, which correctly requires
--    the cycle to be 'closed' first. This let ANY view-level holder (a much
--    lower bar than 'approve') read every rater's raw numeric answers and
--    free-text comments while a cycle is still actively collecting
--    responses -- exactly the identity/anonymity exposure
--    `three_sixty_completion_by_org_unit` was built to prevent at the
--    (less sensitive) assignment-metadata level, left open here at the
--    response-CONTENT level. Raised to `threeSixty>='approve'`, matching the
--    same tier `three_sixty_assignments_select`'s full-identity branch
--    already requires -- an approve-level holder is the same oversight tier
--    already trusted with who-submitted identity, so trusting it with
--    content too is consistent, not a widening.
--
-- 3. three_sixty_completion_by_org_unit counted 'excluded' assignments
--    toward total_assignments, while src/lib/threeSixty.ts's
--    groupCompletionStats (used by the per-rater-group breakdown on the
--    report screens, for the same "completion" concept) explicitly skips
--    them. The same underlying data was producing two disagreeing
--    completion percentages depending on which screen computed it. Fixed by
--    excluding 'excluded' rows from the RPC's count too.
--
-- 4. get_profiles_supervisor_ids -- new narrow RPC needed to fix
--    generateThreeSixtyFixedAssignments (src/app/[locale]/(app)/
--    three-sixty/[cycleId]/actions.ts), which queried `profiles` for
--    nominated subjects' supervisor_id through the plain RLS-respecting
--    client with no bypass -- an HR user holding only `threeSixty` (no
--    `employeeData` grant, entirely plausible since this module was
--    designed independent of employeeData) got a silently partial/empty
--    result, undercounting created assignments with no error. Same
--    established pattern as this session's other narrow SECURITY DEFINER
--    functions: re-checks the caller holds `threeSixty>='prepare'` (the
--    same bar `three_sixty_assignments_insert` already requires for this
--    exact action) before resolving anything.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS three_sixty_nominations_update ON three_sixty_nominations;
CREATE POLICY three_sixty_nominations_update ON three_sixty_nominations
  FOR UPDATE TO authenticated
  USING (
    subject_employee_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR is_my_direct_report(subject_employee_id)
    OR check_vpra_global('threeSixty'::process_area, 'approve'::vpra_level)
  )
  WITH CHECK (
    (
      subject_employee_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
      AND status IN ('draft', 'submitted')
    )
    OR is_my_direct_report(subject_employee_id)
    OR check_vpra_global('threeSixty'::process_area, 'approve'::vpra_level)
  );

DROP POLICY IF EXISTS three_sixty_responses_select ON three_sixty_responses;
CREATE POLICY three_sixty_responses_select ON three_sixty_responses
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM three_sixty_assignments a
      WHERE a.id = three_sixty_responses.assignment_id
        AND a.rater_employee_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM three_sixty_assignments a
      JOIN three_sixty_cycles c ON c.id = a.cycle_id
      WHERE a.id = three_sixty_responses.assignment_id
        AND c.status = 'closed'
        AND (
          a.subject_employee_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
          OR is_my_subordinate(a.subject_employee_id)
        )
    )
    OR check_vpra_global('threeSixty'::process_area, 'approve'::vpra_level)
  );

CREATE OR REPLACE FUNCTION three_sixty_completion_by_org_unit(p_cycle_id UUID)
RETURNS TABLE (
  org_unit_id UUID,
  org_unit_name_ar TEXT,
  total_assignments BIGINT,
  submitted_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT check_vpra_global('threeSixty'::process_area, 'view'::vpra_level) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    ou.id,
    ou.name_ar,
    COUNT(a.id)::BIGINT,
    COUNT(a.id) FILTER (WHERE a.status = 'submitted')::BIGINT
  FROM three_sixty_assignments a
  JOIN profiles subj ON subj.id = a.subject_employee_id
  LEFT JOIN org_units ou ON ou.id = subj.org_unit_id
  WHERE a.cycle_id = p_cycle_id AND a.deleted_at IS NULL AND a.status <> 'excluded'
  GROUP BY ou.id, ou.name_ar
  ORDER BY ou.name_ar;
END;
$$;

CREATE OR REPLACE FUNCTION get_profiles_supervisor_ids(p_ids UUID[])
RETURNS TABLE (id UUID, supervisor_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT check_vpra_global('threeSixty'::process_area, 'prepare'::vpra_level) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.supervisor_id
  FROM profiles p
  WHERE p.id = ANY(p_ids) AND p.deleted_at IS NULL;
END;
$$;

COMMENT ON FUNCTION get_profiles_supervisor_ids IS 'Resolves supervisor_id for a list of profile ids for the 360-review "generate fixed assignments" action -- bypasses profiles_select''s RLS only after re-checking threeSixty>=prepare, the same bar three_sixty_assignments_insert already requires for this exact write.';

REVOKE ALL ON FUNCTION get_profiles_supervisor_ids(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_profiles_supervisor_ids(UUID[]) FROM anon;
GRANT EXECUTE ON FUNCTION get_profiles_supervisor_ids(UUID[]) TO authenticated;

COMMIT;

-- ============================================================================
-- Verification -- run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: a real employee test user attempting
-- `UPDATE three_sixty_nominations SET status='approved' WHERE subject_employee_id = <self>`
-- affects 0 rows (WITH CHECK fails); the same user CAN still set status='submitted'
-- on their own row.

-- Expect: a real threeSixty=view-only test user (not approve, not the cycle
-- owner) gets 0 rows from a direct three_sixty_responses SELECT on an active
-- cycle; a threeSixty=approve test user still gets the real rows.

-- Expect: three_sixty_completion_by_org_unit's total_assignments no longer
-- includes a real 'excluded' assignment for the same cycle.

-- Expect: a real threeSixty=prepare-only test user (no employeeData grant)
-- gets a real supervisor_id back from get_profiles_supervisor_ids(), while a
-- direct `SELECT supervisor_id FROM profiles WHERE id = ...` as the same user
-- returns 0 rows.
