-- ============================================================================
-- New "reports" process area (2026-07-25 request): the project owner asked
-- for the Reports tab to move into the "الإدارة" (Administration) module and
-- become independently grantable from /admin's permission matrix, rather
-- than piggybacking on the general `evaluation` grant it used before --
-- "بحيث عند الاتاحة للمشاهدة يطلع على الارقام الخاصة به" (so the numbers
-- only show once view access is explicitly granted).
--
-- Deliberately seeded with ZERO role_permissions rows, per CLAUDE.md §4-B's
-- own rule ("new roles inherit none on all Process Areas by default -- least
-- privilege") -- this is effectively a brand-new area, and the request's own
-- wording frames granting it as a deliberate future action the project owner
-- takes through the already-built role editor at /admin, not something to
-- guess a default for here. Every role currently sees NOTHING on /reports
-- until explicitly granted `reports>=view` there.
-- ============================================================================

BEGIN;

ALTER TYPE process_area ADD VALUE 'reports';

COMMIT;

-- ============================================================================
-- Verification — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 'reports' now a valid label.
-- SELECT enum_range(NULL::process_area);

-- Expect: false for every role until explicitly granted.
-- SELECT check_vpra_global('reports', 'view');
