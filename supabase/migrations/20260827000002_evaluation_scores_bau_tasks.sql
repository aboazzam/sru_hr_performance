-- =========================================================================
-- درجات المهام التشغيلية (2026-08-27، بطلب مالك المشروع: «نعم أضف وزنا
-- للمهام التشغيلية»).
--
-- كان وزن المهام التشغيلية في توزيع الدورة (20260827000001) عاجزًا عن
-- الإسهام في الدرجة أصلًا: evaluation_scores يحمل جدارة أو هدفًا ولا ثالث،
-- فالوزن يُعطى ولا يجد ما يوزنه. هذه الهجرة تسدّ ذلك.
--
-- ثلاثة أعمدة موضوع، وواحد منها بالضبط غير فارغ — نفس شكل القيد القائم
-- موسَّعًا من اثنين إلى ثلاثة، لا قيدًا جديدًا بجانبه.
--
-- الفهرس الفريد جزئي على (evaluation_id, bau_task_id) مطابقًا لشقيقيه في
-- هذا الجدول تحديدًا، بما في ذلك خلوّهما من deleted_at IS NULL. عدم
-- استثناء المحذوف منطقيًا نقص قائم في هذين الفهرسين (صفٌّ محذوف يمنع
-- بديله)، لكن إصلاحه يخصّهما لا هذه الهجرة، ومخالفة شكلهما هنا كانت
-- ستجعل الجدول الواحد يتبع عرفين.
--
-- ON DELETE RESTRICT كشقيقيه: درجة مسجَّلة لا يجوز أن تفقد موضوعها بحذف
-- صامت.
-- =========================================================================

BEGIN;

ALTER TABLE evaluation_scores
  ADD COLUMN IF NOT EXISTS bau_task_id uuid REFERENCES bau_tasks(id) ON DELETE RESTRICT;

ALTER TABLE evaluation_scores
  DROP CONSTRAINT IF EXISTS evaluation_scores_subject_source;
ALTER TABLE evaluation_scores
  ADD CONSTRAINT evaluation_scores_subject_source CHECK (
    (competency_id IS NOT NULL)::int
      + (goal_id IS NOT NULL)::int
      + (bau_task_id IS NOT NULL)::int
    = 1
  );

CREATE UNIQUE INDEX IF NOT EXISTS evaluation_scores_bau_task_unique
  ON evaluation_scores (evaluation_id, bau_task_id)
  WHERE bau_task_id IS NOT NULL;

COMMENT ON COLUMN evaluation_scores.bau_task_id IS
  'المهمة التشغيلية التي تخصّها هذه الدرجة — بديل عن competency_id/goal_id لا مضاف إليهما.';

COMMIT;
