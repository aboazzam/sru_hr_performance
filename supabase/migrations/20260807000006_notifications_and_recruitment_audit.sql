-- ============================================================================
-- الإشعارات + إتاحة سجل التدقيق لموديول التوظيف
--
-- ---------------------------------------------------------------------------
-- 1) notifications
-- ---------------------------------------------------------------------------
-- CLAUDE.md §6 has listed a `notifications` table since the original plan; it
-- was never built. The TopBar has carried a bell button since early in the
-- project with NO onClick and no table behind it -- dead chrome, exactly like
-- the login button was before it was made real (2026-07-18). The spec's own
-- rule was "reuse the project's notification system if one exists": it does
-- not, so this builds the real one behind the existing bell rather than
-- introducing a second, parallel affordance.
--
-- Shape follows the spec's own columns: recipient, entity type/id, type, Arabic
-- message, read_at, created_at. Two deliberate additions, flagged:
--   * `link_path` [استنتاج] -- a notification the reader cannot act on is
--     half a feature; this carries the in-app path to open. Locale-free (the
--     bell prefixes the active locale), so it never hard-codes /ar or /en.
--   * `message_en` nullable -- the app is bilingual, but these strings are
--     generated from templates at write time, not translated at read time.
--     Null means "Arabic only", which is what the templates produce today.
--
-- RLS: a notification is personal.
--   SELECT : recipient only. No oversight branch at all -- nobody reads
--            another person's inbox, not even hr_admin or super_admin. That
--            is stricter than the rest of this schema on purpose.
--   UPDATE : recipient only, so they can mark their own as read. The
--            recipient cannot be changed away from themselves (WITH CHECK).
--   INSERT : NO POLICY. Notifications are written by Server Actions through
--            the service-role client as a side effect of a real, already
--            authorized action. Leaving authenticated with no INSERT path at
--            all means a user can never fabricate a notification -- e.g. one
--            claiming their request was approved.
--   DELETE : NO POLICY (soft-delete only, CLAUDE.md §5-A rule 7).
--
-- ---------------------------------------------------------------------------
-- 2) audit_log visibility for recruitment
-- ---------------------------------------------------------------------------
-- `audit_log` has been RLS-enabled with exactly ONE policy since
-- 20260719000010, restricted to entity IN ('promotions','rewards'). Every
-- other action type is unreadable, deliberately -- a general audit viewer is
-- a separate, bigger decision. This adds a SECOND narrowly-scoped policy in
-- the same shape, for entity IN ('recruitment_plans','recruitment_requests')
-- only, so the plan's own audit tab can render. Nothing else becomes
-- readable: evaluation transitions, role changes, employee edits and the
-- feedback-360 identity reveals all stay completely invisible.
--
-- Gated on `recruitmentPlan>=view` OR `recruitmentBudget>=view` -- the same
-- pair that can already read the plan and its requests, so this exposes no
-- row whose subject the caller could not already see.
-- ============================================================================

BEGIN;

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  type TEXT NOT NULL,
  message_ar TEXT NOT NULL,
  message_en TEXT,
  link_path TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE notifications IS 'إشعارات المستخدمين -- personal; written server-side only, read only by their own recipient.';
COMMENT ON COLUMN notifications.link_path IS '[استنتاج] locale-free in-app path the bell opens; the reader''s active locale is prefixed at render time.';

-- The bell's own query: my unread notifications, newest first.
CREATE INDEX notifications_recipient_idx
  ON notifications (recipient_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select ON notifications
  FOR SELECT TO authenticated
  USING (recipient_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY notifications_update ON notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()))
  WITH CHECK (recipient_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

-- Deliberately no INSERT and no DELETE policy (see the header).

CREATE POLICY audit_log_select_recruitment ON audit_log
  FOR SELECT TO authenticated
  USING (
    entity IN ('recruitment_plans', 'recruitment_requests')
    AND (
      check_vpra_global('recruitmentPlan'::process_area, 'view'::vpra_level)
      OR check_vpra_global('recruitmentBudget'::process_area, 'view'::vpra_level)
    )
  );

COMMIT;

-- ============================================================================
-- Verification -- run AFTER applying.
-- ============================================================================
-- Expect 2 policies on audit_log (the pre-existing promotions/rewards one,
-- plus this):
--   SELECT policyname FROM pg_policies WHERE tablename = 'audit_log';
-- As a recruitment role: recruitment audit rows are readable, and
--   SELECT count(*) FROM audit_log WHERE entity = 'profiles';  -- still 0
-- As any authenticated user:
--   INSERT INTO notifications (...)      -- must be rejected (42501)
--   SELECT ... FROM notifications        -- only their own rows
--   UPDATE notifications SET read_at=now() WHERE recipient_id <> mine
--                                        -- must affect 0 rows
