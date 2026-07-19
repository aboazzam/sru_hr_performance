-- ============================================================================
-- Lowers the check_vpra bar on evaluation_scores from 'approve' to
-- 'recommend', mirroring migration 20260718000011's identical change to
-- `evaluations` -- explicitly flagged as a separate, still-open follow-up in
-- both 20260719000001 and 20260719000002's own headers, now resolved on
-- request.
--
-- Same reasoning as migration 11: only `manager` and `committee` hold
-- 'recommend' on the `evaluation` process area today, both inherently
-- oversight roles (manager org-unit-scoped, committee university-wide) --
-- this does not reopen the earlier employee/supervisor ambiguity that
-- forced the original 'approve'-only gate (that risk was about an
-- individual role sharing a level with a genuine oversight role).
--
-- [استنتاج] Mirrors migration 11's own scope decision exactly: only SELECT
-- and UPDATE are lowered. INSERT is deliberately left at 'approve' --
-- migration 11 reasoned that creating a brand-new record is a distinct
-- administrative action from overseeing an existing one, and the same
-- distinction applies here (scoring a competency/goal for the first time
-- vs. reviewing/adjusting an existing score). Not separately confirmed with
-- the project owner beyond "mirror the evaluations precedent."
-- ============================================================================

BEGIN;

DROP POLICY evaluation_scores_select ON evaluation_scores;
CREATE POLICY evaluation_scores_select ON evaluation_scores
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM evaluations e
      JOIN profiles p ON p.id = e.employee_id
      WHERE e.id = evaluation_scores.evaluation_id
        AND p.auth_user_id = auth.uid()
    )
    OR check_vpra(
      'evaluation'::process_area,
      'recommend'::vpra_level,
      (SELECT p.org_unit_id FROM evaluations e JOIN profiles p ON p.id = e.employee_id WHERE e.id = evaluation_scores.evaluation_id)
    )
    OR is_my_direct_report(
      (SELECT e.employee_id FROM evaluations e WHERE e.id = evaluation_scores.evaluation_id)
    )
  );

DROP POLICY evaluation_scores_update ON evaluation_scores;
CREATE POLICY evaluation_scores_update ON evaluation_scores
  FOR UPDATE
  TO authenticated
  USING (
    check_vpra(
      'evaluation'::process_area,
      'recommend'::vpra_level,
      (SELECT p.org_unit_id FROM evaluations e JOIN profiles p ON p.id = e.employee_id WHERE e.id = evaluation_scores.evaluation_id)
    )
    OR is_my_direct_report(
      (SELECT e.employee_id FROM evaluations e WHERE e.id = evaluation_scores.evaluation_id)
    )
  )
  WITH CHECK (
    check_vpra(
      'evaluation'::process_area,
      'recommend'::vpra_level,
      (SELECT p.org_unit_id FROM evaluations e JOIN profiles p ON p.id = e.employee_id WHERE e.id = evaluation_scores.evaluation_id)
    )
    OR is_my_direct_report(
      (SELECT e.employee_id FROM evaluations e WHERE e.id = evaluation_scores.evaluation_id)
    )
  );

-- evaluation_scores_insert deliberately untouched -- stays at 'approve' OR
-- is_my_direct_report(), same as before this migration.

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: a real `manager` (or `committee`) test user, scoped appropriately,
-- can now SELECT/UPDATE evaluation_scores rows for an in-scope evaluation
-- via the 'recommend' branch (blocked before this migration), while INSERT
-- for the same evaluation is still rejected unless they also qualify via
-- is_my_direct_report() or hold 'approve'. Regression: hr_admin's 'approve'
-- branch, the self-row SELECT bypass, and is_my_direct_report() all
-- continue to work unchanged.
