-- ============================================================================
-- Fills the missing `salary_scale` rows for 19 leadership job titles, per
-- direct request ("أضف الباقي") after the deans' own rows were deferred.
--
-- NOTHING IS INVENTED. This schema's salary scale is per (grade_level,
-- category), not per title -- already an established fact from the original
-- 2026-07-20 import and reused by the 20260720000004 missing-titles work:
-- every title sharing a grade AND category carries identical step figures.
-- Each row below therefore COPIES the single real figure set that already
-- exists for that title's own (grade, category). The generator asserts that
-- each such pair has EXACTLY ONE distinct figure set before emitting SQL --
-- an ambiguous or absent source aborts generation rather than guessing.
--
-- Titles filled, by grade:
--   grade 12: 6 title(s)
--   grade 13: 7 title(s)
--   grade 14: 2 title(s)
--   grade 16: 4 title(s)
--
-- Deliberately EXCLUDED: the 4 deans (عميد كلية ...). They are grade 14 with
-- category 'academic', and the academic track in this database has real
-- figures only for grades 1-9 (أستاذ = grade 9), so there is no academic
-- grade-14 scale to copy. Copying the grade-14 LEADERSHIP figures would cap a
-- dean (38,220) below a full professor's mid-step (39,749) -- almost certainly
-- wrong. Their real figures are an open question with the project owner, along
-- with whether grade 14 is even the right grade for an academic-track dean
-- (that grade was itself an [استنتاج] from earlier work, not source data).
--
-- effective_date matches the single existing value in the table
-- (2026-07-20), so these rows belong to the same scale version as
-- everything already imported. Each INSERT is guarded by NOT EXISTS, so
-- re-running is a no-op rather than a duplicate-key error.
-- ============================================================================

BEGIN;

INSERT INTO salary_scale (job_title_id, step_a, step_b, step_c, step_d, step_e, step_f, step_g, step_h, step_i, annual_increase_cap, effective_date)
SELECT jt.id, 14700, 16800, 18900, 21000, 23100, 25200, 27300, NULL, NULL, NULL, DATE '2026-07-20'
FROM job_titles jt
WHERE jt.name_ar = 'مدير إدارة التميز المؤسسي'
  AND jt.grade_level = 13
  AND jt.category = 'leadership'
  AND jt.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM salary_scale ss WHERE ss.job_title_id = jt.id);

INSERT INTO salary_scale (job_title_id, step_a, step_b, step_c, step_d, step_e, step_f, step_g, step_h, step_i, annual_increase_cap, effective_date)
SELECT jt.id, 14700, 16800, 18900, 21000, 23100, 25200, 27300, NULL, NULL, NULL, DATE '2026-07-20'
FROM job_titles jt
WHERE jt.name_ar = 'مدير وحدة التوعية والسلوك المهني'
  AND jt.grade_level = 13
  AND jt.category = 'leadership'
  AND jt.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM salary_scale ss WHERE ss.job_title_id = jt.id);

INSERT INTO salary_scale (job_title_id, step_a, step_b, step_c, step_d, step_e, step_f, step_g, step_h, step_i, annual_increase_cap, effective_date)
SELECT jt.id, 40337, 46099, 51862, 57624, 63386, 69149, 74911, NULL, NULL, 5, DATE '2026-07-20'
FROM job_titles jt
WHERE jt.name_ar = 'مساعد النائب للدراسات العليا والبحث العلمي'
  AND jt.grade_level = 16
  AND jt.category = 'leadership'
  AND jt.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM salary_scale ss WHERE ss.job_title_id = jt.id);

INSERT INTO salary_scale (job_title_id, step_a, step_b, step_c, step_d, step_e, step_f, step_g, step_h, step_i, annual_increase_cap, effective_date)
SELECT jt.id, 20580, 23520, 26460, 29400, 32340, 35280, 38220, NULL, NULL, NULL, DATE '2026-07-20'
FROM job_titles jt
WHERE jt.name_ar = 'مدير الإدارة الهندسية'
  AND jt.grade_level = 14
  AND jt.category = 'leadership'
  AND jt.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM salary_scale ss WHERE ss.job_title_id = jt.id);

INSERT INTO salary_scale (job_title_id, step_a, step_b, step_c, step_d, step_e, step_f, step_g, step_h, step_i, annual_increase_cap, effective_date)
SELECT jt.id, 20580, 23520, 26460, 29400, 32340, 35280, 38220, NULL, NULL, NULL, DATE '2026-07-20'
FROM job_titles jt
WHERE jt.name_ar = 'مدير إدارة المستودعات'
  AND jt.grade_level = 14
  AND jt.category = 'leadership'
  AND jt.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM salary_scale ss WHERE ss.job_title_id = jt.id);

