-- ============================================================================
-- Seed: role_permissions baseline matrix (12 roles x 12 process areas)
--
-- STATUS: FIRST DRAFT PROPOSAL, not a signed-off business decision. Every
-- cell below is [استنتاج] — inferred from role names/descriptions in
-- CLAUDE.md §4, the evaluation-lifecycle table in §4-A (src/lib/vpra.ts),
-- and the module list in SRU_System_Design.md §A — NOT transcribed from any
-- explicit "role X gets level Y on area Z" statement, because no such
-- matrix exists anywhere in the project's documents. 20260716000001's
-- header explicitly deferred this exact decision to "the project owner,
-- role by role" — this migration is that first attempt, meant to be
-- reviewed and corrected, not accepted as final. Cells omitted below default
-- to 'none' (the column default, and functionally identical to "no row" —
-- check_vpra()'s INNER JOIN on role_permissions treats a missing row and an
-- explicit 'none' row the same way).
--
-- ----------------------------------------------------------------------------
-- Design principles applied (so each cell below can be sanity-checked
-- against a rule, not read as 12x12 arbitrary choices):
--
-- 1. For the 5 roles named in CLAUDE.md §4-A's evaluation-lifecycle table
--    (employee, supervisor, manager, committee, hr_admin), each role's flat
--    `evaluation` baseline here is set to the HIGHEST level that role ever
--    reaches at any state in that table (employee/supervisor -> prepare,
--    manager/committee -> recommend, hr_admin -> approve). This is a
--    *ceiling*, not a bypass: CLAUDE.md's rule "VPRA checks must consider
--    BOTH permission level AND state" still applies — real evaluation
--    actions must additionally pass src/lib/vpra.ts's per-state table, which
--    this flat grant does not replace (see 20260716000001's role_permissions
--    comment, and note 5 in 20260716000006).
-- 2. Roles outside that table of five (super_admin, ceo, cxo, strategy_admin,
--    competencies_admin, field_supervisor, mentor) get 'view' on
--    `evaluation` for oversight, except field_supervisor which is modeled as
--    a parallel to `supervisor` for field/operational staff (CLAUDE.md's own
--    description, "مشرف ميداني") and so gets the same profile as supervisor
--    throughout, not just on `evaluation`.
-- 3. Each of the four "owner" roles gets 'approve' on the one process area
--    their name/description directly names: hr_admin -> employeeData,
--    strategy_admin -> goalsLibrary, competencies_admin -> competencyFramework.
--    hr_admin ALSO gets 'approve' on userManagement, because CLAUDE.md §4-B
--    says explicitly (the one non-inferred fact in this whole file):
--    "super_admin and hr_admin can create custom roles from the UI."
-- 4. super_admin is treated as a TECHNICAL administrator, not an implicit
--    all-powerful role — src/lib/vpra.ts's own comment on this exact point
--    warns against assuming otherwise. It gets 'approve' only on
--    userManagement and defaultTemplates (system/template configuration)
--    and 'view' everywhere else (oversight/support access, not business
--    authority over evaluation, promotions, etc. — those stay with the
--    roles that own them).
-- 5. ceo/cxo (executive tier): 'view' across the board for oversight, plus
--    the one place an executive plausibly has real authority --
--    `promotions` -- where ceo gets 'approve' (final sign-off) and cxo gets
--    'recommend' (one tier below, mirroring the ceo/cxo hierarchy implied
--    by their Arabic titles "الرئيس التنفيذي"/"رئيس تنفيذي").
-- 6. `userManagement` write authority (>= approve) is granted to NO role
--    here except super_admin and hr_admin (rule 3). ceo/cxo additionally get
--    'view' per rule 5's "view across the board" for executive oversight --
--    they can see the role/permission structure but not change it. Every
--    other role defaults to 'none', matching least-privilege and the fact
--    that no other role's description mentions user/role administration.
-- 7. `employee`'s own profile/evaluation self-access does NOT depend on
--    this table at all -- 20260716000006's profiles/user_roles SELECT
--    policies already grant unconditional self-row visibility
--    (`id = auth.uid()`). employee's row here is deliberately NOT given an
--    `employeeData` grant for that reason (would only ever broaden it
--    beyond self, which is not intended for a plain employee role).
-- ----------------------------------------------------------------------------
--
-- Not addressed here (separate, later decision): scope_type for HOW these
-- roles get assigned to actual users (user_roles.scope_type = 'all' vs
-- 'org_unit') is a per-assignment choice made when a user is actually
-- granted a role, not part of this baseline matrix.
-- ============================================================================

