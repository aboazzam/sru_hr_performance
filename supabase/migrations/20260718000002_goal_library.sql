-- ============================================================================
-- goal_library — CLAUDE.md §6 "goal_library -- Goals bank management".
-- Schema only, zero seeded rows -- same reasoning as job_titles/career_path/
-- salary_scale (migrations 12-13): no source file with real goal templates
-- exists in this repo, so no placeholder data is fabricated.
--
-- `goals` (per-employee assigned goals, CLAUDE.md §6) and `bau_tasks` are
-- explicit follow-ups, NOT part of this migration -- this is the reusable
-- template bank only, not assignment.
--
-- Design notes:
--
-- 1. Column set is TRANSCRIBED, not invented: SRU_System_Design.md's "Goals /
--    BAU" section (line 169) documents
--    `goal_library(id, title_ar, title_en, description, default_weight,
--    job_family_id)` verbatim. Two adjustments from that literal line, both
--    [استنتاج] but consistent with every other table in this project:
--      - `description` -> `description_ar`/`description_en` (the doc's own
--        adjacent `title_ar`/`title_en` pair already establishes the ar/en
--        split convention; every other bilingual text column in this schema
--        -- name_ar/name_en, requirements_ar/requirements_en,
--        definition_ar -- follows it, so a single unsuffixed `description`
--        would be the one inconsistent column in the whole project).
--      - `default_weight` is nullable NUMERIC(5,2) with a
--        CHECK (0, 100] range -- "weight" strongly implies a percentage
--        contribution toward a 100%-total evaluation score, but no document
--        states the bound explicitly; flagged here rather than silently
--        assumed. Nullable because not every library entry necessarily
--        ships a suggested default -- the actual weight is decided at
--        assignment time in the future `goals` table regardless.
--
-- 2. process_area = 'goalsLibrary' is a direct CLAUDE.md §4 fact ("Goals
--    bank management"), not inferred. Per the seeded matrix (migration 7),
--    `strategy_admin` is the only role holding 'approve' (owner); every
--    other role that has any grant at all on `goalsLibrary` is capped at
--    'view'. Unlike `evaluations`, this is shared reference data with no
--    employee_id/row-ownership column, so there is no risk of the
--    `check_vpra()`-can't-distinguish-which-role problem flagged for
--    `evaluations` (20260718000001) -- a flat process_area check is safe
--    here, matching competencies/job_titles/career_path/salary_scale.
--
-- 3. RLS mirrors job_titles/competencies exactly: SELECT at 'view', INSERT/
--    UPDATE at 'prepare' (today only `strategy_admin`'s 'approve' clears
--    that bar, but 'prepare' leaves room for a future lower-tier editor
--    role without a new migration), no DELETE policy (soft-delete via
--    `deleted_at` through UPDATE only, matching every other reference table
--    in this project).
--
-- 4. UNIQUE (job_family_id, title_ar) mirrors job_titles' own
--    UNIQUE(job_family_id, name_ar) -- guards against an obvious duplicate
--    within the same family scope. `job_family_id` is nullable (a goal can
--    be family-scoped or apply generally), so this doesn't catch a
--    duplicate global (NULL-family) title -- an acceptable, documented gap
--    matching this project's existing tolerance for NULL-weakened
--    uniqueness elsewhere, not worth a partial-index workaround for a
--    library table with no seeded data yet.
--
-- No `created_at` column -- matching competencies/job_titles/career_path/
-- salary_scale (the pure-reference-table tier), which don't have one either
-- (only per-employee/transactional tables like evaluation_cycles/
-- evaluations/profiles/audit_log do).
-- ============================================================================

BEGIN;

CREATE TABLE goal_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_ar TEXT NOT NULL,
  title_en TEXT,
  description_ar TEXT,
  description_en TEXT,
  default_weight NUMERIC(5,2),
  job_family_id UUID REFERENCES job_families(id) ON DELETE RESTRICT,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT goal_library_default_weight_range
    CHECK (default_weight IS NULL OR (default_weight > 0 AND default_weight <= 100)),
  CONSTRAINT goal_library_job_family_title_unique UNIQUE (job_family_id, title_ar)
);

ALTER TABLE goal_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY goal_library_select ON goal_library FOR SELECT TO authenticated
  USING (check_vpra('goalsLibrary', 'view'));

CREATE POLICY goal_library_insert ON goal_library FOR INSERT TO authenticated
  WITH CHECK (check_vpra('goalsLibrary', 'prepare'));

CREATE POLICY goal_library_update ON goal_library FOR UPDATE TO authenticated
  USING (check_vpra('goalsLibrary', 'prepare'))
  WITH CHECK (check_vpra('goalsLibrary', 'prepare'));

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 1 row, rowsecurity = true.
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'goal_library';

-- Expect: the CHECK constraint rejects an out-of-range weight (0 and > 100
-- both fail; NULL succeeds).
-- INSERT INTO goal_library (title_ar, default_weight) VALUES ('اختبار', 150);

-- Expect (SET ROLE authenticated + simulated JWT): a `strategy_admin`
-- (goalsLibrary=approve) test user can insert/see rows; a `committee`
-- (no goalsLibrary grant) test user sees zero rows.
