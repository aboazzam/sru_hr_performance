-- ============================================================================
-- Manager org-unit oversight on `evaluations` — the concept repeatedly
-- flagged as a separate, undesigned follow-up throughout the
-- supervisor_id work (20260718000008-10): "manager acts one level removed
-- from a direct report (org-unit-wide oversight, not a 1:1 relationship),
-- which supervisor_id doesn't model."
--
-- Turns out this needs NO new schema or function at all — the existing
-- check_vpra()/user_roles org-unit scoping mechanism (built since
-- 20260716000004, already used everywhere else) already models exactly
-- this concept; `evaluations`' non-self branch was simply gated at
-- 'approve' (hr_admin-only) rather than 'recommend', which is the level
-- `manager` (and `committee`) actually hold on 'evaluation' per the seeded
-- matrix. Lowering the bar from 'approve' to 'recommend' on SELECT/UPDATE
-- is the entire fix.
--
-- Why this is safe and does NOT reopen the employee/supervisor ambiguity
-- that forced the original 'approve'-only gate (20260718000001): that risk
-- was specifically about an INDIVIDUAL role (`employee`, "likely assigned
-- scope_type='all' for an individual assignment" per the original
-- warning) sharing a flat level with a genuine oversight role
-- (`supervisor`). At the 'recommend' tier, only `manager` and `committee`
-- hold that level -- both are inherently oversight/administrative roles
-- (a dean/manager legitimately scoped to their own college via
-- `scope_type='org_unit'`; a review committee legitimately scoped
-- university-wide via `scope_type='all'`, matching its real function at
-- the `manager_recommended` lifecycle stage) -- there is no
-- "individual person mistakenly granted broad scope" case at this tier,
-- unlike `employee`/`supervisor` sharing `'prepare'`.
--
-- `goals`/`bau_tasks` need NO change here: `manager` already holds
-- `'approve'` on both `goalAssignment` and `bauTasks` in the seeded
-- matrix -- meeting or exceeding those tables' existing non-self bars
-- (`'prepare'`/`'approve'` respectively) -- so manager already has full
-- org-unit-scoped oversight there today, via the same pre-existing
-- mechanism.
--
-- Scope deliberately narrow: only `evaluations_select`/`evaluations_update`
-- are touched. `evaluations_insert` (creating a brand-new evaluation
-- record) is NOT extended -- that remains self-row or `hr_admin`-only,
-- an administrative/initiation action distinct from "oversight of
-- existing records," and a separate decision if ever needed.
-- ============================================================================

BEGIN;

DROP POLICY evaluations_select ON evaluations;

CREATE POLICY evaluations_select ON evaluations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = evaluations.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('evaluation', 'recommend', (SELECT org_unit_id FROM profiles WHERE id = evaluations.employee_id))
    OR is_my_direct_report(evaluations.employee_id)
  );

DROP POLICY evaluations_update ON evaluations;

CREATE POLICY evaluations_update ON evaluations FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = evaluations.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('evaluation', 'recommend', (SELECT org_unit_id FROM profiles WHERE id = evaluations.employee_id))
    OR is_my_direct_report(evaluations.employee_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = evaluations.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('evaluation', 'recommend', (SELECT org_unit_id FROM profiles WHERE id = evaluations.employee_id))
    OR is_my_direct_report(evaluations.employee_id)
  );

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect (SET ROLE authenticated + simulated JWT): a real `manager`-role
-- test user scoped `'org_unit'` to a real org unit can SELECT/advance an
-- evaluation for an employee IN that org unit, but sees ZERO rows for an
-- employee in a DIFFERENT org unit; a plain `employee`/`supervisor`
-- (capped at 'prepare') still cannot see/act on anyone else's evaluation
-- via this branch.
