-- ============================================================================
-- الوحدات التنظيمية التي يملك فيها المستخدم صلاحية بمستوى معيّن
--
-- The employee-assignment tab has to know, before it renders, which unit
-- shares this caller may write — otherwise every share would look editable
-- and the refusal would only arrive after a save.
--
-- Answering it from the client is impossible: `user_roles_select` does expose
-- the caller's own rows, but deciding whether a role grants
-- strategicPlanning>=prepare means reading `role_permissions`, which requires
-- a `userManagement` grant that a dean or department manager has no reason to
-- hold. Same shape as `get_my_role_codes()` / `get_my_permissions()`: a
-- narrow SECURITY DEFINER answer to a question about YOURSELF, not a general
-- bypass — it reads only the caller's own `user_roles`, and returns nothing
-- but org unit ids.
--
-- `scope_type = 'all'` returns no rows on purpose: an unscoped role is not
-- "every unit listed", it is handled by the caller's own global check. Mixing
-- the two here would make an `all`-scoped user's result depend on how many
-- units happen to exist.
-- ============================================================================

CREATE OR REPLACE FUNCTION my_scoped_org_unit_ids(p_process_area process_area, p_level vpra_level)
RETURNS TABLE (org_unit_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT DISTINCT ur.org_unit_id
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
   WHERE ur.user_id = auth.uid()
     AND ur.scope_type = 'org_unit'
     AND ur.org_unit_id IS NOT NULL
     AND rp.process_area = p_process_area
     AND rp.vpra_level >= p_level;
$$;

COMMENT ON FUNCTION my_scoped_org_unit_ids(process_area, vpra_level) IS
  'الوحدات التنظيمية التي يملك فيها المستخدم الحالي المستوى المطلوب في مجال معيّن، من أدواره المقيَّدة بنطاق. لا تُرجع شيئًا للأدوار غير المقيَّدة (نطاقها "الكل") لأن ذلك يُفحص عالميًّا.';

REVOKE EXECUTE ON FUNCTION my_scoped_org_unit_ids(process_area, vpra_level) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION my_scoped_org_unit_ids(process_area, vpra_level) FROM anon;
GRANT EXECUTE ON FUNCTION my_scoped_org_unit_ids(process_area, vpra_level) TO authenticated;
