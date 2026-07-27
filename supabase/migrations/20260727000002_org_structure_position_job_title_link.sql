-- ============================================================================
-- Links `org_structure_positions` to `job_titles`, per direct request: "أضف
-- مسمى وظيفي لكل منصب جديد في job_titles" (add a job title for each new
-- position in job_titles). Same shape as the earlier org_unit_id link
-- (20260726000005): a nullable FK, since not every position necessarily
-- needs one (e.g. collegial bodies like "عمداء الكليات"/"المجلس العلمي").
-- ============================================================================

BEGIN;

ALTER TABLE org_structure_positions
  ADD COLUMN job_title_id uuid REFERENCES job_titles(id) ON DELETE SET NULL;

COMMIT;

-- ============================================================================
-- Verification — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: column exists, nullable, FK to job_titles, ON DELETE SET NULL.
-- SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_name = 'org_structure_positions' AND column_name = 'job_title_id';
