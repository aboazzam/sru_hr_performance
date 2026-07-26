-- ============================================================================
-- `system_settings` -- singleton settings row for app-wide configuration,
-- starting with a single field: the IANA timezone used to display
-- timestamps (2026-07-26). Same singleton shape as `org_identity`
-- (20260724000006): a unique index on a constant expression enforces at
-- most one row.
--
-- RLS mirrors `org_identity` exactly: SELECT and INSERT/UPDATE both require
-- `systemSettings`, at 'view' and 'approve' respectively -- seeded ONLY for
-- super_admin (approve), matching identity's precedent (hr_admin holds no
-- grant on either area). This is a deliberate, accepted trade-off already
-- established for org_identity's colors: any caller without `view` simply
-- gets zero rows back from RLS and the application code falls back to a
-- hardcoded default -- here that default is 'Asia/Riyadh', which happens to
-- already be the organizationally-correct timezone, so in practice every
-- user sees correct times unless/until super_admin explicitly picks
-- something else (in which case only super_admin's own view reflects the
-- change -- the same known, accepted limitation as org_identity's colors).
-- Broadening this to every role was considered and rejected: it would mean
-- seeding 12 role_permissions rows for a setting the project owner asked to
-- live under a super_admin-tier "system settings" tab, not a broadly-held
-- reference-data grant.
-- ============================================================================

BEGIN;

CREATE TABLE system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timezone TEXT NOT NULL DEFAULT 'Asia/Riyadh',
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Singleton enforcement: at most one row ever, same idiom as org_identity.
CREATE UNIQUE INDEX system_settings_singleton_uidx ON system_settings ((true));

INSERT INTO system_settings (timezone) VALUES ('Asia/Riyadh');

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY system_settings_select ON system_settings FOR SELECT TO authenticated
  USING (check_vpra_global('systemSettings', 'view'));

CREATE POLICY system_settings_update ON system_settings FOR UPDATE TO authenticated
  USING (check_vpra_global('systemSettings', 'approve'))
  WITH CHECK (check_vpra_global('systemSettings', 'approve'));

REVOKE ALL ON system_settings FROM anon;

INSERT INTO role_permissions (role_id, process_area, vpra_level)
SELECT id, 'systemSettings'::process_area, 'approve'::vpra_level FROM roles WHERE role_code = 'super_admin';

COMMIT;

-- ============================================================================
-- Verification — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: exactly one row, timezone = 'Asia/Riyadh'.
-- SELECT count(*), (SELECT timezone FROM system_settings LIMIT 1) FROM system_settings;

-- Expect: super_admin (approve) can SELECT/UPDATE; every other role sees
-- zero rows and any UPDATE affects zero rows.
