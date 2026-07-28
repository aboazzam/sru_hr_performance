-- Adds a period-type classification to evaluation_cycles, requested directly:
-- the create-cycle form should offer "academic year / calendar year / specific
-- fiscal year" as an explicit first choice, then reveal start/end date fields.
-- NOT NULL, no default -- every future insert must specify it explicitly,
-- same convention as evaluations.eval_type (20260718000012).
--
-- Table confirmed empty (0 rows) before this migration -- a plain ADD COLUMN
-- NOT NULL needs no backfill/default here.
BEGIN;

CREATE TYPE evaluation_cycle_type AS ENUM ('academic', 'calendar', 'fiscal');

ALTER TABLE evaluation_cycles
  ADD COLUMN cycle_type evaluation_cycle_type NOT NULL;

COMMIT;
