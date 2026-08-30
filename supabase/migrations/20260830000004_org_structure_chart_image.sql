-- =========================================================================
-- صورة الهيكل التنظيمي (2026-08-30، بطلب مالك المشروع: «أرغب بحذف المحتوى
-- كاملا واستبداله بصورة png or jpg قابلة للتكبير»).
--
-- الرسم المولَّد يُستبدل بصورة يرفعها المستخدم. البيانات نفسها تبقى كما
-- هي — `org_structure_levels` و`org_structure_positions` وتسكيناتها — لأن
-- مستوى الوحدة ومناصبها يشيران إليها، وإنما تنتقل شاشاتها إلى صفحة
-- الوحدات التنظيمية.
--
-- جدول مفرد بالنمط نفسه الذي يستعمله `org_identity`: فهرس فريد على تعبير
-- ثابت يمنع وجود صفّين.
--
-- **دلو تخزين مستقل لا إعادة استعمال `org-branding`**: ذاك محكوم بمجال
-- `identity` الذي لا يملكه hr_admin، وصورة الهيكل شأن `orgStructure`.
-- خلطهما كان سيمنع من يبني الهيكل من رفع صورته.
-- =========================================================================

BEGIN;

CREATE TABLE org_structure_chart (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url   text,
  caption_ar  text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES profiles(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX org_structure_chart_singleton_uidx ON org_structure_chart ((true));

INSERT INTO org_structure_chart (image_url) VALUES (NULL);

ALTER TABLE org_structure_chart ENABLE ROW LEVEL SECURITY;

-- القراءة عند `view` والكتابة عند `prepare`: نفس الحاجز الذي كان يحرس بناء
-- الهيكل في الشاشة المحذوفة (`canBuild`)، فلا يكسب أحد ولا يخسر أحد.
CREATE POLICY org_structure_chart_select ON org_structure_chart FOR SELECT TO authenticated
  USING (check_vpra_global('orgStructure', 'view'));
CREATE POLICY org_structure_chart_update ON org_structure_chart FOR UPDATE TO authenticated
  USING (check_vpra_global('orgStructure', 'prepare'))
  WITH CHECK (check_vpra_global('orgStructure', 'prepare'));
-- لا سياسة INSERT ولا DELETE: الصف الوحيد زرعته هذه الهجرة، والشاشة تحدّثه.

INSERT INTO storage.buckets (id, name, public)
VALUES ('org-structure', 'org-structure', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY org_structure_image_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'org-structure' AND check_vpra_global('orgStructure', 'view'));
CREATE POLICY org_structure_image_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'org-structure' AND check_vpra_global('orgStructure', 'prepare'));
CREATE POLICY org_structure_image_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'org-structure' AND check_vpra_global('orgStructure', 'prepare'))
  WITH CHECK (bucket_id = 'org-structure' AND check_vpra_global('orgStructure', 'prepare'));
CREATE POLICY org_structure_image_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'org-structure' AND check_vpra_global('orgStructure', 'prepare'));

COMMENT ON TABLE org_structure_chart IS
  'صورة الهيكل التنظيمي التي يرفعها المستخدم، بديلًا عن الرسم المولَّد — صف واحد فقط.';

COMMIT;
