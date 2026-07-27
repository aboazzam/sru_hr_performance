-- ============================================================================
-- Career Path module extension (2026-07-27): approval status for a job
-- title's career-path content (description + required competencies).
--
-- Reuses the existing careerPath VPRA levels rather than inventing a new
-- process area: whoever holds 'recommend' (hr_admin/cxo per the real seeded
-- matrix) prepares/edits as a draft; whoever holds 'approve' (ceo) approves
-- before it's considered final. No RLS change needed here -- job_titles_update
-- (careerPath prepare+) already covers this new column; the "approve" action
-- itself enforces the stricter `approve` bar in application code, layered on
-- top of the same shared RLS policy -- identical pattern to
-- reviewPromotion/reviewReward (a single UPDATE policy at 'recommend' covers
-- both prepare-level edits and the final approve decision, since 'approve'
-- satisfies 'recommend' via VPRA rank ordering).
-- ============================================================================

BEGIN;

CREATE TYPE career_content_status AS ENUM ('draft', 'approved');

ALTER TABLE job_titles
  ADD COLUMN career_content_status career_content_status NOT NULL DEFAULT 'draft';

COMMENT ON COLUMN job_titles.career_content_status IS 'Approval status for this job title''s career-path content (description_ar + job_title_competencies), added 2026-07-27. Any edit by a non-approve actor resets this to draft; only careerPath>=approve can set it to approved (application-level check, see approveJobTitleCareerContent).';

-- The 218 job titles already carrying a real, live-used description
-- (authored in the previous session, already shown to employees before this
-- approval workflow existed) are retroactively marked approved -- an
-- explicit, confirmed business decision with the project owner
-- (2026-07-27), not a default. Job titles with no description yet stay
-- 'draft' (the column default), correctly reflecting that they have no
-- reviewable content at all.
UPDATE job_titles SET career_content_status = 'approved' WHERE description_ar IS NOT NULL;

COMMIT;

-- ============================================================================
-- Verification — run AFTER and BEFORE trusting, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: career_content_status column present.
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'job_titles' AND column_name = 'career_content_status';

-- Expect: 218 approved (matches description_ar IS NOT NULL count), rest draft.
-- SELECT career_content_status, count(*) FROM job_titles GROUP BY career_content_status;
