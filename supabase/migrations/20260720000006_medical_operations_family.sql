-- Creates the "التشغيل الطبي" (Medical Operations) job_family, previously flagged as a
-- documented gap: this track appears throughout Career path.xlsx's "Career Path" sheet
-- (column 19) but had no corresponding job_family or job_titles at all. Adds its 5-tier
-- ladder (grades 8-11 admin, grade 13 leadership) with salary rows copied from the existing
-- per-grade figures, same approach as migration 20260720000004. Grade-12 "رئيس قسم" is
-- deliberately left out: the sheet gives only the bare generic label here (not a specific
-- name), and it doesn't exact-match the existing generic "رئيس قسم/رئيس مكتب" title's exact
-- wording -- left unresolved rather than guessed, consistent with every other track this
-- session.

BEGIN;

WITH new_family AS (
  INSERT INTO job_families (name_ar) VALUES ('التشغيل الطبي')
  RETURNING id
), new_titles AS (
  INSERT INTO job_titles (job_family_id, grade_level, name_ar, category)
  SELECT nf.id, v.grade_level, v.name_ar, v.category::job_title_category
  FROM new_family nf, (VALUES
    (8, 'أ.م.تشغيل طبي', 'admin'),
    (9, 'أ.تشغيل طبي', 'admin'),
    (10, 'أ.أول.تشغيل طبي', 'admin'),
    (11, 'استشاري تشغيل طبي', 'admin'),
    (13, 'مدير إدارة التشغيل الطبي', 'leadership')
  ) AS v(grade_level, name_ar, category)
  RETURNING id, grade_level
)
INSERT INTO salary_scale (job_title_id, step_a, step_b, step_c, step_d, step_e, step_f, step_g, annual_increase_cap, effective_date)
SELECT nt.id, g.step_a, g.step_b, g.step_c, g.step_d, g.step_e, g.step_f, g.step_g, g.annual_increase_cap, CURRENT_DATE
FROM new_titles nt
JOIN (VALUES
  (13, 14700, 16800, 18900, 21000, 23100, 25200, 27300, NULL),
  (8, 3430, 3920, 4410, 4900, 5390, 5880, 6370, NULL),
  (9, 4802, 5488, 6174, 6860, 7546, 8232, 8918, NULL),
  (10, 6723, 7683, 8644, 9604, 10564, 11525, 12485, NULL),
  (11, 9412, 10756, 12101, 13446, 14790, 16135, 17479, 5)
  ) AS g(grade_level, step_a, step_b, step_c, step_d, step_e, step_f, step_g, annual_increase_cap)
  ON g.grade_level = nt.grade_level;

COMMIT;
