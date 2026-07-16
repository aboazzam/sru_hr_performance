-- ============================================================================
-- Fix: strategy_admin was missing a `vacancies` grant
--
-- Follow-up correction from reviewing 20260716000007's matrix (per the
-- project owner, 2026-07-16): strategy_admin had `view` on 9 of 12 process
-- areas but not `vacancies`, even though workforce/headcount planning is a
-- standard strategy-office responsibility, and SRU's own org chart
-- (20260716000003's seed data) places "مكتب إدارة الاستراتيجية" directly
-- under the president. Confirmed by the project owner — not a unilateral
-- addition.
-- ============================================================================

BEGIN;

INSERT INTO role_permissions (role_id, process_area, vpra_level)
SELECT r.id, 'vacancies'::process_area, 'view'::vpra_level
FROM roles r WHERE r.role_code = 'strategy_admin';

COMMIT;

-- ============================================================================
-- Verification — run AFTER and BEFORE trusting, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 108 (107 + this 1 new row).
-- SELECT count(*) FROM role_permissions;

-- Expect: 1 row, vpra_level = 'view'.
-- SELECT rp.vpra_level FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
--   WHERE r.role_code = 'strategy_admin' AND rp.process_area = 'vacancies';
