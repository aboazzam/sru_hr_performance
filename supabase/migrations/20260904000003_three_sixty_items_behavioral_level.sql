-- Scope: قالب تقييم 360 يستخدم مستوى سلوكي واحد ثابت ("ممارس") لكل الموظفين
-- بغض النظر عن أقدميتهم/خبرتهم. طلب مباشر من صاحب المشروع: تبقى نفس الجدارات
-- الأساسية الـ11 للجميع، لكن عبارات كل جدارة تُختار حسب المستوى السلوكي
-- المطلوب فعليًا في مسمى الموظف الوظيفي (job_title_competencies.required_level
-- -- الآلية الموجودة أصلاً لهذا الغرض في شاشة "المسار الوظيفي"، لا آلية جديدة
-- مخترعة)، مع افتراضي احتياطي "ممارس" (practitioner) عند غياب مستوى محدد --
-- طلب صاحب المشروع صراحة ("ابنِ الخيار 1 مع الافتراضي الاحتياطي ممارس").
--
-- Will change: `three_sixty_competencies` (عمود جديد `source_competency_id`
-- يربطها بالجدارة المؤسسية الحقيقية المقابلة في `competencies` -- الجدولان
-- منفصلان تمامًا، لا FK بينهما اليوم، والمطابقة الوحيدة الممكنة اسميًا
-- بالتحقق المباشر: كل الـ11 صفًا تطابق بالاسم العربي تمامًا، تحقّق ذلك مباشرة
-- قبل كتابة هذه الهجرة)، `three_sixty_items` (عمود جديد `behavioral_level`،
-- قابل لل NULL -- NULL يعني "عبارة عامة لا ترتبط بمستوى" مثل عبارة النص
-- الحر الوحيدة؛ إعادة ترقيم `display_order` لتجميع كل جدارة في كتلة من 8
-- عبارات بدل عبارتين، وتحديد `behavioral_level='practitioner'` على الـ22
-- عبارة الموجودة أصلاً -- كانت جميعها مأخوذة من مستوى "ممارس" تحديدًا حسب
-- توثيق الهجرة الأصلية 20260904000002)، إضافة 66 عبارة جديدة (11 جدارة × 3
-- مستويات متبقية × عبارتان) مأخوذة حرفيًا من أول سطرين غير فارغين في
-- `competency_levels.behavior_ar` لكل (جدارة، مستوى) -- نفس تحفظ الهجرة
-- الأصلية بعدم إعادة الصياغة، ونفس القاعدة (أول عبارتين من نص المستوى) --
-- ودالة SECURITY DEFINER جديدة `get_three_sixty_subject_levels` تحل المستوى
-- المطلوب فعليًا لموظف معيّن (تحتاج تجاوز RLS الخاص بـ job_title_competencies
-- الذي لا يسمح لمقيّم عادي -- زميل/عميل -- بقراءته أصلاً، ولا RLS الخاص
-- بـ profiles.job_title_id لموظف آخر).
--
-- Will NOT change: عدد الجدارات (يبقى 11 -- لا إضافة للجدارات الـ16 التخصصية،
-- خارج نطاق هذا الطلب)، محرك الحساب في src/lib/threeSixty.ts (يعمل بلا أي
-- تعديل -- التجميع مبني على استجابات فعلية مربوطة بـ competency_id بغض النظر
-- عن أي عبارات أُظهرت، فبمجرد أن تعرض شاشة التعبئة العبارتين الصحيحتين فقط
-- لكل جدارة لكل موظف، يعمل الحساب كما هو)، جدول `three_sixty_responses` أو
-- `three_sixty_assignments` (لا حاجة لأي عمود جديد فيهما).
--
-- Rollback: DROP FUNCTION get_three_sixty_subject_levels; حذف الـ66 عبارة
-- الجديدة بمعرّفات behavioral_level IN ('basic','advanced','professional')؛
-- إعادة display_order/behavioral_level للـ22 عبارة الأصلية؛ حذف العمودين
-- الجديدين.

BEGIN;

