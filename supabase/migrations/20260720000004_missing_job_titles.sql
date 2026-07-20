-- New job_titles + salary_scale rows for the ~40 titles found genuinely missing while
-- reviewing career_path's skip list (grade-11 "استشاري" tier for tracks that already have a
-- clean 8-10 ladder, a few whole missing 8-11 sub-track ladders within existing families, and
-- a handful of standalone leadership titles). Salary figures are copied from the existing
-- per-grade-level salary data already verified in migration 20260720000001 (every admin/
-- leadership title at a given grade shares identical step figures) -- not a new source lookup,
-- since this schema's salary_scale is per-grade, not per-title.
-- Explicitly excluded (flagged to the project owner as a separate, bigger decision, not
-- silently added): the entire "التشغيل الطبي" (Medical Operations) track, since no such
-- job_family exists yet; the "وظائف الاتصال المؤسسي" grade-11 cell and its "مصور"/"كتابة
-- محتوى" sub-tracks, since the cell split is genuinely ambiguous and those sub-tracks are
-- entirely absent; near-duplicate "استشاري مصادر التعلم" (differs from the existing
-- "استشاري مصادر تعلم" only by the definite article); and facilities/trades supervisor
-- titles already represented as deliberately consolidated combined rows.

BEGIN;

WITH new_titles AS (
  INSERT INTO job_titles (job_family_id, grade_level, name_ar, category)
  VALUES
    ('9d6e643c-ef92-43e2-aef1-f2e96a4f04ba', 16, 'مساعد النائب لتجربة الطالب', 'leadership'::job_title_category),
    ('247ac466-1409-4284-ac07-9457ed5eb41a', 13, 'مدير المشتريات والعقود', 'leadership'::job_title_category),
    ('c0e06614-bc1e-4ea8-80c7-f2377c98b485', 13, 'مدير المسؤولية المجتمعية', 'leadership'::job_title_category),
    ('6cbdb198-182f-4fd3-bdec-25e357a9c4ea', 8, 'أ.م.تطوير أعمال', 'admin'::job_title_category),
    ('6cbdb198-182f-4fd3-bdec-25e357a9c4ea', 9, 'أ.تطوير أعمال', 'admin'::job_title_category),
    ('6cbdb198-182f-4fd3-bdec-25e357a9c4ea', 10, 'أ.أول.تطوير أعمال', 'admin'::job_title_category),
    ('6cbdb198-182f-4fd3-bdec-25e357a9c4ea', 11, 'استشاري تطوير أعمال', 'admin'::job_title_category),
    ('6cbdb198-182f-4fd3-bdec-25e357a9c4ea', 8, 'أ.م.تحليل أعمال', 'admin'::job_title_category),
    ('6cbdb198-182f-4fd3-bdec-25e357a9c4ea', 9, 'أ.تحليل أعمال', 'admin'::job_title_category),
    ('6cbdb198-182f-4fd3-bdec-25e357a9c4ea', 10, 'أ.أول.تحليل أعمال', 'admin'::job_title_category),
    ('18bcec5c-c815-4b8a-9749-11c046b560a3', 8, 'أ.م.أداء', 'admin'::job_title_category),
    ('18bcec5c-c815-4b8a-9749-11c046b560a3', 9, 'أ.أداء', 'admin'::job_title_category),
    ('18bcec5c-c815-4b8a-9749-11c046b560a3', 10, 'أ.أول.أداء', 'admin'::job_title_category),
    ('18bcec5c-c815-4b8a-9749-11c046b560a3', 11, 'استشاري أداء', 'admin'::job_title_category),
    ('18bcec5c-c815-4b8a-9749-11c046b560a3', 11, 'استشاري استراتيجية', 'admin'::job_title_category),
    ('18bcec5c-c815-4b8a-9749-11c046b560a3', 11, 'استشاري إدارة مشاريع', 'admin'::job_title_category),
    ('09328661-d901-4a96-8f77-f1b318311f08', 11, 'استشاري اعتماد', 'admin'::job_title_category),
    ('45c17da1-6073-4d45-8292-de2dfa82ad11', 11, 'استشاري تسجيل', 'admin'::job_title_category),
    ('45c17da1-6073-4d45-8292-de2dfa82ad11', 11, 'استشاري إرشاد أكاديمي', 'admin'::job_title_category),
    ('f3df770a-f4a0-4d0f-8717-c6b61b6ca715', 11, 'استشاري تعليم', 'admin'::job_title_category),
    ('45209d1f-1b44-4bf0-bb8b-b3fafb575f17', 11, 'استشاري أمن سيبراني', 'admin'::job_title_category),
    ('45209d1f-1b44-4bf0-bb8b-b3fafb575f17', 11, 'استشاري دعم فني', 'admin'::job_title_category),
    ('45209d1f-1b44-4bf0-bb8b-b3fafb575f17', 11, 'استشاري تحول رقمي', 'admin'::job_title_category),
    ('45209d1f-1b44-4bf0-bb8b-b3fafb575f17', 11, 'استشاري إدارة بيانات', 'admin'::job_title_category),
    ('45209d1f-1b44-4bf0-bb8b-b3fafb575f17', 11, 'استشاري حماية بيانات', 'admin'::job_title_category),
    ('45209d1f-1b44-4bf0-bb8b-b3fafb575f17', 11, 'استشاري قواعد بيانات', 'admin'::job_title_category),
    ('45209d1f-1b44-4bf0-bb8b-b3fafb575f17', 11, 'استشاري تحليل بيانات', 'admin'::job_title_category),
    ('45209d1f-1b44-4bf0-bb8b-b3fafb575f17', 11, 'استشاري شبكات', 'admin'::job_title_category),
    ('45209d1f-1b44-4bf0-bb8b-b3fafb575f17', 10, 'أ.أول.تخطيط موارد المنشأة', 'admin'::job_title_category),
    ('d5f85116-b12e-498d-a35c-5192a395dc90', 11, 'استشاري قياس', 'admin'::job_title_category),
    ('d5f85116-b12e-498d-a35c-5192a395dc90', 11, 'استشاري إحصاء', 'admin'::job_title_category),
    ('b01d4f7a-4385-45f8-8cc4-f87544c92254', 11, 'استشاري جودة', 'admin'::job_title_category),
    ('8e863e6d-36c2-42af-8bfc-5fcb9d2c0d56', 9, 'أ.تميز مؤسسي', 'admin'::job_title_category),
    ('8e863e6d-36c2-42af-8bfc-5fcb9d2c0d56', 11, 'استشاري تميز مؤسسي', 'admin'::job_title_category),
    ('9d6e643c-ef92-43e2-aef1-f2e96a4f04ba', 11, 'استشاري منح دراسية', 'admin'::job_title_category),
    ('9d6e643c-ef92-43e2-aef1-f2e96a4f04ba', 11, 'استشاري استقطاب موهوبين', 'admin'::job_title_category),
    ('9d6e643c-ef92-43e2-aef1-f2e96a4f04ba', 11, 'استشاري خدمات طلابية', 'admin'::job_title_category),
    ('9d6e643c-ef92-43e2-aef1-f2e96a4f04ba', 11, 'استشاري اجتماعي', 'admin'::job_title_category),
    ('9d6e643c-ef92-43e2-aef1-f2e96a4f04ba', 11, 'استشاري نفسي', 'admin'::job_title_category),
    ('9d6e643c-ef92-43e2-aef1-f2e96a4f04ba', 11, 'استشاري مهارات رياضية', 'admin'::job_title_category),
    ('9d6e643c-ef92-43e2-aef1-f2e96a4f04ba', 11, 'استشاري تطوع', 'admin'::job_title_category),
    ('9d6e643c-ef92-43e2-aef1-f2e96a4f04ba', 11, 'استشاري قيم وسلوك مهني', 'admin'::job_title_category),
    ('cfeeaa97-eacf-4711-9ac3-c918c1a45363', 11, 'استشاري مختبر', 'admin'::job_title_category),
    ('cfeeaa97-eacf-4711-9ac3-c918c1a45363', 11, 'استشاري تمريض', 'admin'::job_title_category),
    ('cfeeaa97-eacf-4711-9ac3-c918c1a45363', 11, 'استشاري أشعة', 'admin'::job_title_category),
    ('cfeeaa97-eacf-4711-9ac3-c918c1a45363', 11, 'استشاري تأهيل', 'admin'::job_title_category),
    ('cfeeaa97-eacf-4711-9ac3-c918c1a45363', 11, 'استشاري تغذية (ترخيص الهيئة)', 'admin'::job_title_category),
    ('8e863e6d-36c2-42af-8bfc-5fcb9d2c0d56', 11, 'استشاري قانوني', 'admin'::job_title_category),
    ('8e863e6d-36c2-42af-8bfc-5fcb9d2c0d56', 11, 'استشاري حوكمة', 'admin'::job_title_category),
    ('8e863e6d-36c2-42af-8bfc-5fcb9d2c0d56', 11, 'استشاري التزام', 'admin'::job_title_category),
    ('8e863e6d-36c2-42af-8bfc-5fcb9d2c0d56', 11, 'استشاري مخاطر', 'admin'::job_title_category),
    ('e62ce357-b186-4a0e-b41e-e6a79f9174a8', 11, 'استشاري قبول', 'admin'::job_title_category),
    ('247ac466-1409-4284-ac07-9457ed5eb41a', 11, 'استشاري شراء مباشر', 'admin'::job_title_category),
    ('247ac466-1409-4284-ac07-9457ed5eb41a', 11, 'استشاري أوامر الشراء والتعاقدات', 'admin'::job_title_category),
    ('5eb5293f-2362-4617-84b1-466b05654a1d', 11, 'مدير تجربة العملاء', 'admin'::job_title_category),
    ('3eecc84a-36d5-43f8-9a6f-da9383ef6898', 11, 'استشاري تطوير مؤسسي', 'admin'::job_title_category),
    ('3eecc84a-36d5-43f8-9a6f-da9383ef6898', 11, 'استشاري استقطاب وإدارة مواهب', 'admin'::job_title_category),
    ('3eecc84a-36d5-43f8-9a6f-da9383ef6898', 11, 'استشاري عمليات موارد بشرية', 'admin'::job_title_category),
    ('3eecc84a-36d5-43f8-9a6f-da9383ef6898', 11, 'استشاري التواصل الداخلي', 'admin'::job_title_category)
  RETURNING id, grade_level
)
INSERT INTO salary_scale (job_title_id, step_a, step_b, step_c, step_d, step_e, step_f, step_g, annual_increase_cap, effective_date)
SELECT nt.id, g.step_a, g.step_b, g.step_c, g.step_d, g.step_e, g.step_f, g.step_g, g.annual_increase_cap, CURRENT_DATE
FROM new_titles nt
JOIN (VALUES
  (13, 14700, 16800, 18900, 21000, 23100, 25200, 27300, NULL),
  (16, 40337, 46099, 51862, 57624, 63386, 69149, 74911, 5),
  (8, 3430, 3920, 4410, 4900, 5390, 5880, 6370, NULL),
  (9, 4802, 5488, 6174, 6860, 7546, 8232, 8918, NULL),
  (10, 6723, 7683, 8644, 9604, 10564, 11525, 12485, NULL),
  (11, 9412, 10756, 12101, 13446, 14790, 16135, 17479, 5)
  ) AS g(grade_level, step_a, step_b, step_c, step_d, step_e, step_f, step_g, annual_increase_cap)
  ON g.grade_level = nt.grade_level;

COMMIT;