BEGIN;

INSERT INTO role_permissions (role_id, process_area, vpra_level)
SELECT r.id, v.process_area::process_area, v.vpra_level::vpra_level
FROM (VALUES
  -- super_admin: technical/system administrator (see design note 4)
  ('super_admin', 'userManagement', 'approve'),
  ('super_admin', 'defaultTemplates', 'approve'),
  ('super_admin', 'employeeData', 'view'),
  ('super_admin', 'competencyFramework', 'view'),
  ('super_admin', 'goalsLibrary', 'view'),
  ('super_admin', 'goalAssignment', 'view'),
  ('super_admin', 'bauTasks', 'view'),
  ('super_admin', 'evaluation', 'view'),
  ('super_admin', 'calibration', 'view'),
  ('super_admin', 'promotions', 'view'),
  ('super_admin', 'vacancies', 'view'),
  ('super_admin', 'careerPath', 'view'),

  -- ceo: top executive, final sign-off on promotions only (design note 5)
  ('ceo', 'promotions', 'approve'),
  ('ceo', 'evaluation', 'view'),
  ('ceo', 'calibration', 'view'),
  ('ceo', 'vacancies', 'view'),
  ('ceo', 'careerPath', 'view'),
  ('ceo', 'goalsLibrary', 'view'),
  ('ceo', 'employeeData', 'view'),
  ('ceo', 'competencyFramework', 'view'),
  ('ceo', 'goalAssignment', 'view'),
  ('ceo', 'bauTasks', 'view'),
  ('ceo', 'defaultTemplates', 'view'),
  ('ceo', 'userManagement', 'view'),

  -- cxo: executive tier below ceo (design note 5)
  ('cxo', 'promotions', 'recommend'),
  ('cxo', 'evaluation', 'view'),
  ('cxo', 'calibration', 'view'),
  ('cxo', 'vacancies', 'view'),
  ('cxo', 'careerPath', 'view'),
  ('cxo', 'goalsLibrary', 'view'),
  ('cxo', 'employeeData', 'view'),
  ('cxo', 'competencyFramework', 'view'),
  ('cxo', 'goalAssignment', 'view'),
  ('cxo', 'bauTasks', 'view'),
  ('cxo', 'defaultTemplates', 'view'),
  ('cxo', 'userManagement', 'view'),

  -- hr_admin: operational HR owner (design notes 1 and 3)
  ('hr_admin', 'employeeData', 'approve'),
  ('hr_admin', 'userManagement', 'approve'),
  ('hr_admin', 'evaluation', 'approve'),
  ('hr_admin', 'calibration', 'approve'),
  ('hr_admin', 'promotions', 'recommend'),
  ('hr_admin', 'vacancies', 'approve'),
  ('hr_admin', 'careerPath', 'approve'),
  ('hr_admin', 'defaultTemplates', 'approve'),
  ('hr_admin', 'goalsLibrary', 'view'),
  ('hr_admin', 'goalAssignment', 'view'),
  ('hr_admin', 'bauTasks', 'view'),
  ('hr_admin', 'competencyFramework', 'view'),

  -- strategy_admin: owns the goals library (design note 3)
  ('strategy_admin', 'goalsLibrary', 'approve'),
  ('strategy_admin', 'careerPath', 'view'),
  ('strategy_admin', 'promotions', 'view'),
  ('strategy_admin', 'evaluation', 'view'),
  ('strategy_admin', 'calibration', 'view'),
  ('strategy_admin', 'employeeData', 'view'),
  ('strategy_admin', 'competencyFramework', 'view'),
  ('strategy_admin', 'goalAssignment', 'view'),
  ('strategy_admin', 'defaultTemplates', 'view'),

  -- competencies_admin: owns the competency framework (design note 3)
  ('competencies_admin', 'competencyFramework', 'approve'),
  ('competencies_admin', 'evaluation', 'view'),
  ('competencies_admin', 'defaultTemplates', 'view'),
  ('competencies_admin', 'calibration', 'view'),
  ('competencies_admin', 'careerPath', 'view'),

  -- committee: evaluation committee, peak = recommend at manager_recommended
  -- state (design note 1)
  ('committee', 'evaluation', 'recommend'),
  ('committee', 'calibration', 'recommend'),
  ('committee', 'promotions', 'view'),
  ('committee', 'employeeData', 'view'),
  ('committee', 'competencyFramework', 'view'),
  ('committee', 'defaultTemplates', 'view'),

  -- manager (عميد/مدير): peak = recommend at supervisor_reviewed state
  -- (design note 1); owns goal assignment and BAU tasks for their unit
  ('manager', 'evaluation', 'recommend'),
  ('manager', 'goalAssignment', 'approve'),
  ('manager', 'promotions', 'recommend'),
  ('manager', 'bauTasks', 'approve'),
  ('manager', 'employeeData', 'view'),
  ('manager', 'vacancies', 'recommend'),
  ('manager', 'calibration', 'view'),
  ('manager', 'careerPath', 'view'),
  ('manager', 'competencyFramework', 'view'),
  ('manager', 'goalsLibrary', 'view'),
  ('manager', 'defaultTemplates', 'view'),

  -- supervisor: peak = prepare at submitted state (design note 1)
  ('supervisor', 'evaluation', 'prepare'),
  ('supervisor', 'goalAssignment', 'prepare'),
  ('supervisor', 'bauTasks', 'prepare'),
  ('supervisor', 'employeeData', 'view'),
  ('supervisor', 'promotions', 'view'),
  ('supervisor', 'careerPath', 'view'),
  ('supervisor', 'competencyFramework', 'view'),
  ('supervisor', 'goalsLibrary', 'view'),
  ('supervisor', 'defaultTemplates', 'view'),

  -- employee: peak = prepare at draft state (design note 1); no employeeData
  -- grant here by design (design note 7 -- self-access is unconditional
  -- via the profiles RLS policy, not this table)
  ('employee', 'evaluation', 'prepare'),
  ('employee', 'bauTasks', 'prepare'),
  ('employee', 'goalAssignment', 'view'),
  ('employee', 'competencyFramework', 'view'),
  ('employee', 'vacancies', 'view'),
  ('employee', 'careerPath', 'view'),
  ('employee', 'goalsLibrary', 'view'),

  -- field_supervisor: modeled as supervisor's field/operational counterpart
  -- (design note 2) -- identical profile to supervisor
  ('field_supervisor', 'evaluation', 'prepare'),
  ('field_supervisor', 'goalAssignment', 'prepare'),
  ('field_supervisor', 'bauTasks', 'prepare'),
  ('field_supervisor', 'employeeData', 'view'),
  ('field_supervisor', 'promotions', 'view'),
  ('field_supervisor', 'careerPath', 'view'),
  ('field_supervisor', 'competencyFramework', 'view'),
  ('field_supervisor', 'goalsLibrary', 'view'),
  ('field_supervisor', 'defaultTemplates', 'view'),

  -- mentor: guidance role, view-only on the three areas relevant to
  -- coaching a mentee (evaluation status, competency development, career path)
  ('mentor', 'evaluation', 'view'),
  ('mentor', 'competencyFramework', 'view'),
  ('mentor', 'careerPath', 'view')
) AS v(role_code, process_area, vpra_level)
JOIN roles r ON r.role_code = v.role_code;

