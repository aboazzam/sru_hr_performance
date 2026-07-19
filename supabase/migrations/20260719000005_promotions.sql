-- ============================================================================
-- `promotions` table (CLAUDE.md §6 "Promotions & Rewards"; also
-- SRU_System_Design.md §B line 207) -- schema + RLS, first slice, needed
-- before the reviewing/approving UI can have anything real to act on
-- (same "schema is a prerequisite for the requested screen" situation as
-- calibration_sessions before its own UI).
--
-- Column set transcribed from SRU_System_Design.md's own ERD:
--   promotions(id, employee_id, cycle_id, from_job_title_id,
--              to_job_title_id, status, approved_by)
--
-- [استنتاج] `status` is TEXT with no CHECK enum, no documented vocabulary
-- exists for it (same precedent as `goals.status`/`calibration_sessions.
-- status`), defaults to `'pending'`.
--
-- [استنتاج] `from_job_title_id` is nullable (an employee may not have a
-- `job_titles` row set yet -- `profiles.job_title_id` itself is nullable);
-- `to_job_title_id` is required. A CHECK blocks proposing a "promotion" to
-- the same title, mirroring `career_path`'s own self-path block.
--
-- `cycle_id` references the same `evaluation_cycles` table promotions
-- documentation says should be a separate annual cycle
-- (`cycle_type='annual_promotion_rewards'`) -- but `evaluation_cycles`
-- never actually got a `cycle_type` column (a gap already flagged when
-- `evaluation_scores`/`eval_type` were resolved), so this migration does
-- not invent that distinction here either; `cycle_id` is a plain FK with
-- no type discrimination, same as every other table referencing cycles.
--
-- RLS designed directly against the real seeded role_permissions matrix
-- for process_area='promotions', checked before writing any policy:
-- {ceo: approve, cxo/hr_admin/manager: recommend, committee/
-- field_supervisor/strategy_admin/super_admin/supervisor: view}. No role
-- holds 'prepare', and no individual/self role (employee, mentor,
-- competencies_admin) holds ANY grant at all -- same clean situation as
-- `calibration`: gating writes at 'recommend' is safe since only three
-- genuinely administrative/oversight roles reach it, and `ceo`'s
-- 'approve' automatically satisfies that same bar via the VPRA rank
-- ordering, so a single UPDATE policy at 'recommend' covers both the
-- initial recommend-level edits (manager/cxo/hr_admin) and the final
-- approve-level decision (ceo) without needing two separate policies.
--
-- `promotions` has no `org_unit_id` of its own -- derived via a join to
-- `profiles.org_unit_id` for the employee being promoted, same pattern
-- `evaluation_scores`/`calibration_results` use.
--
--   promotions_select: self-row (employee sees their own promotion
--     record, `[استنتاج]`, consistent with the self-visibility default
--     posture everywhere else in this schema) OR
--     check_vpra('promotions','view', employee's org_unit_id).
--   promotions_insert: check_vpra('promotions','recommend', ...) --
--     no self-row bypass (an employee cannot propose their own
--     promotion).
--   promotions_update: check_vpra('promotions','recommend', ...) --
--     covers both proposal edits and the final ceo approval/rejection,
--     no self-row bypass.
--
-- No DELETE policy (soft-delete via `deleted_at` only, CLAUDE.md §5-A
-- rule 7).
-- ============================================================================

BEGIN;

CREATE TABLE promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  cycle_id UUID NOT NULL REFERENCES evaluation_cycles(id) ON DELETE RESTRICT,
  from_job_title_id UUID REFERENCES job_titles(id) ON DELETE RESTRICT,
  to_job_title_id UUID NOT NULL REFERENCES job_titles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT promotions_title_change CHECK (from_job_title_id IS DISTINCT FROM to_job_title_id)
);

ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY promotions_select ON promotions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = promotions.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra(
      'promotions'::process_area,
      'view'::vpra_level,
      (SELECT p.org_unit_id FROM profiles p WHERE p.id = promotions.employee_id)
    )
  );

CREATE POLICY promotions_insert ON promotions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    check_vpra(
      'promotions'::process_area,
      'recommend'::vpra_level,
      (SELECT p.org_unit_id FROM profiles p WHERE p.id = promotions.employee_id)
    )
  );

CREATE POLICY promotions_update ON promotions
  FOR UPDATE
  TO authenticated
  USING (
    check_vpra(
      'promotions'::process_area,
      'recommend'::vpra_level,
      (SELECT p.org_unit_id FROM profiles p WHERE p.id = promotions.employee_id)
    )
  )
  WITH CHECK (
    check_vpra(
      'promotions'::process_area,
      'recommend'::vpra_level,
      (SELECT p.org_unit_id FROM profiles p WHERE p.id = promotions.employee_id)
    )
  );

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: a real `manager`/`cxo`/`hr_admin` test user (recommend) can
-- create and update a promotion in their scope; a real `ceo` test user
-- (approve) can update (approve/reject) any promotion; a real `committee`
-- test user (view only) can SELECT but not INSERT/UPDATE; a plain
-- employee sees zero promotion rows for others but sees their OWN
-- promotion record via the self-row branch, and cannot write to it. The
-- title-change CHECK rejects from_job_title_id = to_job_title_id.
