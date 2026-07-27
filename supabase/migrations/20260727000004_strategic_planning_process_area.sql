-- ============================================================================
-- Add `strategicPlanning` as a new process_area value.
--
-- Redesign of the KPI module (2026-07-27, same-day follow-up to
-- 20260727000001/000002): the project owner reviewed the shipped
-- kpiLibrary/kpiAssignment model and asked for a real strategic cascade
-- instead of a flat department-distributed catalog + ad hoc supervisor
-- assignment. Confirmed directly:
--
--   - "نريد أن تبدأ الدائرة من مدير الاستراتيجية بحيث يكون هو الأدمن لهذا
--     الموديول" -> strategy_admin is the sole admin of the whole module.
--   - "كل هدف استراتيجي له مؤشر أداء وله عدة أهداف فرعية والتي بالتالي لها
--     مؤشرات أداء خاصة بها ولها عدة مستهدفات" -> a real 3-tier hierarchy:
--     strategic goal (own KPI) -> sub-goals (own KPI each) -> targets
--     (the actual distributed/assigned instances).
--   - "وكل هدف فرعي له من يملكه ويوزعه" -> each sub-goal/target has a
--     current OWNER who is responsible for further distributing it.
--   - "الشجرة المفروض تكون شجرة واحدة وهي الهيكل التنظيمي" -> cascade
--     ownership is expressed through `org_structure_positions` (the C1-C4
--     org chart tree), not `org_units` — "بامكانك الغاء الربط والدمج بين
--     الهيكل التنظيمي والوحدات التنظيمية" explicitly waived any need to
--     unify/link the two trees for this feature.
--   - "مدير الاستارتيجية يسقط للمدراء وهم من يسقطونها لمن دونهم سواء
--     ادارات او اقسام او موظفين" -> multi-level delegated cascade: whoever
--     currently owns a node can push it further down themselves (not just
--     strategy_admin), terminating at either another position or a
--     specific employee.
--   - "الرئيس التنفيذي يكون له صلاحية الاطلاع والمتابعة من خلال داشبورد
--     متابعة" -> `ceo` gets broad read-only oversight, surfaced as a tab
--     inside the existing `/reports` page.
--
-- This SUPERSEDES kpiLibrary/kpiAssignment (added the same day, migration
-- 20260727000001) -- the follow-up migration drops `kpi_library`/`kpis`
-- outright (zero production rows, confirmed empty, safe) rather than
-- maintaining two parallel, confusingly-overlapping KPI systems. The two
-- now-unused enum values are left in place, harmless -- Postgres has no
-- `DROP VALUE` for enums, same precedent already established for the
-- abandoned `reports` process area (20260725000006, superseded the same
-- day it was added).
--
-- Split into its own migration/transaction, same established precedent as
-- every prior process-area addition: Postgres forbids using a value added
-- via `ALTER TYPE ... ADD VALUE` in the same transaction that added it.
-- ============================================================================

BEGIN;

ALTER TYPE process_area ADD VALUE 'strategicPlanning';

COMMIT;

-- ============================================================================
-- Verification — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 21 values, including 'strategicPlanning'.
-- SELECT enumlabel FROM pg_enum WHERE enumtypid = 'process_area'::regtype ORDER BY enumsortorder;
