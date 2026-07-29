-- ============================================================================
-- Vision/Mission/Values editable at the 'prepare' tier, not only 'approve'.
--
-- The project owner asked for the strategic-identity screen to behave per
-- VPRA tier -- "حسب الصلاحية اما اطلاع ام اعداد او اعتماد" -- and then
-- confirmed directly (2026-07-30) that "إعداد" means EDIT RIGHTS ONLY, with
-- no draft->approve workflow behind it. So the three tiers map to exactly
-- two behaviours, and no status column is introduced:
--
--   view    (اطلاع)  -> read-only
--   prepare (إعداد)  -> may edit
--   approve (اعتماد) -> may edit (satisfies 'prepare' via the VPRA rank
--                       ordering, so it needs no separate branch)
--
-- Lowering the bar here is the load-bearing half of that change: the page's
-- own canEdit check is being lowered to 'prepare' in the same commit, but on
-- its own that would just produce a form whose every submit is rejected by
-- Postgres -- these policies (20260728000002) are the real gate.
--
-- Deliberately NOT touched: strategic_plans / strategic_goals /
-- strategic_kpis / kpi_annual_targets stay approve-only. Those carry the
-- project owner's separate, explicit instruction that goals and KPIs "لا
-- تتغير على طوال سنوات الخطة الا بقرار من صاحب الصلاحية" -- a different
-- rule from the identity text, and not something this change reinterprets.
-- ============================================================================

BEGIN;

DROP POLICY strategic_identity_insert ON strategic_identity;
CREATE POLICY strategic_identity_insert ON strategic_identity FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('strategicPlanning', 'prepare'));

DROP POLICY strategic_identity_update ON strategic_identity;
CREATE POLICY strategic_identity_update ON strategic_identity FOR UPDATE TO authenticated
  USING (check_vpra_global('strategicPlanning', 'prepare'))
  WITH CHECK (check_vpra_global('strategicPlanning', 'prepare'));

DROP POLICY strategic_values_insert ON strategic_values;
CREATE POLICY strategic_values_insert ON strategic_values FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('strategicPlanning', 'prepare'));

DROP POLICY strategic_values_update ON strategic_values;
CREATE POLICY strategic_values_update ON strategic_values FOR UPDATE TO authenticated
  USING (check_vpra_global('strategicPlanning', 'prepare'))
  WITH CHECK (check_vpra_global('strategicPlanning', 'prepare'));

COMMIT;
