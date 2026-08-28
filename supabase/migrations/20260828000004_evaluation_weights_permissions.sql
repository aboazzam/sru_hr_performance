-- =========================================================================
-- أوزان التقييم تُدار بمجالها الخاص (2026-08-28).
--
-- (1) البذرة تنسخ مستوى كل دور على 'evaluation' كما هو إلى
--     'evaluationWeights'. النسخ لا الاختراع: الغرض أن يصير «من يضبط
--     الأوزان» بندًا مستقلًا في شاشة الصلاحيات يُمنح ويُسحب وحده، لا أن
--     يتغيّر اليوم من يملك ماذا. فمن كان يرى الأوزان يراها، ومن كان
--     يضبطها يضبطها، والفرق أن الأمرين صارا قابلين للفصل.
--
-- (2) سياسات org_unit_evaluation_weights تنتقل من 'evaluation' إلى المجال
--     الجديد. تبقى مقيَّدة بالوحدة كما هي: صاحب صلاحية مقيَّدًا بإدارته
--     يضبط إدارته وحدها.
--
-- ولم تُمسّ سياسة evaluation_cycles_update: هي تحكم اسم الدورة وتواريخها
-- أيضًا، وتضييقها على الأوزان كان سيسحب من أصحابها حقًّا في غير موضعه.
-- توزيع الدورة الافتراضي يُحرَس بدلًا من ذلك بفحص تطبيقي على المجال
-- الجديد داخل الإجراء نفسه — حاجزان، والأضيق هو الفاصل.
-- =========================================================================

BEGIN;

INSERT INTO role_permissions (role_id, process_area, vpra_level)
SELECT rp.role_id, 'evaluationWeights'::process_area, rp.vpra_level
FROM role_permissions rp
WHERE rp.process_area = 'evaluation'
ON CONFLICT (role_id, process_area) DO NOTHING;

DROP POLICY IF EXISTS org_unit_evaluation_weights_select ON org_unit_evaluation_weights;
CREATE POLICY org_unit_evaluation_weights_select ON org_unit_evaluation_weights FOR SELECT
  USING (check_vpra('evaluationWeights', 'view', org_unit_id));

DROP POLICY IF EXISTS org_unit_evaluation_weights_insert ON org_unit_evaluation_weights;
CREATE POLICY org_unit_evaluation_weights_insert ON org_unit_evaluation_weights FOR INSERT
  WITH CHECK (check_vpra('evaluationWeights', 'approve', org_unit_id));

DROP POLICY IF EXISTS org_unit_evaluation_weights_update ON org_unit_evaluation_weights;
CREATE POLICY org_unit_evaluation_weights_update ON org_unit_evaluation_weights FOR UPDATE
  USING (check_vpra('evaluationWeights', 'approve', org_unit_id));

COMMIT;