INSERT INTO salary_scale (job_title_id, step_a, step_b, step_c, step_d, step_e, step_f, step_g, step_h, step_i, annual_increase_cap, effective_date)
SELECT jt.id, 14700, 16800, 18900, 21000, 23100, 25200, 27300, NULL, NULL, NULL, DATE '2026-07-20'
FROM job_titles jt
WHERE jt.name_ar = 'مدير إدارة التدريب والاستشارات'
  AND jt.grade_level = 13
  AND jt.category = 'leadership'
  AND jt.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM salary_scale ss WHERE ss.job_title_id = jt.id);

INSERT INTO salary_scale (job_title_id, step_a, step_b, step_c, step_d, step_e, step_f, step_g, step_h, step_i, annual_increase_cap, effective_date)
SELECT jt.id, 14700, 16800, 18900, 21000, 23100, 25200, 27300, NULL, NULL, NULL, DATE '2026-07-20'
FROM job_titles jt
WHERE jt.name_ar = 'مدير إدارة الشراكات'
  AND jt.grade_level = 13
  AND jt.category = 'leadership'
  AND jt.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM salary_scale ss WHERE ss.job_title_id = jt.id);

INSERT INTO salary_scale (job_title_id, step_a, step_b, step_c, step_d, step_e, step_f, step_g, step_h, step_i, annual_increase_cap, effective_date)
SELECT jt.id, 14700, 16800, 18900, 21000, 23100, 25200, 27300, NULL, NULL, NULL, DATE '2026-07-20'
FROM job_titles jt
WHERE jt.name_ar = 'مدير إدارة تطوير المنتجات والخدمات'
  AND jt.grade_level = 13
  AND jt.category = 'leadership'
  AND jt.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM salary_scale ss WHERE ss.job_title_id = jt.id);

INSERT INTO salary_scale (job_title_id, step_a, step_b, step_c, step_d, step_e, step_f, step_g, step_h, step_i, annual_increase_cap, effective_date)
SELECT jt.id, 10500, 12000, 13500, 15000, 16500, 18000, 19500, NULL, NULL, NULL, DATE '2026-07-20'
FROM job_titles jt
WHERE jt.name_ar = 'رئيس مكتب المنح والحلول المالية'
  AND jt.grade_level = 12
  AND jt.category = 'leadership'
  AND jt.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM salary_scale ss WHERE ss.job_title_id = jt.id);

INSERT INTO salary_scale (job_title_id, step_a, step_b, step_c, step_d, step_e, step_f, step_g, step_h, step_i, annual_increase_cap, effective_date)
SELECT jt.id, 10500, 12000, 13500, 15000, 16500, 18000, 19500, NULL, NULL, NULL, DATE '2026-07-20'
FROM job_titles jt
WHERE jt.name_ar = 'رئيس مكتب رعاية الخريجين'
  AND jt.grade_level = 12
  AND jt.category = 'leadership'
  AND jt.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM salary_scale ss WHERE ss.job_title_id = jt.id);

INSERT INTO salary_scale (job_title_id, step_a, step_b, step_c, step_d, step_e, step_f, step_g, step_h, step_i, annual_increase_cap, effective_date)
SELECT jt.id, 10500, 12000, 13500, 15000, 16500, 18000, 19500, NULL, NULL, NULL, DATE '2026-07-20'
FROM job_titles jt
WHERE jt.name_ar = 'رئيس مركز الاستشارات'
  AND jt.grade_level = 12
  AND jt.category = 'leadership'
  AND jt.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM salary_scale ss WHERE ss.job_title_id = jt.id);

INSERT INTO salary_scale (job_title_id, step_a, step_b, step_c, step_d, step_e, step_f, step_g, step_h, step_i, annual_increase_cap, effective_date)
SELECT jt.id, 10500, 12000, 13500, 15000, 16500, 18000, 19500, NULL, NULL, NULL, DATE '2026-07-20'
FROM job_titles jt
WHERE jt.name_ar = 'رئيس مكتب الدراسات العليا'
  AND jt.grade_level = 12
  AND jt.category = 'leadership'
  AND jt.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM salary_scale ss WHERE ss.job_title_id = jt.id);

INSERT INTO salary_scale (job_title_id, step_a, step_b, step_c, step_d, step_e, step_f, step_g, step_h, step_i, annual_increase_cap, effective_date)
SELECT jt.id, 10500, 12000, 13500, 15000, 16500, 18000, 19500, NULL, NULL, NULL, DATE '2026-07-20'
FROM job_titles jt
WHERE jt.name_ar = 'رئيس مكتب البحث العلمي'
  AND jt.grade_level = 12
  AND jt.category = 'leadership'
  AND jt.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM salary_scale ss WHERE ss.job_title_id = jt.id);

