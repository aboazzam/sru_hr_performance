-- ============================================================================
-- Fix: org_structure_assignments_select was narrowed to `staffing` alone in
-- 20260725000002, but the org CHART (gated on `orgStructure>=view`, not
-- `staffing`) reads this same table to show who's actually staffed on each
-- position -- that's the whole point of an org chart. A caller with only
-- `orgStructure=view` (and no `staffing` grant at all) was seeing every
-- position as "شاغر" (vacant) even when real assignments existed, confirmed
-- live during verification of the 2026-07-25 process-area split.
--
-- Fix: SELECT accepts EITHER `orgStructure>=view` (viewing the chart) OR
-- `staffing>=view` (viewing/managing the staffing table itself) OR the
-- existing self-row bypass. INSERT/UPDATE (the actual staffing actions)
-- stay `staffing`-only, untouched by this migration -- only the read path
-- needed widening.
-- ============================================================================

BEGIN;

DROP POLICY org_structure_assignments_select ON org_structure_assignments;
CREATE POLICY org_structure_assignments_select ON org_structure_assignments FOR SELECT TO authenticated
  USING (
    check_vpra_global('orgStructure', 'view')
    OR check_vpra_global('staffing', 'view')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = employee_id AND p.auth_user_id = auth.uid())
  );

COMMIT;

-- ============================================================================
-- Verification — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: a role with orgStructure=view and no staffing grant can now SELECT
-- real assignment rows (the org chart shows actual staffing, not "vacant").
