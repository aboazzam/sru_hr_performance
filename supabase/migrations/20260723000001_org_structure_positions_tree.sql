-- ============================================================================
-- Turns org_structure_positions into a real tree, not a flat per-level list.
--
-- The project owner clarified (2026-07-23), after reviewing the first
-- version live: "بل شجرة حقيقية كل مستوى له عدة عقد وكل عقد له أب من
-- المستوى السابق" (a real tree — each level has several nodes, and each
-- node has a parent from the previous level). This supersedes the flat
-- reading flagged as [استنتاج] in migration 20260722000004's header.
--
-- Adds `parent_id` (self-FK, nullable) to `org_structure_positions`:
--   - NULL only for a position whose level is the structure's first level
--     (the minimum `level_order` in org_structure_levels) — the tree's root
--     tier. A level can have multiple root-tier positions (e.g. several
--     top-level offices reporting to no one within this structure).
--   - NOT NULL for every position at any other level, and that parent's
--     OWN level must be exactly one level_order less than this position's
--     level — "من المستوى السابق" (from the PREVIOUS level), not just any
--     ancestor further up. This is the actual tree-branching mechanism:
--     multiple positions at level N can share or differ in which level
--     N-1 position they report to.
--
-- Enforced by a BEFORE INSERT OR UPDATE trigger, not a CHECK constraint —
-- validating this requires joining to org_structure_levels twice (this
-- position's level and its parent's level), which plain CHECK constraints
-- cannot express in Postgres. ON DELETE RESTRICT on parent_id, consistent
-- with this project's convention of protecting reference data (no cascading
-- delete of a whole subtree by accident) — no position-delete UI exists yet
-- anyway.
-- ============================================================================

BEGIN;

ALTER TABLE org_structure_positions
  ADD COLUMN parent_id UUID REFERENCES org_structure_positions (id) ON DELETE RESTRICT;

COMMENT ON COLUMN org_structure_positions.parent_id IS 'Self-FK forming the org chart tree. NULL only for positions at the structure''s first (root) level; otherwise must reference a position at the immediately preceding level, enforced by validate_org_structure_position_parent().';

CREATE OR REPLACE FUNCTION validate_org_structure_position_parent()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_min_level_order INTEGER;
  v_this_level_order INTEGER;
  v_parent_level_order INTEGER;
BEGIN
  SELECT MIN(level_order) INTO v_min_level_order FROM org_structure_levels WHERE deleted_at IS NULL;
  SELECT level_order INTO v_this_level_order FROM org_structure_levels WHERE id = NEW.level_id AND deleted_at IS NULL;

  IF v_this_level_order IS NULL THEN
    RAISE EXCEPTION 'org_structure_positions: level_id does not reference an active level';
  END IF;

  IF v_this_level_order = v_min_level_order THEN
    IF NEW.parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'org_structure_positions: a position at the first (root) level cannot have a parent';
    END IF;
  ELSE
    IF NEW.parent_id IS NULL THEN
      RAISE EXCEPTION 'org_structure_positions: a position at a non-root level requires a parent from the immediately preceding level';
    END IF;

    SELECT l.level_order INTO v_parent_level_order
    FROM org_structure_positions p
    JOIN org_structure_levels l ON l.id = p.level_id
    WHERE p.id = NEW.parent_id AND p.deleted_at IS NULL AND l.deleted_at IS NULL;

    IF v_parent_level_order IS NULL THEN
      RAISE EXCEPTION 'org_structure_positions: parent_id does not reference an active position';
    END IF;

    IF v_parent_level_order <> v_this_level_order - 1 THEN
      RAISE EXCEPTION 'org_structure_positions: parent must be a position at the immediately preceding level';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER org_structure_positions_validate_parent
  BEFORE INSERT OR UPDATE ON org_structure_positions
  FOR EACH ROW
  EXECUTE FUNCTION validate_org_structure_position_parent();

COMMENT ON FUNCTION validate_org_structure_position_parent IS 'Enforces the org_structure_positions tree invariant: root-level positions have no parent, every other position''s parent must sit at exactly the preceding level_order. Plain CHECK constraints cannot express this (needs joins to org_structure_levels).';

COMMIT;

-- ============================================================================
-- Verification — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 1 row (the new trigger), tgenabled = 'O' (enabled).
-- SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'org_structure_positions'::regclass;

-- Expect: error "cannot have a parent" if a real root-level position is
-- inserted with a non-null parent_id.
-- Expect: error "requires a parent" if a real non-root-level position is
-- inserted with parent_id = NULL.
-- Expect: error "immediately preceding level" if a parent from two levels
-- up (not one) is used.
