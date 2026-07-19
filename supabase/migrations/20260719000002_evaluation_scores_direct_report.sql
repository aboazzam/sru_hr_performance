-- ============================================================================
-- Extends the direct-supervisor relationship mechanism (`is_my_direct_report()`,
-- migration 20260718000009) to `evaluation_scores`, closing the gap flagged
-- in 20260719000001's own header: this table's RLS still used the older
-- `check_vpra('evaluation','approve',...)`-only pattern (self-row bypass on
-- SELECT only, no supervisor branch at all), predating migrations 9-11's
-- fixes to `evaluations`/`goals`/`bau_tasks`.
--
-- Mirrors migrations 9 (extend to goals/bau_tasks) and 10 (write access)
-- exactly: adds `OR is_my_direct_report(<employee_id>)` to SELECT, INSERT,
-- and UPDATE. `evaluation_scores` has no `employee_id` column of its own —
-- it's derived via the same `evaluations e JOIN profiles p` subquery this
-- table's policies already use for `check_vpra`'s org_unit_id lookup, just
-- selecting `e.employee_id` instead of `p.org_unit_id`.
--
-- [استنتاج] Deliberately NOT lowering the `check_vpra` bar from 'approve' to
-- 'recommend' here, unlike migration 11's change to `evaluations`. That
-- change was justified specifically because only `manager`/`committee` hold
-- 'recommend' on `evaluation` (both genuine oversight roles) — the same
-- reasoning could apply here, but extending it wasn't asked for and is a
-- separate decision from "add is_my_direct_report()"; flagged as a follow-up
-- in CLAUDE.md/HANDOVER.md, not bundled into this migration
-- (PROJECT_STRICT.md: patch, not rewrite — no changes outside scope).
--
-- Does not touch the existing self-row bypass on SELECT (kept as-is) or add
-- one to INSERT/UPDATE (none existed before, and none was asked for here).
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
      'approve'::vpra_level,
      (SELECT p.org_unit_id FROM evaluations e JOIN profiles p ON p.id = e.employee_id WHERE e.id = evaluation_scores.evaluation_id)
    )
    OR is_my_direct_report(
      (SELECT e.employee_id FROM evaluations e WHERE e.id = evaluation_scores.evaluation_id)
    )
  );

DROP POLICY evaluation_scores_insert ON evaluation_scores;
CREATE POLICY evaluation_scores_insert ON evaluation_scores
  FOR INSERT
  TO authenticated
  WITH CHECK (
    check_vpra(
      'evaluation'::process_area,
      'approve'::vpra_level,
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
      'approve'::vpra_level,
      (SELECT p.org_unit_id FROM evaluations e JOIN profiles p ON p.id = e.employee_id WHERE e.id = evaluation_scores.evaluation_id)
    )
    OR is_my_direct_report(
      (SELECT e.employee_id FROM evaluations e WHERE e.id = evaluation_scores.evaluation_id)
    )
  )
  WITH CHECK (
    check_vpra(
      'evaluation'::process_area,
      'approve'::vpra_level,
      (SELECT p.org_unit_id FROM evaluations e JOIN profiles p ON p.id = e.employee_id WHERE e.id = evaluation_scores.evaluation_id)
    )
    OR is_my_direct_report(
      (SELECT e.employee_id FROM evaluations e WHERE e.id = evaluation_scores.evaluation_id)
    )
  );

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: an org_unit-scoped supervisor test user (scope NOT covering their
-- report) can SELECT/INSERT/UPDATE evaluation_scores rows for an evaluation
-- belonging to their real direct report (via is_my_direct_report()), while
-- the same actions against an unrelated employee's evaluation_scores rows
-- are rejected/return 0 rows. A regression check confirms the existing
-- self-row SELECT bypass and the check_vpra('approve') branch are unaffected.
