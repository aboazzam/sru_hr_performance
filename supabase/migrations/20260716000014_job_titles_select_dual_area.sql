-- ============================================================================
-- Fix: job_titles was unreadable to employeeData-only viewers, breaking the
-- salary_scale screen's job-title embed for them
--
-- [مكتشف أثناء التحقق الفعلي في المتصفح، وليس نظريًا] بُنيت شاشة سلم الرواتب
-- (salary_scale) لتُعرض لأي مستخدم يملك `careerPath` **أو** `employeeData`
-- (القاعدة الموثّقة في SRU_System_Design.md §A لمسار /salary-scale، مُطبَّقة
-- في migration 13 على salary_scale_select). لكن مستخدم اختبار بدور
-- `committee` (يملك employeeData=view، بلا أي careerPath) رأى فعليًا صف
-- salary_scale (الأرقام: A-G صحيحة) لكن **اسم المسمى الوظيفي ظهر فارغًا
-- ("—")** بدل "مبرمج (اختبار)" الحقيقي — لأن embed
-- `job_titles(name_ar,grade_level)` يخضع لسياسة RLS الخاصة بـjob_titles
-- نفسها (migration 12: `check_vpra('careerPath','view')` فقط)، وcommittee
-- لا يملك careerPath إطلاقًا.
--
-- النتيجة: عرض أرقام رواتب حقيقية بلا أي سياق عن أي مسمى وظيفي تخصّه —
-- غير مفيد عمليًا وليس له مبرر حقيقي (لا سبب خصوصية لإخفاء اسم المسمى
-- الوظيفي تحديدًا بينما تُعرض أرقام رواتبه). الإصلاح: تعميم سياسة SELECT
-- على job_titles لتطابق نفس ثنائية salary_scale تمامًا — أي شخص يملك رؤية
-- employeeData (مثل ملفات الموظفين نفسها، التي تشير أيضًا إلى
-- job_titles.id عبر profiles.job_title_id) يجب أن يرى اسم/درجة المسمى
-- الوظيفي، وليس فقط من يملك careerPath تحديدًا.
--
-- job_families لم تُعدَّل (لا تزال careerPath فقط) — لا شاشة حالية تُضمِّن
-- اسم job_family مباشرة إلى جانب بيانات employeeData-gated، فلا يوجد نفس
-- الخلل الملموس بعد. يُعاد النظر إن ظهرت حاجة مماثلة لاحقًا.
-- ============================================================================

BEGIN;

DROP POLICY job_titles_select ON job_titles;

CREATE POLICY job_titles_select ON job_titles FOR SELECT TO authenticated
  USING (check_vpra('careerPath', 'view') OR check_vpra('employeeData', 'view'));

COMMIT;

-- ============================================================================
-- Verification — run AFTER and BEFORE trusting, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: qual now shows the OR of both process areas.
-- SELECT policyname, qual FROM pg_policies WHERE tablename = 'job_titles' AND cmd = 'SELECT';
