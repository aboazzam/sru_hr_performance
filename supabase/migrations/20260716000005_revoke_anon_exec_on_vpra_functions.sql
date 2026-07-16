-- ============================================================================
-- Fix: anon could still EXECUTE check_vpra()/is_org_unit_in_scope()
--
-- 20260716000004 intended to lock both functions down to `authenticated`
-- only via `REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE ... TO
-- authenticated`. Verified after applying that migration
-- (has_function_privilege('anon', 'check_vpra(...)', 'EXECUTE') returned
-- true) that this did NOT work: this Supabase project has `ALTER DEFAULT
-- PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,
-- authenticated, service_role` configured at the project level, which grants
-- EXECUTE directly to `anon` (and `authenticated`/`service_role`) at
-- CREATE FUNCTION time — independent of, and not undone by, revoking the
-- PUBLIC pseudo-role's privilege.
--
-- Functionally this was not an exploitable data leak (check_vpra() derives
-- everything from auth.uid(), which is NULL for anon/unauthenticated
-- requests, so it always returns false regardless of caller) — but it
-- violates the least-privilege intent stated in CLAUDE.md §5-A #3 ("anon
-- role has NO access") and in 20260716000004's own comments. Explicit
-- REVOKE FROM anon closes the gap for real this time.
-- ============================================================================

BEGIN;

REVOKE EXECUTE ON FUNCTION check_vpra(process_area, vpra_level, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION is_org_unit_in_scope(UUID, UUID) FROM anon;

COMMIT;

-- ============================================================================
-- Verification — run AFTER and BEFORE trusting, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: both false.
-- SELECT has_function_privilege('anon', 'check_vpra(process_area, vpra_level, uuid)', 'EXECUTE') AS anon_check_vpra,
--        has_function_privilege('anon', 'is_org_unit_in_scope(uuid, uuid)', 'EXECUTE') AS anon_is_org_unit_in_scope;

-- Expect: both true (authenticated access must remain intact).
-- SELECT has_function_privilege('authenticated', 'check_vpra(process_area, vpra_level, uuid)', 'EXECUTE') AS authenticated_check_vpra,
--        has_function_privilege('authenticated', 'is_org_unit_in_scope(uuid, uuid)', 'EXECUTE') AS authenticated_is_org_unit_in_scope;
