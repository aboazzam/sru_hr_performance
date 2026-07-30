-- ============================================================================
-- targets.kpi_id / targets.cycle_id become NOT NULL.
--
-- 20260730000001 added both as NULLABLE, and said so explicitly: the cascade
-- UI did not supply them yet, so requiring them in that migration would have
-- broken every cascade insert between the schema change and the UI change.
-- That UI change has now landed -- assignTarget's Zod schema requires both,
-- the assign screen offers a KPI picker (or inherits the parent target's KPI
-- when cascading from another target) and a cycle picker, and refuses to
-- render the form at all when there is no KPI or no cycle to choose. So the
-- deferred constraint can be closed.
--
-- Safe: `targets` was verified EMPTY in the real database immediately before
-- applying this, so there are no pre-existing rows to backfill. Confirmed
-- there is exactly ONE insert path into `targets` in the whole codebase
-- (assignTarget) before tightening, so nothing else can produce a NULL.
--
-- Why this matters rather than being cosmetic: a target that names no KPI
-- cannot be rolled up into its indicator, and one with no cycle cannot be
-- evaluated -- "مستهدف سنوي وعليه يتم التقييم سواء للفرد او الادارة".
-- Leaving them nullable would let a row exist that the whole model has no
-- way to interpret.
-- ============================================================================

BEGIN;

ALTER TABLE targets ALTER COLUMN kpi_id SET NOT NULL;
ALTER TABLE targets ALTER COLUMN cycle_id SET NOT NULL;

COMMIT;
