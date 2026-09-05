-- Scope: طلب مباشر بعد ملاحظتين حقيقيتين على شاشة ترشيح المقيّمين -- (1)
-- خانة "مستفيد/عميل" لا تسمح بإضافة شخص من خارج المنظمة، (2) الرد المؤكَّد:
-- نعم، اسمح للخارجي بالإجابة على الاستبيان عبر رابط بريده الخاص بلا دخول
-- على النظام (كنموذج Google Forms). أُجِّل الإرسال التلقائي للبريد عمدًا
-- (لا يوجد أي مزوّد بريد تجاري في هذا المشروع اليوم -- تحقّق مباشر قبل
-- الكتابة) -- هذه الهجرة تبني الرابط وآلية الوصول فقط؛ من يملك صلاحية
-- الترشيح ينسخ الرابط ويرسله يدويًا حتى يُجهَّز مزوّد بريد لاحقًا.
--
-- ثلاثة افتراضات أُكِّدت مباشرة (لم تُصحَّح): يخص "مستفيد/عميل" فقط، الموظف
-- نفسه يضيف الاسم والبريد من نفس شاشة الترشيح، ويمر بنفس اعتماد الرئيس
-- المباشر قبل إنشاء الرابط.
--
-- Will change:
-- 1. `three_sixty_rater_groups.allows_external_rater` (جديد، افتراضي false)
--    -- بيانات لا كود مكتوب بالاسم الحرفي "customer" في منطق التطبيق؛ تُضبط
--    true على 'customer' فقط أدناه. [استنتاج] لم يُدرَج في استيراد/تصدير
--    إكسل القالب في هذه الهجرة -- تبديل نادر يُتوقَّع ضبطه مرة واحدة، وليس
--    جزءًا متكررًا من دورة تحرير القالب.
-- 2. `three_sixty_nominations`/`three_sixty_assignments`: rater_employee_id
--    يصبح NULLABLE، مع عمودين جديدين (external_rater_name/
--    external_rater_email) وقيد CHECK يفرض أحدهما حصرًا لا كليهما ولا
--    الاثنين معًا فارغين. `three_sixty_assignments` تضيف أيضًا access_token
--    (UUID فريد، يُولَّد تلقائيًا لكل صف -- حتى الداخلي، تبسيطًا؛ الرابط
--    الخارجي هو الوسيلة الوحيدة لدخول من لا حساب له، مطابقةً تمامًا لطلب
--    "نموذج بلا دخول على النظام").
-- 3. فهرسان فريدان جزئيان جديدان (على كلا الجدولين) لمنع تكرار نفس المقيّم
--    الخارجي (بالبريد) لنفس الموضوع/الدورة/العلاقة -- الفهرس الفريد القائم
--    لا يمنع هذا لأن rater_employee_id سيكون NULL دائمًا للصفوف الخارجية،
--    وPostgres لا يعتبر NULL مساويًا لـ NULL في فهرس فريد.
--
-- Will NOT change: أي سياسة RLS قائمة -- كل السياسات الحالية على
-- three_sixty_nominations/assignments/responses تشترط TO authenticated وتظل
-- صحيحة تمامًا للمسار الداخلي (فرع rater_employee_id ببساطة لا يُطابَق أبدًا
-- لصف خارجي، بلا ضرر). وصول المقيّم الخارجي بلا حساب إطلاقًا يمر بمسار
-- منفصل كليًا (Server Actions بعميل service role، مُصرَّح فقط عبر access_token
-- نفسه -- تمامًا مثل رابط دعوة/استعادة كلمة مرور)، فلا حاجة لأي تعديل RLS.
--
-- Rollback: حذف الأعمدة والفهارس المضافة، وrater_employee_id يعود NOT NULL
-- (بعد التأكد من عدم وجود صفوف خارجية حقيقية أولًا).

BEGIN;

ALTER TABLE three_sixty_rater_groups
  ADD COLUMN allows_external_rater boolean NOT NULL DEFAULT false;

UPDATE three_sixty_rater_groups
SET allows_external_rater = true
WHERE relationship_code = 'customer' AND deleted_at IS NULL;

-- ---- three_sixty_nominations ----------------------------------------------
ALTER TABLE three_sixty_nominations
  ALTER COLUMN rater_employee_id DROP NOT NULL,
  ADD COLUMN external_rater_name text,
  ADD COLUMN external_rater_email text,
  ADD CONSTRAINT three_sixty_nominations_rater_source_check CHECK (
    (rater_employee_id IS NOT NULL AND external_rater_name IS NULL AND external_rater_email IS NULL)
    OR (rater_employee_id IS NULL AND external_rater_name IS NOT NULL AND external_rater_email IS NOT NULL)
  );

CREATE UNIQUE INDEX three_sixty_nominations_external_uidx
  ON three_sixty_nominations (cycle_id, subject_employee_id, relationship_code, external_rater_email)
  WHERE deleted_at IS NULL AND external_rater_email IS NOT NULL;

-- ---- three_sixty_assignments -----------------------------------------------
ALTER TABLE three_sixty_assignments
  ALTER COLUMN rater_employee_id DROP NOT NULL,
  ADD COLUMN external_rater_name text,
  ADD COLUMN external_rater_email text,
  ADD COLUMN access_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD CONSTRAINT three_sixty_assignments_rater_source_check CHECK (
    (rater_employee_id IS NOT NULL AND external_rater_name IS NULL AND external_rater_email IS NULL)
    OR (rater_employee_id IS NULL AND external_rater_name IS NOT NULL AND external_rater_email IS NOT NULL)
  );

ALTER TABLE three_sixty_assignments
  ADD CONSTRAINT three_sixty_assignments_access_token_key UNIQUE (access_token);

CREATE UNIQUE INDEX three_sixty_assignments_external_uidx
  ON three_sixty_assignments (cycle_id, subject_employee_id, relationship_code, external_rater_email)
  WHERE deleted_at IS NULL AND external_rater_email IS NOT NULL;

COMMIT;

-- ============================================================================
-- تحقّق -- يُشغَّل بعد التطبيق، وفق قاعدة PROJECT_STRICT.md رقم 10.
-- ============================================================================
-- المتوقع: إدراج ترشيح/تعيين خارجي حقيقي (بلا rater_employee_id) ينجح؛
-- محاولة إدراج صف بكلا rater_employee_id وexternal_rater_email معًا، أو بلا
-- أي منهما، تُرفض بقيد CHECK؛ محاولة تكرار نفس البريد لنفس (الدورة، الموضوع،
-- العلاقة) تُرفض بالفهرس الفريد الجديد.
