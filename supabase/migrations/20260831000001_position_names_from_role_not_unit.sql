-- =========================================================================
-- تسمية مناصب الهيكل بأسماء مناصب لا بأسماء وحداتها (2026-08-31، بطلب
-- مالك المشروع: «المناصب المنشأة باسم الادارة ... خطأ فالمنصب مدير إدارة
-- المراجعة الداخلية وهذا الذي يسكن عليه بالاسم»).
--
-- المناصب أُنشئت في هجرات بناء الهيكل بأسماء وحداتها، فصار المسكَّن عليها
-- يُقرأ «عمار أحمد — إدارة المراجعة الداخلية» بدل «مدير إدارة المراجعة
-- الداخلية». وهذه **تسمية لا حذف**: التسكينات الأربعة القائمة وتبعيات
-- المناصب الاثنتي عشرة تبقى كما هي.
--
-- البادئة من شكل الوحدة، بقواعد صرّح بها مالك المشروع نفسه:
--   إدارة → «مدير»، مكتب/مركز → «رئيس» (قراره 2026-07-27)، كلية → «عميد».
--
-- **غير مشمول عمدًا** (١٢ منصبًا): الوحدات من شكل «قيادة» (رئيس الجامعة،
-- النائب، النواب المساعدون، المشرفة، عمداء الكليات) والمجالس واللجنة —
-- فتلك مناصب قيادية أو هيئات جماعية لا تنطبق عليها البادئة، وموضعها
-- التنظيمي قرار لم يُحسم بعد. وأمانة مجلس الجامعة استُثنيت لأن «أمين
-- أمانة...» ركيك، وصياغتها الصحيحة تحتاج قرارًا لا اشتقاقًا.
-- =========================================================================

BEGIN;

