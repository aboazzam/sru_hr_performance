-- ============================================================================
-- profiles.supervisor_id — the direct-supervisor relationship column
-- flagged as a real, structural gap in nearly every evaluations/goals/
-- bau_tasks migration so far (20260718000001 through 20260718000004):
-- without it, RLS has no way to express "this employee reports to me,"
-- only "does my role hold a flat grant" — which is exactly why
-- supervisor/manager/committee transitions and visibility on those tables
-- were deliberately left blocked pending this decision.
--
-- 🔴 [استنتاج] — NOT documented anywhere. `SRU_System_Design.md`'s own
-- `profiles` ERD (line 126-131) has no supervisor/manager column at all.
-- This migration adds the most natural, minimal reading of "direct
-- supervisor": a self-referencing nullable FK, one level only (not a full
-- reporting chain/hierarchy walk like `org_units.parent_id`). No org-unit
-- consistency check is enforced (e.g. "supervisor must be in the same or
-- a parent org unit") -- not documented, and not required for this
-- column to be useful today.
--
-- Scope of THIS migration, deliberately narrow: adds the column, and
-- widens ONLY `evaluations_select` (read access) to let a real direct
-- supervisor see their reports' evaluations. It does NOT touch
-- evaluations_insert/update (state transitions), nor goals/bau_tasks'
-- RLS -- those remain exactly as documented in their own migrations'
-- follow-up notes. Extending the same mechanism there is a natural next
-- step, not done here to keep this change reviewable and testable in
-- isolation.
--
-- RLS design for the new branch: `emp.supervisor_id = <caller's own
-- profile id>` is the actual authorization gate (a real FK match, not a
-- flat role level), so it does NOT suffer the `employee`/`supervisor`
-- share-the-same-'prepare'-level ambiguity that forced `evaluations`'
-- non-self branch to `'approve'`-only in 20260718000001 -- a random
-- `employee`-role user, even with `scope_type='all'`, cannot satisfy this
-- branch unless `supervisor_id` genuinely points at them. `check_vpra
-- ('evaluation','view',...)` is layered on top anyway (defense in depth,
-- matching CLAUDE.md's "VPRA + relationship both matter" principle) --
-- in practice this is nearly always already true for a real supervisor
-- (their flat grant is 'prepare', which clears 'view'), so it doesn't
-- meaningfully restrict a legitimate supervisor, but it does stop a
-- stale/incorrect `supervisor_id` link from granting access to someone
-- holding no evaluation-related role at all.
-- ============================================================================

BEGIN;

ALTER TABLE profiles ADD COLUMN supervisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE profiles ADD CONSTRAINT profiles_supervisor_not_self CHECK (supervisor_id IS NULL OR supervisor_id <> id);

DROP POLICY evaluations_select ON evaluations;

CREATE POLICY evaluations_select ON evaluations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = evaluations.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('evaluation', 'approve', (SELECT org_unit_id FROM profiles WHERE id = evaluations.employee_id))
    OR (
      EXISTS (
        SELECT 1 FROM profiles emp
        WHERE emp.id = evaluations.employee_id
          AND emp.supervisor_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
      )
      AND check_vpra('evaluation', 'view', (SELECT org_unit_id FROM profiles WHERE id = evaluations.employee_id))
    )
  );

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: CHECK rejects a profile referencing itself as its own supervisor.

-- Expect (SET ROLE authenticated + simulated JWT): a real `supervisor`-role
-- test user whose real direct report (supervisor_id set to their own
-- profile id) has an evaluation can now SELECT that evaluation, where
-- before this migration they could not; an unrelated employee (no
-- supervisor_id link) still cannot.
