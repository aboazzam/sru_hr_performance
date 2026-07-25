-- ============================================================================
-- Real feedback (2026-07-25): the org chart colors nodes by tree DEPTH, so
-- two positions declared at different org_structure_levels but sitting at
-- the same tree depth (e.g. C2 and C4, both direct children of the root)
-- rendered in the exact same color -- visually erasing a distinction the
-- admin explicitly created. Separately requested: let the admin override a
-- level's color from a picker (or leave it to fall back to the
-- organization's own theme colors, already the automatic default via the
-- CSS variables OrgChartTree.tsx reads).
--
-- This migration only adds the storage column; the color-by-level fix and
-- the picker UI are application-layer changes in the same PR, not a DB
-- concern. NULL (the default for every existing row) means "no override --
-- use the automatically derived theme-based rotation."
-- ============================================================================

BEGIN;

ALTER TABLE org_structure_levels ADD COLUMN color TEXT;

COMMENT ON COLUMN org_structure_levels.color IS 'Optional admin-chosen hex color (e.g. #501e8c) for this level''s org-chart nodes. NULL = fall back to the automatically-derived theme-based color rotation.';

COMMIT;

-- ============================================================================
-- Verification — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: a new nullable `color` column, NULL for every pre-existing row.
-- SELECT id, name_ar, color FROM org_structure_levels;
