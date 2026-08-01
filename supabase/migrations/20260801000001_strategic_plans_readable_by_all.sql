-- Widen strategic_plans_select so browsing which plans exist is open to
-- every authenticated user, mirroring the exact "vision/mission opened to
-- everyone" precedent from 20260730000004.
--
-- Found live while building the new /kpis/plans list + /kpis/plans/[id]
-- detail page (2026-08-01): the page-level gate was already loosened to
-- ungated (matching that same precedent), but the underlying RLS
-- (strategic_plans_select, 20260730000001) still required EITHER
-- check_vpra_global('strategicPlanning','view') OR an EXISTS join to
-- strategic_goals -- and that EXISTS subquery is itself subject to
-- strategic_goals_select's own RLS, so it only counts goals the CALLER can
-- already see. A plain employee with no strategicPlanning grant and no
-- position in any goal's cascade chain therefore saw "no plans yet" even
-- though a real plan (with a real goal) exists in production -- silently
-- defeating the explicit request that clicking the sidebar's "الخطة
-- الاستراتيجية" button always shows "قائمة بالخطط الاستراتيجية".
--
-- A plan's name/year-range is non-sensitive administrative metadata, same
-- category as the vision/mission text (published institutional identity),
-- not a per-row-scoped business record -- the sensitive content (goals,
-- sub-goals, KPIs, targets) each already has its own, unchanged, much
-- narrower RLS. Write policies (strategic_plans_insert/update) are
-- untouched and remain strategy_admin-only via
-- check_vpra_global('strategicPlanning','approve').
BEGIN;

DROP POLICY IF EXISTS strategic_plans_select ON strategic_plans;
CREATE POLICY strategic_plans_select ON strategic_plans FOR SELECT TO authenticated
  USING (true);

-- Verify: policy now exists with the expected permissive qual.
SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'strategic_plans'::regclass AND polname = 'strategic_plans_select';

COMMIT;
