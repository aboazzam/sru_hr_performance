-- =========================================================================
-- توزيع أوزان طرق التقييم على مستوى الدورة (2026-08-27، بطلب مالك المشروع).
--
-- الدورة تحمل التوزيع، فيسري على كل تقييماتها بلا استثناء — وهذا هو المقصود:
-- «يتم تطبيقه على جميع التقييمات في هذه الدورة». ولو حُفظ الوزن في التقييم
-- الواحد لأمكن أن يختلف موظفان في الدورة نفسها، وهو ما يفسد المقارنة
-- والمعايرة معًا.
--
-- أربعة أعمدة لا جدول أبناء: التوزيع أربع قيم ثابتة لكل دورة، والقيد الذي
-- يضمن أن مجموعها مئة لا يمكن التعبير عنه على صفوف متفرّقة إلا بمُشغّل.
--
-- المجموع مئة بالضبط، وبسماحية 0.01 لأن NUMERIC(5,2) يسمح بكسور تجعل
-- المساواة الحرفية هشّة.
--
-- الافتراضي 25 لكل طريقة: قيمة محايدة تُبقي القيد صحيحًا للدورات القائمة
-- دون أن تدّعي قرارًا لم يتخذه أحد — وهي أول ما يُتوقَّع من مالك الدورة
-- تعديله.
-- =========================================================================

BEGIN;

ALTER TABLE evaluation_cycles
  ADD COLUMN IF NOT EXISTS weight_goals        NUMERIC(5,2) NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS weight_competencies NUMERIC(5,2) NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS weight_bau          NUMERIC(5,2) NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS weight_feedback_360 NUMERIC(5,2) NOT NULL DEFAULT 25;

ALTER TABLE evaluation_cycles
  DROP CONSTRAINT IF EXISTS evaluation_cycles_method_weights_range;
ALTER TABLE evaluation_cycles
  ADD CONSTRAINT evaluation_cycles_method_weights_range CHECK (
    weight_goals        BETWEEN 0 AND 100 AND
    weight_competencies BETWEEN 0 AND 100 AND
    weight_bau          BETWEEN 0 AND 100 AND
    weight_feedback_360 BETWEEN 0 AND 100
  );

ALTER TABLE evaluation_cycles
  DROP CONSTRAINT IF EXISTS evaluation_cycles_method_weights_total;
ALTER TABLE evaluation_cycles
  ADD CONSTRAINT evaluation_cycles_method_weights_total CHECK (
    abs((weight_goals + weight_competencies + weight_bau + weight_feedback_360) - 100) < 0.01
  );

COMMENT ON COLUMN evaluation_cycles.weight_goals IS 'وزن مستهدفات الاستراتيجية في درجة الدورة (٪).';
COMMENT ON COLUMN evaluation_cycles.weight_competencies IS 'وزن الجدارات في درجة الدورة (٪).';
COMMENT ON COLUMN evaluation_cycles.weight_bau IS 'وزن المهام التشغيلية في درجة الدورة (٪).';
COMMENT ON COLUMN evaluation_cycles.weight_feedback_360 IS 'وزن تقييم 360 في درجة الدورة (٪).';

COMMIT;
