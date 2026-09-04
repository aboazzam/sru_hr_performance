-- ============================================================================
-- Adds `months_worked_together` to `three_sixty_nominations` -- the column
-- already existed on `three_sixty_assignments` (in the original given field
-- list) but was never actually captured anywhere in the app: nothing ever
-- wrote it, so the cycle's own `min_months_together` exclusion rule
-- ("يُستبعد آلياً كل تعيين months_worked_together أقل من min_months_together")
-- had no data to act on. The employee doing the nominating is the one who
-- knows how long they've worked with a given peer, so it's captured at
-- NOMINATION time and copied onto the resulting `three_sixty_assignments`
-- row when a supervisor approves the list (application-layer copy, in
-- `createMissingThreeSixtyAssignments` -- no DB trigger needed, this is a
-- plain value carried through one INSERT).
--
-- Nullable, no CHECK: "unknown" is a real, valid state (the exclusion rule
-- only fires on a real value below the threshold, per this session's own
-- documented decision -- see threeSixty.ts's `excludeByTenure`).
-- ============================================================================

BEGIN;

ALTER TABLE three_sixty_nominations ADD COLUMN months_worked_together INTEGER;

COMMENT ON COLUMN three_sixty_nominations.months_worked_together IS 'How many months the nominating employee has worked with this rater -- captured at nomination time, copied onto the resulting three_sixty_assignments row on approval. NULL means unknown, never auto-excluded (only a real value below cycle.min_months_together is).';

COMMIT;
