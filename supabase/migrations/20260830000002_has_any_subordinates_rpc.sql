-- The Employees sidebar tab is visible via `employeeData` OR the narrower
-- `employeeDataSubordinates` (PR #99, 2026-07-27 -- a manager/deputy with
-- real direct reports but only the subordinates grant correctly saw the
-- page's content but the tab itself never showed). Follow-up request
-- (2026-08-30): a caller who qualifies ONLY through
-- `employeeDataSubordinates` but genuinely has zero subordinates should not
-- see the tab at all -- it would just open to an empty list. A caller who
-- also holds `employeeData` still sees the tab regardless (that grant shows
-- more than their own reports).
--
-- Mirrors `is_my_subordinate(target_employee_id)`'s own recursive
-- supervisor-chain walk (20260718000009) exactly, just as an existence
-- check with no specific target -- "does the caller have ANY subordinate at
-- any depth", not "is a specific person one of them". Same depth cap (20)
-- as every other recursive supervisor-chain walk in this schema, guarding
-- against a corrupted cyclical supervisor_id chain.
create or replace function has_any_subordinates()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive chain as (
    select id, supervisor_id, 0 as depth
    from profiles
    where supervisor_id = (select id from profiles where auth_user_id = auth.uid())
    union all
    select p.id, p.supervisor_id, c.depth + 1
    from profiles p
    join chain c on p.supervisor_id = c.id
    where c.depth < 20
  )
  select exists (select 1 from chain);
$$;

revoke all on function has_any_subordinates() from public;
revoke all on function has_any_subordinates() from anon;
grant execute on function has_any_subordinates() to authenticated;
