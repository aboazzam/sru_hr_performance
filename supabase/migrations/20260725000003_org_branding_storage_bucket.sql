-- ============================================================================
-- `org-branding` Storage bucket for the real logo file upload the project
-- owner asked for (2026-07-25): "بالنسبة للشعار ضع زر لرفع الشعار" (for the
-- logo, add a button to upload it) — logo_url was a plain text URL input
-- until now (no Storage bucket existed anywhere in this project, per the
-- same reasoning already documented for the My Profile avatar placeholder).
--
-- Public bucket: logo images are meant to be visible wherever the identity
-- page/branding is shown, so `public = true` serves them via Storage's own
-- public URL endpoint without needing signed URLs. `storage.objects` RLS
-- (confirmed live before writing this: enabled, zero existing policies —
-- same deny-by-default discipline as every other table in this schema)
-- still gates the actual read/write API paths through this app, scoped to
-- this one bucket only, using the same `identity` process area
-- `org_identity` itself now uses (20260725000001/2) — approve to
-- upload/replace/delete, view to read via the authenticated API path.
-- ============================================================================

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('org-branding', 'org-branding', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY org_branding_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'org-branding' AND check_vpra_global('identity', 'view'));

CREATE POLICY org_branding_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'org-branding' AND check_vpra_global('identity', 'approve'));

CREATE POLICY org_branding_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'org-branding' AND check_vpra_global('identity', 'approve'))
  WITH CHECK (bucket_id = 'org-branding' AND check_vpra_global('identity', 'approve'));

CREATE POLICY org_branding_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'org-branding' AND check_vpra_global('identity', 'approve'));

COMMIT;

-- ============================================================================
-- Verification — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 1 row, public = true.
-- SELECT id, public FROM storage.buckets WHERE id = 'org-branding';

-- Expect: super_admin (identity=approve) can upload; hr_admin (no identity
-- grant) is rejected.
