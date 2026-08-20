-- ============================================================================
-- المبادرة: الإدارة المالكة بدل المنصب المالك، والربط بالهدف الفرعي، وحالات
-- قابلة لإدارتها من موديول الإدارة
--
-- Requested 2026-08-20:
--   * "عدل المنصب المالك الى الادارة المالكة"  -> owner is an org_unit, not an
--     org_structure_position. This matches the real initiative cards supplied
--     as PDFs, where "صاحب المبادرة" is a department/centre ("المدير العام
--     للاتصال وتقنية المعلومات", "مركز القيم والسلوكيات المهنية") and matches
--     the assignment slice, which already assigns to org_units.
--   * "واربط المبادرة بالهدف الفرعي والمستهدف الخاص به" -> a direct
--     sub_goal_id, alongside the existing target links. The cards show both
--     "الهدف الرئيسي (SRU)" and "الهدف الفرعي (LOGIC)" on every initiative,
--     so the sub-goal is part of the initiative's own identity, not only a
--     many-to-many link.
--   * "ضع الحالة عبارة عن دروب داون ... واترك للادمن فرصة تغيير الحالات من
--     خلال موديول الادارة" -> statuses become a real lookup table, seeded with
--     the four requested values and editable from the admin module.
--
-- SAFE TO RESHAPE: strategic_initiatives is empty in production (verified
-- directly before writing this), so owner_position_id is dropped rather than
-- kept alongside its replacement — one answer to "who owns this", not two.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. حالات المبادرة (admin-managed lookup)
-- ---------------------------------------------------------------------------
CREATE TABLE initiative_statuses (
  code TEXT PRIMARY KEY,
  label_ar TEXT NOT NULL,
  label_en TEXT,
  display_order INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE initiative_statuses IS 'حالات المبادرة، قابلة للتعديل من موديول الإدارة. الكود ثابت وتُعدَّل التسمية والترتيب والتفعيل.';

INSERT INTO initiative_statuses (code, label_ar, label_en, display_order) VALUES
  ('pending',     'في انتظار التنفيذ', 'Pending',     1),
  ('in_progress', 'قيد التنفيذ',       'In progress', 2),
  ('delayed',     'متأخر',             'Delayed',     3),
  ('done',        'منتهي',             'Done',        4);

ALTER TABLE initiative_statuses ENABLE ROW LEVEL SECURITY;

-- Readable by everyone: it is a label list, and every initiative row renders
-- through it. Editing sits in the admin module — `systemSettings`, the same
-- narrow tier that already owns /admin/settings — because the request placed
-- it there ("من خلال موديول الادارة"), not with strategic planning.
CREATE POLICY initiative_statuses_select ON initiative_statuses FOR SELECT TO authenticated
  USING (true);

CREATE POLICY initiative_statuses_insert ON initiative_statuses FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('systemSettings', 'approve'));

CREATE POLICY initiative_statuses_update ON initiative_statuses FOR UPDATE TO authenticated
  USING (check_vpra_global('systemSettings', 'approve'))
  WITH CHECK (check_vpra_global('systemSettings', 'approve'));

-- ---------------------------------------------------------------------------
-- 2. المبادرة: المالك والهدف الفرعي والحالة
-- ---------------------------------------------------------------------------
ALTER TABLE strategic_initiatives
  ADD COLUMN owner_org_unit_id UUID REFERENCES org_units(id) ON DELETE RESTRICT,
  ADD COLUMN sub_goal_id UUID REFERENCES sub_goals(id) ON DELETE SET NULL,
  ADD COLUMN status_code TEXT REFERENCES initiative_statuses(code) ON DELETE RESTRICT;

COMMENT ON COLUMN strategic_initiatives.owner_org_unit_id IS 'الإدارة/الكلية المالكة للمبادرة (صاحب المبادرة في البطاقة).';
COMMENT ON COLUMN strategic_initiatives.sub_goal_id IS 'الهدف الفرعي الذي تخدمه المبادرة؛ الهدف الرئيسي يُشتق منه.';

-- Table is empty, so the backfill is a no-op today and exists only so this
-- migration is correct if run against a database that does have rows.
UPDATE strategic_initiatives
   SET status_code = CASE
     WHEN status IN ('pending', 'in_progress', 'delayed', 'done') THEN status
     ELSE 'pending'
   END
 WHERE status_code IS NULL;

ALTER TABLE strategic_initiatives ALTER COLUMN status_code SET DEFAULT 'pending';
ALTER TABLE strategic_initiatives ALTER COLUMN status_code SET NOT NULL;

-- The free-text status column is superseded by the lookup.
ALTER TABLE strategic_initiatives DROP COLUMN status;

-- ---------------------------------------------------------------------------
-- 3. RLS follows the owner change
-- ---------------------------------------------------------------------------
-- The visibility branch moves from "I hold the owning POSITION" to "I belong
-- to the owning ORG UNIT" — the same shift the request makes, so a member of
-- the owning department sees their own initiatives without a strategic
-- planning grant. is_my_org_unit() keeps that lookup out of profiles' own RLS
-- (a caller may not be allowed to read their own colleagues' rows), matching
-- is_my_strategic_position()'s established shape.
CREATE FUNCTION is_my_org_unit(p_org_unit_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_org_unit_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.auth_user_id = auth.uid()
      AND p.org_unit_id = p_org_unit_id
      AND p.deleted_at IS NULL
  );
$$;

COMMENT ON FUNCTION is_my_org_unit IS 'TRUE iff the caller''s own profile belongs to p_org_unit_id. SECURITY DEFINER for the same reason as is_my_strategic_position().';

REVOKE EXECUTE ON FUNCTION is_my_org_unit(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_my_org_unit(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION is_my_org_unit(UUID) TO authenticated;

DROP POLICY strategic_initiatives_select ON strategic_initiatives;

CREATE POLICY strategic_initiatives_select ON strategic_initiatives FOR SELECT TO authenticated
  USING (
    check_vpra_global('strategicPlanning', 'view')
    OR (owner_org_unit_id IS NOT NULL AND is_my_org_unit(owner_org_unit_id))
    OR is_initiative_in_my_program(id)
  );

-- owner_position_id is no longer part of the model.
ALTER TABLE strategic_initiatives DROP COLUMN owner_position_id;