INSERT INTO salary_scale (job_title_id, step_a, step_b, step_c, step_d, step_e, step_f, step_g, step_h, step_i, annual_increase_cap, effective_date)
SELECT jt.id, 14700, 16800, 18900, 21000, 23100, 25200, 27300, NULL, NULL, NULL, DATE '2026-07-20'
FROM job_titles jt
WHERE jt.name_ar = 'مدير إدارة التدريب'
  AND jt.grade_level = 13
  AND jt.category = 'leadership'
  AND jt.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM salary_scale ss WHERE ss.job_title_id = jt.id);

INSERT INTO salary_scale (job_title_id, step_a, step_b, step_c, step_d, step_e, step_f, step_g, step_h, step_i, annual_increase_cap, effective_date)
SELECT jt.id, 14700, 16800, 18900, 21000, 23100, 25200, 27300, NULL, NULL, NULL, DATE '2026-07-20'
FROM job_titles jt
WHERE jt.name_ar = 'مدير إدارة التجهيزات التعليمية'
  AND jt.grade_level = 13
  AND jt.category = 'leadership'
  AND jt.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM salary_scale ss WHERE ss.job_title_id = jt.id);

INSERT INTO salary_scale (job_title_id, step_a, step_b, step_c, step_d, step_e, step_f, step_g, step_h, step_i, annual_increase_cap, effective_date)
SELECT jt.id, 10500, 12000, 13500, 15000, 16500, 18000, 19500, NULL, NULL, NULL, DATE '2026-07-20'
FROM job_titles jt
WHERE jt.name_ar = 'رئيس مركز إدارة المحتوى'
  AND jt.grade_level = 12
  AND jt.category = 'leadership'
  AND jt.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM salary_scale ss WHERE ss.job_title_id = jt.id);

INSERT INTO salary_scale (job_title_id, step_a, step_b, step_c, step_d, step_e, step_f, step_g, step_h, step_i, annual_increase_cap, effective_date)
SELECT jt.id, 40337, 46099, 51862, 57624, 63386, 69149, 74911, NULL, NULL, 5, DATE '2026-07-20'
FROM job_titles jt
WHERE jt.name_ar = 'رئيس الجامعة'
  AND jt.grade_level = 16
  AND jt.category = 'leadership'
  AND jt.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM salary_scale ss WHERE ss.job_title_id = jt.id);

INSERT INTO salary_scale (job_title_id, step_a, step_b, step_c, step_d, step_e, step_f, step_g, step_h, step_i, annual_increase_cap, effective_date)
SELECT jt.id, 40337, 46099, 51862, 57624, 63386, 69149, 74911, NULL, NULL, 5, DATE '2026-07-20'
FROM job_titles jt
WHERE jt.name_ar = 'النائب المساعد للتميز الأكاديمي'
  AND jt.grade_level = 16
  AND jt.category = 'leadership'
  AND jt.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM salary_scale ss WHERE ss.job_title_id = jt.id);

INSERT INTO salary_scale (job_title_id, step_a, step_b, step_c, step_d, step_e, step_f, step_g, step_h, step_i, annual_increase_cap, effective_date)
SELECT jt.id, 40337, 46099, 51862, 57624, 63386, 69149, 74911, NULL, NULL, 5, DATE '2026-07-20'
FROM job_titles jt
WHERE jt.name_ar = 'نائب الرئيس للشؤون الأكاديمية'
  AND jt.grade_level = 16
  AND jt.category = 'leadership'
  AND jt.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM salary_scale ss WHERE ss.job_title_id = jt.id);

COMMIT;

-- ============================================================================
-- Verification -- run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect 355 salary rows for 359 job titles, with exactly the 4 deans left.
-- SELECT count(*) FROM salary_scale;
-- SELECT jt.name_ar, jt.grade_level, jt.category
--   FROM job_titles jt
--   WHERE jt.deleted_at IS NULL
--     AND NOT EXISTS (SELECT 1 FROM salary_scale ss WHERE ss.job_title_id = jt.id)
--   ORDER BY jt.name_ar;

-- Expect each filled title's figures to match its own (grade, category) peers.
-- SELECT jt.grade_level, jt.category, count(DISTINCT (ss.step_a, ss.step_g)) AS distinct_sets
--   FROM salary_scale ss JOIN job_titles jt ON jt.id = ss.job_title_id
--   GROUP BY 1, 2 ORDER BY 1, 2;
