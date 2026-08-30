-- ============================================================================
-- Org chart: visual groups + functional (dotted-line) relationships +
-- production content matching the approved static mockup built this session.
--
-- Replaces OrgChartTree.tsx's old name-string `isBranchContainer` heuristic
-- (any position whose name starts with "الإدارة التنفيذية"/"النائب
-- المساعد") with real, data-driven, general-purpose primitives:
--
--   org_structure_position_groups: pulls SOME (not necessarily all) of one
--     real parent's children out of the shared main-pyramid grid and lays
--     them out together as a branch, 'vertical' (a single stacked column,
--     spine + one short tick per member) or 'horizontal' (a fan-out, same
--     mechanism the old name-matched containers already used). `parent_id`
--     never changes because of grouping -- a group only changes how
--     something is DRAWN, never what it reports to. Groups nest freely (a
--     member can itself be the real parent of a further group).
--
--   org_structure_functional_lines: a secondary, non-reporting "dotted
--     line" relationship between two positions that otherwise share no
--     parent_id edge (e.g. لجنة المراجعة <-> إدارة المراجعة الداخلية,
--     "وظيفيًا") -- modelled directly on career_path's own shape
--     (20260716000013): two FKs to the same parent table, a CHECK against
--     self-reference, a UNIQUE pair, deleted_at for soft delete, no DELETE
--     policy.
--
--   org_structure_positions.color: a per-position color override, same
--     convention as org_structure_levels.color (20260725000005) -- lets a
--     handful of positions within one shared level stand out (e.g. the
--     three "الإدارة التنفيذية" positions rendered blue/teal against the
--     three purple "النائب المساعد" positions they share a row with),
--     without fragmenting one real level into several just for color.
--
-- RLS on both new tables mirrors org_structure_positions' own exactly:
-- check_vpra_global('orgStructure','view') to read, ('orgStructure',
-- 'recommend') to write, no DELETE policy (soft-delete only, CLAUDE.md
-- §5-A rule 7).
--
-- The data section below applies the specific content negotiated across a
-- long mockup-review thread with the project owner and confirmed live
-- against this exact production tree: a new "أمانة مجلس الأمناء" position
-- (does not exist yet, added fresh), a real tبعية correction for المجلس
-- العلمي (was a direct child of رئيس الجامعة, corrected to نائب الرئيس),
-- a real split of the single "وحدة التوعية والسلوك المهني" row into two
-- ("وحدة التوعية الفكرية" + "مركز القيم والسلوك المهني", per the reference
-- chart image naming both separately), and a full level_order cleanup so
-- رئيس الجامعة and نائب الرئيس each render alone in their own row and the
-- three "الإدارة التنفيذية" + three "النائب المساعد" positions (plus
-- المشرفة على القسم النسائي) share ONE row below نائب -- confirmed directly
-- with the project owner mid-session ("الرسم لا تغير فيه شيء … الرئيس C1،
-- النائب C2، المدراء التنفيذيون والنواب المساعدون C3، الإدارات الأخرى C4")
-- after the real level_order assignment was found to mix رئيس/نائب in with
-- several of their own children on the same level.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Schema: groups + functional lines + per-position color
-- ----------------------------------------------------------------------------

CREATE TABLE org_structure_position_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES org_structure_positions (id) ON DELETE CASCADE,
  layout TEXT NOT NULL CHECK (layout IN ('horizontal', 'vertical')),
  label_ar TEXT,
  label_en TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE org_structure_position_groups IS 'Visual grouping: some (not necessarily all) real children of parent_id, drawn together as one branch (vertical = stacked column, horizontal = fan-out) instead of the shared main-pyramid grid. Never a reporting relationship of its own -- parent_id on the member rows is unaffected.';

ALTER TABLE org_structure_positions
  ADD COLUMN group_id UUID REFERENCES org_structure_position_groups (id) ON DELETE SET NULL,
  ADD COLUMN color TEXT;

COMMENT ON COLUMN org_structure_positions.group_id IS 'Optional membership in a org_structure_position_groups row -- when set, this position is excluded from the main pyramid grid and rendered as part of that group''s own branch instead.';
COMMENT ON COLUMN org_structure_positions.color IS 'Optional per-position color override for the org chart, same convention as org_structure_levels.color -- NULL falls back to the level/theme color.';

CREATE TABLE org_structure_functional_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_position_id UUID NOT NULL REFERENCES org_structure_positions (id) ON DELETE RESTRICT,
  to_position_id UUID NOT NULL REFERENCES org_structure_positions (id) ON DELETE RESTRICT,
  label_ar TEXT,
  label_en TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CHECK (from_position_id <> to_position_id),
  UNIQUE (from_position_id, to_position_id)
);

COMMENT ON TABLE org_structure_functional_lines IS 'A secondary, non-reporting "dotted line" relationship between two positions (e.g. لجنة المراجعة <-> إدارة المراجعة الداخلية, "وظيفيًا") -- rendered as a dashed elbow connector on the org chart, independent of parent_id.';

ALTER TABLE org_structure_position_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_structure_functional_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_structure_position_groups_select ON org_structure_position_groups FOR SELECT TO authenticated
  USING (check_vpra_global('orgStructure', 'view'));

CREATE POLICY org_structure_position_groups_insert ON org_structure_position_groups FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('orgStructure', 'recommend'));

