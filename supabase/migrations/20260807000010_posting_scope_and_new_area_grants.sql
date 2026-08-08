-- ============================================================================
-- ١) نطاق الإعلان: بوابة داخلية وأخرى خارجية
-- ٢) ربط المجالين الجديدين بالسياسات ومنحهما لمن يستحق
--
-- ---------------------------------------------------------------------------
-- posting_scope -- الخطاف الموثّق منذ docs/recruitment-module.md §٦-أ
-- ---------------------------------------------------------------------------
-- كان مكتوبًا هناك حرفيًا أن الناقص هو "مرحلتا INTERNAL ثم EXTERNAL... بلا
-- حقل نطاق يميّز الإعلان الداخلي من الخارجي"، وأن الخطوة التالية المقترحة
-- عمود `posting_scope`. هذا تنفيذه بطلب مباشر: "اجعل بوابة التوظيف الحالية
-- باسم بوابة التوظيف الداخلي وأضف تاب بوابة التوظيف الخارجي... كأن يتم
-- التخيير عند الإعلان".
--
-- ثلاث قيم لا قيمتان: 'internal' | 'external' | 'both' — لأن إعلانًا واحدًا
-- قد يُنشر على البوابتين معًا، وإجبار المستخدم على اختيار واحدة كان سيعني
-- إعلانَين منفصلَين لنفس الشاغر.
--
-- DEFAULT 'internal' وليس 'both': البوابة القائمة اليوم داخلية بحكم أن
-- التطبيق كله خلف تسجيل دخول، والإعلانات الموجودة أُنشئت على هذا الأساس.
-- فترقية صامتة إلى 'both' كانت ستنشر إعلانات قائمة خارجيًا دون أن يطلب
-- ذلك أحد -- والافتراض الآمن هو الأضيق.
--
-- ---------------------------------------------------------------------------
-- المجالان الجديدان
-- ---------------------------------------------------------------------------
-- `recruitment_requests` تُقرأ وتُكتب الآن بـ`recruitmentRequests` بدل
-- `recruitmentPlan`. ولئلا يفقد أحد ما يملكه اليوم، تُزرع المنح المكافئة
-- لكل دور يحمل `recruitmentPlan` حاليًا -- فالنتيجة العملية بعد الهجرة
-- مطابقة تمامًا لما قبلها، والفرق أن الصلاحية صارت قابلة للفصل من /admin.
--
-- `recruitmentPortal` جديد بالكامل ويُزرع لكل دور يحمل `vacancies` اليوم،
-- لنفس السبب: البوابة كانت مرئية لهم فعلًا.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- ١) posting_scope
-- ---------------------------------------------------------------------------

ALTER TABLE vacancies
  ADD COLUMN posting_scope TEXT NOT NULL DEFAULT 'internal'
    CHECK (posting_scope = ANY (ARRAY['internal', 'external', 'both']));

COMMENT ON COLUMN vacancies.posting_scope IS
  'نطاق الإعلان: داخلي | خارجي | كلاهما. الافتراضي داخلي، فلا يُنشر إعلان قائم خارجيًا دون قرار.';

-- ---------------------------------------------------------------------------
-- ٢) نقل طلبات الاحتياج إلى مجالها الخاص
-- ---------------------------------------------------------------------------

DROP POLICY recruitment_requests_select ON recruitment_requests;
CREATE POLICY recruitment_requests_select ON recruitment_requests
  FOR SELECT TO authenticated
  USING (
    requested_by = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR check_vpra('recruitmentRequests'::process_area, 'view'::vpra_level, org_unit_id)
    OR check_vpra_global('recruitmentBudget'::process_area, 'view'::vpra_level)
  );

DROP POLICY recruitment_requests_insert ON recruitment_requests;
CREATE POLICY recruitment_requests_insert ON recruitment_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    check_vpra('recruitmentRequests'::process_area, 'prepare'::vpra_level, org_unit_id)
    AND requested_by = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

DROP POLICY recruitment_requests_update ON recruitment_requests;
CREATE POLICY recruitment_requests_update ON recruitment_requests
  FOR UPDATE TO authenticated
  USING (check_vpra('recruitmentRequests'::process_area, 'prepare'::vpra_level, org_unit_id))
  WITH CHECK (check_vpra('recruitmentRequests'::process_area, 'prepare'::vpra_level, org_unit_id));

DROP POLICY recruitment_request_competencies_select ON recruitment_request_competencies;
CREATE POLICY recruitment_request_competencies_select ON recruitment_request_competencies
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recruitment_requests r
      WHERE r.id = request_id
        AND (
          r.requested_by = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
          OR check_vpra('recruitmentRequests'::process_area, 'view'::vpra_level, r.org_unit_id)
          OR check_vpra_global('recruitmentBudget'::process_area, 'view'::vpra_level)
        )
    )
  );

