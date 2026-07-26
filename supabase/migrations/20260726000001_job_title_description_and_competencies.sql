-- ============================================================================
-- Career Path module, part 1: job_titles.description_ar/description_en +
-- job_title_competencies (schema only, this file -- data follows in
-- 20260726000002_job_title_description_and_competencies_data.sql).
--
-- Closes two gaps flagged repeatedly throughout this project's history:
-- job_titles has never had a job-description column at all, and no table
-- has ever linked a specific competency requirement to a specific job
-- title (only competencies.job_family_id exists, unpopulated on every row).
-- Neither piece of content exists in any source file (confirmed directly
-- against the real "Career path.xlsx" the project owner attached this
-- session -- its "Career Path"/"Admin Salary Structure" sheets carry only
-- job names, grades, and qualification text, nothing resembling a job
-- description or a competency list). Per the project owner's explicit
-- instruction this session, the content itself will be authored by Claude
-- (data migration 20260726000002) rather than left for manual HR entry --
-- flagged there as [استنتاج]/AI-authored, not transcribed from an official
-- document, and fully editable afterward via the new
-- /career-path/job-titles management screens (same migration's sibling
-- app-code PR).
--
-- required_level reuses the existing `behavioral_level` enum
-- (basic/practitioner/advanced/professional) from
-- 20260716000002_competency_framework.sql -- per the project owner's
-- explicit confirmation this session that each required competency should
-- specify which of the framework's 4 levels applies, not just a flat
-- "required" flag.
-- ============================================================================

BEGIN;

ALTER TABLE job_titles
  ADD COLUMN description_ar TEXT,
  ADD COLUMN description_en TEXT;

COMMENT ON COLUMN job_titles.description_ar IS 'Job description (Arabic). Added 2026-07-26 for the Career Path module -- no source file has ever contained this content (see migration header); authored content, editable via /career-path/job-titles/[id].';
COMMENT ON COLUMN job_titles.description_en IS 'Job description (English), optional -- same provenance as description_ar.';

-- ----------------------------------------------------------------------------
-- job_title_competencies -- which competencies (and at what behavioral
-- level) are required for a given job title. Distinct from
-- competencies.job_family_id (a broad, currently-unused "applies to this
-- whole family" concept) -- this is an explicit, per-job-title, per-level
-- assignment, matching the project owner's request to scope competency
-- requirements to individual jobs, not whole families.
--
-- FKs use RESTRICT on both sides, matching this schema's established
-- convention for career_path's own two job_titles FKs (a referenced job
-- title or competency must not be hard-deletable out from under a real
-- requirement row) -- moot in practice since both this app and this
-- project's own discipline only ever soft-delete, but kept consistent with
-- house style rather than introducing a new CASCADE precedent here.
--
-- UNIQUE(job_title_id, competency_id) WHERE deleted_at IS NULL: a partial
-- index, not a plain UNIQUE -- the same NULL-safety pattern already used
-- repeatedly in this schema (evaluations, goals, calibration_results, ...)
-- so a soft-deleted requirement doesn't block re-adding the same
-- competency later.
-- ----------------------------------------------------------------------------

CREATE TABLE job_title_competencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_title_id UUID NOT NULL REFERENCES job_titles (id) ON DELETE RESTRICT,
  competency_id UUID NOT NULL REFERENCES competencies (id) ON DELETE RESTRICT,
  required_level behavioral_level NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX job_title_competencies_job_title_competency_uidx
  ON job_title_competencies (job_title_id, competency_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE job_title_competencies IS 'Career Path module (2026-07-26): required competencies per job title, each at one of the 4 behavioral levels. Populated by Claude-authored content (20260726000002), not transcribed from a source document -- see job_titles.description_ar''s comment for the same provenance note.';

-- ----------------------------------------------------------------------------
-- RLS -- reuses the `careerPath` process area exactly as job_titles/
-- career_path already do (CLAUDE.md §4: "Career ladder management" is a
-- direct, documented fit), rather than inventing a new process area for
-- what is fundamentally an attribute of a job title's own career-ladder
-- definition. check_vpra_global (not check_vpra) since this is
-- org-unit-less catalog data, same reasoning as job_titles/career_path
-- themselves post-20260719000011.
--
-- No DELETE policy -- soft-delete only, same rule as every other table in
-- this schema (CLAUDE.md §5-A rule 7).
-- ----------------------------------------------------------------------------

ALTER TABLE job_title_competencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_title_competencies_select ON job_title_competencies
  FOR SELECT TO authenticated
  USING (check_vpra_global('careerPath'::process_area, 'view'::vpra_level));

CREATE POLICY job_title_competencies_insert ON job_title_competencies
  FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('careerPath'::process_area, 'prepare'::vpra_level));

CREATE POLICY job_title_competencies_update ON job_title_competencies
  FOR UPDATE TO authenticated
  USING (check_vpra_global('careerPath'::process_area, 'prepare'::vpra_level))
  WITH CHECK (check_vpra_global('careerPath'::process_area, 'prepare'::vpra_level));

COMMIT;

-- ============================================================================
-- Verification — run AFTER and BEFORE trusting, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 2 rows for job_titles.description_ar/description_en.
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'job_titles' AND column_name IN ('description_ar','description_en');

-- Expect: 1 row, rowsecurity = true.
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'job_title_competencies';

-- Expect: 3 rows, none with qual/with_check = 'true'.
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'job_title_competencies';

-- Expect: 0 (schema-only in this file; data follows in the next migration).
-- SELECT count(*) FROM job_title_competencies;
