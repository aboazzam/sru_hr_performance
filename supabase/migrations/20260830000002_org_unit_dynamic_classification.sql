-- =========================================================================
-- تصنيف الوحدات التنظيمية يصير ديناميكيًّا، ونوع الإدارة يُضاف بجانبه
-- (2026-08-30، بطلب مالك المشروع: «نريد التصنيف يكون ديناميك بحيث استطيع
-- اضافة تصنيف / أضف قسم / اضافة نوع الادارة»).
--
-- ما كان: `org_units.kind` عمود من نوع ENUM بتسع قيم ثابتة (هجرة
-- 20260830000001). الـENUM لا يُضاف إليه من الواجهة، فطلب «أضف قسم» كان
-- يحتاج هجرة جديدة في كل مرة — وهذا بالضبط ما ينفيه الطلب.
--
-- ما صار: جدولان مرجعيان يملكهما المستخدم:
--   * `org_unit_kinds` — الشكل التنظيمي (مجلس، لجنة، إدارة، مكتب... + قسم).
--   * `org_unit_types`  — نوع الإدارة (حوكمة، داعمة، أكاديمي، تطوير أعمال،
--     مساهمة وأثر) — محور مستقل تمامًا عن الأول: الأول يقول «ما شكل هذه
--     الوحدة»، والثاني يقول «في أي منظومة تعمل».
--
-- ملاحظة أمانة: النوع الجديد يشبه العمود `type` الذي حُذف في
-- 20260830000001 — لكن ذاك كان **لون صندوق** مأخوذًا من صورة المخطط
-- (وثّقته الهجرة نفسها)، وهذا قيمه يحدّدها مالك المشروع بنفسه، وقيمه
-- ليست هي (مساهمة وأثر بدل إداري). فهو ليس رجوعًا عن ذلك الحذف.
--
-- **`type_id` يبقى NULL لكل الوحدات الثامنة والخمسين عمدًا**: لا مصدر
-- يقول أي وحدة تنتمي لأي نوع، واختراع التوزيع تلفيق. يملؤه المستخدم من
-- الشاشة.
--
-- **`kind` القديم لا يُحذف في هذه الهجرة** — يُجعل قابلاً للـNULL ويتوقف
-- الكود عن كتابته فقط. حذف عمود بينما الكود المنشور ما زال يقرؤه هو
-- بالضبط ما أوقع `/org-units` في «لا توجد وحدات تنظيمية» يوم
-- 2026-08-30، فالحذف يستحق هجرة تالية بعد استقرار الكود الجديد.
-- =========================================================================

BEGIN;

