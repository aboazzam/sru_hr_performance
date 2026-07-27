-- ============================================================================
-- Strategic-goal cascade: `strategic_goals` -> `sub_goals` -> `targets`
-- (self-referencing, arbitrary depth). Replaces `kpi_library`/`kpis`
-- (20260727000002), dropped at the end of this migration -- see the
-- previous migration's header for the full design rationale confirmed
-- with the project owner.
--
-- ----------------------------------------------------------------------------
-- Schema
-- ----------------------------------------------------------------------------
-- strategic_goals: top tier, strategy_admin-only. Has its own KPI shape
--   (target_value/actual_value/unit_ar/weight) directly on the row --
--   "كل هدف استراتيجي له مؤشر أداء" (one KPI per strategic goal), not a
--   separate join to a KPI catalog.
--
-- sub_goals: children of exactly one strategic_goal. Each is first created
--   by strategy_admin and cascaded onto an `org_structure_positions` row
--   (owner_position_id, typically C2 per the confirmed flow) -- "له من
--   يملكه ويوزعه". Same own-KPI shape as strategic_goals.
--
-- targets: children of exactly one sub_goal, but ALSO self-referencing via
--   parent_target_id -- this is what allows the confirmed multi-hop
--   delegation ("مدير الاستراتيجية يسقط للمدراء وهم من يسقطونها لمن
--   دونهم"): a target's *immediate* owner (whoever is currently assigned
--   to assigned_position_id) can cascade a further child target down to
--   another position, or terminate the chain by assigning directly to an
--   employee (assigned_employee_id). assigned_position_id/
--   assigned_employee_id are mutually exclusive (targets_assignee_xor),
--   same established XOR pattern as `goals`/`kpis`' title-source CHECKs.
--   A target already assigned to an employee cannot have children
--   (targets_validate_no_children_under_employee trigger) -- an employee
--   is always a leaf, matching the "المسقطة عليه" (cascaded ONTO them)
--   framing used throughout this schema's per-employee tables.
--   Cycle/self-parent prevention on parent_target_id mirrors
--   validate_org_structure_position_parent()'s already-relaxed shape
--   (20260724000001) exactly -- same trigger-based walk-the-chain
--   technique, since a plain CHECK can't express it.
--
-- No unique constraint on (sub_goal_id/parent_target_id, ...): a sub-goal
-- or target can legitimately be split into several sibling children (one
-- strategic goal -> several sub-goals -> several targets each), matching
-- `goals`' own "no unique (employee_id, cycle_id)" precedent for the same
-- reason (multiple children are the normal case, not a duplicate).
--
-- ----------------------------------------------------------------------------
-- Authorization model -- deliberately NOT the standard check_vpra(area,
-- level, org_unit_id) shape used everywhere else in this schema, because
-- cascade authority here is genuinely per-ROW (whoever currently holds the
-- specific position/target), not a flat role grant. Two new SECURITY
-- DEFINER helpers:
--
--   is_my_strategic_position(position_id): TRUE iff the caller is
--     currently staffed (org_structure_assignments) onto position_id --
--     "الشجرة الموحدة... الهيكل التنظيمي" per the confirmed design, this
--     is the ONLY ownership mechanism used, not org_units.
--
--   is_in_my_strategic_subtree(target_id): recursive CTE walking UP a
--     target's ancestor chain (parent_target_id, then its root sub_goal)
--     -- TRUE iff the caller owns ANY node along that chain. This is what
--     gives a C2 owner real "متابعة" (follow-up) visibility over
--     everything cascaded beneath their own sub-goal, all the way down to
--     individual employees, without a separate role grant at every level
--     -- same "the relationship itself is the authorization fact"
--     principle already established for profiles.supervisor_id
--     (20260718000009/10), just walked recursively instead of one hop.
--
-- `strategicPlanning` role_permissions grant is ONLY used for the two
-- GLOBAL oversight roles: strategy_admin='approve' (creates/edits every
-- tier; also retains blanket override authority to cascade directly to
-- ANY position at any depth, per "وله الصلاحية يسقطها على C3 or C4" --
-- not required to go level-by-level), ceo='view' (the confirmed
-- read-only "داشبورد متابعة"). No other role holds any grant here at all
-- -- deliberately: every other participant's access is mediated entirely
-- through is_my_strategic_position()/is_in_my_strategic_subtree(), the
-- same "being the administratively-designated owner IS the authorization"
-- trust model, not a blanket role-wide grant (which would leak visibility
-- across unrelated branches of the tree, same risk already documented for
-- `evaluations`' original `employee`/`supervisor`-share-a-level bug).
--
--   strategic_goals_select/sub_goals_select: check_vpra_global
--     ('strategicPlanning','view') [strategy_admin+ceo see everything] OR
--     is_my_strategic_position(owner_position_id) [sub_goals only] OR
--     EXISTS a descendant target the caller can already see (so someone
--     deep in a sub-goal's tree still gets the parent title for context).
--   targets_select: the same global-oversight OR-branch OR
--     is_in_my_strategic_subtree(id) OR self-as-assigned_employee.
--   *_insert: strategy_admin (approve) creates strategic_goals and the
--     FIRST cascade of sub_goals; sub_goals/targets deeper inserts require
--     being the owner of the immediate parent (is_my_strategic_position on
--     the parent's owner/assignee) -- exactly one hop, not the recursive
--     subtree check, since creating a NEW child is a distinct action from
--     merely viewing the existing subtree.
--   *_update: strategy_admin (approve) OR being the CURRENT owner of that
--     exact row (progress reporting on your own sub-goal/target).
-- ----------------------------------------------------------------------------

BEGIN;

CREATE TABLE strategic_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES evaluation_cycles(id) ON DELETE RESTRICT,
  title_ar TEXT NOT NULL,
  title_en TEXT,
  description_ar TEXT,
  description_en TEXT,
  target_value NUMERIC(14,2),
  actual_value NUMERIC(14,2),
  unit_ar TEXT NOT NULL,
  unit_en TEXT,
  weight NUMERIC(5,2),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT strategic_goals_weight_range CHECK (weight IS NULL OR (weight > 0 AND weight <= 100))
);

CREATE TABLE sub_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategic_goal_id UUID NOT NULL REFERENCES strategic_goals(id) ON DELETE CASCADE,
  owner_position_id UUID NOT NULL REFERENCES org_structure_positions(id) ON DELETE RESTRICT,
  title_ar TEXT NOT NULL,
  title_en TEXT,
  description_ar TEXT,
  description_en TEXT,
  target_value NUMERIC(14,2),
  actual_value NUMERIC(14,2),
  unit_ar TEXT NOT NULL,
  unit_en TEXT,
  weight NUMERIC(5,2),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT sub_goals_weight_range CHECK (weight IS NULL OR (weight > 0 AND weight <= 100))
);

CREATE TABLE targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_goal_id UUID NOT NULL REFERENCES sub_goals(id) ON DELETE CASCADE,
  parent_target_id UUID REFERENCES targets(id) ON DELETE CASCADE,
  assigned_position_id UUID REFERENCES org_structure_positions(id) ON DELETE RESTRICT,
  assigned_employee_id UUID REFERENCES profiles(id) ON DELETE RESTRICT,
  title_ar TEXT NOT NULL,
  title_en TEXT,
  target_value NUMERIC(14,2) NOT NULL,
  actual_value NUMERIC(14,2),
  unit_ar TEXT NOT NULL,
  unit_en TEXT,
  weight NUMERIC(5,2),
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT targets_weight_range CHECK (weight IS NULL OR (weight > 0 AND weight <= 100)),
  CONSTRAINT targets_assignee_xor CHECK (
    (assigned_position_id IS NOT NULL AND assigned_employee_id IS NULL)
    OR (assigned_position_id IS NULL AND assigned_employee_id IS NOT NULL)
  ),
  CONSTRAINT targets_no_self_parent CHECK (id IS DISTINCT FROM parent_target_id)
);

