-- Scope: تقرير مباشر من صاحب المشروع بلقطة شاشة حقيقية -- خانتا "زميل" و
-- "مستفيد/عميل" في شاشة ترشيح المقيّمين (/three-sixty/nominate) لا تعرضان
-- أي زميل في نتائج البحث (حتى بحث فارغ)، لأن الشاشة تقرأ profiles مباشرة
-- عبر عميل المستخدم نفسه الخاضع لـ RLS -- وأغلب الأدوار المزروعة اليوم
-- (employee, employees_coordinator, finance_manager...) لا تملك أي منحة
-- على employeeData/employeeDataSubordinates، فتعيد profiles_select صفًا
-- واحدًا فقط (المستخدم نفسه، المُستبعد أصلًا من هذه القائمة بـ .neq()).
--
-- هذا ترشيح لنفس الموظف لمقيّميه الخاصين -- لا يحتاج أي صلاحية مرتفعة
-- أصلًا (three_sixty_nominations_insert لا تشترط أي منحة على employeeData،
-- كما يوثّق تعليق nominate/page.tsx نفسه)، فحجب أسماء الزملاء هنا ليس حماية
-- حقيقية بل عطل غير مقصود. نفس فئة الثغرة التي عولجت مرارًا في هذا المشروع
-- (job_titles/salary_scale، تجميع موظفي الوحدة التنظيمية،
-- get_three_sixty_nomination_candidates لشاشة الاعتماد).
--
-- Will change: دالة جديدة SECURITY DEFINER تُرجع قائمة أساسية آمنة
-- (id/employee_number/full_name_ar) لكل الموظفين ما عدا المستخدم نفسه، بلا
-- أي تحقق صلاحية إضافي داخلها -- الإجراء الذي تخدمه (الترشيح الذاتي) أصلًا
-- بلا حاجز صلاحية.
--
-- Will NOT change: profiles_select نفسها (تبقى كما هي لكل الاستخدامات
-- الأخرى)، ولا أي شاشة أخرى غير nominate/page.tsx.

BEGIN;

CREATE OR REPLACE FUNCTION get_three_sixty_nominatable_employees()
RETURNS TABLE (id UUID, employee_number TEXT, full_name_ar TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.employee_number, p.full_name_ar
  FROM profiles p
  WHERE p.deleted_at IS NULL
    AND p.id <> COALESCE((SELECT id FROM profiles WHERE auth_user_id = auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid)
  ORDER BY p.full_name_ar;
$$;

COMMENT ON FUNCTION get_three_sixty_nominatable_employees IS 'Basic {id, employee_number, full_name_ar} list of every OTHER employee, for the 360 self-nomination screen''s "pick a colleague" search -- bypasses profiles_select''s RLS deliberately, since nominating a rater for yourself needs no elevated permission in the first place.';

REVOKE ALL ON FUNCTION get_three_sixty_nominatable_employees() FROM PUBLIC;
REVOKE ALL ON FUNCTION get_three_sixty_nominatable_employees() FROM anon;
GRANT EXECUTE ON FUNCTION get_three_sixty_nominatable_employees() TO authenticated;

COMMIT;

-- ============================================================================
-- تحقّق -- يُشغَّل بعد التطبيق مباشرة، وفق قاعدة PROJECT_STRICT.md رقم 10.
-- ============================================================================
-- المتوقع: حساب اختبار مؤقت بدور "employee" فقط (بلا أي منحة employeeData)
-- يستدعي الدالة ويحصل على كل الموظفين الآخرين الحقيقيين، لا صفًا واحدًا كما
-- كان الحال قبل الإصلاح عبر profiles_select مباشرة.
