-- ============================================================================
-- First real RLS policies — replacing the deliberate zero-policy default-deny
-- on all 9 existing business tables with actual check_vpra()-gated rules.
--
-- Source: CLAUDE.md §5-A #2/#4 ("policies must be specific, never
-- USING (true)"; "server-side VPRA+scope check") and SRU_System_Design.md §C.
-- check_vpra()/is_org_unit_in_scope() were built in 20260716000004 for
-- exactly this purpose.
--
-- ----------------------------------------------------------------------------
-- [استنتاج] Business-rule assumptions made in this migration — none of these
-- are written down anywhere else; flagging each explicitly per
-- PROJECT_STRICT.md rather than silently deciding them:
--
-- 1. process_area mapping per table:
--      roles, role_permissions, user_roles       -> 'userManagement'
--      competency_pillars/domains/competencies/
--        competency_levels                        -> 'competencyFramework'
--      org_units, profiles                        -> 'employeeData'
--    roles/role_permissions/user_roles and competencyFramework map directly
--    to CLAUDE.md §4's named process areas. org_units has NO dedicated
--    process area anywhere in CLAUDE.md/SRU_System_Design.md — 'employeeData'
--    ("Employee Master Data") is the closest existing fit, not a documented
--    decision. Confirm with the project owner; do not treat as settled.
--
-- 2. Write level per table: 'approve' for roles/role_permissions/user_roles/
--    org_units (structural/system config — mistakes here are the most
--    costly, and none of these has a documented draft-then-approve
--    workflow the way `evaluation` does); 'prepare' for the competency
--    framework and profiles (content/master-data edits — lower stakes,
--    'prepare' = "create/edit drafts" per CLAUDE.md §4 fits directly).
--    No table here has a 'recommend' step modeled — none of them are staged
--    workflows like the evaluation lifecycle.
--
-- 3. DELETE policy exists ONLY on tables with no `deleted_at` column
--    (competency_pillars, competency_domains, competency_levels,
--    role_permissions, user_roles) — for those, hard DELETE is the only way
--    to remove a row and none of them are "users/employees" under CLAUDE.md
--    §5-A rule 7's soft-delete mandate (role_permissions/user_roles are
--    permission-grant rows; competency_pillars/domains/levels are reference
--    content). Tables that DO have `deleted_at` (roles, org_units,
--    competencies, profiles) get NO DELETE policy at all — removal there
--    must go through the UPDATE policy setting `deleted_at`, per rule 7.
--
-- 4. `profiles`/`user_roles` SELECT additionally allow a user to always read
--    their OWN row (`id = auth.uid()` / `user_id = auth.uid()`), independent
--    of check_vpra. Standard in virtually every RBAC system (you can always
--    see yourself) and orthogonal to the permission matrix by design — not
--    gated behind role_permissions since a brand-new user may have no
--    permissions seeded yet and still needs to load their own profile/roles
--    to render anything at all. No self-UPDATE granted on either table:
--    profiles' own fields (org_unit_id, job_title_id, status...) and role
--    assignments are HR/admin actions, not self-service edits.
--
-- 5. `check_vpra()` calls in this migration omit `target_org_unit` (pass
--    NULL) for roles/role_permissions/user_roles/the competency framework,
--    because none of those tables carry a per-row org_unit_id — they are
--    global config, not org-scoped data. Consequence (by check_vpra's own
--    design, not new here): an 'org_unit'-scoped role assignment can NEVER
--    satisfy these checks, only a 'all'-scope assignment can. That's a
--    deliberate outcome: a dean scoped to one college should not be able to
--    redefine the university-wide competency framework or role matrix.
--    org_units and profiles DO carry a real org_unit_id per row, so their
--    policies pass one (see per-table sections below for exactly which).
--
-- 6. IMPORTANT immediate consequence of this migration: `role_permissions`
--    is still seeded EMPTY (20260716000001's deliberate choice — the
--    12-role x 12-area matrix needs the project owner's explicit
--    role-by-role decision). Until it is populated, check_vpra() returns
--    false for literally everyone on every process area, so every table
--    touched here remains 100% inaccessible to every role — functionally
--    identical to the current zero-policy state, but now via the real
--    mechanism instead of an empty policy list. This is expected, not a bug
--    to chase.
-- ----------------------------------------------------------------------------
--
-- Also discovered (NOT fixed here — recorded as tech debt per
-- PROJECT_STRICT.md rule 12, out of this migration's scope): this Supabase
-- project's `ALTER DEFAULT PRIVILEGES` grants `anon`/`authenticated` full
-- table-level SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on
-- EVERY table in `public`, including TRUNCATE (which bypasses RLS entirely
-- in Postgres — RLS does not gate TRUNCATE). Not exploitable through the
-- normal Supabase client/PostgREST today (PostgREST's REST surface never
-- issues TRUNCATE), so this migration's policies remain effective in
-- practice, but it is a real least-privilege gap worth a project-level fix
-- (e.g. `REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon,
-- authenticated`, or reconsidering the default-privilege grant itself).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- roles
-- ----------------------------------------------------------------------------

CREATE POLICY roles_select ON roles FOR SELECT TO authenticated
  USING (check_vpra('userManagement', 'view'));

CREATE POLICY roles_insert ON roles FOR INSERT TO authenticated
  WITH CHECK (check_vpra('userManagement', 'approve'));

CREATE POLICY roles_update ON roles FOR UPDATE TO authenticated
  USING (check_vpra('userManagement', 'approve'))
  WITH CHECK (check_vpra('userManagement', 'approve'));

-- ----------------------------------------------------------------------------
-- role_permissions (no deleted_at -> real DELETE allowed, see note 3 above)
-- ----------------------------------------------------------------------------

CREATE POLICY role_permissions_select ON role_permissions FOR SELECT TO authenticated
  USING (check_vpra('userManagement', 'view'));

CREATE POLICY role_permissions_insert ON role_permissions FOR INSERT TO authenticated
  WITH CHECK (check_vpra('userManagement', 'approve'));

CREATE POLICY role_permissions_update ON role_permissions FOR UPDATE TO authenticated
  USING (check_vpra('userManagement', 'approve'))
  WITH CHECK (check_vpra('userManagement', 'approve'));

CREATE POLICY role_permissions_delete ON role_permissions FOR DELETE TO authenticated
  USING (check_vpra('userManagement', 'approve'));

-- ----------------------------------------------------------------------------
-- user_roles (no deleted_at -> real DELETE allowed; SELECT also allows
-- reading one's own assignment rows, see note 4 above)
-- ----------------------------------------------------------------------------

CREATE POLICY user_roles_select ON user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR check_vpra('userManagement', 'view'));

CREATE POLICY user_roles_insert ON user_roles FOR INSERT TO authenticated
  WITH CHECK (check_vpra('userManagement', 'approve'));

CREATE POLICY user_roles_update ON user_roles FOR UPDATE TO authenticated
  USING (check_vpra('userManagement', 'approve'))
  WITH CHECK (check_vpra('userManagement', 'approve'));

CREATE POLICY user_roles_delete ON user_roles FOR DELETE TO authenticated
  USING (check_vpra('userManagement', 'approve'));

-- ----------------------------------------------------------------------------
-- org_units — [استنتاج] process_area = 'employeeData' (see note 1). Each row
-- IS an org unit, so its own `id` is the natural target_org_unit for
-- SELECT/UPDATE. INSERT checks the NEW row's `parent_id` instead (a
-- not-yet-placed new unit has no scope of its own; you may only attach a
-- child under a parent that's within your scope). UPDATE's WITH CHECK also
-- re-checks the (possibly changed) parent_id, so re-parenting a unit you
-- own to somewhere outside your scope is blocked. Has deleted_at -> no
-- DELETE policy (soft-delete via UPDATE only, see note 3).
-- ----------------------------------------------------------------------------

CREATE POLICY org_units_select ON org_units FOR SELECT TO authenticated
  USING (check_vpra('employeeData', 'view', id));

CREATE POLICY org_units_insert ON org_units FOR INSERT TO authenticated
  WITH CHECK (check_vpra('employeeData', 'approve', parent_id));

CREATE POLICY org_units_update ON org_units FOR UPDATE TO authenticated
  USING (check_vpra('employeeData', 'approve', id))
  WITH CHECK (check_vpra('employeeData', 'approve', parent_id));

-- ----------------------------------------------------------------------------
-- competency_pillars / competency_domains / competency_levels
-- (no deleted_at -> real DELETE allowed, see note 3). No org_unit_id on any
-- of these -> target_org_unit omitted (NULL), see note 5.
-- ----------------------------------------------------------------------------

CREATE POLICY competency_pillars_select ON competency_pillars FOR SELECT TO authenticated
  USING (check_vpra('competencyFramework', 'view'));
CREATE POLICY competency_pillars_insert ON competency_pillars FOR INSERT TO authenticated
  WITH CHECK (check_vpra('competencyFramework', 'prepare'));
CREATE POLICY competency_pillars_update ON competency_pillars FOR UPDATE TO authenticated
  USING (check_vpra('competencyFramework', 'prepare'))
  WITH CHECK (check_vpra('competencyFramework', 'prepare'));
CREATE POLICY competency_pillars_delete ON competency_pillars FOR DELETE TO authenticated
  USING (check_vpra('competencyFramework', 'approve'));

CREATE POLICY competency_domains_select ON competency_domains FOR SELECT TO authenticated
  USING (check_vpra('competencyFramework', 'view'));
CREATE POLICY competency_domains_insert ON competency_domains FOR INSERT TO authenticated
  WITH CHECK (check_vpra('competencyFramework', 'prepare'));
CREATE POLICY competency_domains_update ON competency_domains FOR UPDATE TO authenticated
  USING (check_vpra('competencyFramework', 'prepare'))
  WITH CHECK (check_vpra('competencyFramework', 'prepare'));
CREATE POLICY competency_domains_delete ON competency_domains FOR DELETE TO authenticated
  USING (check_vpra('competencyFramework', 'approve'));

CREATE POLICY competency_levels_select ON competency_levels FOR SELECT TO authenticated
  USING (check_vpra('competencyFramework', 'view'));
CREATE POLICY competency_levels_insert ON competency_levels FOR INSERT TO authenticated
  WITH CHECK (check_vpra('competencyFramework', 'prepare'));
CREATE POLICY competency_levels_update ON competency_levels FOR UPDATE TO authenticated
  USING (check_vpra('competencyFramework', 'prepare'))
  WITH CHECK (check_vpra('competencyFramework', 'prepare'));
CREATE POLICY competency_levels_delete ON competency_levels FOR DELETE TO authenticated
  USING (check_vpra('competencyFramework', 'approve'));

-- ----------------------------------------------------------------------------
-- competencies — has deleted_at -> no DELETE policy (soft-delete via UPDATE
-- only, see note 3). DELETE-level removal above (pillars/domains/levels) is
-- 'approve'; here 'prepare' also governs UPDATE (which is how a soft-delete
-- happens: UPDATE ... SET deleted_at = now()), consistent with the write
-- level chosen for the rest of the competency framework.
-- ----------------------------------------------------------------------------

CREATE POLICY competencies_select ON competencies FOR SELECT TO authenticated
  USING (check_vpra('competencyFramework', 'view'));
CREATE POLICY competencies_insert ON competencies FOR INSERT TO authenticated
  WITH CHECK (check_vpra('competencyFramework', 'prepare'));
CREATE POLICY competencies_update ON competencies FOR UPDATE TO authenticated
  USING (check_vpra('competencyFramework', 'prepare'))
  WITH CHECK (check_vpra('competencyFramework', 'prepare'));

-- ----------------------------------------------------------------------------
-- profiles — [استنتاج] process_area = 'employeeData' (see note 1).
-- org_unit_id is each row's own scope target. SELECT also allows reading
-- one's own profile regardless of check_vpra (see note 4). Has deleted_at
-- -> no DELETE policy (soft-delete via UPDATE only, see note 3). UPDATE's
-- WITH CHECK re-checks org_unit_id so moving a profile to an org unit
-- outside the caller's scope is blocked, same reasoning as org_units above.
-- ----------------------------------------------------------------------------

CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR check_vpra('employeeData', 'view', org_unit_id));

