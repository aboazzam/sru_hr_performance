-- ============================================================================
-- Relax validate_org_structure_position_parent(): "المستوى" is a job-rank
-- classification, not tree depth — supersedes migration 20260723000001's
-- "parent must be from EXACTLY the preceding level_order" rule.
--
-- The project owner provided a real org chart (61 positions) to import and
-- confirmed directly: "بالنسبة للمستوى صحيح فهو يعني بمستوى الوظيفة" (yes,
-- the level means job rank). The real data proves the old rule wrong: e.g.
-- a level-6 position ("رئيس قسم التسويق") reports directly to a level-4
-- position ("مدير إدارة الاتصال المؤسسي"), and several level-5 positions
-- report directly to the level-1 root — genuine multi-level skips, not
-- edge cases. Levels and tree edges are independent concepts in this data.
--
-- New rule: a position's parent may be ANY other active position (or NULL,
-- making it a root) regardless of level — the only things still enforced
-- are (1) no self-parenting and (2) no cycles (a position cannot become
-- its own ancestor). Both still need a trigger, not a CHECK, since cycle
-- detection requires walking the parent_id chain.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION validate_org_structure_position_parent()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_id UUID;
  v_depth INTEGER := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'org_structure_positions: a position cannot be its own parent';
  END IF;

  -- Walk up from the proposed parent; if we ever reach NEW.id, this update
  -- would create a cycle. Bounded by v_depth as a defensive guard against
  -- an already-corrupt chain looping forever.
  v_current_id := NEW.parent_id;
  WHILE v_current_id IS NOT NULL AND v_depth < 1000 LOOP
    IF v_current_id = NEW.id THEN
      RAISE EXCEPTION 'org_structure_positions: setting this parent would create a cycle';
    END IF;
    SELECT parent_id INTO v_current_id FROM org_structure_positions WHERE id = v_current_id;
    v_depth := v_depth + 1;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION validate_org_structure_position_parent IS 'Prevents self-parenting and cycles only — level_order no longer constrains parent choice (2026-07-24: level is a job-rank classification independent of tree depth, confirmed against a real 61-position org chart with multi-level-skip edges).';

COMMIT;

-- ============================================================================
-- Verification — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: succeeds (multi-level skip now allowed).
-- In a rolled-back transaction with a 3-level chain (L1 -> L2 -> L3),
-- inserting a position at a 4th, unrelated level with parent = the L1
-- position should succeed now (previously rejected).

-- Expect: still rejected (self-parent).
-- Expect: still rejected (cycle: A -> B -> A).
