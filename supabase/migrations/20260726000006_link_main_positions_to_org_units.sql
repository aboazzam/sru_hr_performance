-- ============================================================================
-- Links the current 3 confidently-matched org-chart positions to their real
-- org unit, per the project owner's explicit request ("ابدأ بربط باقي
-- المناصب الرئيسية بالوحدات التنظيمية" — start linking the remaining main
-- positions to org units), following the position-to-org-unit link feature
-- (20260726000005).
--
-- Only 5 real positions exist in `org_structure_positions` at this point.
-- Matched confidently, by exact or clearly-equivalent name, NOT guessed:
--   - النائب المساعد للتميز الأكاديمي -> exact string match in org_units
--   - مدير الادارة المالية            -> إدارة الشؤون المالية (same finance
--     department; "الادارة المالية" is a shorter informal wording of the
--     org unit's full name "الشؤون المالية")
--   - مدير رأس المال البشري           -> إدارة رأس المال البشري (Director-of-X
--     position naturally maps to the Department-of-X org unit)
--
-- Deliberately NOT linked (flagged back to the project owner instead of
-- guessed, per this project's no-fabricated-data discipline):
--   - الرئيس التنفيذي (CEO) -- two plausible org_units exist ("رئيس الجامعة"
--     / University President, and "مكتب الرئيس" / Office of the President),
--     and it's not clear whether "الرئيس التنفيذي" (a CEO-style executive
--     title) is meant to be the same office as the university presidency or
--     a distinct executive role.
--   - نائب الرئيس التنفيذي (Deputy CEO) -- no org_unit with a comparable
--     name exists among the real 58 units at all.
-- ============================================================================

BEGIN;

UPDATE org_structure_positions
SET org_unit_id = (SELECT id FROM org_units WHERE name_ar = 'النائب المساعد للتميز الأكاديمي')
WHERE name_ar = 'النائب المساعد للتميز الأكاديمي' AND deleted_at IS NULL;

UPDATE org_structure_positions
SET org_unit_id = (SELECT id FROM org_units WHERE name_ar = 'إدارة الشؤون المالية')
WHERE name_ar = 'مدير الادارة المالية' AND deleted_at IS NULL;

UPDATE org_structure_positions
SET org_unit_id = (SELECT id FROM org_units WHERE name_ar = 'إدارة رأس المال البشري')
WHERE name_ar = 'مدير رأس المال البشري' AND deleted_at IS NULL;

COMMIT;

-- ============================================================================
-- Verification — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: exactly 3 of the 5 real positions now have a non-NULL org_unit_id;
-- الرئيس التنفيذي and نائب الرئيس التنفيذي remain NULL.
-- SELECT p.name_ar AS position, u.name_ar AS org_unit
--   FROM org_structure_positions p LEFT JOIN org_units u ON u.id = p.org_unit_id
--   WHERE p.deleted_at IS NULL ORDER BY p.name_ar;
