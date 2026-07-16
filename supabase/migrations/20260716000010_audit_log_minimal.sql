-- ============================================================================
-- Minimal audit_log — enough to satisfy CLAUDE.md §5's non-negotiable
-- "No admin access without audit trail" for the employee-invite action being
-- built in this same session, not the full audit system.
--
-- Scope: table + RLS enabled with zero policies (same default-deny pattern
-- as every other table in this project). Writing to it is done via the
-- service_role client (bypasses RLS by design, same client already needed
-- for `auth.admin.inviteUserByEmail`) -- no INSERT policy for `authenticated`
-- is added here, since nothing in the app writes audit_log except trusted
-- server-side code. Reading it (a future "audit log viewer" screen, gated
-- by some VPRA process area -- CLAUDE.md §4's 12 areas do not currently
-- include one for "auditLog") is explicitly NOT built here. Retention
-- (SRU_System_Design.md's "5 years -> periodic archive job") is also not
-- built here -- this is the minimal shape to stop writes from having
-- nowhere to go, not the full backlog item.
-- ============================================================================

BEGIN;

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE audit_log IS 'SRU_System_Design.md §(System). Minimal shape (no retention job, no viewer RLS policy yet) — see this migration''s header.';
COMMENT ON COLUMN audit_log.actor_id IS 'SET NULL (not RESTRICT/CASCADE): losing the actor reference on a deleted auth user must not corrupt or delete audit history — the log entry must outlive the account it describes.';

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ============================================================================
-- Verification — run AFTER and BEFORE trusting, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 1 row, rowsecurity = true.
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_log';

-- Expect: 0 rows (no policies yet, deliberate default-deny for `authenticated`).
-- SELECT policyname FROM pg_policies WHERE tablename = 'audit_log';
