-- ============================================================================
-- منح cxo صلاحية الاطلاع على بيانات الموظفين
--
-- Requested directly 2026-08-20 ("أعطِ cxo صلاحية employeeData"), following
-- the finding raised while checking the promotions module: `cxo` held no
-- `employeeData` grant at all, so `profiles_select`'s RLS exposed only their
-- own row — the employee dropdown on any screen that picks a person showed
-- them nothing but themselves, with no error to explain it.
--
-- ---------------------------------------------------------------------------
-- WHY 'view' AND NOT HIGHER
-- ---------------------------------------------------------------------------
-- The level was not specified, so this takes the least privilege that
-- actually solves the reported problem (CLAUDE.md §4-B rule 4): 'view' is
-- exactly what `profiles_select` needs. Going further would have real,
-- unrequested consequences:
--   prepare  -> could create/edit employee records (profiles_insert/update)
--   approve  -> could also approve pending employees, assign supervisors,
--               and edit anyone's master data — the hr_admin/ceo tier
-- Say the word and the level is one row to change; it is deliberately not
-- assumed here.
--
-- Scope still applies on top: an `org_unit`-scoped cxo sees their own unit's
-- employees, not the whole university — check_vpra() evaluates scope for this
-- grant exactly as it does for every other role.
--
-- NOTE, recorded because it corrects an earlier report in this project's
-- history: at the time of writing, the live matrix has cxo at
-- `promotions = view` (not 'recommend' as an earlier session note stated), so
-- cxo cannot propose a promotion today regardless of this grant. This
-- migration fixes employee VISIBILITY only; whether cxo should also propose
-- promotions is a separate matrix decision that nobody has taken.
--
-- cxo already holds `employeeDataSubordinates = view` (their own reporting
-- chain). That row is left untouched: it is narrower and independent, and
-- removing it would change behaviour for any screen that checks it directly.
-- ============================================================================

INSERT INTO role_permissions (role_id, process_area, vpra_level)
SELECT r.id, 'employeeData', 'view'
  FROM roles r
 WHERE r.role_code = 'cxo'
ON CONFLICT (role_id, process_area) DO UPDATE
   SET vpra_level = EXCLUDED.vpra_level;

-- Expect: exactly one row, cxo/employeeData/view.
-- SELECT r.role_code, rp.process_area, rp.vpra_level
--   FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
--  WHERE r.role_code = 'cxo' AND rp.process_area = 'employeeData';