UPDATE org_structure_positions SET name_ar = 'مدير إدارة المسؤولية المجتمعية' WHERE id = 'a72394ba-93d5-400a-8928-c691e0dc7a0c' AND name_ar = 'إدارة المسؤولية المجتمعية';
UPDATE org_structure_positions SET name_ar = 'مدير إدارة التميز المؤسسي' WHERE id = '2c9eb1f8-2543-407f-809b-1e5f9074f83c' AND name_ar = 'إدارة التميز المؤسسي';
UPDATE org_structure_positions SET name_ar = 'رئيس مكتب إدارة الاستراتيجية' WHERE id = '50e67b79-228b-4b17-9bad-7519710cb636' AND name_ar = 'مكتب إدارة الاستراتيجية';
UPDATE org_structure_positions SET name_ar = 'مدير إدارة الشؤون القانونية' WHERE id = 'c145eacf-3638-4e6f-b634-c0c8a0c56e6f' AND name_ar = 'إدارة الشؤون القانونية';
UPDATE org_structure_positions SET name_ar = 'رئيس مكتب الحوكمة وإدارة المخاطر والالتزام' WHERE id = '33d46e19-d16c-4abd-9bec-a50415859b22' AND name_ar = 'مكتب الحوكمة وإدارة المخاطر والالتزام';
UPDATE org_structure_positions SET name_ar = 'مدير إدارة المراجعة الداخلية' WHERE id = '30aac2a4-31bd-4980-87ff-b9cb4b55ee7d' AND name_ar = 'إدارة المراجعة الداخلية';
UPDATE org_structure_positions SET name_ar = 'عميد كلية الطب' WHERE id = 'bb661f22-00e4-4d22-a899-562f77c5a82b' AND name_ar = 'كلية الطب';
UPDATE org_structure_positions SET name_ar = 'رئيس مكتب الرئيس' WHERE id = '330a4822-0664-40b3-9522-8f2f7cb41c06' AND name_ar = 'مكتب الرئيس';
UPDATE org_structure_positions SET name_ar = 'عميد كلية التمريض' WHERE id = 'd6b2914b-d3cb-4231-a205-e13604fa64e4' AND name_ar = 'كلية التمريض';
UPDATE org_structure_positions SET name_ar = 'عميد كلية العلوم الصحية' WHERE id = '1f58cd81-6a58-4092-bdb5-1428e92e4e48' AND name_ar = 'كلية العلوم الصحية';
UPDATE org_structure_positions SET name_ar = 'عميد كلية الأعمال' WHERE id = 'e6340cae-fb72-4dc0-8528-fa3e00f8faff' AND name_ar = 'كلية الأعمال';
UPDATE org_structure_positions SET name_ar = 'مدير إدارة التجهيزات التعليمية' WHERE id = '5fd75e42-0e7f-41ae-9f9d-0551e9cc049e' AND name_ar = 'إدارة التجهيزات التعليمية';
UPDATE org_structure_positions SET name_ar = 'رئيس مركز التعليم والتعلم' WHERE id = '3174053f-06bd-41b0-bd0c-5824f23e8472' AND name_ar = 'مركز التعليم والتعلم';
UPDATE org_structure_positions SET name_ar = 'رئيس مركز التقييم والقياس' WHERE id = '4ee84027-26be-4c7d-8750-23926b1c1782' AND name_ar = 'مركز التقييم والقياس';
UPDATE org_structure_positions SET name_ar = 'رئيس مكتب الاعتماد الأكاديمي' WHERE id = '78657486-a7e5-442c-83f3-e25770260429' AND name_ar = 'مكتب الاعتماد الأكاديمي';
UPDATE org_structure_positions SET name_ar = 'رئيس مكتب الدراسات العليا' WHERE id = 'cc197340-d641-4210-8831-36c2683d60c3' AND name_ar = 'مكتب الدراسات العليا';
UPDATE org_structure_positions SET name_ar = 'رئيس مكتب البحث العلمي' WHERE id = '0bbc2758-0ba9-4a27-9cb7-0598ed56b8a9' AND name_ar = 'مكتب البحث العلمي';
UPDATE org_structure_positions SET name_ar = 'رئيس مكتب المنح والحلول المالية' WHERE id = '15b9a11d-bc56-4992-bd12-6984a56a29b1' AND name_ar = 'مكتب المنح والحلول المالية';
UPDATE org_structure_positions SET name_ar = 'رئيس مكتب رعاية الخريجين' WHERE id = '4cf78019-c7ff-41fe-905a-beb2285115fc' AND name_ar = 'مكتب رعاية الخريجين';
UPDATE org_structure_positions SET name_ar = 'رئيس مكتب القبول' WHERE id = 'd6b980cb-3d4c-4717-bcb0-ac93cdccc065' AND name_ar = 'مكتب القبول';
UPDATE org_structure_positions SET name_ar = 'رئيس مكتب التسجيل والإرشاد الأكاديمي' WHERE id = '541b4fd5-2e8a-4d9f-a9d8-bb5d85f5a544' AND name_ar = 'مكتب التسجيل والإرشاد الأكاديمي';
UPDATE org_structure_positions SET name_ar = 'مدير الإدارة التنفيذية لتطوير الأعمال' WHERE id = 'e363b29f-20af-44c4-9555-b4786a6e727d' AND name_ar = 'الإدارة التنفيذية لتطوير الأعمال';
UPDATE org_structure_positions SET name_ar = 'مدير إدارة التدريب والاستشارات' WHERE id = 'b8e1194d-b827-47c6-8e97-45e39b184058' AND name_ar = 'إدارة التدريب والاستشارات';
UPDATE org_structure_positions SET name_ar = 'مدير إدارة الشراكات' WHERE id = 'd76080dd-2662-40dc-b4f6-4a7c33e0d119' AND name_ar = 'إدارة الشراكات';
UPDATE org_structure_positions SET name_ar = 'مدير إدارة تطوير المنتجات والخدمات' WHERE id = '1ca4403e-69fd-4d64-b9c0-3de3c60b0112' AND name_ar = 'إدارة تطوير المنتجات والخدمات';
UPDATE org_structure_positions SET name_ar = 'رئيس مركز الاستشارات' WHERE id = 'a8e93ee4-c759-4260-8620-6dcbce5b20e8' AND name_ar = 'مركز الاستشارات';
UPDATE org_structure_positions SET name_ar = 'مدير إدارة التدريب' WHERE id = '603bf071-cef9-4248-9019-db227905d76d' AND name_ar = 'إدارة التدريب';
UPDATE org_structure_positions SET name_ar = 'رئيس مركز إدارة المحتوى' WHERE id = '05ec29d4-5b6b-4318-b3fc-8c8e9bf4d159' AND name_ar = 'مركز إدارة المحتوى';
UPDATE org_structure_positions SET name_ar = 'رئيس مركز الابتكار وريادة الأعمال' WHERE id = 'bb1873d3-5937-4d99-8fa4-fa7898e49c74' AND name_ar = 'مركز الابتكار وريادة الأعمال';
UPDATE org_structure_positions SET name_ar = 'مدير الإدارة التنفيذية للخدمات المشتركة' WHERE id = '4f24f9e4-a74f-4bb9-8818-4e44a961a874' AND name_ar = 'الإدارة التنفيذية للخدمات المشتركة';
UPDATE org_structure_positions SET name_ar = 'مدير الإدارة التنفيذية للاتصالات وتقنية المعلومات' WHERE id = '98c02ccf-7bdd-4450-a1c8-7b019df3b5cb' AND name_ar = 'الإدارة التنفيذية للاتصالات وتقنية المعلومات';
UPDATE org_structure_positions SET name_ar = 'مدير إدارة الأمن السيبراني' WHERE id = '21bd3b45-b1c5-4a18-9fdc-e2c20222af6d' AND name_ar = 'إدارة الأمن السيبراني';
UPDATE org_structure_positions SET name_ar = 'مدير الإدارة الهندسية' WHERE id = 'e3248fff-c8da-4a28-a65a-b2ee15d2cca3' AND name_ar = 'الإدارة الهندسية';
UPDATE org_structure_positions SET name_ar = 'مدير إدارة التحول الرقمي' WHERE id = '55788b4c-850f-45a3-887f-c82c43843bbb' AND name_ar = 'إدارة التحول الرقمي';
UPDATE org_structure_positions SET name_ar = 'مدير إدارة تقنية المعلومات' WHERE id = 'def5001c-f759-4baf-8495-29d4dcba16e3' AND name_ar = 'إدارة تقنية المعلومات';
UPDATE org_structure_positions SET name_ar = 'رئيس مكتب إدارة البيانات' WHERE id = 'ebac99fb-e930-4333-b2a5-2ec9b24cb002' AND name_ar = 'مكتب إدارة البيانات';
UPDATE org_structure_positions SET name_ar = 'مدير إدارة المستودعات' WHERE id = 'b54fd954-e962-44ea-9a19-0b8a97a45ade' AND name_ar = 'إدارة المستودعات';
UPDATE org_structure_positions SET name_ar = 'مدير إدارة المرافق' WHERE id = 'e053a466-f91c-4e03-be80-6e42201ba2da' AND name_ar = 'إدارة المرافق';
UPDATE org_structure_positions SET name_ar = 'مدير إدارة المشتريات' WHERE id = '241af612-179b-47ec-8e23-221158d09f9d' AND name_ar = 'إدارة المشتريات';
UPDATE org_structure_positions SET name_ar = 'مدير إدارة رأس المال البشري' WHERE id = '74eea20f-ec95-45b7-a49b-6f236d359a07' AND name_ar = 'إدارة رأس المال البشري';
UPDATE org_structure_positions SET name_ar = 'مدير إدارة الشؤون المالية' WHERE id = 'fe8cb844-2575-4993-9148-4edbc13c1b3e' AND name_ar = 'إدارة الشؤون المالية';

-- تحقق: لا يبقى منصب اسمه = اسم وحدته ضمن الأشكال الأربعة المشمولة.
DO $$
DECLARE remaining integer;
BEGIN
  SELECT count(*) INTO remaining
  FROM org_structure_positions p
  JOIN org_units u ON u.id = p.org_unit_id
  JOIN org_unit_kinds k ON k.id = u.kind_id
  WHERE p.deleted_at IS NULL AND u.deleted_at IS NULL
    AND p.name_ar = u.name_ar
    AND k.name_ar IN ('إدارة','مكتب','مركز','كلية');
  IF remaining > 0 THEN
    RAISE EXCEPTION 'بقي % منصبًا باسم وحدته', remaining;
  END IF;
END $$;

COMMIT;
