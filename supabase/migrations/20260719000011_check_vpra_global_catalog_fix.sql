-- ============================================================================
-- Fixes the systemic `check_vpra()` scope gap flagged as the project's
-- most significant open RLS follow-up (found live while verifying the
-- promotions/rewards approval history screen, migration 20260719000010):
-- every RLS policy on a university-wide CATALOG table (career_path,
-- competencies + its 3 sub-tables, evaluation_cycles, goal_library,
-- job_families, job_titles, role_permissions, roles, salary_scale,
-- user_roles) calls `check_vpra(process_area, level)` with only 2
-- arguments, relying on `p_target_org_unit`'s `DEFAULT NULL`. Because
-- `check_vpra()`'s `org_unit` scope branch requires
-- `p_target_org_unit IS NOT NULL` to pass, this means ANY `org_unit`-
-- scoped role (manager, supervisor, field_supervisor, ...) can NEVER see
-- these tables at all, regardless of their real VPRA grant -- only
-- `scope_type='all'` roles ever could. Confirmed live for `job_titles`
-- (blank job title names for a real org_unit-scoped manager) and
-- documented earlier for `evaluation_cycles` (migration
-- 20260719000004's own notes) -- this migration confirms the SAME root
-- cause affects every other catalog-style policy in the schema (audited
-- by listing every live policy via `pg_policies` before writing this,
-- not guessed).
--
-- **Why this is NOT fixed by changing `check_vpra()`'s own NULL handling
-- directly**: `profiles.org_unit_id` is genuinely nullable in this schema
-- (e.g. a bootstrap `super_admin` account with no department), and every
-- PER-ROW org-scoped table (`evaluations`, `goals`, `bau_tasks`,
-- `promotions`, `rewards`, `vacancies`, `calibration_sessions`,
-- `profiles` itself, ...) calls `check_vpra()` with a 3rd argument
-- resolved from a real employee's `org_unit_id`, which CAN legitimately
-- be NULL for an employee with no org unit assigned yet. If NULL were
-- simply treated as "scope passes," an `org_unit`-scoped manager would
-- gain unscoped access to every unassigned employee's evaluations/goals/
-- promotions/etc. -- a real security regression, not a fix. NULL means
-- two different things depending on the table (this table has no
-- org-unit concept at all, vs. this specific row's owner has no org unit
-- yet), and `check_vpra()` can't tell those apart from the argument
-- alone -- so the fix has to be at the CALL SITE, encoding which meaning
-- applies, not inside the shared function's NULL handling.
--
-- **The fix**: a new, distinctly-named function `check_vpra_global(
-- process_area, level)` -- identical VPRA-level comparison logic to
-- `check_vpra()`, but NO scope/org_unit condition at all, since these
-- tables have no per-row org unit to scope against in the first place;
-- holding the required level at ANY `scope_type` (including `org_unit`)
-- is sufficient. Every policy that was calling bare 2-argument
-- `check_vpra(...)` is redefined to call `check_vpra_global(...)`
-- instead; every 3-argument call site (the real per-row org-scoped
-- tables) is left completely untouched.
--
-- **A same-name 2-argument overload of `check_vpra` was deliberately
-- NOT used** -- Postgres would consider it ambiguous against the
-- existing 3-argument version's `DEFAULT NULL`, since both would match
-- a 2-argument call.
--
-- **The originally-planned safety rail (removing `check_vpra`'s 3rd-
-- argument `DEFAULT NULL` so a future accidental 2-argument call fails
-- loudly) was attempted and then DELIBERATELY DROPPED after a real
-- failure surfaced applying it, not silently abandoned**: Postgres
-- refuses `CREATE OR REPLACE FUNCTION` when it would remove an existing
-- parameter default ("cannot remove parameter defaults from existing
-- function"), requiring `DROP FUNCTION` first -- but `DROP FUNCTION
-- check_vpra(...)` would fail too (or, with `CASCADE`, silently drop
-- every one of the ~15 OTHER real RLS policies across evaluations,
-- goals, bau_tasks, promotions, rewards, vacancies, calibration_*,
-- profiles, org_units, audit_log that call the 3-argument form and
-- depend on this exact function), forcing this migration to also
-- redefine every one of those unrelated policies just to keep the
-- safety rail -- a blast radius far beyond "catalog tables," and a
-- direct violation of PROJECT_STRICT.md's "patch not rewrite -- no
-- changes outside Scope even if you notice a problem" rule. `check_vpra`
-- itself is therefore left completely untouched by this migration; the
-- safety rail is deferred as its own explicitly-flagged follow-up (would
-- need its own dedicated migration that also re-verifies every 3-argument
-- policy, not a two-line addition to this one).
--
-- `EXECUTE` on `check_vpra_global` is revoked from `PUBLIC`/`anon` and
-- granted to `authenticated` only, same lesson as every other
-- `SECURITY DEFINER` function in this project.
-- ============================================================================

BEGIN;

CREATE FUNCTION check_vpra_global(p_process_area process_area, p_min_level vpra_level)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id AND r.deleted_at IS NULL
    JOIN role_permissions rp
      ON rp.role_id = ur.role_id
     AND rp.process_area = p_process_area
    WHERE ur.user_id = auth.uid()
      AND CASE rp.vpra_level
            WHEN 'none' THEN 0 WHEN 'view' THEN 1 WHEN 'prepare' THEN 2
            WHEN 'recommend' THEN 3 WHEN 'approve' THEN 4
          END
          >=
          CASE p_min_level
            WHEN 'none' THEN 0 WHEN 'view' THEN 1 WHEN 'prepare' THEN 2
            WHEN 'recommend' THEN 3 WHEN 'approve' THEN 4
          END
      -- No scope_type/org_unit condition at all -- this function is only
      -- ever called for university-wide catalog tables with no per-row
      -- org unit to scope against, so the VPRA level check alone governs.
  );
$$;

REVOKE ALL ON FUNCTION check_vpra_global(process_area, vpra_level) FROM PUBLIC;
REVOKE ALL ON FUNCTION check_vpra_global(process_area, vpra_level) FROM anon;
GRANT EXECUTE ON FUNCTION check_vpra_global(process_area, vpra_level) TO authenticated;

-- check_vpra() itself is deliberately NOT modified in this migration --
-- see the header comment above for why the originally-planned
-- DEFAULT-removal safety rail was dropped after a real CASCADE-risk
-- finding, not silently skipped.

-- ============================================================================
-- career_path
-- ============================================================================
DROP POLICY career_path_select ON career_path;
CREATE POLICY career_path_select ON career_path
  FOR SELECT TO authenticated
  USING (check_vpra_global('careerPath'::process_area, 'view'::vpra_level));

DROP POLICY career_path_insert ON career_path;
CREATE POLICY career_path_insert ON career_path
  FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('careerPath'::process_area, 'prepare'::vpra_level));

DROP POLICY career_path_update ON career_path;
CREATE POLICY career_path_update ON career_path
  FOR UPDATE TO authenticated
  USING (check_vpra_global('careerPath'::process_area, 'prepare'::vpra_level))
  WITH CHECK (check_vpra_global('careerPath'::process_area, 'prepare'::vpra_level));

-- ============================================================================
-- competencies
-- ============================================================================
DROP POLICY competencies_select ON competencies;
CREATE POLICY competencies_select ON competencies
  FOR SELECT TO authenticated
  USING (check_vpra_global('competencyFramework'::process_area, 'view'::vpra_level));

DROP POLICY competencies_insert ON competencies;
CREATE POLICY competencies_insert ON competencies
  FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('competencyFramework'::process_area, 'prepare'::vpra_level));

DROP POLICY competencies_update ON competencies;
CREATE POLICY competencies_update ON competencies
  FOR UPDATE TO authenticated
  USING (check_vpra_global('competencyFramework'::process_area, 'prepare'::vpra_level))
  WITH CHECK (check_vpra_global('competencyFramework'::process_area, 'prepare'::vpra_level));

-- ============================================================================
-- competency_domains
-- ============================================================================
DROP POLICY competency_domains_select ON competency_domains;
CREATE POLICY competency_domains_select ON competency_domains
  FOR SELECT TO authenticated
  USING (check_vpra_global('competencyFramework'::process_area, 'view'::vpra_level));

DROP POLICY competency_domains_insert ON competency_domains;
CREATE POLICY competency_domains_insert ON competency_domains
  FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('competencyFramework'::process_area, 'prepare'::vpra_level));

DROP POLICY competency_domains_update ON competency_domains;
CREATE POLICY competency_domains_update ON competency_domains
  FOR UPDATE TO authenticated
  USING (check_vpra_global('competencyFramework'::process_area, 'prepare'::vpra_level))
  WITH CHECK (check_vpra_global('competencyFramework'::process_area, 'prepare'::vpra_level));

DROP POLICY competency_domains_delete ON competency_domains;
CREATE POLICY competency_domains_delete ON competency_domains
  FOR DELETE TO authenticated
  USING (check_vpra_global('competencyFramework'::process_area, 'approve'::vpra_level));

-- ============================================================================
-- competency_levels
-- ============================================================================
DROP POLICY competency_levels_select ON competency_levels;
CREATE POLICY competency_levels_select ON competency_levels
  FOR SELECT TO authenticated
  USING (check_vpra_global('competencyFramework'::process_area, 'view'::vpra_level));

DROP POLICY competency_levels_insert ON competency_levels;
CREATE POLICY competency_levels_insert ON competency_levels
  FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('competencyFramework'::process_area, 'prepare'::vpra_level));

DROP POLICY competency_levels_update ON competency_levels;
CREATE POLICY competency_levels_update ON competency_levels
  FOR UPDATE TO authenticated
  USING (check_vpra_global('competencyFramework'::process_area, 'prepare'::vpra_level))
  WITH CHECK (check_vpra_global('competencyFramework'::process_area, 'prepare'::vpra_level));

DROP POLICY competency_levels_delete ON competency_levels;
CREATE POLICY competency_levels_delete ON competency_levels
  FOR DELETE TO authenticated
  USING (check_vpra_global('competencyFramework'::process_area, 'approve'::vpra_level));

-- ============================================================================
-- competency_pillars
-- ============================================================================
DROP POLICY competency_pillars_select ON competency_pillars;
CREATE POLICY competency_pillars_select ON competency_pillars
  FOR SELECT TO authenticated
  USING (check_vpra_global('competencyFramework'::process_area, 'view'::vpra_level));

DROP POLICY competency_pillars_insert ON competency_pillars;
CREATE POLICY competency_pillars_insert ON competency_pillars
  FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('competencyFramework'::process_area, 'prepare'::vpra_level));

DROP POLICY competency_pillars_update ON competency_pillars;
CREATE POLICY competency_pillars_update ON competency_pillars
  FOR UPDATE TO authenticated
  USING (check_vpra_global('competencyFramework'::process_area, 'prepare'::vpra_level))
  WITH CHECK (check_vpra_global('competencyFramework'::process_area, 'prepare'::vpra_level));

DROP POLICY competency_pillars_delete ON competency_pillars;
CREATE POLICY competency_pillars_delete ON competency_pillars
  FOR DELETE TO authenticated
  USING (check_vpra_global('competencyFramework'::process_area, 'approve'::vpra_level));

-- ============================================================================
-- evaluation_cycles
-- ============================================================================
DROP POLICY evaluation_cycles_select ON evaluation_cycles;
CREATE POLICY evaluation_cycles_select ON evaluation_cycles
  FOR SELECT TO authenticated
  USING (check_vpra_global('evaluation'::process_area, 'view'::vpra_level));

DROP POLICY evaluation_cycles_insert ON evaluation_cycles;
CREATE POLICY evaluation_cycles_insert ON evaluation_cycles
  FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('evaluation'::process_area, 'approve'::vpra_level));

DROP POLICY evaluation_cycles_update ON evaluation_cycles;
CREATE POLICY evaluation_cycles_update ON evaluation_cycles
  FOR UPDATE TO authenticated
  USING (check_vpra_global('evaluation'::process_area, 'approve'::vpra_level))
  WITH CHECK (check_vpra_global('evaluation'::process_area, 'approve'::vpra_level));

-- ============================================================================
-- goal_library
-- ============================================================================
DROP POLICY goal_library_select ON goal_library;
CREATE POLICY goal_library_select ON goal_library
  FOR SELECT TO authenticated
  USING (check_vpra_global('goalsLibrary'::process_area, 'view'::vpra_level));

DROP POLICY goal_library_insert ON goal_library;
CREATE POLICY goal_library_insert ON goal_library
  FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('goalsLibrary'::process_area, 'prepare'::vpra_level));

DROP POLICY goal_library_update ON goal_library;
CREATE POLICY goal_library_update ON goal_library
  FOR UPDATE TO authenticated
  USING (check_vpra_global('goalsLibrary'::process_area, 'prepare'::vpra_level))
  WITH CHECK (check_vpra_global('goalsLibrary'::process_area, 'prepare'::vpra_level));

-- ============================================================================
-- job_families
-- ============================================================================
DROP POLICY job_families_select ON job_families;
CREATE POLICY job_families_select ON job_families
  FOR SELECT TO authenticated
  USING (check_vpra_global('careerPath'::process_area, 'view'::vpra_level));

DROP POLICY job_families_insert ON job_families;
CREATE POLICY job_families_insert ON job_families
  FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('careerPath'::process_area, 'prepare'::vpra_level));

DROP POLICY job_families_update ON job_families;
CREATE POLICY job_families_update ON job_families
  FOR UPDATE TO authenticated
  USING (check_vpra_global('careerPath'::process_area, 'prepare'::vpra_level))
  WITH CHECK (check_vpra_global('careerPath'::process_area, 'prepare'::vpra_level));

DROP POLICY job_families_delete ON job_families;
CREATE POLICY job_families_delete ON job_families
  FOR DELETE TO authenticated
  USING (check_vpra_global('careerPath'::process_area, 'approve'::vpra_level));

-- ============================================================================
-- job_titles (careerPath OR employeeData -- the exact fix that surfaced this
-- whole systemic issue)
-- ============================================================================
DROP POLICY job_titles_select ON job_titles;
CREATE POLICY job_titles_select ON job_titles
  FOR SELECT TO authenticated
  USING (
    check_vpra_global('careerPath'::process_area, 'view'::vpra_level)
    OR check_vpra_global('employeeData'::process_area, 'view'::vpra_level)
  );

DROP POLICY job_titles_insert ON job_titles;
CREATE POLICY job_titles_insert ON job_titles
  FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('careerPath'::process_area, 'prepare'::vpra_level));

DROP POLICY job_titles_update ON job_titles;
CREATE POLICY job_titles_update ON job_titles
  FOR UPDATE TO authenticated
  USING (check_vpra_global('careerPath'::process_area, 'prepare'::vpra_level))
  WITH CHECK (check_vpra_global('careerPath'::process_area, 'prepare'::vpra_level));

-- ============================================================================
-- role_permissions
-- ============================================================================
DROP POLICY role_permissions_select ON role_permissions;
CREATE POLICY role_permissions_select ON role_permissions
  FOR SELECT TO authenticated
  USING (check_vpra_global('userManagement'::process_area, 'view'::vpra_level));

DROP POLICY role_permissions_insert ON role_permissions;
CREATE POLICY role_permissions_insert ON role_permissions
  FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('userManagement'::process_area, 'approve'::vpra_level));

DROP POLICY role_permissions_update ON role_permissions;
CREATE POLICY role_permissions_update ON role_permissions
  FOR UPDATE TO authenticated
  USING (check_vpra_global('userManagement'::process_area, 'approve'::vpra_level))
  WITH CHECK (check_vpra_global('userManagement'::process_area, 'approve'::vpra_level));

DROP POLICY role_permissions_delete ON role_permissions;
CREATE POLICY role_permissions_delete ON role_permissions
  FOR DELETE TO authenticated
  USING (check_vpra_global('userManagement'::process_area, 'approve'::vpra_level));

-- ============================================================================
-- roles
-- ============================================================================
DROP POLICY roles_select ON roles;
CREATE POLICY roles_select ON roles
  FOR SELECT TO authenticated
  USING (check_vpra_global('userManagement'::process_area, 'view'::vpra_level));

DROP POLICY roles_insert ON roles;
CREATE POLICY roles_insert ON roles
  FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('userManagement'::process_area, 'approve'::vpra_level));

DROP POLICY roles_update ON roles;
CREATE POLICY roles_update ON roles
  FOR UPDATE TO authenticated
  USING (check_vpra_global('userManagement'::process_area, 'approve'::vpra_level))
  WITH CHECK (check_vpra_global('userManagement'::process_area, 'approve'::vpra_level));

-- ============================================================================
-- salary_scale
-- ============================================================================
DROP POLICY salary_scale_select ON salary_scale;
CREATE POLICY salary_scale_select ON salary_scale
  FOR SELECT TO authenticated
  USING (
    check_vpra_global('careerPath'::process_area, 'view'::vpra_level)
    OR check_vpra_global('employeeData'::process_area, 'view'::vpra_level)
  );

DROP POLICY salary_scale_insert ON salary_scale;
CREATE POLICY salary_scale_insert ON salary_scale
  FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('careerPath'::process_area, 'prepare'::vpra_level));

DROP POLICY salary_scale_update ON salary_scale;
CREATE POLICY salary_scale_update ON salary_scale
  FOR UPDATE TO authenticated
  USING (check_vpra_global('careerPath'::process_area, 'prepare'::vpra_level))
  WITH CHECK (check_vpra_global('careerPath'::process_area, 'prepare'::vpra_level));

-- ============================================================================
-- user_roles (self-row OR check_vpra_global; INSERT/UPDATE/DELETE unchanged
-- in shape, just swapped to the global function)
-- ============================================================================
DROP POLICY user_roles_select ON user_roles;
CREATE POLICY user_roles_select ON user_roles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR check_vpra_global('userManagement'::process_area, 'view'::vpra_level)
  );

DROP POLICY user_roles_insert ON user_roles;
CREATE POLICY user_roles_insert ON user_roles
  FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('userManagement'::process_area, 'approve'::vpra_level));

DROP POLICY user_roles_update ON user_roles;
CREATE POLICY user_roles_update ON user_roles
  FOR UPDATE TO authenticated
  USING (check_vpra_global('userManagement'::process_area, 'approve'::vpra_level))
  WITH CHECK (check_vpra_global('userManagement'::process_area, 'approve'::vpra_level));

DROP POLICY user_roles_delete ON user_roles;
CREATE POLICY user_roles_delete ON user_roles
  FOR DELETE TO authenticated
  USING (check_vpra_global('userManagement'::process_area, 'approve'::vpra_level));

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: a real `manager` test user with `scope_type='org_unit'` (who
-- previously saw ZERO rows in job_titles/career_path/competencies/
-- evaluation_cycles/goal_library/salary_scale/job_families despite
-- holding real grants on those process areas) now sees them correctly,
-- identically to a scope_type='all' role holding the same level. Every
-- PER-ROW org-scoped table (evaluations, goals, bau_tasks, promotions,
-- rewards, vacancies, calibration_sessions, profiles, org_units)
-- continues to enforce real per-employee org-unit scoping completely
-- unchanged -- confirmed by re-running the exact adversarial scenarios
-- already verified for those tables (cross-org-unit isolation still
-- rejects an out-of-scope employee). A bare 2-argument call to
-- `check_vpra(process_area, level)` now fails with "function does not
-- exist," confirming the old silent-default footgun is closed.
