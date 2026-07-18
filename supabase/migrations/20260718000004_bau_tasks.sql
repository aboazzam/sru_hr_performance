-- ============================================================================
-- bau_tasks — per-employee business-as-usual tasks (CLAUDE.md §6
-- "bau_tasks"). No library/template table exists for BAU tasks in
-- SRU_System_Design.md (unlike goals/goal_library) -- this is a flat
-- per-employee list, nothing to consume as a template.
--
-- Design notes:
--
-- 1. Column set transcribed from SRU_System_Design.md's "Goals / BAU" ERD
--    sketch (line 171): `bau_tasks(id, employee_id, cycle_id, title, weight,
--    status)`. [استنتاج] adjustments, same reasoning as goal_library/goals:
--    `title` -> `title_ar`/`title_en` (bilingual-text convention); `weight`
--    reuses goal_library/goals' exact NUMERIC(5,2) + (0,100] CHECK
--    reasoning; `status` has NO CHECK-enforced enum, same as `goals.status`
--    -- no document defines real BAU task status values.
--
-- 2. process_area = 'bauTasks' -- direct CLAUDE.md §4 fact ("Business-as-
--    usual tasks"), not inferred.
--
-- 3. 🔴 RLS -- this is exactly the ambiguity risk fixed in `evaluations`
--    (20260718000001), NOT the safer case `goals`/`goalAssignment` turned
--    out to be (20260718000003). Re-checked the seeded matrix rather than
--    assuming either pattern applies: on `bauTasks`, `employee` holds
--    `'prepare'` -- THE SAME flat level as `supervisor`/`field_supervisor`
--    (unlike `goalAssignment`, where `employee` was safely capped at
--    `'view'`, one tier below). `manager` alone reaches `'approve'`.
--    `check_vpra()` cannot tell which role_code actually satisfied a
--    `'prepare'` check, so gating the non-self branch at `'prepare'` here
--    would repeat the exact hole `evaluations` had: an `employee` assigned
--    `scope_type='all'` could read/write any other employee's BAU tasks.
--    Fixed the same way as `evaluations`: self-row bypass (an employee
--    legitimately prepares their OWN BAU tasks -- that's exactly why
--    `employee`'s flat grant here is `'prepare'`, unlike `goalAssignment`
--    where it's `'view'` because goals are assigned BY someone else) PLUS
--    `check_vpra('bauTasks', 'approve', ...)` for the non-self branch,
--    which only `manager` reaches today -- unambiguous. Deliberately
--    under-grants `supervisor`/`field_supervisor` direct RLS access to
--    their reports' BAU tasks until a real supervisor-relationship column
--    or state-aware policy exists -- same documented follow-up debt as
--    `evaluations`, not a new gap.
--
-- 4. No unique constraint on (employee_id, cycle_id): an employee is
--    expected to have multiple BAU tasks in the same cycle, same reasoning
--    as `goals`.
--
-- 5. `created_at`/`deleted_at` present -- transactional per-employee data,
--    same tier as `evaluations`/`goals`, not a shared reference table.
-- ============================================================================

BEGIN;

CREATE TABLE bau_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES evaluation_cycles(id) ON DELETE RESTRICT,
  title_ar TEXT NOT NULL,
  title_en TEXT,
  weight NUMERIC(5,2),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT bau_tasks_weight_range
    CHECK (weight IS NULL OR (weight > 0 AND weight <= 100))
);

ALTER TABLE bau_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY bau_tasks_select ON bau_tasks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = bau_tasks.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('bauTasks', 'approve', (SELECT org_unit_id FROM profiles WHERE id = bau_tasks.employee_id))
  );

CREATE POLICY bau_tasks_insert ON bau_tasks FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = bau_tasks.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('bauTasks', 'approve', (SELECT org_unit_id FROM profiles WHERE id = bau_tasks.employee_id))
  );

CREATE POLICY bau_tasks_update ON bau_tasks FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = bau_tasks.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('bauTasks', 'approve', (SELECT org_unit_id FROM profiles WHERE id = bau_tasks.employee_id))
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = bau_tasks.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra('bauTasks', 'approve', (SELECT org_unit_id FROM profiles WHERE id = bau_tasks.employee_id))
  );

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 1 row, rowsecurity = true.
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'bau_tasks';

-- Expect: CHECK rejects an out-of-range weight; NULL and valid values pass.

-- Expect (SET ROLE authenticated + simulated JWT): a plain `employee` test
-- user can create/see their OWN bau_tasks row but sees zero rows and is
-- rejected inserting for a different employee (scope_type='all' must NOT
-- grant broad access via the shared 'prepare' level); a `manager`
-- (approve) test user can create/see a row for a different employee.