COMMIT;

-- ============================================================================
-- Verification queries — run these AFTER the migration and BEFORE trusting
-- it, per PROJECT_STRICT.md rule 10. Expected results noted inline.
-- ============================================================================

-- Expect: 107 rows total.
-- SELECT count(*) FROM role_permissions;

-- Expect: 0 rows -- every role_code in the VALUES list above must exist in
-- roles, or the JOIN silently drops that role's rows instead of erroring.
-- WITH expected(role_code) AS (
--   VALUES ('super_admin'),('ceo'),('cxo'),('hr_admin'),('strategy_admin'),
--     ('competencies_admin'),('committee'),('manager'),('supervisor'),
--     ('employee'),('field_supervisor'),('mentor')
-- )
-- SELECT e.role_code FROM expected e
--   WHERE (SELECT count(*) FROM role_permissions rp
--            JOIN roles r ON r.id = rp.role_id WHERE r.role_code = e.role_code) = 0;

-- Expect: exactly 2 rows (super_admin, hr_admin) per design note 3/CLAUDE.md §4-B.
-- SELECT r.role_code FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
--   WHERE rp.process_area = 'userManagement' AND rp.vpra_level != 'none';

-- Expect: hr_admin = approve (matches lifecycle table's committee_reviewed peak).
-- SELECT r.role_code, rp.vpra_level FROM role_permissions rp
--   JOIN roles r ON r.id = rp.role_id
--   WHERE rp.process_area = 'evaluation' AND r.role_code = 'hr_admin';
