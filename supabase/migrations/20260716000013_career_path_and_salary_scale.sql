-- ============================================================================
-- career_path + salary_scale (SRU_System_Design.md §B "Org & Career")
--
-- [بلا بيانات بذر — نفس سبب migration 12] لا ملف مصدر حقيقي لأي منهما في
-- هذا المستودع (Career_path.xlsx/SalaryScale.xlsx الأصليان حُذفا قبل هذه
-- الجلسة). بنية فقط (schema)، صفر صف مزروع.
--
-- Source: SRU_System_Design.md §B:
--   career_path(id, from_job_title_id -> job_titles.id, to_job_title_id ->
--     job_titles.id, requirements_ar, requirements_en)
--   salary_scale(id, job_title_id -> job_titles.id, step_a..step_g NUMERIC,
--     annual_increase_cap, effective_date)
-- Also §B's **[معتمد]** decision: salary_scale is Steps A-G ONLY — no
-- allowances (transport/housing/secondment) in MVP or the current Phase 2,
-- confirmed by the project owner 2026-07-13. Not re-litigated here.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- career_path
-- ----------------------------------------------------------------------------

CREATE TABLE career_path (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_job_title_id UUID NOT NULL REFERENCES job_titles (id) ON DELETE RESTRICT,
  to_job_title_id UUID NOT NULL REFERENCES job_titles (id) ON DELETE RESTRICT,
  requirements_ar TEXT,
  requirements_en TEXT,
  deleted_at TIMESTAMPTZ,
  CHECK (from_job_title_id <> to_job_title_id),
  UNIQUE (from_job_title_id, to_job_title_id)
);

COMMENT ON TABLE career_path IS 'SRU_System_Design.md §B. Schema only -- zero seeded rows, no source file exists (see header note). deleted_at added per CLAUDE.md §5-A rule 7 (not in the original §B sketch, but this is referenceable career-ladder data worth soft-deleting like job_titles/competencies).';
COMMENT ON CONSTRAINT career_path_from_job_title_id_fkey ON career_path IS 'RESTRICT: a job title still referenced by a career path must not be deletable out from under it.';

-- ----------------------------------------------------------------------------
-- salary_scale — Steps A-G only, per §B's [معتمد] decision (see header).
-- UNIQUE(job_title_id, effective_date): multiple historical scale versions
-- per job title are expected over time (a new effective_date row), but two
-- rows for the same job title effective on the same date would be
-- ambiguous about which is authoritative.
-- ----------------------------------------------------------------------------

CREATE TABLE salary_scale (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_title_id UUID NOT NULL REFERENCES job_titles (id) ON DELETE RESTRICT,
  step_a NUMERIC NOT NULL,
  step_b NUMERIC NOT NULL,
  step_c NUMERIC NOT NULL,
  step_d NUMERIC NOT NULL, -- mid-point
  step_e NUMERIC NOT NULL,
  step_f NUMERIC NOT NULL,
  step_g NUMERIC NOT NULL,
  annual_increase_cap NUMERIC,
  effective_date DATE NOT NULL,
  deleted_at TIMESTAMPTZ,
  UNIQUE (job_title_id, effective_date),
  CONSTRAINT salary_scale_steps_ascending CHECK (
    step_a <= step_b AND step_b <= step_c AND step_c <= step_d
    AND step_d <= step_e AND step_e <= step_f AND step_f <= step_g
  )
);

COMMENT ON TABLE salary_scale IS 'SRU_System_Design.md §B. Steps A-G only -- no allowances, per the [معتمد] 2026-07-13 decision documented there. Schema only -- zero seeded rows, no source file exists (see header note). deleted_at added per CLAUDE.md §5-A rule 7, same reasoning as career_path.';
COMMENT ON CONSTRAINT salary_scale_steps_ascending ON salary_scale IS '[استنتاج] Monotonically increasing steps is not stated explicitly in SRU_System_Design.md §B but is the only sensible reading of a salary "scale" -- flagged as an inferred constraint, not a transcribed one.';

-- ----------------------------------------------------------------------------
-- RLS — real policies from creation (same as migration 12, not the earlier
-- zero-policy-then-backfill pattern).
--
-- career_path: process_area = 'careerPath', same clean documented fit as
-- job_families/job_titles (migration 12).
--
-- salary_scale: SRU_System_Design.md §A's own route table states
-- "/[locale]/salary-scale -- VPRA: employeeData/careerPath فقط" -- i.e.
-- either grant is accepted for reading, a documented fact, not an
-- [استنتاج]. SELECT below ORs both. Writes are gated on `careerPath` alone
-- -- **[استنتاج]**: the design doc only specifies the read-side dual-area
-- rule; which single area should gate mutating salary figures was not
-- stated, and `careerPath` (compensation tied to the job-title/grade
-- ladder) was chosen as the more specific, more sensitive-data-appropriate
-- owner rather than the broader `employeeData`. Confirm with the project
-- owner before relying on this for a real payroll workflow.
--
-- Neither table gets a DELETE policy (both have deleted_at -- soft-delete
-- via UPDATE only, same rule as migration 6).
-- ----------------------------------------------------------------------------

ALTER TABLE career_path ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_scale ENABLE ROW LEVEL SECURITY;

CREATE POLICY career_path_select ON career_path FOR SELECT TO authenticated
  USING (check_vpra('careerPath', 'view'));
CREATE POLICY career_path_insert ON career_path FOR INSERT TO authenticated
  WITH CHECK (check_vpra('careerPath', 'prepare'));
CREATE POLICY career_path_update ON career_path FOR UPDATE TO authenticated
  USING (check_vpra('careerPath', 'prepare'))
  WITH CHECK (check_vpra('careerPath', 'prepare'));

CREATE POLICY salary_scale_select ON salary_scale FOR SELECT TO authenticated
  USING (check_vpra('careerPath', 'view') OR check_vpra('employeeData', 'view'));
CREATE POLICY salary_scale_insert ON salary_scale FOR INSERT TO authenticated
  WITH CHECK (check_vpra('careerPath', 'prepare'));
CREATE POLICY salary_scale_update ON salary_scale FOR UPDATE TO authenticated
  USING (check_vpra('careerPath', 'prepare'))
  WITH CHECK (check_vpra('careerPath', 'prepare'));

COMMIT;

-- ============================================================================
-- Verification — run AFTER and BEFORE trusting, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 2 rows, rowsecurity = true for both.
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('career_path','salary_scale');

-- Expect: 6 rows total (3 + 3), none with qual/with_check = 'true'.
-- SELECT tablename, count(*), bool_or(qual = 'true') AS any_using_true,
--        bool_or(with_check = 'true') AS any_with_check_true
--   FROM pg_policies WHERE tablename IN ('career_path','salary_scale') GROUP BY tablename;

-- Expect: both 0 (schema-only, no seed data).
-- SELECT (SELECT count(*) FROM career_path) AS career_path_count,
--        (SELECT count(*) FROM salary_scale) AS salary_scale_count;
