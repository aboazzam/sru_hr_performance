-- ============================================================================
-- evaluation_scores — individual competency/goal scores within an
-- evaluation (CLAUDE.md §6 "evaluation_scores"). Last table of the
-- evaluations module's documented ERD (SRU_System_Design.md line 187).
--
-- Design notes:
--
-- 1. Column set transcribed from SRU_System_Design.md's own ERD sketch:
--    `evaluation_scores(id, evaluation_id, competency_id NULLABLE, goal_id
--    NULLABLE, score, comment)`. `comment` stays a single free-text column
--    (not `_ar`/`_en`), same reasoning as `feedback_360.comments`: one real
--    person's prose typed once, not curated bilingual reference content.
--
-- 2. `score` is a bare nullable NUMERIC with NO range CHECK -- deliberately,
--    unlike every `weight` column elsewhere in this schema. "Weight"
--    unambiguously means a 0-100% contribution everywhere it appears, but
--    "score" here has at least three plausible, mutually exclusive
--    readings with no document to disambiguate them: a 1-4 rating matching
--    the four competency behavioral levels (basic/practitioner/advanced/
--    professional), a 1-5 Likert scale, or a 0-100 percentage of goal-
--    target achievement. Inventing a range now would be a guess with real
--    consequences once real scoring UI is built -- flagged here as an
--    open point for the project owner, not silently decided.
--
-- 3. 🔴 UNRESOLVED STRUCTURAL GAP, surfaced here rather than silently
--    worked around: SRU_System_Design.md's own model has `evaluations`
--    carrying an `eval_type ENUM('self','supervisor','peer','customer')`
--    column (line 182) that distinguishes WHOSE assessment a given
--    evaluation row represents -- e.g. an employee's own self-assessment
--    scores vs. their supervisor's. The already-merged `evaluations` table
--    (20260718000001) does NOT have this column (a documented gap already
--    flagged in 20260718000002's header, not fixed retroactively there
--    either). Without it, there is no way for THIS table to tell whether a
--    given `evaluation_scores` row was meant to be authored by the
--    employee themselves or by their supervisor/committee -- the doc's own
--    "self" eval_type is exactly the case that would need it. Rather than
--    guess, this migration takes the conservative reading: SELECT allows
--    the employee to read their own evaluation's scores (a reasonable
--    minimum, matching `evaluations`/`goals`/`bau_tasks`'s self-row
--    precedent), but INSERT/UPDATE do NOT get a self-row bypass at all --
--    only `check_vpra('evaluation','approve',...)` (hr_admin-only today)
--    can write, until `eval_type`/a real authorship column resolves who is
--    actually allowed to score what. This under-grants supervisor/
--    committee/self-scoring write access for now -- a deliberate,
--    documented placeholder, not an oversight, and needs revisiting
--    together with the `eval_type` gap before any real scoring UI ships.
--
-- 4. process_area = 'evaluation' -- same [استنتاج] reasoning as
--    `feedback_360` (20260718000005): no dedicated process area exists,
--    but SRU_System_Design.md's own module list groups this squarely under
--    "Evaluation". Since `employee`/`supervisor` share the identical flat
--    `'prepare'` level there (the same ambiguity fixed in `evaluations` and
--    `feedback_360`), any non-self branch must gate at `'approve'` to stay
--    unambiguous -- reused directly, not re-derived.
--
-- 5. Exactly one of `competency_id`/`goal_id` must be set -- same XOR
--    pattern as `goals.goal_library_id`/`custom_title_ar` (20260718000003),
--    the only reading that avoids a subject-less or doubly-scored row.
--
-- 6. Partial unique indexes (NOT a single multi-column UNIQUE) enforce "at
--    most one score row per competency per evaluation" and "at most one
--    per goal per evaluation" -- a plain `UNIQUE(evaluation_id,
--    competency_id, goal_id)` would silently fail to catch duplicates
--    whenever one of the two nullable columns is NULL, because Postgres
--    never treats two NULLs as equal for uniqueness. This exact NULL
--    gotcha already bit this project twice before (`org_units`' single-root
--    constraint and `user_roles`' scope-type uniqueness, both documented in
--    HANDOVER.md) -- applying the lesson proactively here instead of
--    repeating it a third time.
--
-- 7. `evaluation_id` uses ON DELETE CASCADE (unlike `employee_id`'s CASCADE
--    elsewhere, which is a "profile hard-deleted" edge case) -- scores are
--    genuine child records of one specific evaluation; deleting the
--    evaluation should take its scores with it. `competency_id`/`goal_id`
--    use ON DELETE RESTRICT, protecting reference/historical data from
--    disappearing out from under a real score, matching this project's
--    convention for reference-table FKs.
-- ============================================================================

BEGIN;

CREATE TABLE evaluation_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  competency_id UUID REFERENCES competencies(id) ON DELETE RESTRICT,
  goal_id UUID REFERENCES goals(id) ON DELETE RESTRICT,
  score NUMERIC,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT evaluation_scores_subject_source
    CHECK (
      (competency_id IS NOT NULL AND goal_id IS NULL)
      OR (competency_id IS NULL AND goal_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX evaluation_scores_competency_unique
  ON evaluation_scores (evaluation_id, competency_id) WHERE competency_id IS NOT NULL;

CREATE UNIQUE INDEX evaluation_scores_goal_unique
  ON evaluation_scores (evaluation_id, goal_id) WHERE goal_id IS NOT NULL;

ALTER TABLE evaluation_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY evaluation_scores_select ON evaluation_scores FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM evaluations e
      JOIN profiles p ON p.id = e.employee_id
      WHERE e.id = evaluation_scores.evaluation_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('evaluation', 'approve', (
      SELECT p.org_unit_id FROM evaluations e
      JOIN profiles p ON p.id = e.employee_id
      WHERE e.id = evaluation_scores.evaluation_id
    ))
  );

CREATE POLICY evaluation_scores_insert ON evaluation_scores FOR INSERT TO authenticated
  WITH CHECK (
    check_vpra('evaluation', 'approve', (
      SELECT p.org_unit_id FROM evaluations e
      JOIN profiles p ON p.id = e.employee_id
      WHERE e.id = evaluation_scores.evaluation_id
    ))
  );

CREATE POLICY evaluation_scores_update ON evaluation_scores FOR UPDATE TO authenticated
  USING (
    check_vpra('evaluation', 'approve', (
      SELECT p.org_unit_id FROM evaluations e
      JOIN profiles p ON p.id = e.employee_id
      WHERE e.id = evaluation_scores.evaluation_id
    ))
  )
  WITH CHECK (
    check_vpra('evaluation', 'approve', (
      SELECT p.org_unit_id FROM evaluations e
      JOIN profiles p ON p.id = e.employee_id
      WHERE e.id = evaluation_scores.evaluation_id
    ))
  );

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 1 row, rowsecurity = true.
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'evaluation_scores';

-- Expect: CHECK rejects both competency_id and goal_id set together, and
-- rejects neither being set.

-- Expect: the partial unique indexes reject a second score for the same
-- (evaluation_id, competency_id) pair and separately for the same
-- (evaluation_id, goal_id) pair, while allowing distinct subjects.

-- Expect (SET ROLE authenticated + simulated JWT): the employee whose
-- evaluation it is can SELECT their own scores but cannot INSERT/UPDATE
-- them (no self-row write bypass, per design note 3); an `hr_admin`
-- (approve) test user can read and write; a `committee`-role user (no
-- approve) sees zero rows.
