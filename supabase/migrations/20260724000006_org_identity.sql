-- ============================================================================
-- `org_identity` -- singleton settings row for the institution's visual
-- identity (logo + brand colors), backing the new "الهوية" (Identity) page
-- under the "الإدارة" (Administration) group (2026-07-24). The project
-- owner clarified directly: "الهوية تقصد بها الشعار وألوان الهوية البصرية
-- للمؤسسة" (Identity means the logo and the institution's brand colors).
--
-- `logo_url` is a plain text URL, not a file upload -- no Supabase Storage
-- bucket exists anywhere in this project yet (the My Profile avatar is
-- still a generic icon placeholder for the same reason, 2026-07-22). Real
-- file upload is a separate, larger follow-up, not invented here.
--
-- Deliberately the FIRST real use of the recommend/approve split just
-- introduced for orgStructure (20260724000004): SELECT requires
-- orgStructure>=view (anyone who can reach the الإدارة group at all can
-- see the current identity), but UPDATE requires orgStructure>=approve --
-- today that's super_admin ONLY, not hr_admin (which holds 'recommend').
-- This is a deliberate [استنتاج]: branding/identity is a top-level
-- executive decision distinct from hr_admin's day-to-day "build the org
-- structure" capability, not separately confirmed with the project owner
-- beyond the recommend/approve split itself being their own explicit ask.
-- ============================================================================

BEGIN;

CREATE TABLE org_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logo_url TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Singleton enforcement: at most one row ever. A partial unique index on a
-- constant expression is the standard Postgres idiom for this.
CREATE UNIQUE INDEX org_identity_singleton_uidx ON org_identity ((true));

ALTER TABLE org_identity ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_identity_select ON org_identity FOR SELECT TO authenticated
  USING (check_vpra_global('orgStructure', 'view'));

CREATE POLICY org_identity_insert ON org_identity FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('orgStructure', 'approve'));

CREATE POLICY org_identity_update ON org_identity FOR UPDATE TO authenticated
  USING (check_vpra_global('orgStructure', 'approve'))
  WITH CHECK (check_vpra_global('orgStructure', 'approve'));

REVOKE ALL ON org_identity FROM anon;

COMMIT;

-- ============================================================================
-- Verification -- run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: a second INSERT fails with a unique-violation (singleton).
-- Expect: hr_admin (orgStructure=recommend) can SELECT but INSERT/UPDATE
-- are rejected; super_admin (orgStructure=approve) can do all three.
