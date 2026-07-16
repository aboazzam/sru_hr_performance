-- ============================================================================
-- Rate limiting for the login and employee-invite actions (CLAUDE.md §5-A:
-- "Rate limiting on public API routes via middleware or Upstash")
--
-- [استنتاج، قرار تقني] No Upstash/Redis account exists for this project
-- (checked .env.local -- no UPSTASH_* vars, no @upstash/* package
-- installed) -- CLAUDE.md §5-A names it as "via middleware OR Upstash", an
-- either/or, not a hard Upstash requirement. Provisioning an external Redis
-- account is the project owner's call (needs their own sign-up/credentials),
-- not something to silently create. This migration builds a self-contained
-- Postgres-backed limiter instead: correct and sufficient for a
-- single-instance deployment, but NOT strictly correct across multiple
-- concurrent serverless instances/regions racing the same bucket at the
-- exact same millisecond (no distributed lock) -- a real limitation to
-- revisit with Upstash Redis if/when this app runs on a multi-region
-- serverless platform. Flagged, not silently glossed over.
-- ============================================================================

BEGIN;

CREATE TABLE rate_limit_attempts (
  id BIGSERIAL PRIMARY KEY,
  bucket_key TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX rate_limit_attempts_bucket_idx ON rate_limit_attempts (bucket_key, attempted_at);

COMMENT ON TABLE rate_limit_attempts IS 'Append-only attempt log for check_rate_limit(). Rows older than any caller''s window are pruned lazily on each check -- no separate cleanup job exists (acceptable at this scale; revisit if the table grows large).';

ALTER TABLE rate_limit_attempts ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- check_rate_limit — fixed-window counter. Returns true (allowed, and
-- records this attempt) or false (rate-limited, does NOT record another
-- attempt -- the window's attempts already at the cap are enough signal,
-- no need to keep growing the table for a caller already being blocked).
--
-- Not perfectly atomic under heavy concurrent load on the exact same
-- bucket_key within the same instant (a classic read-then-write race) --
-- acceptable here: this is a defense-in-depth brute-force friction control,
-- not a hard security boundary or a billing meter. RLS/VPRA remain the real
-- authorization boundary regardless of this function's outcome.
--
-- SECURITY DEFINER so it can read/write rate_limit_attempts despite that
-- table's own zero-policy RLS. EXECUTE is intentionally NOT granted to
-- `anon`/`authenticated`/PUBLIC -- see the revokes below -- because both
-- call sites (login, invite) call this only through the service_role
-- (admin) Supabase client in application code, never through a
-- user-facing RLS policy or RPC exposed to the browser.
-- ----------------------------------------------------------------------------

CREATE FUNCTION check_rate_limit(
  p_bucket_key TEXT,
  p_max_attempts INT,
  p_window_seconds INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM rate_limit_attempts
    WHERE bucket_key = p_bucket_key
      AND attempted_at < now() - (p_window_seconds || ' seconds')::interval;

  SELECT count(*) INTO v_count FROM rate_limit_attempts WHERE bucket_key = p_bucket_key;

  IF v_count >= p_max_attempts THEN
    RETURN false;
  END IF;

  INSERT INTO rate_limit_attempts (bucket_key) VALUES (p_bucket_key);
  RETURN true;
END;
$$;

COMMENT ON FUNCTION check_rate_limit IS 'CLAUDE.md §5-A rate limiting. Called only via the service_role client (src/lib/rate-limit.ts) -- never exposed as a browser-callable RPC.';

REVOKE ALL ON FUNCTION check_rate_limit(TEXT, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION check_rate_limit(TEXT, INT, INT) FROM anon;
REVOKE ALL ON FUNCTION check_rate_limit(TEXT, INT, INT) FROM authenticated;

COMMIT;

-- ============================================================================
-- Verification — run AFTER and BEFORE trusting, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 1 row, rowsecurity = true, 0 policies.
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'rate_limit_attempts';
-- SELECT policyname FROM pg_policies WHERE tablename = 'rate_limit_attempts';

-- Expect: anon = false, authenticated = false (only service_role/postgres can call it).
-- SELECT has_function_privilege('anon', 'check_rate_limit(text,int,int)', 'EXECUTE') AS anon_exec,
--        has_function_privilege('authenticated', 'check_rate_limit(text,int,int)', 'EXECUTE') AS authenticated_exec;

-- Functional smoke test (run manually, not part of this file):
-- SELECT check_rate_limit('test:smoke', 2, 60); -- true
-- SELECT check_rate_limit('test:smoke', 2, 60); -- true
-- SELECT check_rate_limit('test:smoke', 2, 60); -- false (3rd within the same 60s window, cap is 2)
-- DELETE FROM rate_limit_attempts WHERE bucket_key = 'test:smoke'; -- cleanup
