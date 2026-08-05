-- ============================================================================
-- Announcement details for advertised vacancies, per direct request: clicking
-- a job in "الوظائف المعلن عنها" opens a form holding
--   * كم عدد الوظائف بهذا المسمى      -> openings_count
--   * متى بداية الإعلان (للنشر عبر بوابة التوظيف) -> announcement_start_date
--   * آخر موعد للتقديم (تختفي من بوابة التوظيف)   -> application_deadline
-- and a new "بوابة التوظيف" tab lists the ads whose time has come.
--
-- Three more nullable columns on `vacancies`, continuing the same decision as
-- 20260804000003 (`announced_at`/`announced_by`): these are facts ABOUT a
-- vacancy that already carries its job title, org unit, requirements and
-- status — a separate announcements table would duplicate all of them and add
-- a join for nothing.
--
-- [استنتاج] Nullability and defaults, flagged rather than assumed:
--  * `openings_count` defaults to 1 (a vacancy is one seat unless stated) with
--    a `> 0` CHECK. NOT NULL is safe because of that default — no existing row
--    is left ambiguous.
--  * `announcement_start_date` / `application_deadline` are NULLABLE, because
--    the vacancy advertised before this migration has neither, and inventing
--    dates for it would be fabricating data. The portal treats them as:
--    no start  -> the ad is live from the moment it was advertised
--                 (`announced_at`), which is the only real date it has;
--    no deadline -> open-ended, no automatic disappearance.
--    Both fallbacks are conservative: they never hide an ad that the HR team
--    explicitly advertised, they only skip the scheduling behaviour that
--    needs dates to exist.
--  * A CHECK enforces `application_deadline >= announcement_start_date` when
--    both are present — an ad that expires before it starts is never valid.
--
-- No RLS change: `vacancies_update` already gates writes at
-- check_vpra('vacancies','recommend', org_unit_id) (hr_admin + manager) and
-- `vacancies_select` already lets every `vacancies>=view` holder read the row,
-- which is exactly who the portal tab is for (internal postings are
-- documented as visible to all staff).
-- ============================================================================

BEGIN;

ALTER TABLE vacancies
  ADD COLUMN openings_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN announcement_start_date DATE,
  ADD COLUMN application_deadline DATE,
  ADD CONSTRAINT vacancies_openings_count_positive CHECK (openings_count > 0),
  ADD CONSTRAINT vacancies_announcement_window_valid CHECK (
    announcement_start_date IS NULL
    OR application_deadline IS NULL
    OR application_deadline >= announcement_start_date
  );

COMMENT ON COLUMN vacancies.openings_count IS 'كم عدد الوظائف بهذا المسمى — how many seats this posting covers.';
COMMENT ON COLUMN vacancies.announcement_start_date IS 'بداية الإعلان — the portal shows the ad from this date; NULL = live from announced_at.';
COMMENT ON COLUMN vacancies.application_deadline IS 'آخر موعد للتقديم — the portal hides the ad after this date; NULL = open-ended.';

COMMIT;

-- ============================================================================
-- Verification -- run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect every existing row to carry openings_count = 1 and NULL dates.
-- SELECT openings_count, count(*) FROM vacancies WHERE deleted_at IS NULL GROUP BY 1;
-- SELECT count(*) FILTER (WHERE announcement_start_date IS NOT NULL) AS with_start,
--        count(*) FILTER (WHERE application_deadline IS NOT NULL) AS with_deadline
--   FROM vacancies WHERE deleted_at IS NULL;

-- Expect both CHECKs to reject invalid input:
--   openings_count = 0                                   -> 23514
--   application_deadline earlier than announcement_start  -> 23514
