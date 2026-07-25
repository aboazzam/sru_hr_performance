-- ============================================================================
-- Employee-creation approval workflow + username login, per direct feedback
-- (2026-07-25):
--
-- 1. "نعم اضف حالة بانتظار الاعتماد" -- a profile created by someone at
--    'prepare'/'recommend' level on employeeData sits as 'pending' until an
--    'approve'-level holder reviews it; 'rejected' keeps the record (soft,
--    per CLAUDE.md §5-A rule 7 -- never hard-delete an employee/user record)
--    visible only to its preparer and to approve-level holders, never in the
--    main list. Existing rows are backfilled to 'approved' -- they are
--    already-established real employees, not new pending submissions; only
--    genuinely NEW inserts default to 'pending' going forward (the app
--    itself overrides this to 'approved' at insert time when the actor
--    already holds employeeData='approve', so an approver's own additions
--    don't need a redundant second approval step).
--
-- 2. "اضف اسم المستخدم واجعله خيارا عند الدخول اما الايميل او اسم المستخدم"
--    + "اجعل البريد الالكتروني اختياريا وليس اجباريا" -- `username` is a
--    new optional, unique alternate identifier; `email` drops its NOT NULL
--    (its UNIQUE constraint is untouched -- Postgres treats every NULL as
--    distinct, so multiple email-less profiles coexist fine). Supabase Auth
--    itself has no native username-only sign-in -- `resolve_login_identifier()`
--    below resolves a typed username back to its profile's real email
--    server-side, so the existing signInWithPassword({email, password}) call
--    never needs to change; only the login form's single input field and
--    the Server Action calling this RPC first do.
-- ============================================================================

BEGIN;

CREATE TYPE profile_approval_status AS ENUM ('pending', 'approved', 'rejected');

ALTER TABLE profiles ADD COLUMN approval_status profile_approval_status NOT NULL DEFAULT 'pending';
UPDATE profiles SET approval_status = 'approved';

COMMENT ON COLUMN profiles.approval_status IS 'Employee-creation approval workflow (2026-07-25). Existing rows backfilled to approved (already-established employees). New inserts default to pending; the app sets approved explicitly when the inserting actor already holds employeeData=approve.';

ALTER TABLE profiles ADD COLUMN username TEXT UNIQUE;
COMMENT ON COLUMN profiles.username IS 'Optional alternate login identifier (2026-07-25) -- resolved to the real email server-side via resolve_login_identifier() before calling signInWithPassword, since Supabase Auth itself only authenticates by email.';

ALTER TABLE profiles ALTER COLUMN email DROP NOT NULL;
COMMENT ON COLUMN profiles.email IS 'Optional (2026-07-25, was NOT NULL) -- a record with no login account ever created may have no email at all. When an account IS created without a real email, the app stores a synthetic technical address here (derived from username) so link_profile_to_auth_user()''s email-match trigger keeps working unchanged.';

-- --------------------------------------------------------------------------
-- resolve_login_identifier -- looks up the real email for a username, or
-- returns the input unchanged if it already looks like an email (so the
-- login action can always call this once and get back what to actually
-- authenticate with). SECURITY DEFINER so it can read profiles.email/
-- username despite profiles_select's RLS; granted to anon specifically
-- because login itself necessarily happens before authentication. Returns
-- NULL (not an error) when nothing matches -- login then fails with the
-- same generic "invalid credentials" message it already gives for a wrong
-- password, so this reveals nothing beyond what a normal failed login
-- already would.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION resolve_login_identifier(p_identifier TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_identifier LIKE '%@%' THEN p_identifier
    ELSE (SELECT email FROM profiles WHERE username = p_identifier AND deleted_at IS NULL)
  END;
$$;

COMMENT ON FUNCTION resolve_login_identifier IS 'Resolves a login-form identifier (email or username) to the real email signInWithPassword needs. SECURITY DEFINER + anon-granted since login runs pre-authentication; returns NULL silently on no match, same generic failure as a wrong password.';

REVOKE ALL ON FUNCTION resolve_login_identifier(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_login_identifier(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION resolve_login_identifier(TEXT) TO authenticated;

COMMIT;

-- ============================================================================
-- Verification — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 0 (no existing row left at the 'pending' default).
-- SELECT count(*) FROM profiles WHERE approval_status = 'pending';

-- Expect: email nullable = YES, username exists and nullable = YES.
-- SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_name = 'profiles' AND column_name IN ('email', 'username');

-- Expect: true for both anon and authenticated (deliberately, see comment above).
-- SELECT has_function_privilege('anon', 'resolve_login_identifier(text)', 'EXECUTE');
-- SELECT has_function_privilege('authenticated', 'resolve_login_identifier(text)', 'EXECUTE');
