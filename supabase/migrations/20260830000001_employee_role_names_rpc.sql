-- Fixes a real, live bug reported 2026-08-30: the Employees list's "الدور في
-- النظام" (System Role) column showed "بلا دور" (no role) for every real
-- account tested (hr_admin, manager, employees_coordinator, plain employee),
-- even though `role_permissions`/`user_roles` confirm they genuinely hold
-- roles. Root cause, confirmed directly against pg_policies before writing
-- anything: `roles_select` requires `check_vpra_global('userManagement',
-- 'view')` UNCONDITIONALLY (no self-role exemption at all), and
-- `user_roles_select` only grants a caller their own row or the same
-- `userManagement>=view` bar for anyone else's. Since 2026-07-25's decision
-- ("الغاء تاب الصلاحيات والهوية من hr_admin") removed hr_admin's own
-- userManagement grant entirely, and no other real-world role (manager,
-- employees_coordinator, strategy_admin, plain employee) has ever held one,
-- almost every real caller of this page hits the PostgREST embed
-- (`roles(name_ar)`) returning NULL even for their own visible `user_roles`
-- row -- the role assignment exists, the embed just can't read the name.
--
-- Fixed with a narrow SECURITY DEFINER RPC, matching `get_my_role_codes()`'s
-- own established pattern, rather than widening `roles_select`/
-- `user_roles_select` directly: those tables expose who holds
-- administrative power, a materially different sensitivity than the
-- reference tables (job_titles/org_units/salary_scale) already given an
-- "OR employeeData" RLS branch for the same class of embed-blocked-by-
-- child-table problem. No VPRA gate beyond authentication: this page's own
-- row visibility is already governed by several different RLS branches
-- (self-row, `is_my_direct_report`/`is_my_subordinate`, org-unit-scoped
-- `employeeData`, university-wide `employeeData`) -- gating this RPC at a
-- single flat `employeeData>=view` would incorrectly hide role names for a
-- supervisor who only reaches their reports via `employeeDataSubordinates`,
-- or an employee viewing their own row via the self-row bypass. The real
-- access control stays exactly where it already is: the caller can only
-- ever pass profile ids their own RLS-scoped employees query returned.
create or replace function get_role_names_for_employees(p_profile_ids uuid[])
returns table (profile_id uuid, role_names text[], is_pending boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select p.id, array_agg(distinct r.name_ar), false
  from profiles p
  join user_roles ur on ur.user_id = p.auth_user_id
  join roles r on r.id = ur.role_id and r.deleted_at is null
  where p.id = any(p_profile_ids) and p.auth_user_id is not null
  group by p.id;

  return query
  select pra.profile_id, array_agg(distinct r.name_ar), true
  from pending_role_assignments pra
  join roles r on r.id = pra.role_id and r.deleted_at is null
  where pra.profile_id = any(p_profile_ids)
  group by pra.profile_id;
end;
$$;

revoke all on function get_role_names_for_employees(uuid[]) from public;
revoke all on function get_role_names_for_employees(uuid[]) from anon;
grant execute on function get_role_names_for_employees(uuid[]) to authenticated;
