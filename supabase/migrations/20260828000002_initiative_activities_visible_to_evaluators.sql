-- =========================================================================
-- الأنشطة المكلَّف بها تظهر لمن يقيّم صاحبها (2026-08-28).
--
-- صارت الأنشطة موضوعًا للدرجة في 20260828000001، فظهرت ثغرة حقيقية عند
-- التحقق: initiative_activities_select يشترط رؤية المبادرة نفسها، وهي
-- خلف strategicPlanning — ولا يحمله hr_admin. فمن يُدخل الدرجات لا يرى ما
-- يُدخلها عليه، ويصير وزن «النتائج» معطَّلًا عمليًا عند أكثر من يستعمله.
--
-- سياسة ثانية بدل تعديل الأولى: سياسات SELECT المتساهلة تُجمع بـ OR، فلا
-- تُمسّ رؤية مالكي المبادرات كما هي، ويُضاف إليها من له حقّ في الشخص لا في
-- المبادرة:
--   * صاحب النشاط نفسه،
--   * ومن النشاط مسند إلى مرؤوسه المباشر،
--   * ومن يملك على وحدة صاحب النشاط مستوى 'recommend' على التقييم — وهو
--     الحاجز نفسه الذي يفتح صفوف evaluations لأصحاب الإشراف
--     (20260718000011)، فلا يُخترع هنا حاجز جديد.
--
-- ولا يُمنح شيء على المبادرة نفسها: هذه رؤية سطر نشاط مسند إلى شخص، لا
-- اطلاع على الخطة التي جاء منها.
-- =========================================================================

BEGIN;

DROP POLICY IF EXISTS initiative_activities_select_for_evaluators ON initiative_activities;
CREATE POLICY initiative_activities_select_for_evaluators ON initiative_activities FOR SELECT
  USING (
    responsible_profile_id IS NOT NULL
    AND (
      responsible_profile_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
      OR is_my_direct_report(responsible_profile_id)
      OR check_vpra(
           'evaluation',
           'recommend',
           (SELECT p.org_unit_id FROM profiles p WHERE p.id = initiative_activities.responsible_profile_id)
         )
    )
  );

COMMIT;
