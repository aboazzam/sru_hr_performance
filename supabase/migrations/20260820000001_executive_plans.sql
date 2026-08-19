-- ============================================================================
-- الخطة التنفيذية (executive plans)
--
-- Requested 2026-08-19/20: a module of its own, whose first tab mirrors the
-- strategic-plans list ("اول تاب شبيه بقائمة الخطط الاستراتيجية وانشاء الخطة
-- شبيه بانشاء خطة استاتيجية"), and whose targets and initiatives are drawn
-- from the strategic plan, filtered to the executive plan's own period.
--
-- PERIOD — answered directly 2026-08-20: "دع المستخدم يختار النطاق والأغلب
-- سنة واحدة مربوطة بدورة تقييم". So the period is USER-CHOSEN, with the
-- one-year-tied-to-a-cycle case as the common default rather than the only
-- shape:
--   * cycle_id — optional link to an evaluation_cycles row (the usual case)
--   * start_date / end_date — always present, and the single source of truth
--     for "is this initiative inside my plan's window", so the filter works
--     identically whether or not a cycle was chosen.
--
-- cycle_id is NULLABLE deliberately, and this is load-bearing rather than
-- defensive: production currently has ZERO evaluation_cycles (verified
-- directly), so a NOT NULL cycle would have shipped a module nobody could
-- use — the same trap already avoided for initiative targets in
-- 20260819000001.
--
-- process_area: reuses `strategicPlanning`, no new area. The executive plan
-- is the operational face of the same plan, and inventing a second
-- permission axis before the assignment slice (which is where departments
-- actually act) would be guessing at a boundary nobody has described.
-- Flagged so the next slice can revisit it deliberately.
-- ============================================================================

CREATE TABLE executive_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The strategic plan this operational plan executes. RESTRICT, matching
  -- how strategic_goals holds its own plan.
  strategic_plan_id UUID NOT NULL REFERENCES strategic_plans(id) ON DELETE RESTRICT,
  cycle_id UUID REFERENCES evaluation_cycles(id) ON DELETE RESTRICT,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT executive_plans_dates_valid CHECK (end_date >= start_date)
);

COMMENT ON TABLE executive_plans IS 'الخطة التنفيذية: نافذة زمنية يختارها المستخدم (غالبًا سنة مرتبطة بدورة تقييم) تنفّذ خطة استراتيجية.';
COMMENT ON COLUMN executive_plans.cycle_id IS 'دورة التقييم المرتبطة إن وُجدت. اختياري: الفترة الفعلية تُقرأ دائمًا من start_date/end_date، ولا توجد دورات في قاعدة الإنتاج بعد.';

CREATE INDEX executive_plans_strategic_plan_idx ON executive_plans (strategic_plan_id) WHERE deleted_at IS NULL;

-- One executive plan per (strategic plan, cycle) when a cycle IS chosen —
-- partial, so several cycle-less plans can coexist and a soft-deleted row
-- never blocks a replacement.
CREATE UNIQUE INDEX executive_plans_cycle_uidx
  ON executive_plans (strategic_plan_id, cycle_id)
  WHERE cycle_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE executive_plans ENABLE ROW LEVEL SECURITY;

-- Mirrors strategic_plans exactly (20260801000001): browsing which plans
-- exist is open to every authenticated user — the name and window are
-- administrative metadata, and the sensitive content (goals, targets,
-- assignments) keeps its own much narrower RLS. Creating/editing stays
-- strategy-admin level.
CREATE POLICY executive_plans_select ON executive_plans FOR SELECT TO authenticated
  USING (true);

CREATE POLICY executive_plans_insert ON executive_plans FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

CREATE POLICY executive_plans_update ON executive_plans FOR UPDATE TO authenticated
  USING (check_vpra_global('strategicPlanning', 'approve'))
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

-- No DELETE policy: soft-delete only (CLAUDE.md §5-A rule 7).
