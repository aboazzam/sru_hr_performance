-- ============================================================================
-- "الوظائف المعلن عنها" (Advertised jobs), per direct request: an icon on
-- every vacancy row ("أعلن عن الوظيفة") that makes it appear in a new
-- التوظيف-module tab listing the advertised ones.
--
-- Two nullable columns on the existing `vacancies` table rather than a new
-- `job_postings` table: "announced" is one fact about a vacancy that already
-- exists (its job title, org unit, requirements and status are all already
-- here), so a separate table would duplicate every one of those columns and
-- add a join for nothing. `announced_at IS NOT NULL` IS the advertised flag
-- -- and it carries when, which a boolean would not.
--
--   announced_at  -- when it was advertised; NULL = not advertised
--   announced_by  -- who advertised it, same shape/precedent as
--                    `promotions.approved_by` / `rewards.approved_by`
--                    (profiles FK, ON DELETE SET NULL so removing a staff
--                    member never erases the posting itself)
--
-- No RLS change: `vacancies_update` already gates writes at
-- check_vpra('vacancies','recommend', org_unit_id) (20260719000007 --
-- hr_admin + manager), which is exactly the tier that should decide whether
-- a vacancy is publicly advertised, and `vacancies_select` already lets
-- every role holding `vacancies>=view` (including plain `employee`, by
-- design -- internal postings are meant to be visible to all staff) read
-- these columns along with the rest of the row. Announcing therefore needs
-- no new policy and no new process area.
--
-- [استنتاج] Announcing deliberately does NOT touch `status`: a vacancy can
-- be advertised while `open`, and closing it later does not un-advertise it
-- automatically -- the new tab shows each posting's real status instead, so
-- the two facts stay independent rather than one silently overwriting the
-- other. Un-announcing is a separate explicit action (sets both columns
-- back to NULL).
-- ============================================================================

BEGIN;

ALTER TABLE vacancies
  ADD COLUMN announced_at TIMESTAMPTZ,
  ADD COLUMN announced_by UUID REFERENCES profiles (id) ON DELETE SET NULL;

COMMENT ON COLUMN vacancies.announced_at IS 'When this vacancy was advertised ("الوظائف المعلن عنها"). NULL = not advertised.';

-- Partial index: the advertised list is the only query that filters on this,
-- and advertised rows are the minority.
CREATE INDEX vacancies_announced_idx
  ON vacancies (announced_at DESC)
  WHERE announced_at IS NOT NULL AND deleted_at IS NULL;

COMMIT;

-- ============================================================================
-- Verification -- run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect both columns present and nullable, and every existing row NULL
-- (nothing is retroactively treated as advertised).
-- SELECT count(*) FILTER (WHERE announced_at IS NOT NULL) AS announced,
--        count(*) AS total
--   FROM vacancies WHERE deleted_at IS NULL;

-- Expect: an hr_admin/manager test user can set announced_at on a vacancy in
-- scope (via vacancies_update); an `employee` test user's identical UPDATE
-- affects 0 rows but they can still SELECT the advertised row.
