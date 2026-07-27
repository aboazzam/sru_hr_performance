-- ============================================================================
-- Backfills job_title_id on the 5 ORIGINAL org_structure_positions rows that
-- predate the job-titles-linking work (20260727000002/000003) and were never
-- in that migration's scope (it only covered the 44 NEW positions from
-- 20260727000001). Direct follow-up request: "backfill job titles for the
-- CEO/Deputy CEO positions too" -- extended here to all 5 originally-flagged
-- gaps (not just the 2 named), since they're the same category of gap and
-- 3 of the 5 have confident REUSE matches, avoiding a half-finished result.
--
-- The 3 positions PR #100 deliberately left titleless (عمداء الكليات،
-- المجلس العلمي، المشرفة على القسم النسائي -- collegial bodies / already
-- self-titled) are untouched here; this migration only targets the 5 gap
-- positions that were simply out of that migration's scope.
--
-- REUSE (2 rows, confident semantic match already in job_titles, same
-- spelling-variance-tolerance precedent used throughout this project):
--   مدير الادارة المالية        -> مدير الإدارة المالية (grade 14)
--   مدير رأس المال البشري       -> مدير إدارة رأس المال البشري (grade 14)
--
-- NEW (3 rows, no existing match at all):
--   الرئيس التنفيذي              -> رئيس الجامعة (grade 16, family: عام)
--     [استنتاج]: this position's org_unit_id already links to the real
--     "رئيس الجامعة" org unit (20260726000006) -- the University President,
--     a distinct real role from "الرئيس التنفيذي للخدمات المشتركة" (a
--     subordinate exec role already reused for a different position).
--     Titled after the real org unit, not the position's own generic
--     display name, per the same "name identically to the linked org unit"
--     convention 20260727000003 used. Grade 16 is this schema's numeric
--     ceiling (CHECK constraint) -- a University President organizationally
--     outranks every grade-16 title already in the table, but the scale has
--     no room above 16; not worked around here, out of this migration's
--     scope. Family "عام" (generic) since no family covers top leadership.
--   نائب الرئيس التنفيذي         -> نائب الرئيس للشؤون الأكاديمية (grade 16,
--     family: الأكاديمي) [استنتاج]: this position's own display name says
--     "نائب الرئيس التنفيذي" (an older label) but its real linked org unit
--     (20260726000006/20260727 review) is "نائب الرئيس للشؤون الأكاديمية"
--     (VP for Academic Affairs) -- the job title follows the real linked
--     org unit, not the position's legacy display name.
--   النائب المساعد للتميز الأكاديمي -> النائب المساعد للتميز الأكاديمي
--     (grade 16, family: الأكاديمي) [استنتاج]: named identically to both
--     the position and its linked org unit, same "self-titled" precedent as
--     المشرفة على القسم النسائي -- not reworded to match the existing
--     "مساعد النائب لـ..." rows' reversed word order, since no rewording
--     was requested and the position/org-unit name is already unambiguous.
-- ============================================================================

BEGIN;

WITH new_titles AS (
  INSERT INTO job_titles (job_family_id, name_ar, grade_level, category)
  VALUES
    ((SELECT id FROM job_families WHERE name_ar = 'عام'), 'رئيس الجامعة', 16, 'leadership'),
    ((SELECT id FROM job_families WHERE name_ar = 'الأكاديمي'), 'نائب الرئيس للشؤون الأكاديمية', 16, 'leadership'),
    ((SELECT id FROM job_families WHERE name_ar = 'الأكاديمي'), 'النائب المساعد للتميز الأكاديمي', 16, 'leadership')
  RETURNING id, name_ar
)
UPDATE org_structure_positions p
SET job_title_id = nt.id
FROM new_titles nt
WHERE p.deleted_at IS NULL
  AND (
    (p.name_ar = 'الرئيس التنفيذي' AND nt.name_ar = 'رئيس الجامعة')
    OR (p.name_ar = 'نائب الرئيس التنفيذي' AND nt.name_ar = 'نائب الرئيس للشؤون الأكاديمية')
    OR (p.name_ar = 'النائب المساعد للتميز الأكاديمي' AND nt.name_ar = 'النائب المساعد للتميز الأكاديمي')
  );

UPDATE org_structure_positions
SET job_title_id = (SELECT id FROM job_titles WHERE name_ar = 'مدير الإدارة المالية')
WHERE deleted_at IS NULL AND name_ar = 'مدير الادارة المالية';

UPDATE org_structure_positions
SET job_title_id = (SELECT id FROM job_titles WHERE name_ar = 'مدير إدارة رأس المال البشري')
WHERE deleted_at IS NULL AND name_ar = 'مدير رأس المال البشري';

COMMIT;

-- ============================================================================
-- Verification -- run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 3 new job_titles rows (رئيس الجامعة / نائب الرئيس للشؤون
-- الأكاديمية / النائب المساعد للتميز الأكاديمي), all grade 16.
-- SELECT name_ar, grade_level, job_family_id FROM job_titles
--   WHERE name_ar IN ('رئيس الجامعة', 'نائب الرئيس للشؤون الأكاديمية', 'النائب المساعد للتميز الأكاديمي');

-- Expect: all 5 originally-gap positions now have a non-NULL job_title_id;
-- only the 3 deliberately-titleless ones remain NULL.
-- SELECT name_ar, job_title_id FROM org_structure_positions
--   WHERE deleted_at IS NULL AND job_title_id IS NULL;
