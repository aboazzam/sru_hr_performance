-- "نتائج التقييم" (Evaluation Results) module — a new dashboard/table
-- aggregating the weighted evaluation score already computed per-evaluation
-- on /evaluations/[id] (src/lib/evaluationCycle.ts::weightedCycleScore),
-- across every employee/cycle instead of just one. Requested directly:
-- a dashboard tab first, then an employee-results table, alongside the
-- existing "التوصيات" tab in the evaluationResults nav group.
--
-- Adds ONE new process_area value, `evaluationResultsReports`, sibling to
-- performanceReports/competencyReports/bauTasksReports under the same
-- "التقارير" processAreaSections section (20260727000006/20260728000003's
-- own precedent) -- a tab-level gate only. It does NOT by itself widen row
-- visibility on evaluations/evaluation_scores/evaluation_cycles/
-- org_unit_evaluation_weights/three_sixty_* -- those keep their own existing
-- RLS (check_vpra('evaluation', ...) / is_my_direct_report() /
-- check_vpra_global('threeSixty','approve')) untouched. A holder of only
-- this area therefore sees a narrow result set (their own row, or their
-- direct reports') unless they separately also hold `evaluation` (and, for
-- the 360 column, `threeSixty`) at the desired scope -- the exact same
-- accepted shape performanceReports/competencyReports/bauTasksReports
-- already have on /reports, documented there.
--
-- The module's "my team's results" section for a manager with direct
-- reports but no report-level grant does not depend on this process area at
-- all -- authorized purely by the already-existing `is_my_direct_report()`
-- branch on evaluations_select, same "the relationship itself is the
-- authorization fact" trust model as threeSixty's self-service tabs.
--
-- `ALTER TYPE ... ADD VALUE` is deliberately alone in this file: Postgres
-- forbids USING a value added by ALTER TYPE inside the same transaction
-- that added it -- the same two-step pattern every prior process_area
-- addition in this project used (threeSixty, evaluationWeights, etc.).
--
-- No role_permissions rows seeded -- CLAUDE.md §4-B ("new roles inherit
-- none on all Process Areas by default"), same precedent as every other
-- *Reports area: access is granted through the already-built /admin role
-- editor, not assumed here.

ALTER TYPE process_area ADD VALUE 'evaluationResultsReports';

-- ============================================================================
-- Verification -- run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect the new value present in the enum's labels.
-- SELECT enumlabel FROM pg_enum
--   WHERE enumtypid = 'process_area'::regtype AND enumlabel = 'evaluationResultsReports';

-- Expect zero role_permissions rows for it -- deliberately unseeded.
-- SELECT count(*) FROM role_permissions WHERE process_area = 'evaluationResultsReports';
