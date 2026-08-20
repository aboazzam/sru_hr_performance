-- Initiative progress (2026-08-20)
--
-- The initiatives tab now shows a progress ring on every card. Nothing in the
-- schema could answer "how far along is this initiative": `status_code` is a
-- coarse stage (pending / in_progress / delayed / done) and the dates only say
-- how much TIME has passed, which is not the same thing as work done.
--
-- So the owner records it explicitly. NULLABLE on purpose: an initiative that
-- has not been assessed yet must not claim 0% — the ring falls back to elapsed
-- time (real data, labelled as such) and says plainly which one it is showing.
--
-- The CHECK mirrors the 0-100 percentage convention already used by
-- evaluation_scores.score and calibration_results (20260719000001).
ALTER TABLE strategic_initiatives
  ADD COLUMN progress_percent NUMERIC(5,2);

ALTER TABLE strategic_initiatives
  ADD CONSTRAINT strategic_initiatives_progress_range
  CHECK (progress_percent IS NULL OR (progress_percent >= 0 AND progress_percent <= 100));

COMMENT ON COLUMN strategic_initiatives.progress_percent IS
  'Reported completion 0-100. NULL = not assessed yet; the UI then shows elapsed time instead, labelled as such.';