-- ----------------------------------------------------------------------------
-- targets.parent_target_id cycle prevention -- mirrors
-- validate_org_structure_position_parent()'s already-relaxed shape
-- (20260724000001) exactly.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_target_parent()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_id UUID;
  v_depth INTEGER := 0;
BEGIN
  IF NEW.parent_target_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM targets WHERE id = NEW.parent_target_id AND assigned_employee_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'targets: cannot cascade further under a target already assigned to an individual employee';
  END IF;

  v_current_id := NEW.parent_target_id;
  WHILE v_current_id IS NOT NULL AND v_depth < 1000 LOOP
    IF v_current_id = NEW.id THEN
      RAISE EXCEPTION 'targets: setting this parent would create a cycle';
    END IF;
    SELECT parent_target_id INTO v_current_id FROM targets WHERE id = v_current_id;
    v_depth := v_depth + 1;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER targets_validate_parent
  BEFORE INSERT OR UPDATE ON targets
  FOR EACH ROW
  EXECUTE FUNCTION validate_target_parent();

COMMENT ON FUNCTION validate_target_parent IS 'Prevents self-parenting/cycles on targets.parent_target_id, and blocks cascading further under a target already assigned to an individual employee (employees are always leaves).';

-- ----------------------------------------------------------------------------
-- Ownership helpers
-- ----------------------------------------------------------------------------
CREATE FUNCTION is_my_strategic_position(p_position_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_position_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM org_structure_assignments osa
    JOIN profiles p ON p.id = osa.employee_id
    WHERE osa.position_id = p_position_id
      AND osa.deleted_at IS NULL
      AND p.auth_user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION is_my_strategic_position IS 'TRUE iff the caller is currently staffed (org_structure_assignments) onto p_position_id -- the sole ownership mechanism for the strategic-goal cascade, per the confirmed "شجرة واحدة" design (org_structure_positions only, not org_units).';

CREATE FUNCTION is_in_my_strategic_subtree(p_target_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_target_id, sub_goal_id, assigned_position_id
    FROM targets WHERE id = p_target_id
    UNION ALL
    SELECT t.id, t.parent_target_id, t.sub_goal_id, t.assigned_position_id
    FROM targets t
    JOIN ancestors a ON t.id = a.parent_target_id
  )
  SELECT EXISTS (
    SELECT 1 FROM ancestors a WHERE is_my_strategic_position(a.assigned_position_id)
  ) OR EXISTS (
    SELECT 1 FROM ancestors a
    JOIN sub_goals sg ON sg.id = a.sub_goal_id
    WHERE a.parent_target_id IS NULL AND is_my_strategic_position(sg.owner_position_id)
  );
$$;

COMMENT ON FUNCTION is_in_my_strategic_subtree IS 'TRUE iff the caller currently owns (is_my_strategic_position) ANY ancestor of p_target_id -- itself, an ancestor target, or the root sub_goal -- walking UP via parent_target_id. Gives real "متابعة" visibility down an owner''s whole subtree without a separate grant at every level.';

-- These two exist SOLELY so targets_insert (below) never issues a plain
-- correlated subquery directly against sub_goals/targets: a plain
-- subquery there would be RLS-checked as the calling role, and
-- sub_goals_select's own EXISTS-on-targets branch would re-enter RLS
-- evaluation for `targets` while a policy for `targets` (this very
-- INSERT) is already being evaluated -- Postgres refuses this with
-- "infinite recursion detected in policy for relation targets", caught
-- live while writing this migration's own verification test, not assumed
-- safe. Wrapping the lookup in a SECURITY DEFINER function sidesteps it
-- entirely (a function call isn't inlined into the policy's own
-- self-reference tracking the way a bare subquery is) -- same reason
-- every cross-table RLS lookup in this schema already goes through a
-- named function (check_vpra, is_my_direct_report, ...) rather than an
-- inline subquery.
CREATE FUNCTION get_sub_goal_owner_position(p_sub_goal_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT owner_position_id FROM sub_goals WHERE id = p_sub_goal_id;
$$;

CREATE FUNCTION get_target_assigned_position(p_target_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT assigned_position_id FROM targets WHERE id = p_target_id;
$$;

REVOKE ALL ON FUNCTION is_my_strategic_position(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION is_my_strategic_position(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION is_my_strategic_position(UUID) TO authenticated;

REVOKE ALL ON FUNCTION is_in_my_strategic_subtree(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION is_in_my_strategic_subtree(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION is_in_my_strategic_subtree(UUID) TO authenticated;

REVOKE ALL ON FUNCTION get_sub_goal_owner_position(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_sub_goal_owner_position(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION get_sub_goal_owner_position(UUID) TO authenticated;

REVOKE ALL ON FUNCTION get_target_assigned_position(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_target_assigned_position(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION get_target_assigned_position(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
ALTER TABLE strategic_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY strategic_goals_select ON strategic_goals FOR SELECT TO authenticated
  USING (
    check_vpra_global('strategicPlanning', 'view')
    OR EXISTS (
      SELECT 1 FROM sub_goals sg
      WHERE sg.strategic_goal_id = strategic_goals.id
        AND (
          is_my_strategic_position(sg.owner_position_id)
          OR EXISTS (
            SELECT 1 FROM targets t
            WHERE t.sub_goal_id = sg.id
              AND (
                is_in_my_strategic_subtree(t.id)
                OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = t.assigned_employee_id AND p.auth_user_id = auth.uid())
              )
          )
        )
    )
  );

CREATE POLICY strategic_goals_insert ON strategic_goals FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

CREATE POLICY strategic_goals_update ON strategic_goals FOR UPDATE TO authenticated
  USING (check_vpra_global('strategicPlanning', 'approve'))
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

CREATE POLICY sub_goals_select ON sub_goals FOR SELECT TO authenticated
  USING (
    check_vpra_global('strategicPlanning', 'view')
    OR is_my_strategic_position(owner_position_id)
    OR EXISTS (
      SELECT 1 FROM targets t
      WHERE t.sub_goal_id = sub_goals.id
        AND (
          is_in_my_strategic_subtree(t.id)
          OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = t.assigned_employee_id AND p.auth_user_id = auth.uid())
        )
    )
  );

CREATE POLICY sub_goals_insert ON sub_goals FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

CREATE POLICY sub_goals_update ON sub_goals FOR UPDATE TO authenticated
  USING (check_vpra_global('strategicPlanning', 'approve') OR is_my_strategic_position(owner_position_id))
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve') OR is_my_strategic_position(owner_position_id));

CREATE POLICY targets_select ON targets FOR SELECT TO authenticated
  USING (
    check_vpra_global('strategicPlanning', 'view')
    OR is_in_my_strategic_subtree(id)
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = targets.assigned_employee_id AND p.auth_user_id = auth.uid())
  );

CREATE POLICY targets_insert ON targets FOR INSERT TO authenticated
  WITH CHECK (
    check_vpra_global('strategicPlanning', 'approve')
    OR (
      parent_target_id IS NOT NULL
      AND is_my_strategic_position(get_target_assigned_position(targets.parent_target_id))
    )
    OR (
      parent_target_id IS NULL
      AND is_my_strategic_position(get_sub_goal_owner_position(targets.sub_goal_id))
    )
  );

-- Two update paths, deliberately not just "own this row": (1) a
-- position-assigned target's own current owner manages/reports progress on
-- it and can further cascade it (is_my_strategic_position(
-- assigned_position_id)); (2) an EMPLOYEE-assigned target has no
-- assigned_position_id at all (XOR), so with only path (1) nobody but
-- strategy_admin could ever report progress on an individual's target --
-- a real gap caught while designing the UI, not assumed away. Path (2)
-- mirrors targets_insert's own parent-ownership check exactly: whoever
-- owns the IMMEDIATE PARENT (the one who cascaded this row into
-- existence) retains the right to update it, matching the original
-- simpler `kpis` table's precedent where the supervisor -- not the
-- employee -- tracks progress on the employee's behalf.
CREATE POLICY targets_update ON targets FOR UPDATE TO authenticated
  USING (
    check_vpra_global('strategicPlanning', 'approve')
    OR is_my_strategic_position(assigned_position_id)
    OR (
      parent_target_id IS NOT NULL
      AND is_my_strategic_position(get_target_assigned_position(parent_target_id))
    )
    OR (
      parent_target_id IS NULL
      AND is_my_strategic_position(get_sub_goal_owner_position(sub_goal_id))
    )
  )
  WITH CHECK (
    check_vpra_global('strategicPlanning', 'approve')
    OR is_my_strategic_position(assigned_position_id)
    OR (
      parent_target_id IS NOT NULL
      AND is_my_strategic_position(get_target_assigned_position(parent_target_id))
    )
    OR (
      parent_target_id IS NULL
      AND is_my_strategic_position(get_sub_goal_owner_position(sub_goal_id))
    )
  );

-- ----------------------------------------------------------------------------
-- role_permissions seed
-- ----------------------------------------------------------------------------
INSERT INTO role_permissions (role_id, process_area, vpra_level)
SELECT id, 'strategicPlanning'::process_area, 'approve'::vpra_level FROM roles WHERE role_code = 'strategy_admin';

INSERT INTO role_permissions (role_id, process_area, vpra_level)
SELECT id, 'strategicPlanning'::process_area, 'view'::vpra_level FROM roles WHERE role_code = 'ceo';

-- ----------------------------------------------------------------------------
-- list_org_structure_positions(): a real gap caught while designing the
-- cascade UI, not assumed away -- org_structure_positions_select's RLS
-- (20260722000004) is check_vpra_global('orgStructure','view'), which only
-- hr_admin/super_admin hold. Every OTHER participant in this cascade (a
-- C2/C3/C4 owner who is neither) still needs to BROWSE the position tree
-- to pick a cascade recipient (sub_goals.owner_position_id /
-- targets.assigned_position_id) -- without this, the picker would be
-- empty for almost everyone the feature is actually built for. Narrow,
-- purpose-built SECURITY DEFINER read-only lookup, same established
-- pattern as get_my_supervisor()/get_my_role_codes() -- returns only
-- id/name/level/parent (no sensitive data, just organizational structure
-- names), not a general RLS bypass on the table itself.
-- ----------------------------------------------------------------------------
CREATE FUNCTION list_org_structure_positions()
RETURNS TABLE(id UUID, name_ar TEXT, name_en TEXT, level_id UUID, parent_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name_ar, p.name_en, p.level_id, p.parent_id
  FROM org_structure_positions p
  WHERE p.deleted_at IS NULL
  ORDER BY p.name_ar;
$$;

COMMENT ON FUNCTION list_org_structure_positions IS 'SECURITY DEFINER read-only position picker for the strategic-goal cascade UI -- org_structure_positions_select''s own RLS (orgStructure=view, hr_admin/super_admin only) would otherwise leave this picker empty for every other cascade participant.';

REVOKE ALL ON FUNCTION list_org_structure_positions() FROM PUBLIC;
REVOKE ALL ON FUNCTION list_org_structure_positions() FROM anon;
GRANT EXECUTE ON FUNCTION list_org_structure_positions() TO authenticated;

-- ----------------------------------------------------------------------------
-- list_profiles_for_cascade(): the same class of gap as
-- list_org_structure_positions(), one step further down the cascade --
-- terminating a target directly on "a specific employee" needs a picker,
-- but profiles_select's RLS (self-row / employeeData / employeeDataSubordinates
-- + is_my_subordinate / created_by) would leave it empty for most cascade
-- participants (a C2/C3 position holder holds none of those by default).
-- Deliberately minimal columns (id/employee_number/full_name_ar only, no
-- other profile fields) -- roughly the same exposure level employee
-- pickers already have on other assign screens in this app (AssignGoalForm
-- etc.), just reachable by more roles here since the cascade itself is
-- broadly participated in (not gated behind a single process area).
-- ----------------------------------------------------------------------------
CREATE FUNCTION list_profiles_for_cascade()
RETURNS TABLE(id UUID, employee_number TEXT, full_name_ar TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.employee_number, p.full_name_ar
  FROM profiles p
  WHERE p.deleted_at IS NULL
  ORDER BY p.employee_number;
$$;

COMMENT ON FUNCTION list_profiles_for_cascade IS 'SECURITY DEFINER minimal employee picker (id/employee_number/full_name_ar only) for the strategic-goal cascade UI -- profiles_select''s own RLS would otherwise leave this picker empty for most cascade participants.';

REVOKE ALL ON FUNCTION list_profiles_for_cascade() FROM PUBLIC;
REVOKE ALL ON FUNCTION list_profiles_for_cascade() FROM anon;
GRANT EXECUTE ON FUNCTION list_profiles_for_cascade() TO authenticated;

-- ----------------------------------------------------------------------------
-- Drop the superseded kpiLibrary/kpiAssignment tables (20260727000002) --
-- confirmed empty in production before this migration was written; the
-- process_area enum values themselves are left in place (harmless dead
-- values, Postgres has no DROP VALUE), same precedent as `reports`.
-- ----------------------------------------------------------------------------
DELETE FROM role_permissions WHERE process_area IN ('kpiLibrary', 'kpiAssignment');
DROP TABLE IF EXISTS kpis;
DROP TABLE IF EXISTS kpi_library;

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 3 rows, rowsecurity = true.
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('strategic_goals','sub_goals','targets');

-- Expect: anon = false, authenticated = true, for both new functions.
-- SELECT has_function_privilege('anon', 'is_my_strategic_position(uuid)', 'EXECUTE');
-- SELECT has_function_privilege('authenticated', 'is_my_strategic_position(uuid)', 'EXECUTE');

-- Expect: CHECK rejects setting both assigned_position_id and
-- assigned_employee_id, and rejects neither being set, on `targets`.

-- Expect: trigger rejects cascading a child target under a target already
-- assigned to an employee; rejects self-parent and cycles.

-- Expect (SET ROLE authenticated + simulated JWT, real org_structure chain
-- C1 -> C2 -> C3, real assignments): a `strategy_admin` test user creates a
-- strategic_goal and a sub_goal owned by the C2 position; the person
-- assigned to C2 can insert a target cascading to C3 (their own creation)
-- and update its own progress, but CANNOT insert a target under an
-- unrelated sub_goal they don't own; the person assigned to C3 can see the
-- C2-owned sub_goal (via the EXISTS-descendant branch) and cascade a
-- further target to a specific employee; that employee sees only their own
-- leaf target (self-row) and cannot write to it; a `ceo` test user
-- (strategicPlanning=view) sees everything read-only and cannot insert or
-- update; an unrelated employee with no relation to any node in the chain
-- sees zero rows across all three tables.

-- Expect: 0 rows.
-- SELECT count(*) FROM information_schema.tables WHERE table_name IN ('kpi_library','kpis');
