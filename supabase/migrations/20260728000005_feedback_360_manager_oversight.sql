-- Lowers feedback_360_select's oversight branch from 'approve' to
-- 'recommend' on the `evaluation` process area -- mirrors migration
-- 20260719000003's identical change to evaluation_scores exactly, and for
-- the same reason: only manager/committee hold 'recommend' on `evaluation`
-- today (confirmed against the live role_permissions matrix before writing
-- this), both inherently oversight roles, so this doesn't reopen the
-- employee/supervisor ambiguity that forced other tables' non-self branch
-- to 'approve'-only.
--
-- Required directly by the new /reports "تقييم 360" tab: "على مستوى
-- الادارة لرئيس القسم او المكتب او مدير الادارة" (department level for the
-- section/office head or department manager) -- without this, a manager
-- (recommend, org-unit-scoped) could not see ANY feedback_360 row beyond
-- their own as target/evaluator, since the table's only oversight branch
-- was hr_admin-only ('approve'). ceo already holds 'approve' on
-- `evaluation` (org-wide), so the organization-level tier already worked
-- via the existing branch and needed no change.
--
-- INSERT/UPDATE are deliberately left untouched (still self-as-evaluator
-- only) -- reviewing existing submissions is a distinct action from
-- authoring/editing one, same distinction already drawn for
-- evaluations/evaluation_scores.
BEGIN;

DROP POLICY feedback_360_select ON feedback_360;

CREATE POLICY feedback_360_select ON feedback_360 FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = feedback_360.target_employee_id AND p.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = feedback_360.evaluator_id AND p.auth_user_id = auth.uid())
    OR check_vpra(
      'evaluation',
      'recommend',
      (SELECT profiles.org_unit_id FROM profiles WHERE profiles.id = feedback_360.target_employee_id)
    )
  );

COMMIT;