CREATE POLICY org_structure_position_groups_update ON org_structure_position_groups FOR UPDATE TO authenticated
  USING (check_vpra_global('orgStructure', 'recommend'))
  WITH CHECK (check_vpra_global('orgStructure', 'recommend'));

CREATE POLICY org_structure_functional_lines_select ON org_structure_functional_lines FOR SELECT TO authenticated
  USING (check_vpra_global('orgStructure', 'view'));

CREATE POLICY org_structure_functional_lines_insert ON org_structure_functional_lines FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('orgStructure', 'recommend'));

CREATE POLICY org_structure_functional_lines_update ON org_structure_functional_lines FOR UPDATE TO authenticated
  USING (check_vpra_global('orgStructure', 'recommend'))
  WITH CHECK (check_vpra_global('orgStructure', 'recommend'));

-- ----------------------------------------------------------------------------
-- Data: أمانة مجلس الأمناء (brand new position)
-- ----------------------------------------------------------------------------

INSERT INTO org_structure_positions (level_id, parent_id, name_ar)
SELECT
  (SELECT level_id FROM org_structure_positions WHERE name_ar = 'لجنة المراجعة' AND deleted_at IS NULL),
  (SELECT id FROM org_structure_positions WHERE name_ar = 'مجلس الأمناء' AND deleted_at IS NULL),
  'أمانة مجلس الأمناء';

-- ----------------------------------------------------------------------------
-- Data: المجلس العلمي -- real تبعية correction, رئيس -> نائب
-- ----------------------------------------------------------------------------

UPDATE org_structure_positions
SET parent_id = (SELECT id FROM org_structure_positions WHERE name_ar = 'نائب الرئيس للشؤون الأكاديمية' AND deleted_at IS NULL)
WHERE name_ar = 'المجلس العلمي' AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- Data: split وحدة التوعية والسلوك المهني into two real rows
-- ----------------------------------------------------------------------------

UPDATE org_structure_positions
SET name_ar = 'وحدة التوعية الفكرية'
WHERE name_ar = 'وحدة التوعية والسلوك المهني' AND deleted_at IS NULL;

INSERT INTO org_structure_positions (level_id, parent_id, name_ar)
SELECT
  (SELECT level_id FROM org_structure_positions WHERE name_ar = 'وحدة التوعية الفكرية' AND deleted_at IS NULL),
  (SELECT parent_id FROM org_structure_positions WHERE name_ar = 'وحدة التوعية الفكرية' AND deleted_at IS NULL),
  'مركز القيم والسلوك المهني';

-- ----------------------------------------------------------------------------
-- Level cleanup: رئيس الجامعة alone, نائب الرئيس alone, الإدارات التنفيذية +
-- النواب المساعدون share one row -- see header note for the exact confirmed
-- scheme. Two-phase renumber (negative placeholders, then final values) to
-- avoid colliding with org_structure_levels_order_uidx, same pattern as the
-- reorderLevels() Server Action already uses.
-- ----------------------------------------------------------------------------

