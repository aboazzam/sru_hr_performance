-- ============================================================================
-- profiles table + check_vpra() SECURITY DEFINER function
--
-- Source: SRU_System_Design.md §B "Core" (`profiles(id, employee_number,
-- full_name_ar, full_name_en, org_unit_id, job_title_id, hire_date, status,
-- deleted_at)`) and §C ("كل policy تتحقق من VPRA + Scope معاً ... عبر دالة
-- SECURITY DEFINER مركزية" — the `check_vpra(process_area, min_level,
-- target_org_unit)` sketch there is explicitly marked [استنتاج]/illustrative
-- only; the body below is a real, first implementation, not a transcription).
--
-- Scope (per PROJECT_STRICT.md protocol): this migration adds ONLY the
-- `profiles` table and the `check_vpra()` function (+ its
-- `is_org_unit_in_scope()` helper). It deliberately does NOT:
--   - Add RLS policies to `roles`/`role_permissions`/`user_roles`/
--     `org_units`/the competency_* tables. Migration 20260716000001's header
--     comment says those policies belong "in the migration that introduces
--     profiles and auth" — that phrasing is now stale. Writing them requires
--     real per-table access decisions (which VPRA level gates which action)
--     that the project owner hasn't made yet; inventing them here would
--     violate the "no change outside scope" rule. Follow-up migration.
--   - Add RLS policies to `profiles` itself beyond enabling RLS. Same
--     reasoning — even "a user can see their own row" is a real decision
--     (do soft-deleted profiles still self-select? does viewing require an
--     active auth session tied 1:1 to a profile row that may not exist yet
--     for an invited-but-not-yet-linked user?). Zero policies = default
--     deny, consistent with all three prior migrations.
--   - Add the auth.users -> profiles linking trigger described in
--     SRU_System_Design.md §C step 3 (invite flow). Separate concern from
--     the table/function shape.
--   - Add `job_titles` or its FK on `profiles.job_title_id` — that table
--     doesn't exist in this repo's migrations yet (same situation
--     `user_roles.org_unit_id` was in before `org_units` existed; see
--     20260716000001's header note). Plain UUID column, no FK, documented
--     inline below.
--
-- STATUS: to be applied and verified against the live project
-- (rrzrrytrdhgmypxjfbmw) via the Session Pooler connection, same as the
-- three prior migrations — NOT a draft-only file.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------

CREATE TYPE profile_status AS ENUM ('active', 'on_leave', 'terminated');

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE RESTRICT,
  employee_number TEXT NOT NULL UNIQUE,
  full_name_ar TEXT NOT NULL,
  full_name_en TEXT,
  org_unit_id UUID REFERENCES org_units (id) ON DELETE RESTRICT,
  job_title_id UUID, -- no FK yet: job_titles table doesn't exist in this repo's migrations yet.
  hire_date DATE,
  status profile_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE profiles IS 'SRU_System_Design.md §B. One row per auth.users identity. Soft-delete only (deleted_at) per CLAUDE.md §5-A rule 7 — never hard DELETE a profile.';
COMMENT ON CONSTRAINT profiles_id_fkey ON profiles IS 'RESTRICT, not CASCADE: hard-deleting the underlying auth.users row must not silently remove employee history. Soft-delete the profile (deleted_at) first if an identity truly needs to be retired.';
COMMENT ON CONSTRAINT profiles_org_unit_id_fkey ON profiles IS 'RESTRICT per SECURITY_CHECKLIST.md §1.4, same rationale as org_units.parent_id: deleting/reassigning an org unit that still has profiles pointing to it must fail loudly.';
COMMENT ON COLUMN profiles.job_title_id IS 'No FK: job_titles table (SRU_System_Design.md §B) has not been migrated yet. Add `ALTER TABLE profiles ADD CONSTRAINT ... FOREIGN KEY (job_title_id) REFERENCES job_titles(id)` once it exists.';

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- is_org_unit_in_scope — helper for check_vpra(): true when p_scope_org_unit
-- is p_target_org_unit itself or one of its ancestors in the org_units tree
-- (i.e. p_target_org_unit is within the subtree rooted at p_scope_org_unit).
-- Walks UP from the target via parent_id rather than down from the scope
-- unit, since org_units has no depth/path column to bound a downward
-- recursive search — an upward walk from a single row is bounded by the
-- tree's height regardless.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_org_unit_in_scope(p_target_org_unit UUID, p_scope_org_unit UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_id FROM org_units WHERE id = p_target_org_unit
    UNION ALL
    SELECT o.id, o.parent_id
    FROM org_units o
    JOIN ancestors a ON o.id = a.parent_id
  )
  SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = p_scope_org_unit);
$$;

COMMENT ON FUNCTION is_org_unit_in_scope IS 'SECURITY DEFINER so it can read org_units regardless of that table''s own RLS policies (currently zero = default deny). Called only from check_vpra().';

REVOKE ALL ON FUNCTION is_org_unit_in_scope(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_org_unit_in_scope(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- check_vpra — the central authorization check referenced by
-- SRU_System_Design.md §C and CLAUDE.md §5-A #4. Returns true iff the
-- CURRENT authenticated user (auth.uid()) holds, through at least one of
-- their role assignments, a role_permissions grant on p_process_area at or
-- above p_min_level, AND that assignment's scope covers p_target_org_unit:
--   - scope_type = 'all'                                -> always in scope
--   - scope_type = 'org_unit'                            -> in scope only if
--       p_target_org_unit is supplied AND is within that assignment's
--       org_unit subtree (via is_org_unit_in_scope above)
-- p_target_org_unit defaults to NULL for process areas that aren't
-- org-unit-scoped in practice (e.g. userManagement); an 'org_unit'-scoped
-- assignment can never satisfy an unscoped (NULL) check — that would be
-- assuming a scope match with no data to check it against.
--
-- Deliberately NOT modeled here: evaluation's per-lifecycle-state table
-- (CLAUDE.md §4-A) — that lives in src/lib/vpra.ts / a future
-- evaluation-specific RPC, exactly as 20260716000001's header already notes
-- for role_permissions. check_vpra() only ever answers the flat,
-- state-independent VPRA question.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_vpra(
  p_process_area process_area,
  p_min_level vpra_level,
  p_target_org_unit UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
      AND (
        ur.scope_type = 'all'
        OR (
          ur.scope_type = 'org_unit'
          AND p_target_org_unit IS NOT NULL
          AND ur.org_unit_id IS NOT NULL
          AND is_org_unit_in_scope(p_target_org_unit, ur.org_unit_id)
        )
      )
  );
$$;

COMMENT ON FUNCTION check_vpra IS 'CLAUDE.md §5-A #4 / SRU_System_Design.md §C central VPRA+scope check. SECURITY DEFINER so it can read roles/role_permissions/user_roles despite their zero-policy default-deny RLS. Every future RLS policy on business tables should call this rather than re-deriving role/scope logic inline.';

REVOKE ALL ON FUNCTION check_vpra(process_area, vpra_level, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_vpra(process_area, vpra_level, UUID) TO authenticated;

COMMIT;

-- ============================================================================
-- Verification queries — run these AFTER the migration and BEFORE trusting
-- it, per PROJECT_STRICT.md rule 10. Expected results noted inline.
-- ============================================================================

-- Expect: 1 row, rowsecurity = true.
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles';

-- Expect: 0 rows (confirms no accidental USING (true) policy exists on profiles).
-- SELECT tablename, policyname, qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles';

-- Expect: 2 rows (check_vpra, is_org_unit_in_scope), both prosecdef = true (SECURITY DEFINER).
-- SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('check_vpra', 'is_org_unit_in_scope');

-- Expect: false (no rows in user_roles/role_permissions yet for any user, so nothing can pass).
-- SELECT check_vpra('evaluation', 'view');

-- Expect: false in all cases (role_permissions is currently seeded empty per
-- 20260716000001 — this is proof the deny-by-default is real, not just
-- "no test data yet").
-- SELECT check_vpra('userManagement', 'none');