ALTER TABLE three_sixty_competencies
  ADD COLUMN source_competency_id uuid REFERENCES competencies(id) ON DELETE SET NULL;

ALTER TABLE three_sixty_items
  ADD COLUMN behavioral_level behavioral_level;

-- ربط الـ11 جدارة بمقابلها الحقيقي في إطار الجامعة الرسمي -- بالمطابقة على
-- الاسم العربي الحرفي، تحقّق مسبقًا (خارج هذه الهجرة) أن كل الـ11 تطابق صفًا
-- واحدًا بالضبط، لا أكثر ولا أقل.
UPDATE three_sixty_competencies tc
SET source_competency_id = c.id
FROM competencies c
WHERE c.name_ar = tc.name_ar
  AND c.deleted_at IS NULL
  AND tc.deleted_at IS NULL
  AND tc.source_competency_id IS NULL;

-- ترتيب الجدارات الأصلي (نفس ترتيب display_order 1..22 الحالي، عبارتان لكل
-- جدارة) -- يُستخدم فقط لإعادة تجميع display_order في كتل من 8، لا لأي غرض
-- آخر.
CREATE TEMP TABLE tmp_three_sixty_block_order (competency_code text PRIMARY KEY, block_index int NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_three_sixty_block_order (competency_code, block_index) VALUES
  ('support.governance.1', 0),
  ('support.governance.2', 1),
  ('support.governance.3', 2),
  ('support.loyalty.1', 3),
  ('support.loyalty.2', 4),
  ('support.loyalty.3', 5),
  ('support.mastery.1', 6),
  ('support.mastery.2', 7),
  ('support.mastery.3', 8),
  ('innovation.contribution.1', 9),
  ('innovation.contribution.2', 10);

-- عبارات "ممارس" الموجودة أصلًا (22): تُوسَم بمستواها الحقيقي وتُعاد كتلتها
-- إلى الموضعين 3-4 من كتلة الثمانية الخاصة بجدارتها (أساسي=1-2، ممارس=3-4،
-- متقدم=5-6، محترف=7-8).
UPDATE three_sixty_items ti
SET behavioral_level = 'practitioner',
    display_order = t.block_index * 8 + 2 + (CASE WHEN ti.item_code LIKE '%.i1' THEN 1 ELSE 2 END)
FROM three_sixty_competencies tc
JOIN tmp_three_sixty_block_order t ON t.competency_code = tc.competency_code
WHERE ti.competency_id = tc.id
  AND ti.item_type = 'rating'
  AND ti.deleted_at IS NULL;

-- عبارة النص الحر الوحيدة: بلا مستوى (تُعرض دائمًا بغض النظر عن مستوى
-- الموظف)، تُنقَل إلى آخر الترتيب (بعد كتل الجدارات الإحدى عشرة).
UPDATE three_sixty_items
SET display_order = 89
WHERE item_code = 'general.feedback.open1'
  AND deleted_at IS NULL;

-- الـ66 عبارة الجديدة (11 جدارة × 3 مستويات متبقية × عبارتان): مأخوذة حرفيًا
-- من أول سطرين غير فارغين في competency_levels.behavior_ar لكل (جدارة،
-- مستوى) -- نفس مصدر ونفس قاعدة اختيار العبارتين المستخدمة أصلًا لمستوى
-- "ممارس" في الهجرة 20260904000002، مطبَّقة الآن على باقي المستويات الثلاثة.
INSERT INTO three_sixty_items (
  item_code, competency_id, item_type, text_ar, rater_groups,
  required, reverse_scored, scale_code, display_order, behavioral_level
)
SELECT
  tc.competency_code || '.' || cl.level::text || '.i' || sub.rn,
  tc.id,
  'rating',
  sub.line,
  ARRAY['self', 'supervisor', 'peer', 'customer'],
  true,
  false,
  'behavior_freq_5',
  t.block_index * 8
    + (CASE cl.level WHEN 'basic' THEN 0 WHEN 'advanced' THEN 2 WHEN 'professional' THEN 3 ELSE 1 END) * 2
    + sub.rn,
  cl.level
FROM three_sixty_competencies tc
JOIN tmp_three_sixty_block_order t ON t.competency_code = tc.competency_code
JOIN competency_levels cl ON cl.competency_id = tc.source_competency_id
  AND cl.level IN ('basic', 'advanced', 'professional')
JOIN LATERAL (
  SELECT trim(x) AS line, row_number() OVER () AS rn
  FROM regexp_split_to_table(cl.behavior_ar, E'\n') AS x
  WHERE trim(x) <> ''
  LIMIT 2
) sub ON true
WHERE tc.deleted_at IS NULL;

-- دالة تحلّ المستوى السلوكي المطلوب فعليًا من موظف معيّن (subject) لكل جدارة
-- مؤسسية، لاستخدامها في تصفية عبارات الاستبانة -- SECURITY DEFINER لأنها
-- تحتاج قراءة profiles.job_title_id لموظف آخر (لا يملكها مقيّم عادي عبر RLS)
-- و job_title_competencies (مقفلة على careerPath/recruitment* فقط، لا صلة لها
-- بتقييم 360). التفويض: يُسمح فقط لمن له علاقة فعلية بهذا الموظف ضمن تقييم
-- 360 (مقيّمه أو هو نفسه في أي تعيين)، أو مشرفه غير المباشر (is_my_subordinate)،
-- أو من يملك اعتماد وحدة threeSixty -- غير ذلك تُعاد نتيجة فارغة بلا خطأ (لا
-- بيانات حساسة تُكشف، فقط تصنيف مستوى سلوكي).
CREATE FUNCTION public.get_three_sixty_subject_levels(p_subject_employee_id uuid)
RETURNS TABLE(competency_id uuid, required_level behavioral_level)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id uuid;
  v_job_title_id uuid;
BEGIN
  SELECT id INTO v_caller_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1 FROM three_sixty_assignments a
      WHERE a.subject_employee_id = p_subject_employee_id
        AND a.deleted_at IS NULL
        AND (a.rater_employee_id = v_caller_id OR a.subject_employee_id = v_caller_id)
    )
    OR is_my_subordinate(p_subject_employee_id)
    OR check_vpra_global('threeSixty'::process_area, 'approve'::vpra_level)
  ) THEN
    RETURN;
  END IF;

  SELECT job_title_id INTO v_job_title_id FROM profiles WHERE id = p_subject_employee_id;
  IF v_job_title_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT jtc.competency_id, jtc.required_level
  FROM job_title_competencies jtc
  WHERE jtc.job_title_id = v_job_title_id
    AND jtc.deleted_at IS NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_three_sixty_subject_levels(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_three_sixty_subject_levels(uuid) TO authenticated;

-- تحقّق قبل الاعتماد
SELECT
  (SELECT count(*) FROM three_sixty_competencies WHERE source_competency_id IS NOT NULL AND deleted_at IS NULL) AS competencies_linked, -- متوقع 11
  (SELECT count(*) FROM three_sixty_items WHERE behavioral_level = 'practitioner' AND deleted_at IS NULL) AS practitioner_items, -- متوقع 22
  (SELECT count(*) FROM three_sixty_items WHERE behavioral_level = 'basic' AND deleted_at IS NULL) AS basic_items, -- متوقع 22
  (SELECT count(*) FROM three_sixty_items WHERE behavioral_level = 'advanced' AND deleted_at IS NULL) AS advanced_items, -- متوقع 22
  (SELECT count(*) FROM three_sixty_items WHERE behavioral_level = 'professional' AND deleted_at IS NULL) AS professional_items, -- متوقع 22
  (SELECT count(*) FROM three_sixty_items WHERE behavioral_level IS NULL AND deleted_at IS NULL) AS level_agnostic_items, -- متوقع 1 (النص الحر)
  (SELECT count(*) FROM three_sixty_items WHERE deleted_at IS NULL) AS total_items; -- متوقع 89

COMMIT;