UPDATE org_structure_levels SET level_order = -104 WHERE level_order = 4 AND deleted_at IS NULL;
UPDATE org_structure_levels SET level_order = -105 WHERE level_order = 5 AND deleted_at IS NULL;
UPDATE org_structure_levels SET level_order = -106 WHERE level_order = 6 AND deleted_at IS NULL;
-- Now 4, 5, 6 are free; renumber the placeholders to their real final values
-- (old C4 -> 6 "الإدارات التنفيذية+النواب المساعدون", old C5 -> 7, old C6 -> 8).
UPDATE org_structure_levels SET level_order = 6 WHERE level_order = -104;
UPDATE org_structure_levels SET level_order = 7 WHERE level_order = -105;
UPDATE org_structure_levels SET level_order = 8 WHERE level_order = -106;

INSERT INTO org_structure_levels (name_ar, level_order)
VALUES ('الإدارات المرتبطة بالرئيس مباشرة', 4), ('نائب الرئيس', 5);

-- رئيس الجامعة keeps its existing level (order 3, "C3") -- everything else
-- that used to share it moves to the new order-4 level below.
UPDATE org_structure_positions
SET level_id = (SELECT id FROM org_structure_levels WHERE level_order = 4)
WHERE name_ar IN (
  'أمانة مجلس الجامعة', 'إدارة الشؤون القانونية', 'مكتب الحوكمة وإدارة المخاطر والالتزام', 'إدارة المراجعة الداخلية',
  'عمداء الكليات', 'مكتب إدارة الاستراتيجية', 'إدارة التميز المؤسسي', 'إدارة الاتصال المؤسسي', 'إدارة المسؤولية المجتمعية',
  'مكتب الرئيس', 'وحدة التوعية الفكرية', 'مركز القيم والسلوك المهني'
) AND deleted_at IS NULL;

UPDATE org_structure_positions
SET level_id = (SELECT id FROM org_structure_levels WHERE level_order = 5)
WHERE name_ar IN ('نائب الرئيس للشؤون الأكاديمية', 'المجلس العلمي') AND deleted_at IS NULL;

UPDATE org_structure_positions
SET level_id = (SELECT id FROM org_structure_levels WHERE level_order = 6)
WHERE name_ar IN (
  'الإدارة التنفيذية لتطوير الأعمال', 'الإدارة التنفيذية للاتصالات وتقنية المعلومات', 'الإدارة التنفيذية للخدمات المشتركة',
  'النائب المساعد للتميز الأكاديمي', 'النائب المساعد للدراسات العليا والبحث العلمي', 'النائب المساعد لتجربة الطالب',
  'المشرفة على القسم النسائي'
) AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- Visual groups: reproduces the approved mockup's spine+tick vertical lists
-- and تطوير الأعمال's horizontal fan, exactly as negotiated.
-- ----------------------------------------------------------------------------

-- LEFT group (vertical), off رئيس الجامعة
WITH g AS (
  INSERT INTO org_structure_position_groups (parent_id, layout)
  SELECT id, 'vertical' FROM org_structure_positions WHERE name_ar = 'رئيس الجامعة' AND deleted_at IS NULL
  RETURNING id
)
UPDATE org_structure_positions SET group_id = (SELECT id FROM g)
WHERE name_ar IN ('مكتب إدارة الاستراتيجية', 'إدارة التميز المؤسسي', 'إدارة الاتصال المؤسسي', 'إدارة المسؤولية المجتمعية') AND deleted_at IS NULL;

-- RIGHT / oversight group (vertical), off رئيس الجامعة
WITH g AS (
  INSERT INTO org_structure_position_groups (parent_id, layout)
  SELECT id, 'vertical' FROM org_structure_positions WHERE name_ar = 'رئيس الجامعة' AND deleted_at IS NULL
  RETURNING id
)
UPDATE org_structure_positions SET group_id = (SELECT id FROM g)
WHERE name_ar IN ('إدارة المراجعة الداخلية', 'مكتب الحوكمة وإدارة المخاطر والالتزام', 'إدارة الشؤون القانونية') AND deleted_at IS NULL;

-- Colleges group (vertical), off عمداء الكليات
WITH g AS (
  INSERT INTO org_structure_position_groups (parent_id, layout)
  SELECT id, 'vertical' FROM org_structure_positions WHERE name_ar = 'عمداء الكليات' AND deleted_at IS NULL
  RETURNING id
)
UPDATE org_structure_positions SET group_id = (SELECT id FROM g)
WHERE name_ar IN ('كلية الطب', 'كلية التمريض', 'كلية الأعمال', 'كلية العلوم الصحية') AND deleted_at IS NULL;