CREATE TABLE org_unit_kinds (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL,
  name_ar       text NOT NULL,
  name_en       text,
  display_order integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE UNIQUE INDEX org_unit_kinds_code_uidx ON org_unit_kinds (code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX org_unit_kinds_name_uidx ON org_unit_kinds (name_ar) WHERE deleted_at IS NULL;

CREATE TABLE org_unit_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL,
  name_ar       text NOT NULL,
  name_en       text,
  display_order integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE UNIQUE INDEX org_unit_types_code_uidx ON org_unit_types (code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX org_unit_types_name_uidx ON org_unit_types (name_ar) WHERE deleted_at IS NULL;

-- التسع القائمة بنفس أكوادها وأسمائها المعروضة اليوم، ثم «قسم» المطلوب.
INSERT INTO org_unit_kinds (code, name_ar, name_en, display_order) VALUES
  ('council',     'مجلس',  'Council',     10),
  ('committee',   'لجنة',  'Committee',   20),
  ('secretariat', 'أمانة', 'Secretariat', 30),
  ('leadership',  'قيادة', 'Leadership',  40),
  ('college',     'كلية',  'College',     50),
  ('department',  'إدارة', 'Department',  60),
  ('section',     'قسم',   'Section',     70),
  ('office',      'مكتب',  'Office',      80),
  ('center',      'مركز',  'Center',      90),
  ('unit',        'وحدة',  'Unit',       100);

INSERT INTO org_unit_types (code, name_ar, name_en, display_order) VALUES
  ('governance',       'حوكمة',        'Governance',          10),
  ('support',          'داعمة',        'Support',             20),
  ('academic',         'أكاديمي',      'Academic',            30),
  ('business',         'تطوير أعمال',  'Business Development', 40),
  ('impact',           'مساهمة وأثر',  'Contribution & Impact', 50);

ALTER TABLE org_units ADD COLUMN kind_id uuid REFERENCES org_unit_kinds(id) ON DELETE RESTRICT;
ALTER TABLE org_units ADD COLUMN type_id uuid REFERENCES org_unit_types(id) ON DELETE SET NULL;

-- نقل القيم القائمة: مطابقة بالكود، فلا تحويل يدوي ولا احتمال خطأ.
UPDATE org_units u SET kind_id = k.id FROM org_unit_kinds k WHERE k.code = u.kind::text;

-- كل صف حي لا بد أن يكون قد وجد شكله، وإلا فالهجرة نفسها خاطئة.
DO $$
DECLARE missing integer;
BEGIN
  SELECT count(*) INTO missing FROM org_units WHERE deleted_at IS NULL AND kind_id IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'بقيت % وحدة بلا kind_id — المطابقة بالكود فشلت', missing;
  END IF;
END $$;

ALTER TABLE org_units ALTER COLUMN kind_id SET NOT NULL;
-- العمود القديم يبقى للتوافق مع الكود المنشور حتى تستقر النسخة الجديدة.
ALTER TABLE org_units ALTER COLUMN kind DROP NOT NULL;

CREATE INDEX org_units_kind_id_idx ON org_units (kind_id);
CREATE INDEX org_units_type_id_idx ON org_units (type_id);

-- RLS: جدولان مرجعيان على مستوى الجامعة بلا وحدة تنظيمية خاصة بهما، فهما
-- حالة `check_vpra_global` بالضبط (نفس ما فعلته 20260719000011 لجداول
-- المرجع الأخرى) لا `check_vpra` المقيَّد بالنطاق — وإلا لما رآهما أي دور
-- مقيَّد بوحدة إطلاقًا.
ALTER TABLE org_unit_kinds ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_unit_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_unit_kinds_select ON org_unit_kinds FOR SELECT TO authenticated
  USING (check_vpra_global('employeeData', 'view'));
CREATE POLICY org_unit_kinds_insert ON org_unit_kinds FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('employeeData', 'approve'));
CREATE POLICY org_unit_kinds_update ON org_unit_kinds FOR UPDATE TO authenticated
  USING (check_vpra_global('employeeData', 'approve'))
  WITH CHECK (check_vpra_global('employeeData', 'approve'));

CREATE POLICY org_unit_types_select ON org_unit_types FOR SELECT TO authenticated
  USING (check_vpra_global('employeeData', 'view'));
CREATE POLICY org_unit_types_insert ON org_unit_types FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('employeeData', 'approve'));
CREATE POLICY org_unit_types_update ON org_unit_types FOR UPDATE TO authenticated
  USING (check_vpra_global('employeeData', 'approve'))
  WITH CHECK (check_vpra_global('employeeData', 'approve'));

-- لا سياسة DELETE على أيٍّ منهما: الحذف ناعم عبر `deleted_at`، كبقية
-- المخطط (القاعدة ٧ في §5-A).

COMMENT ON TABLE org_unit_kinds IS 'الشكل التنظيمي للوحدة (مجلس/لجنة/إدارة/قسم/مكتب...) — يملكه المستخدم بعد أن كان ENUM ثابتًا.';
COMMENT ON TABLE org_unit_types IS 'نوع الإدارة (حوكمة/داعمة/أكاديمي/تطوير أعمال/مساهمة وأثر) — محور مستقل عن الشكل التنظيمي.';

COMMIT;
