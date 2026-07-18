-- ============================================================================
-- goals — per-employee goal assignment (CLAUDE.md §6 "goals -- assigned
-- goals"), consuming `goal_library` (migration 16) as an optional template
-- source. `bau_tasks`/`feedback_360`/`evaluation_scores` remain separate
-- follow-ups, not part of this migration.
--
-- Design notes:
--
-- 1. Column set is TRANSCRIBED from SRU_System_Design.md's own "Goals / BAU"
--    ERD sketch (line 170): `goals(id, employee_id, cycle_id,
--    goal_library_id NULLABLE, custom_title, weight, target, status)`.
--    [استنتاج] adjustments from that literal line, consistent with every
--    bilingual text column already in this schema (title_ar/title_en on
--    goal_library itself, requirements_ar/requirements_en on career_path):
--      - `custom_title` -> `custom_title_ar`/`custom_title_en`
--      - `target` -> `target_ar`/`target_en`
--    `weight` reuses `goal_library.default_weight`'s exact NUMERIC(5,2) +
--    (0,100] CHECK reasoning (a percentage contribution toward a 100%-total
--    evaluation score), nullable for the same reason (weight may not be
--    finalized the moment a goal row is created).
--
-- 2. `goal_library_id` (NULLABLE per the doc) and `custom_title_ar` are
--    mutually exclusive by a CHECK, not just convention: a goal either
--    comes from the reusable library (custom_title_ar must be NULL, the
--    title lives on goal_library) or is a one-off custom goal
--    (goal_library_id must be NULL, custom_title_ar required) -- never
--    both, never neither. This wasn't stated explicitly in the ERD sketch
--    but is the only reading that avoids an orphan goal with no title
--    source at all, or an ambiguous one with two conflicting titles.
--
-- 3. `status` has NO CHECK-enforced enum, deliberately -- no document
--    anywhere defines real status values for an assigned goal (unlike
--    `evaluations.state`, which transcribes vpra.ts's already-canonical
--    7-value lifecycle). Modeled as free TEXT with a DEFAULT 'active' as a
--    placeholder only, same conservative choice `evaluation_cycles` made
--    by omitting a status column entirely rather than inventing one
--    (20260718000001's header note 1) -- here the doc DOES list a `status`
--    column, so it isn't omitted, but its vocabulary is left open until a
--    real decision exists. Locking in guessed values now via CHECK would
--    be harder to walk back than adding the CHECK later once documented.
--
-- 4. process_area = 'goalAssignment' -- direct CLAUDE.md §4 fact ("Assigning
--    goals to employees"), not inferred.
--
-- 5. RLS -- THIS IS A PER-EMPLOYEE TABLE, so the exact ambiguity risk fixed
--    in `evaluations` (20260718000001) had to be re-checked here, not
--    assumed away. The good news: `goalAssignment`'s seeded levels avoid it
--    structurally, unlike `evaluation`'s. Per migration 7's matrix:
--      employee            = 'view'    (NOT 'prepare' -- distinct from its
--                                        'evaluation'/'bauTasks' grants)
--      supervisor           = 'prepare'
--      field_supervisor     = 'prepare' (intentional mirror of supervisor)
--      manager               = 'approve' (sole owner)
--      super_admin/ceo/cxo/
--      hr_admin/strategy_admin = 'view' (oversight)
--    Because `employee`'s ceiling here is 'view' -- ONE TIER BELOW
--    `supervisor`/`field_supervisor`'s 'prepare' -- gating the non-self
--    branch at 'prepare' cleanly excludes `employee` (regardless of its
--    scope_type) while still admitting supervisor/field_supervisor/manager,
--    with no ambiguity about which role_code actually satisfied the check.
--    This differs from `evaluation`, where `employee` and `supervisor`
--    shared the identical 'prepare' level and forced gating all the way up
--    to 'approve' (hr_admin-only). The trade-off taken here: the oversight
--    roles capped at 'view' (super_admin/ceo/cxo/hr_admin/strategy_admin)
--    do NOT clear the 'prepare' bar either, so they lose broad visibility
--    into goal assignments via RLS for now -- same deliberate
--    under-provisioning choice as `evaluations`, not an oversight, and
--    subject to the same follow-up (a real relationship column or
--    state-aware policy) if broader read access is needed later.
--    SELECT additionally allows the employee's own row via a self-row
--    EXISTS clause (mirroring `evaluations_select`) -- an employee must be
--    able to see goals assigned to them even though their flat
--    'goalAssignment' grant alone (view) would not otherwise clear the
--    'prepare' bar.
--    INSERT/UPDATE have NO self-row bypass: `employee` doesn't hold
--    'prepare' on `goalAssignment` at all in the seeded matrix (unlike
--    `evaluation`, where it explicitly does, matching the documented
--    "employee prepares their own draft" flow) -- goals are assigned BY a
--    supervisor/manager, not self-authored, so this is a correct
--    reflection of the role design, not an oversight.
--
-- 6. No unique constraint on (employee_id, cycle_id): unlike `evaluations`
--    (exactly one row per employee per cycle), an employee is expected to
--    have MULTIPLE goals in the same cycle (their weights are meant to sum
--    toward a 100%-total score) -- CLAUDE.md §5-A rule 10's example doesn't
--    apply here.
--
-- 7. `created_at`/`deleted_at` present (unlike the pure-reference tables
--    from migration 16) -- this is transactional per-employee data, same
--    tier as `evaluations`, not a shared library.
-- ============================================================================

BEGIN;

CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES evaluation_cycles(id) ON DELETE RESTRICT,
  goal_library_id UUID REFERENCES goal_library(id) ON DELETE RESTRICT,
  custom_title_ar TEXT,
  custom_title_en TEXT,
  weight NUMERIC(5,2),
  target_ar TEXT,
  target_en TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT goals_weight_range
    CHECK (weight IS NULL OR (weight > 0 AND weight <= 100)),
  CONSTRAINT goals_title_source
    CHECK (
      (goal_library_id IS NOT NULL AND custom_title_ar IS NULL)
      OR (goal_library_id IS NULL AND custom_title_ar IS NOT NULL)
    )
);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY goals_select ON goals FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = goals.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('goalAssignment', 'prepare', (SELECT org_unit_id FROM profiles WHERE id = goals.employee_id))
  );

CREATE POLICY goals_insert ON goals FOR INSERT TO authenticated
  WITH CHECK (
    check_vpra('goalAssignment', 'prepare', (SELECT org_unit_id FROM profiles WHERE id = goals.employee_id))
  );

CREATE POLICY goals_update ON goals FOR UPDATE TO authenticated
  USING (
    check_vpra('goalAssignment', 'prepare', (SELECT org_unit_id FROM profiles WHERE id = goals.employee_id))
  )
  WITH CHECK (
    check_vpra('goalAssignment', 'prepare', (SELECT org_unit_id FROM profiles WHERE id = goals.employee_id))
  );

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 1 row, rowsecurity = true.
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'goals';

-- Expect: CHECK rejects both goal_library_id and custom_title_ar set
-- together, and rejects neither being set.

-- Expect: CHECK rejects an out-of-range weight; NULL and valid values pass.

-- Expect (SET ROLE authenticated + simulated JWT): a `supervisor` (prepare)
-- test user can insert/see a goal row for another employee; a plain
-- `employee` (view only) test user sees ONLY their own goal row and cannot
-- insert one for anyone, including themselves.
