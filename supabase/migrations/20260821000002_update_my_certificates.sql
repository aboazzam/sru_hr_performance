-- Self-service: a user maintains their OWN certificates (2026-08-21)
--
-- `profiles.certificates` arrived yesterday (20260821000001) but only the two
-- employee-admin forms could fill it, so an employee could read their
-- certificates and not correct them. The request is exactly that: let the
-- employee edit them from their own profile.
--
-- Why an RPC and not a new branch on `profiles_update`: that policy is
-- row-level, and a row-level "you may update your own profile" branch would
-- let a caller change ANY column on that row — org unit, job title, employee
-- number, supervisor. RLS cannot express "this column only". A narrow
-- SECURITY DEFINER function can, and it is the pattern this schema already
-- uses for self-service writes (clear_must_change_password, 20260725000007).
--
-- The function takes no profile id: the row is found by auth.uid(), so there
-- is nothing to tamper with. The length cap keeps a runaway paste from
-- becoming an unbounded row.
CREATE OR REPLACE FUNCTION update_my_certificates(p_certificates TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean TEXT;
BEGIN
  v_clean := NULLIF(btrim(coalesce(p_certificates, '')), '');

  IF v_clean IS NOT NULL AND length(v_clean) > 4000 THEN
    RAISE EXCEPTION 'certificates too long';
  END IF;

  UPDATE profiles
     SET certificates = v_clean
   WHERE auth_user_id = auth.uid()
     AND deleted_at IS NULL;
END;
$$;

COMMENT ON FUNCTION update_my_certificates IS
  'Self-row-only write of profiles.certificates. Takes no profile id (the row is auth.uid()''s own) and touches no other column, which is why it exists instead of a self-row branch on profiles_update: RLS filters rows, not columns.';

REVOKE ALL ON FUNCTION update_my_certificates(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION update_my_certificates(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION update_my_certificates(TEXT) TO authenticated;
