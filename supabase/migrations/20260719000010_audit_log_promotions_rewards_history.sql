-- ============================================================================
-- Adds a real SELECT policy to `audit_log`, scoped narrowly to the
-- `promotions_reviewed`/`reward_reviewed` entries needed for the
-- requested "promotions and rewards approval history" screen.
--
-- `audit_log` has been RLS-enabled with ZERO policies since its own
-- creation (migration 10) -- a deliberate, documented default-deny with
-- "no retention job or viewer UI yet" flagged as a future follow-up. This
-- migration does NOT open audit_log broadly (a general audit-log viewer
-- for every action type is a separate, bigger, more sensitive decision
-- not asked for here) -- it adds exactly one policy restricted to
-- `entity IN ('promotions', 'rewards')`, nothing else. Every other
-- action type in `audit_log` (evaluation_state_transition,
-- goal_assigned, supervisor_assigned, feedback_360_evaluator_revealed,
-- ...) remains completely unreadable through RLS, same as before this
-- migration.
--
-- The policy mirrors `promotions_select`/`rewards_select`'s own real
-- scoping exactly (not a flattened global check): for a `promotions`
-- entity_id, it joins to that `promotions` row's employee to resolve the
-- real `org_unit_id` and calls `check_vpra('promotions','view',
-- org_unit_id)`; same shape for `rewards`. This is the identical
-- authorization boundary that already lets a caller see the current
-- `promotions`/`rewards` list -- the history screen doesn't grant any
-- broader audience than that.
--
-- [استنتاج] No self-row bypass is added here (unlike `promotions_select`/
-- `rewards_select`'s own self-row branch) -- revealing "who rejected my
-- promotion/reward" to the employee themselves is a more sensitive HR
-- question not explicitly asked for; this stays an oversight-role-only
-- screen, matching the `check_vpra('promotions','view',...)` audience
-- already viewing the org-wide list pages today.
-- ============================================================================

BEGIN;

CREATE POLICY audit_log_select_promotions_rewards ON audit_log
  FOR SELECT
  TO authenticated
  USING (
    (
      entity = 'promotions'
      AND EXISTS (
        SELECT 1 FROM promotions p
        JOIN profiles emp ON emp.id = p.employee_id
        WHERE p.id = audit_log.entity_id
          AND check_vpra('promotions'::process_area, 'view'::vpra_level, emp.org_unit_id)
      )
    )
    OR
    (
      entity = 'rewards'
      AND EXISTS (
        SELECT 1 FROM rewards r
        JOIN profiles emp ON emp.id = r.employee_id
        WHERE r.id = audit_log.entity_id
          AND check_vpra('promotions'::process_area, 'view'::vpra_level, emp.org_unit_id)
      )
    )
  );

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: a real committee/ceo-style test user (scope 'all', view+ on
-- promotions) can SELECT both promotion_reviewed and reward_reviewed
-- audit_log rows; a real org_unit-scoped manager sees only rows for
-- employees within their own org unit, zero for an unrelated unit; every
-- OTHER action type in audit_log (e.g. evaluation_state_transition)
-- remains invisible to everyone, confirming the policy did not
-- accidentally widen access beyond promotions/rewards.
