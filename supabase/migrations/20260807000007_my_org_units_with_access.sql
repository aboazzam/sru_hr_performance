-- ============================================================================
-- `my_org_units_with_access()` — الوحدات التنظيمية التي يستطيع المتصل
-- الكتابة فيها فعلًا، لا التي يستطيع قراءتها.
--
-- السبب، ملاحَظ حيًّا لا متوقَّعًا: بعد إسناد دور "منسق شؤون الموظفين"
-- لموظف حقيقي بنطاق وحدة واحدة، أظهر نموذج طلب الاحتياج الـ58 وحدة كلها.
-- الحدّ الأمني سليم — `recruitment_requests_insert` رفضت الكتابة خارج
-- نطاقه بـ42501 — لكن القائمة كانت تعده بما سيُرفض عند الحفظ.
--
-- السبب أن قائمة النموذج كانت تُبنى من `org_units_select`، وهي سياسة
-- قراءة تقبل عدة مجالات (`employeeData` أو `vacancies` أو مجالَي التوظيف).
-- والموظف المذكور يحمل دور "موظف" بنطاق **كل الوحدات**، وهو يحمل
-- `vacancies=view` — فرأى الـ58 عبر دوره القديم لا عبر دور المنسق.
--
-- أي أن قراءة الوحدات وكتابة الطلب فيها بابان مختلفان بطبعهما، وليسا
-- خطأً في أيٍّ منهما. لذلك لا يُعالَج هذا بتضييق سياسة القراءة (فذلك
-- يكسر شاشات الشواغر وبيانات الموظفين)، بل بأن يسأل النموذج عن الصلاحية
-- الصحيحة: "أين أستطيع الكتابة؟".
--
-- SECURITY INVOKER عمدًا لا DEFINER: تبقى `org_units_select` سارية فوق
-- الفحص، فلا تُرجع الدالة إلا ما يستطيع المتصل قراءته **و** الكتابة فيه.
-- دفاع في العمق — الدالة تضيّق ولا توسّع أبدًا، فلا يمكن استعمالها
-- لتسريب وحدة لا يراها أصلًا.
--
-- عامة لا خاصة بالتوظيف: تأخذ المجال والمستوى، فتصلح لأي نموذج آخر
-- يعاني نفس الفجوة بين ما يُعرض وما يُقبل.
-- ============================================================================

CREATE OR REPLACE FUNCTION my_org_units_with_access(
  p_process_area process_area,
  p_min_level vpra_level
)
RETURNS TABLE (id UUID, name_ar TEXT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT o.id, o.name_ar
  FROM org_units o
  WHERE check_vpra(p_process_area, p_min_level, o.id)
  ORDER BY o.name_ar;
$$;

COMMENT ON FUNCTION my_org_units_with_access(process_area, vpra_level) IS
  'الوحدات التي يملك المتصل فيها المستوى المطلوب على المجال المحدد — لبناء قوائم النماذج بما يُقبل فعلًا لا بما يُقرأ.';

-- نفس درس migration 5: REVOKE من PUBLIC وحدها لا تمنع anon في هذا
-- المشروع، بسبب ALTER DEFAULT PRIVILEGES التي تمنح EXECUTE تلقائيًا.
REVOKE ALL ON FUNCTION my_org_units_with_access(process_area, vpra_level) FROM PUBLIC;
REVOKE ALL ON FUNCTION my_org_units_with_access(process_area, vpra_level) FROM anon;
GRANT EXECUTE ON FUNCTION my_org_units_with_access(process_area, vpra_level) TO authenticated;

-- ============================================================================
-- التحقق — بعد التطبيق.
-- ============================================================================
-- بحساب يحمل "منسق شؤون الموظفين" بنطاق وحدة واحدة + "موظف" بنطاق الكل:
--   SELECT count(*) FROM org_units;                                        -- 58 (القراءة)
--   SELECT count(*) FROM my_org_units_with_access('recruitmentPlan','prepare'); -- وحدته وفروعها فقط
-- وبحساب anon: يجب أن يُرفض الاستدعاء (لا EXECUTE).
