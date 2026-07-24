-- ============================================================================
-- New `profiles` columns to support importing the project owner's real
-- "Employees Data" sheet (279 rows) — a much richer employee dataset than
-- this schema previously modeled. Plain TEXT for every new descriptive
-- field (no enum), same precedent already used for `goals.status`/
-- `bau_tasks.status`/`promotions.status`: no fully-confirmed fixed
-- vocabulary exists for gender/marital_status/nationality/etc. beyond what
-- happens to appear in one sample file, so a rigid enum would risk
-- rejecting a legitimate future value (e.g. "Widowed" marital status,
-- unseen in this file's 279 rows but a standard real-world option).
--
-- Column source: "Employees Data" sheet, columns Qualification, Education
-- Speciality, DATE OF BIRTH, Mobile, MARITIAL STATUS, GENDER, NATIONALITY,
-- Category, Insurance Category. `qualification` closes a gap the My
-- Profile page (2026-07-22) already flagged as a "coming soon" placeholder
-- with no schema backing.
--
-- Also adds `org_structure_positions.external_code`: the source sheet's
-- own unique "الرمز" column per position, needed to make the Excel import
-- idempotent (re-running an import should UPDATE the same position, not
-- create a duplicate, even after the project owner has renamed it via the
-- UI). Nullable (positions created directly through the UI, not imported,
-- have no external code) but unique when present.
-- ============================================================================

BEGIN;

ALTER TABLE profiles
  ADD COLUMN qualification TEXT,
  ADD COLUMN education_speciality TEXT,
  ADD COLUMN date_of_birth DATE,
  ADD COLUMN mobile TEXT,
  ADD COLUMN marital_status TEXT,
  ADD COLUMN gender TEXT,
  ADD COLUMN nationality TEXT,
  ADD COLUMN employee_category TEXT,
  ADD COLUMN insurance_category TEXT;

COMMENT ON COLUMN profiles.employee_category IS 'Source sheet''s "Category" column (e.g. Academic, Administrative) — a coarse HR classification, distinct from job_titles.category (leadership/academic/admin/technical/labor), not assumed identical to it.';

ALTER TABLE org_structure_positions
  ADD COLUMN external_code TEXT;

CREATE UNIQUE INDEX org_structure_positions_external_code_uidx
  ON org_structure_positions (external_code) WHERE external_code IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN org_structure_positions.external_code IS 'The source spreadsheet''s own position code ("الرمز") — lets a re-imported Excel file match and update the same position instead of duplicating it. NULL for positions created directly through the UI.';

COMMIT;

-- ============================================================================
-- Verification — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 9 new columns on profiles.
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles'
--   AND column_name IN ('qualification','education_speciality','date_of_birth','mobile',
--     'marital_status','gender','nationality','employee_category','insurance_category');

-- Expect: 1 new column on org_structure_positions, plus the unique index.
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'org_structure_positions'
--   AND column_name = 'external_code';
