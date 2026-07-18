-- ============================================================================
-- evaluation_cycles + evaluations — first structural slice of the
-- evaluations module (CLAUDE.md §1/§6). Scoped deliberately narrow per this
-- session's decision: this migration builds ONLY the cycle container and
-- the per-employee evaluation row carrying the §4-A lifecycle state --
-- goal_library/goals/bau_tasks/feedback_360/evaluation_scores and any UI
-- are explicit follow-up steps, not part of this change.
--
-- Design notes (all [استنتاج] unless a CLAUDE.md section is cited):
--
-- 1. evaluation_cycles has no `status` column. CLAUDE.md never documents a
--    cycle-level status distinct from the per-EVALUATION lifecycle in §4-A
--    (which lives on `evaluations.state`, not here) -- inventing one now
--    would be a guess with no source to check it against. Only
--    start_date/end_date are modeled; "is this cycle currently open for new
--    evaluations" is left to whichever server action creates evaluations
--    later, not encoded here.
--
-- 2. `evaluations.state` uses the exact 7 values from src/lib/vpra.ts's
--    `EvaluationState`/`evaluationStates` (draft, submitted,
--    supervisor_reviewed, manager_recommended, committee_reviewed, approved,
--    finalized) -- single source of truth, transcribed not reinvented.
--
-- 3. UNIQUE (employee_id, cycle_id) for "one evaluation per employee per
--    cycle" is CLAUDE.md §5-A rule 10's own named example. Implemented as a
--    partial unique index (WHERE deleted_at IS NULL) rather than a table
--    constraint so a soft-deleted evaluation doesn't permanently block
--    creating a replacement for the same employee/cycle.
--
-- 4. process_area = 'evaluation' for BOTH tables. No dedicated process area
--    exists for "manage evaluation cycles" specifically, and 'evaluation'
--    is the direct documented fit (same reasoning job_titles/career_path
--    used 'careerPath' -- see 20260716000012's header).
--
-- 5. evaluation_cycles write gate is check_vpra('evaluation','approve').
--    Per 20260716000007's seeded matrix, hr_admin is the ONLY role holding
--    'approve' on 'evaluation' -- this migration doesn't invent a new
--    number, it reads the one already seeded. Every other role's flat
--    'evaluation' grant tops out at 'recommend' or below, so they get
--    view-only on cycles, matching "HR administers the review calendar."
--
-- 6. evaluations RLS: self-row, OR check_vpra('evaluation', 'approve', ...)
--    -- deliberately 'approve', NOT 'prepare'/'view'. This is a direct fix
--    for a real gap flagged in HANDOVER.md's §5 log (2026-07-16, "الأدوار
--    الثمانية المتبقية" entry): `employee` AND `supervisor` both hold the
--    SAME flat 'prepare' grant on 'evaluation' in the seeded matrix
--    (20260716000007) -- check_vpra() has no way to tell which role_code
--    actually satisfied the check, only that SOME assignment did. If the
--    non-self branch were gated at 'prepare', an `employee` user assigned
--    with scope_type='all' (called out in that same note as the likely
--    default for an individual assignment, since a single person has no
--    natural "org unit" to scope them to) would satisfy check_vpra exactly
--    like a real supervisor would, and could read/write ANY other
--    employee's evaluation row -- not just their own. Gating at 'approve'
--    closes that hole because only `hr_admin` reaches 'approve' on
--    'evaluation' in the current seed matrix (verified below), so the
--    non-self branch is unambiguously HR-admin-only until a real fix
--    lands. Deliberately NOT solved here (follow-up, needs its own
--    decision): supervisor/manager/committee genuinely need read/write on
--    THEIR REPORTS' rows per §4-A, but nothing in the schema today
--    expresses "is caller the supervisor of this employee" -- doing that
--    properly needs either a profiles.supervisor_id-style relationship
--    column, or the full per-state table from src/lib/vpra.ts
--    (`getEvaluationStatePermission`) encoded into the policy, referencing
--    the row's own `state` column. Until one of those exists, this
--    migration intentionally under-grants (self + hr_admin only) rather
--    than ship the same ambiguity bug forward. The state-machine
--    transition action itself (`transitionEvaluationState`) is a separate
--    follow-up step, not part of this migration either way.
--
-- 7. No DELETE policy on either table -- soft-delete via `deleted_at`
--    UPDATE only, matching every other table in this project (profiles,
--    org_units, job_titles, career_path, salary_scale).
-- ============================================================================

BEGIN;

CREATE TABLE evaluation_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL,
  name_en TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT evaluation_cycles_dates_valid CHECK (end_date > start_date)
);

ALTER TABLE evaluation_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY evaluation_cycles_select ON evaluation_cycles FOR SELECT TO authenticated
  USING (check_vpra('evaluation', 'view'));

CREATE POLICY evaluation_cycles_insert ON evaluation_cycles FOR INSERT TO authenticated
  WITH CHECK (check_vpra('evaluation', 'approve'));

CREATE POLICY evaluation_cycles_update ON evaluation_cycles FOR UPDATE TO authenticated
  USING (check_vpra('evaluation', 'approve'))
  WITH CHECK (check_vpra('evaluation', 'approve'));

CREATE TABLE evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES evaluation_cycles(id) ON DELETE RESTRICT,
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN (
    'draft', 'submitted', 'supervisor_reviewed', 'manager_recommended',
    'committee_reviewed', 'approved', 'finalized'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX evaluations_employee_cycle_active_uidx
  ON evaluations (employee_id, cycle_id) WHERE deleted_at IS NULL;

ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY evaluations_select ON evaluations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = evaluations.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('evaluation', 'approve', (SELECT org_unit_id FROM profiles WHERE id = evaluations.employee_id))
  );

CREATE POLICY evaluations_insert ON evaluations FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = evaluations.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('evaluation', 'approve', (SELECT org_unit_id FROM profiles WHERE id = evaluations.employee_id))
  );

CREATE POLICY evaluations_update ON evaluations FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = evaluations.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('evaluation', 'approve', (SELECT org_unit_id FROM profiles WHERE id = evaluations.employee_id))
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = evaluations.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('evaluation', 'approve', (SELECT org_unit_id FROM profiles WHERE id = evaluations.employee_id))
  );

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 2 rows, rowsecurity = true for both.
-- SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('evaluation_cycles', 'evaluations');

-- Expect: the CHECK constraint rejects end_date <= start_date.
-- INSERT INTO evaluation_cycles (name_ar, start_date, end_date)
--   VALUES ('اختبار', '2026-06-01', '2026-01-01');

-- Expect: second insert for the same (employee_id, cycle_id) fails the
-- partial unique index while the first succeeds.

-- Expect (SET ROLE authenticated + simulated JWT): an `employee`-scope test
-- user sees only their own evaluations row; an `hr_admin` (all-scope) test
-- user sees every row across employees.