-- المجلس العلمي as a single-member vertical group off نائب الرئيس (so نائب
-- still renders alone in its own main-pyramid row).
WITH g AS (
  INSERT INTO org_structure_position_groups (parent_id, layout)
  SELECT id, 'vertical' FROM org_structure_positions WHERE name_ar = 'نائب الرئيس للشؤون الأكاديمية' AND deleted_at IS NULL
  RETURNING id
)
UPDATE org_structure_positions SET group_id = (SELECT id FROM g) WHERE name_ar = 'المجلس العلمي' AND deleted_at IS NULL;

-- تطوير الأعمال group (horizontal fan, 3 members)
WITH g AS (
  INSERT INTO org_structure_position_groups (parent_id, layout)
  SELECT id, 'horizontal' FROM org_structure_positions WHERE name_ar = 'الإدارة التنفيذية لتطوير الأعمال' AND deleted_at IS NULL
  RETURNING id
)
UPDATE org_structure_positions SET group_id = (SELECT id FROM g)
WHERE name_ar IN ('إدارة التدريب والاستشارات', 'إدارة الشراكات', 'إدارة تطوير المنتجات والخدمات') AND deleted_at IS NULL;

-- Nested vertical sub-group under إدارة التدريب والاستشارات
WITH g AS (
  INSERT INTO org_structure_position_groups (parent_id, layout)
  SELECT id, 'vertical' FROM org_structure_positions WHERE name_ar = 'إدارة التدريب والاستشارات' AND deleted_at IS NULL
  RETURNING id
)
UPDATE org_structure_positions SET group_id = (SELECT id FROM g)
WHERE name_ar IN ('إدارة التدريب', 'مركز الاستشارات') AND deleted_at IS NULL;

-- Nested vertical sub-group under إدارة تطوير المنتجات والخدمات
WITH g AS (
  INSERT INTO org_structure_position_groups (parent_id, layout)
  SELECT id, 'vertical' FROM org_structure_positions WHERE name_ar = 'إدارة تطوير المنتجات والخدمات' AND deleted_at IS NULL
  RETURNING id
)
UPDATE org_structure_positions SET group_id = (SELECT id FROM g)
WHERE name_ar IN ('مركز الابتكار وريادة الأعمال', 'مركز إدارة المحتوى') AND deleted_at IS NULL;

-- Vertical groups under each of the three النائب المساعد positions
WITH g AS (
  INSERT INTO org_structure_position_groups (parent_id, layout)
  SELECT id, 'vertical' FROM org_structure_positions WHERE name_ar = 'النائب المساعد للتميز الأكاديمي' AND deleted_at IS NULL
  RETURNING id
)
UPDATE org_structure_positions SET group_id = (SELECT id FROM g)
WHERE name_ar IN ('مركز التعليم والتعلم', 'مركز التقييم والقياس', 'إدارة التجهيزات التعليمية', 'مكتب الاعتماد الأكاديمي') AND deleted_at IS NULL;

WITH g AS (
  INSERT INTO org_structure_position_groups (parent_id, layout)
  SELECT id, 'vertical' FROM org_structure_positions WHERE name_ar = 'النائب المساعد للدراسات العليا والبحث العلمي' AND deleted_at IS NULL
  RETURNING id
)
UPDATE org_structure_positions SET group_id = (SELECT id FROM g)
WHERE name_ar IN ('مكتب الدراسات العليا', 'مكتب البحث العلمي') AND deleted_at IS NULL;

WITH g AS (
  INSERT INTO org_structure_position_groups (parent_id, layout)
  SELECT id, 'vertical' FROM org_structure_positions WHERE name_ar = 'النائب المساعد لتجربة الطالب' AND deleted_at IS NULL
  RETURNING id
)
UPDATE org_structure_positions SET group_id = (SELECT id FROM g)
WHERE name_ar IN ('مكتب القبول', 'مكتب المنح والحلول المالية', 'مكتب التسجيل والإرشاد الأكاديمي', 'إدارة الحياة الجامعية', 'مكتب رعاية الخريجين') AND deleted_at IS NULL;

-- Vertical groups under the two remaining الإدارة التنفيذية positions
WITH g AS (
  INSERT INTO org_structure_position_groups (parent_id, layout)
  SELECT id, 'vertical' FROM org_structure_positions WHERE name_ar = 'الإدارة التنفيذية للاتصالات وتقنية المعلومات' AND deleted_at IS NULL
  RETURNING id
)
UPDATE org_structure_positions SET group_id = (SELECT id FROM g)
WHERE name_ar IN ('إدارة الأمن السيبراني', 'إدارة التحول الرقمي', 'إدارة تقنية المعلومات', 'مكتب إدارة البيانات') AND deleted_at IS NULL;