CREATE POLICY profiles_insert ON profiles FOR INSERT TO authenticated
  WITH CHECK (check_vpra('employeeData', 'prepare', org_unit_id));

CREATE POLICY profiles_update ON profiles FOR UPDATE TO authenticated
  USING (check_vpra('employeeData', 'prepare', org_unit_id))
  WITH CHECK (check_vpra('employeeData', 'prepare', org_unit_id));

COMMIT;

-- ============================================================================
-- Verification queries — run these AFTER the migration and BEFORE trusting
-- it, per PROJECT_STRICT.md rule 10. Expected results noted inline.
-- ============================================================================

-- Expect: 9 rows, rowsecurity = true for all (unchanged from prior
-- migrations, just re-confirming nothing regressed).
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'
--   AND tablename IN ('roles','role_permissions','user_roles','org_units',
--     'competency_pillars','competency_domains','competencies',
--     'competency_levels','profiles');

-- Expect: 30 rows total (3+4+4+3+4+4+4+3+3), zero of them with
-- qual/with_check literally = 'true' (confirms no accidental USING (true)).
-- SELECT tablename, count(*), bool_or(qual = 'true') AS any_using_true,
--        bool_or(with_check = 'true') AS any_with_check_true
--   FROM pg_policies WHERE schemaname = 'public' GROUP BY tablename ORDER BY tablename;

-- Expect: false for every one of these (role_permissions is still empty,
-- so nobody has any grant yet -- proves default-deny is real end-to-end,
-- not just "policy exists").
-- SELECT
--   (SELECT count(*) FROM roles) AS roles_visible_should_be_0,
--   (SELECT count(*) FROM role_permissions) AS role_permissions_visible_should_be_0,
--   (SELECT count(*) FROM user_roles) AS user_roles_visible_should_be_0,
--   (SELECT count(*) FROM org_units) AS org_units_visible_should_be_0,
--   (SELECT count(*) FROM competencies) AS competencies_visible_should_be_0,
--   (SELECT count(*) FROM profiles) AS profiles_visible_should_be_0;
-- (Run this as a role with `SET ROLE authenticated;` and a fake
-- `SET request.jwt.claims...`/auth.uid() context, or simply trust that
-- postgres/superuser bypasses RLS so this must be re-verified through
-- Supabase's SQL editor "run as authenticated" or the actual app once wired
-- up -- a superuser psql session, like the one used to apply this
-- migration, ignores RLS entirely and is NOT a valid way to test these
-- policies. See note below.)
