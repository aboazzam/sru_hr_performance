-- Scope: طلب مباشر بعد أن لاحظ صاحب المشروع أن دورة "تقييم 360" الجديدة
-- (three_sixty_cycles) لا علاقة لها إطلاقًا بدورة "التقييم للعام الأكاديمي"
-- (evaluation_cycles) رغم أن الأخيرة تحمل بالفعل وزنًا مخصصًا لتقييم 360
-- (weight_feedback_360) ضمن أوزان الدرجة الكلية الأربعة -- وأن ذلك الوزن كان
-- يُحتسب فعليًا من جدول قديم ومختلف تمامًا (feedback_360)، لا من الموديول
-- الغني الذي بُني في اليومين الأخيرين (three_sixty_*). القرارات الثلاثة
-- المؤكَّدة مباشرة من صاحب المشروع: (1) العلاقة 1:1 بين دورة 360 ودورة
-- التقييم، (2) حذف weight_in_total_score من three_sixty_cycles (كان زائدًا
-- عن الحاجة -- الوزن الحقيقي موجود أصلًا في evaluation_cycles.weight_feedback_360)،
-- (3) إلغاء نظام feedback_360 القديم بالكامل (الجدول، جدول الترشيحات،
-- الدالة، الشاشات) لصالح الموديول الجديد.
--
-- Will change: إضافة `three_sixty_cycles.evaluation_cycle_id` (فريد، NOT
-- NULL -- كلا الجدولين فارغ تمامًا اليوم فلا حاجة لتعبئة أثرية)، حذف
-- `three_sixty_cycles.weight_in_total_score`، حذف `feedback_360` و
-- `feedback_360_nominations` و`reveal_feedback_360_evaluator` نهائيًا.
--
-- Will NOT change: `evaluation_cycles.weight_feedback_360` نفسه (لا يزال
-- المفهوم صحيحًا -- فقط مصدر البيانات الذي يغذّيه تغيّر في كود التطبيق لا في
-- هذه الهجرة)، ولا `org_unit_evaluation_weights` (نفس المنطق).
--
-- Rollback: حذف عمود evaluation_cycle_id، إعادة إنشاء weight_in_total_score
-- (numeric(5,2))، إعادة إنشاء feedback_360/feedback_360_nominations
-- والدالة من الهجرات الأصلية (20260718000005، إلخ) إن استُدعي التراجع فعليًا
-- -- غير متوقَّع، فكلا الجدولين كان فارغًا وقت هذه الهجرة (تحقّقت مباشرة).

BEGIN;

ALTER TABLE three_sixty_cycles
  ADD COLUMN evaluation_cycle_id uuid NOT NULL REFERENCES evaluation_cycles(id) ON DELETE RESTRICT,
  ADD CONSTRAINT three_sixty_cycles_evaluation_cycle_uidx UNIQUE (evaluation_cycle_id);

ALTER TABLE three_sixty_cycles
  DROP COLUMN weight_in_total_score;

DROP TABLE feedback_360_nominations;
DROP TABLE feedback_360;
DROP FUNCTION reveal_feedback_360_evaluator(uuid, text);

-- تحقّق قبل الاعتماد
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'three_sixty_cycles' AND column_name = 'evaluation_cycle_id') AS has_link_column, -- متوقع 1
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'three_sixty_cycles' AND column_name = 'weight_in_total_score') AS has_old_weight_column, -- متوقع 0
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'feedback_360') AS feedback_360_exists, -- متوقع 0
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'feedback_360_nominations') AS feedback_360_nominations_exists, -- متوقع 0
  (SELECT count(*) FROM pg_proc WHERE proname = 'reveal_feedback_360_evaluator') AS reveal_fn_exists; -- متوقع 0

COMMIT;