WITH g AS (
  INSERT INTO org_structure_position_groups (parent_id, layout)
  SELECT id, 'vertical' FROM org_structure_positions WHERE name_ar = 'الإدارة التنفيذية للخدمات المشتركة' AND deleted_at IS NULL
  RETURNING id
)
UPDATE org_structure_positions SET group_id = (SELECT id FROM g)
WHERE name_ar IN ('إدارة الشؤون المالية', 'إدارة رأس المال البشري', 'إدارة المرافق', 'الإدارة الهندسية', 'إدارة المشتريات', 'إدارة المستودعات') AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- Functional (dotted-line) relationship: لجنة المراجعة <-> إدارة المراجعة
-- الداخلية, "وظيفيًا" -- a real oversight relationship with no parent_id
-- edge of its own (إدارة المراجعة الداخلية reports to رئيس الجامعة).
-- ----------------------------------------------------------------------------

INSERT INTO org_structure_functional_lines (from_position_id, to_position_id, label_ar)
SELECT
  (SELECT id FROM org_structure_positions WHERE name_ar = 'لجنة المراجعة' AND deleted_at IS NULL),
  (SELECT id FROM org_structure_positions WHERE name_ar = 'إدارة المراجعة الداخلية' AND deleted_at IS NULL),
  'وظيفيًا';

-- ----------------------------------------------------------------------------
-- Colors: تطوير الأعمال's whole subtree in SRU blue, الاتصالات/الخدمات
-- المشتركة (and their subtrees) in the existing teal already in
-- THEME_NODE_COLORS -- both real SRU-identity tones already used elsewhere
-- in this app (CLAUDE.md §7: never a color outside the approved palette),
-- distinguishing them from the purple النائب المساعد positions they share
-- a row with.
-- ----------------------------------------------------------------------------

UPDATE org_structure_positions SET color = '#0a6eaa'
WHERE name_ar IN (
  'الإدارة التنفيذية لتطوير الأعمال', 'إدارة التدريب والاستشارات', 'إدارة الشراكات', 'إدارة تطوير المنتجات والخدمات',
  'إدارة التدريب', 'مركز الاستشارات', 'مركز الابتكار وريادة الأعمال', 'مركز إدارة المحتوى'
) AND deleted_at IS NULL;

UPDATE org_structure_positions SET color = '#3f9dc9'
WHERE name_ar IN (
  'الإدارة التنفيذية للاتصالات وتقنية المعلومات', 'إدارة الأمن السيبراني', 'إدارة التحول الرقمي', 'إدارة تقنية المعلومات', 'مكتب إدارة البيانات',
  'الإدارة التنفيذية للخدمات المشتركة', 'إدارة الشؤون المالية', 'إدارة رأس المال البشري', 'إدارة المرافق', 'الإدارة الهندسية', 'إدارة المشتريات', 'إدارة المستودعات'
) AND deleted_at IS NULL;

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 8 rows, level_order 1..8, no duplicates.
-- SELECT name_ar, level_order FROM org_structure_levels WHERE deleted_at IS NULL ORDER BY level_order;

-- Expect: exactly 1 row (رئيس الجامعة) at level_order 3; exactly 1 row
-- (نائب الرئيس للشؤون الأكاديمية) at level_order 5 (المجلس العلمي is
-- excluded via group_id even though it shares the level value); exactly 7
-- rows at level_order 6 (3 EDs + 3 VPs + المشرفة).
-- SELECT p.name_ar FROM org_structure_positions p JOIN org_structure_levels l ON l.id = p.level_id
--   WHERE l.level_order = 3 AND p.deleted_at IS NULL;

-- Expect: 60 rows (58 original real + أمانة مجلس الأمناء + مركز القيم والسلوك المهني).
-- SELECT count(*) FROM org_structure_positions WHERE deleted_at IS NULL;

-- Expect: 12 groups, 2 functional lines worth of columns populated correctly.
-- SELECT layout, count(*) FROM org_structure_position_groups GROUP BY layout;
-- SELECT from_position_id, to_position_id, label_ar FROM org_structure_functional_lines;
