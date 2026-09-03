-- ============================================================================
-- Manual drag-to-reorder for org_units siblings (2026-09-02 request:
-- "اضف خاصية التحريك بحيث يمكن للمستخدم تغيير الترتيب" -- followed up with
-- "كلاهما، ونفّذها في صفحة الوحدات التنظيمية" when asked whether it should
-- cover reordering child units within a card, the top-level cards
-- themselves, or both, and where it should live).
--
-- One plain column, no uniqueness constraint: `sort_order` only needs to
-- rank a unit among its own siblings (same parent_id) for display, not
-- guarantee a unique slot the way org_structure_levels.level_order does --
-- a tie is harmless (broken by name_ar alphabetically, the existing default
-- behavior). Every existing row defaults to 0, so this migration changes NO
-- visible order by itself; ordering only diverges from today's pure
-- alphabetical sort once an admin actually drags something.
--
-- Both /org-units' own tree (OrgUnitsManager) and the staffing screen's
-- nested-card tree (staffingUnitTree.ts) read this same column, so
-- reordering here is what the project owner asked for: implemented once,
-- in the one place org_units is actually edited, and it shows up wherever
-- these units are displayed.
-- ============================================================================

BEGIN;

ALTER TABLE org_units ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN org_units.sort_order IS 'Manual display order among siblings sharing the same parent_id (or among the roots, for NULL parent_id) -- ties broken alphabetically by name_ar. Not a uniqueness-enforced index like org_structure_levels.level_order; a duplicate value is harmless.';

COMMIT;
