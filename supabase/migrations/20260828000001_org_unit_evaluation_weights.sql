-- =========================================================================
-- إعادة تصميم أوزان التقييم (2026-08-28، بطلب مالك المشروع).
--
-- ثلاثة تغييرات مترابطة:
--
-- (1) الوزن ينزل إلى الإدارة: «كل إدارة لها أوزانها المختلفة». جدول
--     org_unit_evaluation_weights يحمل توزيعًا لكل (دورة، وحدة تنظيمية)،
--     وتبقى أوزان الدورة نفسها الافتراضَ لكل إدارة لم يُحدَّد لها توزيع —
--     فلا تنكسر دورة قائمة، ولا يُفرض على كل إدارة إدخالٌ قبل أن تبدأ.
--     والصلاحية لا تنتقل مع الوزن: الكتابة تبقى عند check_vpra('evaluation',
--     'approve', org_unit) كما هي على الدورة، أي «تبقى لدى صاحب الصلاحية»
--     كما نصّ الطلب — غير أن المعامل الثالث يجعل صاحب صلاحية مقيَّدًا بوحدته
--     يكتب توزيع وحدته وحدها.
--
-- (2) الطرق الأربع تُجمَع في مجموعتين: النتائج (الأنشطة المكلَّف بها +
--     المهام التشغيلية) والسلوك (الجدارات + تقييم 360). التجميع عرضٌ لا
--     تخزين: مجموع الأربعة يبقى مئة، والمجموعتان تُحسبان جمعًا عند العرض،
--     فلا يوجد رقمان لحقيقة واحدة يفترقان.
--
-- (3) weight_goals صار weight_activities. الطلب سمّى «الأنشطة المكلَّف بها»
--     ولم يذكر مستهدفات الاستراتيجية بين مكوّنات الدرجة، فأُعيد الاسم إلى
--     ما يوزنه فعلًا. والأنشطة صارت قابلة للتقييم (activity_id على
--     evaluation_scores) وإلا لكان الوزن يُعطى ولا يجد ما يوزنه — نفس
--     الثغرة التي عولجت للمهام التشغيلية في 20260827000002.
--
-- **أثر مقصود يجب أن يُعرف**: مستهدفات الاستراتيجية (goals) لم تعد تُسهم
-- في الدرجة الموزونة. عمود goal_id باقٍ على evaluation_scores ولم يُحذف،
-- فالدرجات المسجَّلة عليه — ولا وجود لها اليوم — لا تضيع.
-- =========================================================================

BEGIN;

-- (3-أ) اسم الوزن الأول
ALTER TABLE evaluation_cycles RENAME COLUMN weight_goals TO weight_activities;

ALTER TABLE evaluation_cycles
  DROP CONSTRAINT IF EXISTS evaluation_cycles_method_weights_range;
ALTER TABLE evaluation_cycles
  ADD CONSTRAINT evaluation_cycles_method_weights_range CHECK (
    weight_activities   BETWEEN 0 AND 100 AND
    weight_competencies BETWEEN 0 AND 100 AND
    weight_bau          BETWEEN 0 AND 100 AND
    weight_feedback_360 BETWEEN 0 AND 100
  );

ALTER TABLE evaluation_cycles
  DROP CONSTRAINT IF EXISTS evaluation_cycles_method_weights_total;
ALTER TABLE evaluation_cycles
  ADD CONSTRAINT evaluation_cycles_method_weights_total CHECK (
    abs((weight_activities + weight_competencies + weight_bau + weight_feedback_360) - 100) < 0.01
  );

COMMENT ON COLUMN evaluation_cycles.weight_activities IS
  'وزن الأنشطة المكلَّف بها في درجة الدورة (٪) — الافتراض لكل إدارة لم يُحدَّد لها توزيع.';

-- (1) توزيع لكل إدارة
CREATE TABLE IF NOT EXISTS org_unit_evaluation_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES evaluation_cycles(id) ON DELETE CASCADE,
  org_unit_id uuid NOT NULL REFERENCES org_units(id) ON DELETE CASCADE,
  weight_activities   numeric(5,2) NOT NULL DEFAULT 25,
  weight_competencies numeric(5,2) NOT NULL DEFAULT 25,
  weight_bau          numeric(5,2) NOT NULL DEFAULT 25,
  weight_feedback_360 numeric(5,2) NOT NULL DEFAULT 25,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT org_unit_weights_range CHECK (
    weight_activities   BETWEEN 0 AND 100 AND
    weight_competencies BETWEEN 0 AND 100 AND
    weight_bau          BETWEEN 0 AND 100 AND
    weight_feedback_360 BETWEEN 0 AND 100
  ),
  CONSTRAINT org_unit_weights_total CHECK (
    abs((weight_activities + weight_competencies + weight_bau + weight_feedback_360) - 100) < 0.01
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS org_unit_evaluation_weights_unique
  ON org_unit_evaluation_weights (cycle_id, org_unit_id)
  WHERE deleted_at IS NULL;

ALTER TABLE org_unit_evaluation_weights ENABLE ROW LEVEL SECURITY;

-- القراءة عند 'view': الموظف يحق له أن يعرف كيف تُوزن درجته.
DROP POLICY IF EXISTS org_unit_evaluation_weights_select ON org_unit_evaluation_weights;
CREATE POLICY org_unit_evaluation_weights_select ON org_unit_evaluation_weights FOR SELECT
  USING (check_vpra('evaluation', 'view', org_unit_id));

DROP POLICY IF EXISTS org_unit_evaluation_weights_insert ON org_unit_evaluation_weights;
CREATE POLICY org_unit_evaluation_weights_insert ON org_unit_evaluation_weights FOR INSERT
  WITH CHECK (check_vpra('evaluation', 'approve', org_unit_id));

DROP POLICY IF EXISTS org_unit_evaluation_weights_update ON org_unit_evaluation_weights;
CREATE POLICY org_unit_evaluation_weights_update ON org_unit_evaluation_weights FOR UPDATE
  USING (check_vpra('evaluation', 'approve', org_unit_id));

COMMENT ON TABLE org_unit_evaluation_weights IS
  'توزيع أوزان طرق التقييم لإدارة بعينها في دورة بعينها — وغيابه يعني اعتماد توزيع الدورة.';

-- (3-ب) الأنشطة صارت قابلة للتقييم
ALTER TABLE evaluation_scores
  ADD COLUMN IF NOT EXISTS activity_id uuid REFERENCES initiative_activities(id) ON DELETE RESTRICT;

ALTER TABLE evaluation_scores
  DROP CONSTRAINT IF EXISTS evaluation_scores_subject_source;
ALTER TABLE evaluation_scores
  ADD CONSTRAINT evaluation_scores_subject_source CHECK (
    (competency_id IS NOT NULL)::int
      + (goal_id IS NOT NULL)::int
      + (bau_task_id IS NOT NULL)::int
      + (activity_id IS NOT NULL)::int
    = 1
  );

CREATE UNIQUE INDEX IF NOT EXISTS evaluation_scores_activity_unique
  ON evaluation_scores (evaluation_id, activity_id)
  WHERE activity_id IS NOT NULL;

COMMENT ON COLUMN evaluation_scores.activity_id IS
  'النشاط المكلَّف به الذي تخصّه هذه الدرجة — بديل عن بقية أعمدة الموضوع لا مضاف إليها.';

COMMIT;
