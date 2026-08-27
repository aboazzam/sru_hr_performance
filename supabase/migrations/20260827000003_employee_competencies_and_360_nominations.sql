-- =========================================================================
-- ملف الموظف: جداراته الخاصة، ومن سيقيّمونه في تقييم 360
-- (2026-08-27، بطلب مالك المشروع).
--
-- (1) employee_competencies
-- job_title_competencies يصف المسمى الوظيفي لا الشخص: كل من يحمل المسمى
-- نفسه يشترك في صفوفه. والمطلوب هنا أن «يحدد المدير المستوى لهذا الموظف
-- ويضيف جدارات أخرى» — وهو قرار عن شخص بعينه، فلا يصحّ كتابته في جدول
-- المسمى وإلا سرى على زملائه جميعًا. جدول مستقل إذن، لا عمود إضافي هناك.
--
-- الجدارات المؤسسية (type='core') لا تُخزَّن مسبقًا: الشاشة تعرضها كلها
-- دائمًا من competencies، والصف لا يُكتب إلا حين يُحدَّد له مستوى فعلًا —
-- نفس نهج شاشة المسمى الوظيفي، وتفاديًا لصفوف فارغة عن كل موظف.
--
-- (2) feedback_360_nominations
-- feedback_360 يحمل الإفادة المقدَّمة فعلًا، وسياسة الإدراج فيه تشترط
-- evaluator_id = صاحب الجلسة نفسه — عمدًا، حتى لا يُنتحل مقيّم. فلا يمكن
-- للمدير أن «يحدد من سيقيّم» بالكتابة فيه أصلًا. الترشيح إذن جدول منفصل
-- يسبق الإفادة ولا يحلّ محلها، والرابط بينهما بالمطابقة على
-- (cycle, target, evaluator, relation) — وهي نفس رباعية القيد الفريد
-- القائمة في feedback_360.
--
-- [استنتاج] في الصلاحيات: لا وثيقة تسمّي من يملك هذين القرارين. جرى
-- ربطهما بما هو قائم فعلًا: employeeData للجدارات (قرار عن بيانات الموظف)،
-- evaluation للترشيحات (تقييم 360 مصنَّف تحت التقييم منذ feedback_360)،
-- وفي الحالتين is_my_direct_report كفرع مستقل حتى يستطيع المدير المباشر
-- إدارة من يتبعه دون منحه اطلاعًا على الجامعة كلها.
-- =========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS employee_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  competency_id uuid NOT NULL REFERENCES competencies(id) ON DELETE RESTRICT,
  required_level behavioral_level NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS employee_competencies_unique
  ON employee_competencies (employee_id, competency_id)
  WHERE deleted_at IS NULL;

ALTER TABLE employee_competencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_competencies_select ON employee_competencies;
CREATE POLICY employee_competencies_select ON employee_competencies FOR SELECT
  USING (
    employee_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR is_my_direct_report(employee_id)
    OR check_vpra('employeeData', 'view',
        (SELECT p.org_unit_id FROM profiles p WHERE p.id = employee_competencies.employee_id))
  );

DROP POLICY IF EXISTS employee_competencies_insert ON employee_competencies;
CREATE POLICY employee_competencies_insert ON employee_competencies FOR INSERT
  WITH CHECK (
    is_my_direct_report(employee_id)
    OR check_vpra('employeeData', 'approve',
        (SELECT p.org_unit_id FROM profiles p WHERE p.id = employee_competencies.employee_id))
  );

DROP POLICY IF EXISTS employee_competencies_update ON employee_competencies;
CREATE POLICY employee_competencies_update ON employee_competencies FOR UPDATE
  USING (
    is_my_direct_report(employee_id)
    OR check_vpra('employeeData', 'approve',
        (SELECT p.org_unit_id FROM profiles p WHERE p.id = employee_competencies.employee_id))
  );

CREATE TABLE IF NOT EXISTS feedback_360_nominations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES evaluation_cycles(id) ON DELETE RESTRICT,
  target_employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  evaluator_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  evaluator_relation feedback_360_evaluator_relation NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT feedback_360_nominations_not_self
    CHECK (evaluator_relation = 'self' OR evaluator_id <> target_employee_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS feedback_360_nominations_unique
  ON feedback_360_nominations (cycle_id, target_employee_id, evaluator_id, evaluator_relation)
  WHERE deleted_at IS NULL;

ALTER TABLE feedback_360_nominations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feedback_360_nominations_select ON feedback_360_nominations;
CREATE POLICY feedback_360_nominations_select ON feedback_360_nominations FOR SELECT
  USING (
    target_employee_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR evaluator_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR is_my_direct_report(target_employee_id)
    OR check_vpra('evaluation', 'recommend',
        (SELECT p.org_unit_id FROM profiles p WHERE p.id = feedback_360_nominations.target_employee_id))
  );

DROP POLICY IF EXISTS feedback_360_nominations_insert ON feedback_360_nominations;
CREATE POLICY feedback_360_nominations_insert ON feedback_360_nominations FOR INSERT
  WITH CHECK (
    is_my_direct_report(target_employee_id)
    OR check_vpra('evaluation', 'approve',
        (SELECT p.org_unit_id FROM profiles p WHERE p.id = feedback_360_nominations.target_employee_id))
  );

DROP POLICY IF EXISTS feedback_360_nominations_update ON feedback_360_nominations;
CREATE POLICY feedback_360_nominations_update ON feedback_360_nominations FOR UPDATE
  USING (
    is_my_direct_report(target_employee_id)
    OR check_vpra('evaluation', 'approve',
        (SELECT p.org_unit_id FROM profiles p WHERE p.id = feedback_360_nominations.target_employee_id))
  );

COMMENT ON TABLE employee_competencies IS
  'جدارات الموظف بعينه ومستوياتها المطلوبة — مستقلة عن job_title_competencies التي تصف المسمى لا الشخص.';
COMMENT ON TABLE feedback_360_nominations IS
  'ترشيح من سيقيّمون الموظف في تقييم 360 — يسبق feedback_360 ولا يحلّ محله.';

COMMIT;
