-- ============================================================================
-- Resolves the `score` range/meaning gap flagged since migration
-- 20260718000006 (evaluation_scores creation): "at least three plausible
-- readings exist (1-4 matching competency behavioral levels, 1-5 Likert,
-- 0-100 percentage) with no document to disambiguate."
--
-- Business decision confirmed explicitly with the project owner (same
-- pattern as eval_type in 20260718000012 — asked directly since this is a
-- business-rule call, not a technical implementation detail):
-- `score` is a 0-100 PERCENTAGE, uniform across both competency scores and
-- goal scores (evaluation_scores has no column distinguishing the two
-- cases' scales — the same `score` column and range applies whichever of
-- `competency_id`/`goal_id` is set).
--
-- [استنتاج] Bounds are inclusive (0 and 100 are both valid) — the natural
-- reading of "percentage," not separately confirmed.
-- ============================================================================

BEGIN;

-- Table confirmed empty in production before applying (SELECT count(*)
-- FROM evaluation_scores; -> 0), so a plain CHECK add is safe with no
-- backfill/validation-against-existing-rows concern.
ALTER TABLE evaluation_scores
  ADD CONSTRAINT evaluation_scores_score_range CHECK (score IS NULL OR (score >= 0 AND score <= 100));

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: rejected (check_violation) for 101 and -1; accepted for 0, 100, 85.5, and NULL.
