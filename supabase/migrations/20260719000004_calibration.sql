-- ============================================================================
-- First slice of the calibration engine (CLAUDE.md §6 "Calibration &
-- Rewards"; SRU_System_Design.md §B "Calibration & Rewards" line 202-211).
-- Schema + RLS only, mirroring how `evaluation_cycles`/`evaluations`
-- started (migration 15) before goals/bau_tasks/feedback_360/
-- evaluation_scores/UI followed as separate slices -- no UI/Server Action
-- in this migration.
--
-- **This resolves CLAUDE.md §1's "Bell Curve / Forced Distribution"
-- language in favor of the more recent, explicitly confirmed decision in
-- SRU_System_Design.md** (line 11: "Calibration: بدون توزيع إجباري
-- (guided, not forced)"; line 211: "`calibration_sessions.mode = 'guided'`
-- فقط -- حسب إجابتك" -- a direct project-owner answer, not a guess). Not
-- re-confirmed here since it's already a documented, dated decision, not
-- an open question -- `calibration_mode` is a Postgres ENUM with a single
-- literal value ('guided'), matching the doc's own ERD sketch exactly
-- rather than a free-form column that could silently drift.
--
-- Column set transcribed verbatim from SRU_System_Design.md's own ERD:
--   calibration_sessions(id, cycle_id, org_unit_id, status, mode, notes)
--   calibration_results(id, session_id, employee_id, original_rating,
--                        calibrated_rating, justification)
--
-- [استنتاج] `status` is TEXT with no CHECK enum, no documented vocabulary
-- exists for it (unlike `evaluations.state`) -- same precedent as
-- `goals.status`/`bau_tasks.status`, defaults to 'draft'.
--
-- [استنتاج] `original_rating`/`calibrated_rating` get the exact same
-- 0-100 percentage CHECK (NULL allowed, bounds inclusive) just resolved
-- for `evaluation_scores.score` in 20260719000001 -- consistent with that
-- established convention across the app rather than a freshly guessed
-- scale, though not separately re-confirmed with the project owner for
-- this specific column.
--
-- RLS design, checked directly against the real seeded role_permissions
-- matrix for process_area='calibration' before writing any policy (not
-- assumed): {hr_admin: approve, committee: recommend, ceo/cxo/manager/
-- strategy_admin/competencies_admin/super_admin: view}. No role holds
-- 'prepare', and critically no individual/self role (employee, supervisor,
-- field_supervisor, mentor) holds ANY grant on 'calibration' at all --
-- so unlike `evaluations`/`bau_tasks`, there is NO risk of the
-- employee/supervisor-share-a-level ambiguity that forced those tables'
-- non-self branches to a higher bar. Only `hr_admin` and `committee`
-- qualify at 'recommend'+, both inherently administrative/oversight
-- roles -- safe to gate write access at 'recommend' directly, mirroring
-- the already-established evaluations/evaluation_scores precedent
-- (migrations 11, 20260719000003) rather than re-deriving it.
--
--   calibration_sessions_select: check_vpra('calibration','view', org_unit_id)
--     -- org_unit_id is a direct NOT NULL column here, no join needed.
--   calibration_sessions_insert: check_vpra('calibration','approve', org_unit_id)
--     -- hr_admin only -- creating a new session is a distinct
--     -- administrative action, same distinction migration 11 drew for
--     -- `evaluations_insert` vs. `_select`/`_update`.
--   calibration_sessions_update: check_vpra('calibration','recommend', org_unit_id)
--     -- hr_admin + committee, matching their real function reviewing/
--     -- progressing a session already created.
--
--   calibration_results has no org_unit_id of its own -- derived via a
--   join to calibration_sessions, same pattern evaluation_scores uses via
--   evaluations.
--   calibration_results_select: self-row (employee sees their own
--     calibrated rating) OR check_vpra('calibration','view', ...).
--     [استنتاج] Self-visibility is not separately documented for this
--     table, but is the established default posture everywhere else in
--     this schema (evaluations/evaluation_scores/goals/bau_tasks all
--     grant a self-row SELECT bypass) -- not invented fresh here.
--   calibration_results_insert: check_vpra('calibration','approve', ...)
--     -- hr_admin only, seeding a session's initial ratings.
--   calibration_results_update: check_vpra('calibration','recommend', ...)
--     -- hr_admin + committee adjust calibrated_rating/justification
--     during guided review, no self-row write bypass (an employee cannot
--     calibrate their own rating).
--
-- No DELETE policy on either table (soft-delete via `deleted_at` only,
-- CLAUDE.md §5-A rule 7).
-- ============================================================================

BEGIN;

CREATE TYPE calibration_mode AS ENUM ('guided');

CREATE TABLE calibration_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES evaluation_cycles(id) ON DELETE RESTRICT,
  org_unit_id UUID NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
  mode calibration_mode NOT NULL DEFAULT 'guided',
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE calibration_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES calibration_sessions(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  original_rating NUMERIC,
  calibrated_rating NUMERIC,
  justification TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT calibration_results_rating_range CHECK (
    (original_rating IS NULL OR (original_rating >= 0 AND original_rating <= 100))
    AND (calibrated_rating IS NULL OR (calibrated_rating >= 0 AND calibrated_rating <= 100))
  )
);

-- Partial (not plain) unique index, soft-delete aware -- same NULL-safety
-- reasoning as evaluations_employee_cycle_type_active_uidx: a plain
-- UNIQUE would let a soft-deleted row block a legitimate replacement.
CREATE UNIQUE INDEX calibration_results_session_employee_active_uidx
  ON calibration_results (session_id, employee_id) WHERE deleted_at IS NULL;

ALTER TABLE calibration_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY calibration_sessions_select ON calibration_sessions
  FOR SELECT
  TO authenticated
  USING (check_vpra('calibration'::process_area, 'view'::vpra_level, org_unit_id));

CREATE POLICY calibration_sessions_insert ON calibration_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (check_vpra('calibration'::process_area, 'approve'::vpra_level, org_unit_id));

CREATE POLICY calibration_sessions_update ON calibration_sessions
  FOR UPDATE
  TO authenticated
  USING (check_vpra('calibration'::process_area, 'recommend'::vpra_level, org_unit_id))
  WITH CHECK (check_vpra('calibration'::process_area, 'recommend'::vpra_level, org_unit_id));

CREATE POLICY calibration_results_select ON calibration_results
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = calibration_results.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra(
      'calibration'::process_area,
      'view'::vpra_level,
      (SELECT cs.org_unit_id FROM calibration_sessions cs WHERE cs.id = calibration_results.session_id)
    )
  );

CREATE POLICY calibration_results_insert ON calibration_results
  FOR INSERT
  TO authenticated
  WITH CHECK (
    check_vpra(
      'calibration'::process_area,
      'approve'::vpra_level,
      (SELECT cs.org_unit_id FROM calibration_sessions cs WHERE cs.id = calibration_results.session_id)
    )
  );

CREATE POLICY calibration_results_update ON calibration_results
  FOR UPDATE
  TO authenticated
  USING (
    check_vpra(
      'calibration'::process_area,
      'recommend'::vpra_level,
      (SELECT cs.org_unit_id FROM calibration_sessions cs WHERE cs.id = calibration_results.session_id)
    )
  )
  WITH CHECK (
    check_vpra(
      'calibration'::process_area,
      'recommend'::vpra_level,
      (SELECT cs.org_unit_id FROM calibration_sessions cs WHERE cs.id = calibration_results.session_id)
    )
  );

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: a real `hr_admin` test user (approve) can create a session and
-- seed results in their scope; a real `committee` test user (recommend,
-- scope 'all') can view/update sessions and results across org units but
-- cannot INSERT either; a real `manager` test user (view only) can SELECT
-- but not INSERT/UPDATE either table; a plain employee sees zero session
-- rows but sees their OWN calibration_results row via the self-row branch,
-- and cannot write to either table at all. The rating-range CHECK rejects
-- out-of-bounds values on both columns.
