-- ============================================================================
-- feedback_360 — 360° feedback (CLAUDE.md §1/§6 "360° Feedback"), the most
-- explicitly documented table built so far: SRU_System_Design.md's "(B)"
-- section marks its anonymity strategy **[معتمد]** (approved decision, not
-- [استنتاج]) — see line 200 and the "قرارات معتمدة" list (line 306).
--
-- Design notes:
--
-- 1. Column set transcribed verbatim from SRU_System_Design.md line 192-198:
--    `feedback_360(id, cycle_id, target_employee_id -> profiles.id,
--    evaluator_relation ENUM('supervisor','peer','customer','self'),
--    evaluator_id -> profiles.id, is_anonymous BOOLEAN DEFAULT true,
--    scores JSONB, comments TEXT, submitted_at)`. `evaluator_relation`
--    becomes a real Postgres ENUM (`feedback_360_evaluator_relation`),
--    matching this project's existing enum convention
--    (profile_status/job_title_category/competency_type).
--
-- 2. `comments` is deliberately NOT split into `comments_ar`/`comments_en`,
--    unlike `title_ar`/`description_ar`/`target_ar` on goal_library/goals.
--    Those are curated, potentially-bilingual reference/template content;
--    `comments` here is free-form prose a single real evaluator types once,
--    in whichever language they choose -- there is no "official Arabic
--    version + official English version" of one person's opinion. Applying
--    the bilingual-split convention here would be a category error, not
--    consistency.
--
-- 3. 🔴 evaluator_id anonymity is NOT achievable through row-level security
--    alone -- RLS filters rows, not columns, and the target employee
--    legitimately needs to see the REST of their own feedback row (scores,
--    comments) while never seeing evaluator_id specifically. The doc's own
--    words are explicit: "RLS منفصلة أشد صرامة -- SELECT مقيّد بدور
--    super_admin فقط مع تسجيل audit_log لكل قراءة" (line 249) -- a
--    genuinely separate, stricter mechanism, not just another check_vpra()
--    tier. Implemented here with real, tested column-level privileges
--    (Postgres GRANT/REVOKE on a specific column, independent of RLS):
--    `evaluator_id`'s SELECT privilege is explicitly revoked from
--    `anon`/`authenticated` -- this project's own `ALTER DEFAULT
--    PRIVILEGES` (flagged as tech debt in 20260716000006's header) would
--    otherwise auto-grant full-column SELECT to both on every new table,
--    so an explicit REVOKE is required here, not optional (same lesson
--    20260716000005 already learned for function EXECUTE grants). Only
--    `service_role` can read `evaluator_id` directly.
--    IMPORTANT MECHANISM NOTE (found empirically while verifying this
--    migration, not assumed): a bare column-level
--    `REVOKE SELECT (evaluator_id) ... FROM authenticated` does NOT work
--    on its own here, because this project's default ACL
--    (`pg_default_acl`, objtype 'r') grants `authenticated` full
--    TABLE-LEVEL SELECT (the `r` bit in `arwdDxtm`) on every new table --
--    and a table-level SELECT grant permits reading ANY column, silently
--    overriding a column-specific REVOKE. The only way to actually narrow
--    this is to REVOKE SELECT ON THE WHOLE TABLE from
--    anon/authenticated first (removing the blanket table-level grant),
--    then GRANT SELECT back to `authenticated` on an explicit column list
--    that excludes `evaluator_id`. Verified directly: before this fix, a
--    plain `SELECT evaluator_id FROM feedback_360` as `authenticated`
--    (no RLS rows even required) succeeded; after it, the same query --
--    alone or mixed with granted columns -- fails with "permission
--    denied for table feedback_360" (Postgres's actual wording for this
--    table-wide-REVOKE-plus-column-GRANT shape; it doesn't name the
--    specific column), while selecting only the granted columns (id,
--    cycle_id, scores, comments, etc.) succeeds normally.
--    PRACTICAL CONSEQUENCE for any future code querying this table: an
--    ordinary authenticated user's `SELECT *` (or any column list that
--    includes `evaluator_id`) will error with "permission denied for
--    table feedback_360" -- always select an explicit column list
--    omitting it.
--    The actual "كشف هوية مقيّم" (reveal evaluator identity) action --
--    super_admin-only, with a mandatory audit_log entry per the doc -- is a
--    deliberate follow-up (a SECURITY DEFINER RPC using service_role-level
--    access), NOT part of this schema-only migration, mirroring how
--    `evaluations`' state-transition action was deferred in 20260718000001.
--
-- 4. process_area = 'evaluation' -- [استنتاج]: CLAUDE.md's 12 process areas
--    have no dedicated "feedback360" area; SRU_System_Design.md's own
--    module list (line 32) explicitly groups 360 feedback under
--    "9. Evaluation -- self/supervisor/peer/customer (360)", not as a
--    separate module -- the strongest available textual basis, not a
--    guess from nothing.
--
-- 5. RLS row-policies (separate from the column-level evaluator_id lock
--    above) re-apply the exact `evaluations` lesson: `employee` and
--    `supervisor` share the identical flat `'prepare'` grant on
--    `evaluation`, so any non-self oversight branch must gate at
--    `'approve'` (hr_admin-only today) to stay unambiguous -- copied
--    directly from 20260718000001's fix, not re-derived from scratch.
--    SELECT: self-as-target (target_employee_id) OR self-as-evaluator
--    (evaluator_id) OR check_vpra('evaluation','approve',...). Both
--    self-branches only ever expose the row subject to the column-level
--    lock above, so a target employee still can't see who evaluated them
--    even though the ROW itself is visible to them.
--    INSERT/UPDATE are MORE restrictive than the flat VPRA model on
--    purpose, matching the doc's "stricter" framing for this table
--    specifically: only `evaluator_id = caller` may write -- no
--    'approve'-level bypass for creating/editing a submission on someone
--    else's behalf, since that would undermine the entire audit/dispute
--    purpose of tracking who actually gave the feedback. Locking a row
--    against edits once `submitted_at` is set is left to a future server
--    action (same "state machine belongs above the DB" reasoning as
--    `evaluations`), not attempted at the RLS layer here.
--
-- 6. `evaluator_id` uses ON DELETE RESTRICT (not CASCADE, unlike
--    `employee_id` elsewhere in this schema) -- the doc explicitly states
--    evaluator_id is retained "لأغراض تدقيق/نزاعات" (audit/dispute
--    purposes); CASCADE-deleting the whole feedback record if the
--    evaluator's profile were ever removed would defeat that documented
--    purpose (profiles are soft-deleted only per CLAUDE.md §5 anyway, so
--    this is mostly a theoretical safeguard). `target_employee_id` keeps
--    the ON DELETE CASCADE convention used by `evaluations`/`goals`/
--    `bau_tasks`'s `employee_id`.
--
-- 7. UNIQUE (cycle_id, target_employee_id, evaluator_id, evaluator_relation)
--    -- [استنتاج], not stated in the doc, but the only sensible reading:
--    one evaluator gives at most one submission per target per cycle per
--    relation (a peer could conceivably also be a customer in a different
--    relation, hence relation is part of the key, not just evaluator+target).
-- ============================================================================

BEGIN;

CREATE TYPE feedback_360_evaluator_relation AS ENUM ('supervisor', 'peer', 'customer', 'self');

CREATE TABLE feedback_360 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES evaluation_cycles(id) ON DELETE RESTRICT,
  target_employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  evaluator_relation feedback_360_evaluator_relation NOT NULL,
  evaluator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  is_anonymous BOOLEAN NOT NULL DEFAULT true,
  scores JSONB,
  comments TEXT,
  submitted_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT feedback_360_unique_submission
    UNIQUE (cycle_id, target_employee_id, evaluator_id, evaluator_relation)
);

ALTER TABLE feedback_360 ENABLE ROW LEVEL SECURITY;

-- Column-level lock, independent of and stricter than any RLS row policy
-- below -- see design note 3. A column-level REVOKE alone is not enough
-- here (see the note above): this project's default ACL grants
-- table-level SELECT to anon/authenticated on every new table, which
-- overrides a column-specific REVOKE. Fix: revoke SELECT on the whole
-- table first (anon gets none at all, matching this project's "anon has
-- zero access" convention), then re-grant SELECT to authenticated on an
-- explicit column list that omits evaluator_id.
REVOKE SELECT ON feedback_360 FROM anon, authenticated;
GRANT SELECT (
  id, cycle_id, target_employee_id, evaluator_relation, is_anonymous,
  scores, comments, submitted_at, deleted_at
) ON feedback_360 TO authenticated;

CREATE POLICY feedback_360_select ON feedback_360 FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = feedback_360.target_employee_id AND p.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = feedback_360.evaluator_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('evaluation', 'approve', (SELECT org_unit_id FROM profiles WHERE id = feedback_360.target_employee_id))
  );

CREATE POLICY feedback_360_insert ON feedback_360 FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = feedback_360.evaluator_id AND p.auth_user_id = auth.uid()
    )
  );

CREATE POLICY feedback_360_update ON feedback_360 FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = feedback_360.evaluator_id AND p.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = feedback_360.evaluator_id AND p.auth_user_id = auth.uid()
    )
  );

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 1 row, rowsecurity = true.
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'feedback_360';

-- Expect: explicit SELECT of evaluator_id as `authenticated` fails with
-- "permission denied for table feedback_360"; selecting other columns
-- (scores, comments, evaluator_relation) succeeds normally for a visible row.

-- Expect (SET ROLE authenticated + simulated JWT): the target employee sees
-- their own feedback row's scores/comments but cannot select evaluator_id;
-- the evaluator sees their own submitted row; a `committee`-role user (no
-- 'evaluation'='approve') sees zero rows for someone else's feedback; an
-- `hr_admin` (approve) sees any row. INSERT succeeds only when
-- evaluator_id matches the caller's own profile, regardless of role.
