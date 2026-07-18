-- ============================================================================
-- Extends the direct-supervisor relationship (profiles.supervisor_id,
-- 20260718000008/9) from READ to WRITE (INSERT/UPDATE) on `evaluations`,
-- `goals`, and `bau_tasks` -- the follow-up both prior migrations
-- explicitly deferred ("extending write access via the relationship is a
-- separate decision... a natural next step, not done here").
--
-- Uses `is_my_direct_report()` (20260718000009) with NO additional
-- check_vpra layered on top, for the exact reason established in that
-- migration's second bugfix: `profiles.supervisor_id` can only be set via
-- a `profiles` UPDATE that itself requires `check_vpra('employeeData',
-- 'prepare',...)`, so the relationship's existence already is the
-- authorization fact. Any additional scope-bound check_vpra call would
-- reintroduce the exact org-unit-mismatch failure mode fixed twice
-- already in that migration.
--
-- Practical effect for `evaluations`: this is what makes the ALREADY-BUILT
-- `transitionEvaluation` Server Action (src/app/[locale]/(app)/
-- evaluations/[id]/actions.ts) start actually working for a real
-- `supervisor` advancing their direct report's evaluation at the
-- `submitted` state -- the RLS write gate was the only thing blocking it;
-- `vpra.ts`'s `canAdvanceEvaluationState` already correctly restricts
-- WHICH transition a `supervisor` may perform, RLS only had to stop
-- blocking the write itself. This does NOT unlock `manager`/`committee`
-- transitions -- those roles act one level removed from a direct report
-- (manager oversees a whole org unit, committee reviews cycle-wide), which
-- `supervisor_id` doesn't model; that remains a separate, undesigned
-- follow-up (an org-unit-based "manages this unit" concept, not a direct
-- 1:1 relationship).
--
-- `goals`/`bau_tasks`: a real supervisor can now create/edit goals and BAU
-- tasks for their actual direct reports, independent of whether their
-- user_roles org_unit scope happens to cover that specific report (same
-- reasoning as the SELECT extension in 20260718000009).
-- ============================================================================

BEGIN;

DROP POLICY evaluations_insert ON evaluations;

CREATE POLICY evaluations_insert ON evaluations FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = evaluations.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('evaluation', 'approve', (SELECT org_unit_id FROM profiles WHERE id = evaluations.employee_id))
    OR is_my_direct_report(evaluations.employee_id)
  );

DROP POLICY evaluations_update ON evaluations;

CREATE POLICY evaluations_update ON evaluations FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = evaluations.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('evaluation', 'approve', (SELECT org_unit_id FROM profiles WHERE id = evaluations.employee_id))
    OR is_my_direct_report(evaluations.employee_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = evaluations.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('evaluation', 'approve', (SELECT org_unit_id FROM profiles WHERE id = evaluations.employee_id))
    OR is_my_direct_report(evaluations.employee_id)
  );

DROP POLICY goals_insert ON goals;

CREATE POLICY goals_insert ON goals FOR INSERT TO authenticated
  WITH CHECK (
    check_vpra('goalAssignment', 'prepare', (SELECT org_unit_id FROM profiles WHERE id = goals.employee_id))
    OR is_my_direct_report(goals.employee_id)
  );

DROP POLICY goals_update ON goals;

CREATE POLICY goals_update ON goals FOR UPDATE TO authenticated
  USING (
    check_vpra('goalAssignment', 'prepare', (SELECT org_unit_id FROM profiles WHERE id = goals.employee_id))
    OR is_my_direct_report(goals.employee_id)
  )
  WITH CHECK (
    check_vpra('goalAssignment', 'prepare', (SELECT org_unit_id FROM profiles WHERE id = goals.employee_id))
    OR is_my_direct_report(goals.employee_id)
  );

DROP POLICY bau_tasks_insert ON bau_tasks;

CREATE POLICY bau_tasks_insert ON bau_tasks FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = bau_tasks.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('bauTasks', 'approve', (SELECT org_unit_id FROM profiles WHERE id = bau_tasks.employee_id))
    OR is_my_direct_report(bau_tasks.employee_id)
  );

DROP POLICY bau_tasks_update ON bau_tasks;

CREATE POLICY bau_tasks_update ON bau_tasks FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = bau_tasks.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('bauTasks', 'approve', (SELECT org_unit_id FROM profiles WHERE id = bau_tasks.employee_id))
    OR is_my_direct_report(bau_tasks.employee_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = bau_tasks.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('bauTasks', 'approve', (SELECT org_unit_id FROM profiles WHERE id = bau_tasks.employee_id))
    OR is_my_direct_report(bau_tasks.employee_id)
  );

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect (SET ROLE authenticated + simulated JWT): a real `org_unit`-scoped
-- supervisor test user (scope NOT covering their report's org unit) can
-- now INSERT/UPDATE a goal and BAU task for their real direct report, and
-- can advance their report's evaluation from 'submitted' to
-- 'supervisor_reviewed' (the one state a `supervisor` actor can act on
-- per vpra.ts's lifecycle table) via the same real transitionEvaluation()
-- code path used elsewhere; an unrelated employee's rows remain
-- untouchable in all three cases.