DROP POLICY recruitment_request_competencies_insert ON recruitment_request_competencies;
CREATE POLICY recruitment_request_competencies_insert ON recruitment_request_competencies
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recruitment_requests r
      WHERE r.id = request_id
        AND check_vpra('recruitmentRequests'::process_area, 'prepare'::vpra_level, r.org_unit_id)
    )
  );

DROP POLICY recruitment_request_competencies_update ON recruitment_request_competencies;
CREATE POLICY recruitment_request_competencies_update ON recruitment_request_competencies
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recruitment_requests r
      WHERE r.id = request_id
        AND check_vpra('recruitmentRequests'::process_area, 'prepare'::vpra_level, r.org_unit_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recruitment_requests r
      WHERE r.id = request_id
        AND check_vpra('recruitmentRequests'::process_area, 'prepare'::vpra_level, r.org_unit_id)
    )
  );

-- البيانات المرجعية التي يحتاجها نموذج الطلب تقبل المجال الجديد أيضًا،
-- وإلا لعاد المنسّق يرى قوائم فارغة (نفس الثغرة المعالجة في 20260807000003).
DROP POLICY org_units_select ON org_units;
CREATE POLICY org_units_select ON org_units
  FOR SELECT TO authenticated
  USING (
    check_vpra('employeeData'::process_area, 'view'::vpra_level, id)
    OR check_vpra('vacancies'::process_area, 'view'::vpra_level, id)
    OR check_vpra('recruitmentPlan'::process_area, 'view'::vpra_level, id)
    OR check_vpra('recruitmentBudget'::process_area, 'view'::vpra_level, id)
    OR check_vpra('recruitmentRequests'::process_area, 'view'::vpra_level, id)
  );

DROP POLICY job_titles_select ON job_titles;
CREATE POLICY job_titles_select ON job_titles
  FOR SELECT TO authenticated
  USING (
    check_vpra_global('careerPath'::process_area, 'view'::vpra_level)
    OR check_vpra_global('employeeData'::process_area, 'view'::vpra_level)
    OR check_vpra_global('recruitmentPlan'::process_area, 'view'::vpra_level)
    OR check_vpra_global('recruitmentBudget'::process_area, 'view'::vpra_level)
    OR check_vpra_global('recruitmentRequests'::process_area, 'view'::vpra_level)
  );

DROP POLICY competencies_select ON competencies;
CREATE POLICY competencies_select ON competencies
  FOR SELECT TO authenticated
  USING (
    check_vpra_global('competencyFramework'::process_area, 'view'::vpra_level)
    OR check_vpra_global('recruitmentPlan'::process_area, 'view'::vpra_level)
    OR check_vpra_global('recruitmentRequests'::process_area, 'view'::vpra_level)
  );

DROP POLICY job_title_competencies_select ON job_title_competencies;
CREATE POLICY job_title_competencies_select ON job_title_competencies
  FOR SELECT TO authenticated
  USING (
    check_vpra_global('careerPath'::process_area, 'view'::vpra_level)
    OR check_vpra_global('recruitmentPlan'::process_area, 'view'::vpra_level)
    OR check_vpra_global('recruitmentBudget'::process_area, 'view'::vpra_level)
    OR check_vpra_global('recruitmentRequests'::process_area, 'view'::vpra_level)
  );

-- ---------------------------------------------------------------------------
-- ٣) منح المجالين الجديدين لمن يملك المكافئ اليوم — فلا يفقد أحد شيئًا
-- ---------------------------------------------------------------------------

INSERT INTO role_permissions (role_id, process_area, vpra_level)
SELECT role_id, 'recruitmentRequests'::process_area, vpra_level
FROM role_permissions
WHERE process_area = 'recruitmentPlan'
ON CONFLICT (role_id, process_area) DO NOTHING;

INSERT INTO role_permissions (role_id, process_area, vpra_level)
SELECT role_id, 'recruitmentPortal'::process_area, vpra_level
FROM role_permissions
WHERE process_area = 'vacancies'
ON CONFLICT (role_id, process_area) DO NOTHING;

COMMIT;

-- ============================================================================
-- التحقق — بعد التطبيق.
-- ============================================================================
-- كل الإعلانات القائمة داخلية، ولا شيء نُشر خارجيًا بالصدفة:
--   SELECT posting_scope, count(*) FROM vacancies GROUP BY 1;
-- ولا أحد فقد صلاحية: كل دور يحمل recruitmentPlan يحمل recruitmentRequests
-- بالمستوى نفسه، وكل دور يحمل vacancies يحمل recruitmentPortal كذلك.
-- وبحساب المنسّق: رفع طلب لوحدته ما زال ينجح، ولوحدة أخرى ما زال يُرفض.
