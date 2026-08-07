-- ============================================================================
-- وصول المراجع المالي إلى الخطة نفسها
-- (Finance reviewer access to the plan and its items)
--
-- A gap in 20260807000002's own design, found while wiring the finance
-- review screen — not a later regression. That migration gave the finance
-- reviewer access to `recruitment_requests` (SELECT accepts
-- `recruitmentBudget>=view`), but left `recruitment_plans` and
-- `recruitment_plan_items` keyed on `recruitmentPlan` alone. So a finance
-- role holding ONLY `recruitmentBudget` — exactly the role the documented
-- cycle puts in the budget-review seat — could read the individual demand
-- requests but not the plan that consolidates them, and could not write its
-- own review at all:
--
--   SELECT on recruitment_plans        -> 0 rows  (page would 404)
--   UPDATE on recruitment_plans        -> 0 rows  (finance note/budget lost)
--   SELECT on recruitment_plan_items   -> 0 rows  (nothing to cost)
--
-- Fixes all three by adding a `recruitmentBudget` branch:
--   * SELECT at 'view'      — read the plan and its items to review them.
--   * UPDATE at 'recommend' — record the review and perform the finance-side
--                             transitions the guard allows.
--
-- WHY THIS DOES NOT LET FINANCE REWRITE THE PLAN:
-- Postgres policies gate ROWS, not columns, so this UPDATE branch does
-- technically permit finance to write any column of a plan row. That is the
-- same limitation `recruitment_plans_update` already lives with for
-- `recruitmentPlan>=prepare`, and it is why the column-level and
-- state-machine rules are enforced in the Server Actions instead:
--   * `saveFinanceReview` re-checks `recruitmentBudget>=recommend` and
--     writes only approved_budget / finance_note / finance_reviewed_*.
--   * `transitionRecruitmentPlan` runs every status change through
--     `recruitmentWorkflow.ts`, where the finance-side transitions are the
--     only ones a `recruitmentBudget` holder satisfies — approving the plan
--     requires `recruitmentPlan>='approve'`, which finance does not hold.
-- Documented here rather than left implicit, because "RLS allows it, the
-- action forbids it" is exactly the kind of split that must be written down.
--
-- Existing branches are preserved verbatim; no role loses visibility.
-- ============================================================================

BEGIN;

DROP POLICY recruitment_plans_select ON recruitment_plans;
CREATE POLICY recruitment_plans_select ON recruitment_plans
  FOR SELECT TO authenticated
  USING (
    check_vpra_global('recruitmentPlan'::process_area, 'view'::vpra_level)
    OR check_vpra_global('recruitmentBudget'::process_area, 'view'::vpra_level)
  );

DROP POLICY recruitment_plans_update ON recruitment_plans;
CREATE POLICY recruitment_plans_update ON recruitment_plans
  FOR UPDATE TO authenticated
  USING (
    check_vpra_global('recruitmentPlan'::process_area, 'prepare'::vpra_level)
    OR check_vpra_global('recruitmentBudget'::process_area, 'recommend'::vpra_level)
  )
  WITH CHECK (
    check_vpra_global('recruitmentPlan'::process_area, 'prepare'::vpra_level)
    OR check_vpra_global('recruitmentBudget'::process_area, 'recommend'::vpra_level)
  );

DROP POLICY recruitment_plan_items_select ON recruitment_plan_items;
CREATE POLICY recruitment_plan_items_select ON recruitment_plan_items
  FOR SELECT TO authenticated
  USING (
    check_vpra_global('recruitmentPlan'::process_area, 'view'::vpra_level)
    OR check_vpra_global('recruitmentBudget'::process_area, 'view'::vpra_level)
  );

-- INSERT on both tables is deliberately UNCHANGED: creating a plan or adding
-- a line item is HR's act, never finance's. A budget reviewer reviews what
-- exists; it does not add to it.

COMMIT;

-- ============================================================================
-- Verification -- run AFTER applying.
-- ============================================================================
-- As an account holding ONLY recruitmentBudget='recommend':
--   SELECT count(*) FROM recruitment_plans;       -- > 0 (was 0)
--   SELECT count(*) FROM recruitment_plan_items;  -- > 0 (was 0)
--   UPDATE recruitment_plans SET finance_note='x' -- affects rows (was 0)
--   INSERT INTO recruitment_plan_items ...        -- still rejected (42501)
-- As an account with neither area: all still 0.
