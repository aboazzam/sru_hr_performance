-- Scope: طلب مباشر من صاحب المشروع بعد نقاش المستويات السلوكية -- "أضف
-- الجدارات التخصصية الـ16 أيضًا" (الأربعة عشر... الـ16 المتبقية من إطار
-- الجامعة الرسمي، غير المؤسسية الـ11 المضافة سابقًا في 20260904000002).
--
-- Will change: `three_sixty_competencies` (16 صفًا جديدًا، مربوطًا بالجدارات
-- التخصصية الحقيقية عبر source_competency_id -- كل الـ16 من محورين فقط
-- "أكاديمي" و"ابتكار"، لا وجود لتخصصية بمجال إداري/مالي/تقني في الإطار
-- الحقيقي اليوم، تحقّق ذلك مباشرة قبل كتابة هذه الهجرة؛ عمود applies_to
-- يُضبط الآن بقيمة 'specialized' على الـ16 الجديدة (الـ11 المؤسسية موجودة
-- بالفعل على 'all' من عمل سابق -- تحقّقت مباشرة قبل الكتابة، والتحديث هنا
-- على applies_to IS NULL بلا أثر عليها فعليًا، صفري لكن غير ضار)؛ إعادة
-- توزيع weight_pct بالتساوي على الـ27 كلها -- [استنتاج]،
-- نفس مبدأ التوزيع المتساوي المستخدم أصلاً للـ11، ممتد الآن ليشمل الجدارات
-- التخصصية أيضًا بدل أن تبقى وزنها صفرًا فلا تدخل النتيجة الكلية إطلاقًا رغم
-- ظهورها فعليًا في استبانة من يستحقها)، `three_sixty_items` (128 عبارة جديدة
-- = 16 جدارة × 4 مستويات × عبارتان، مأخوذة حرفيًا من competency_levels بنفس
-- طريقة 20260904000003 بالضبط؛ نُقلت عبارة النص الحر إلى آخر الترتيب بعد
-- كل الـ27 كتلة).
--
-- القاعدة الجوهرية المطبَّقة في كود التطبيق (لا في هذه الهجرة): جدارة
-- "specialized" لا تُعرض لموظف إلا إذا كان مسماه الوظيفي يتطلبها فعليًا
-- (صف حقيقي في job_title_competencies) -- بخلاف الجدارة "all" (المؤسسية) التي
-- تُعرض دائمًا بمستوى احتياطي "ممارس" عند غياب تحديد صريح. تحقّقت مسبقًا: 69
-- من 359 مسمى وظيفي حقيقي يملك بالفعل تحديد مستوى لجدارة تخصصية واحدة على
-- الأقل (82 صفًا)، فهذا مسار بيانات حقيقي مستخدَم لا افتراضي نظري فقط.
--
-- Will NOT change: محرك الحساب في threeSixty.ts (combineWeighted يستبعد
-- أصلاً أي جدارة بلا استجابات فعلية من البسط والمقام معًا، فجدارة تخصصية لا
-- تنطبق على أحد لا تدخل حساب نتيجته الكلية بلا أي تعديل إضافي)، الـ22 عبارة
-- الأصلية للجدارات المؤسسية ومستوياتها الأربعة (لا تُمس إطلاقًا).
--
-- Rollback: حذف الـ128 عبارة الجديدة (competency_id IN الـ16 الجديدة)، حذف
-- الـ16 صف جدارة جديد، إعادة weight_pct للقيم الأصلية (9.09/9.10 على الـ11)،
-- إعادة applies_to إلى NULL على الـ11 إن رُغب، إعادة display_order لعبارة
-- النص الحر إلى 89.

BEGIN;

CREATE TEMP TABLE tmp_specialized_competency_map (
  source_competency_id uuid PRIMARY KEY,
  competency_code text NOT NULL UNIQUE,
  block_index int NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO tmp_specialized_competency_map (source_competency_id, competency_code, block_index) VALUES
  ('4f112027-ea4b-4e04-9512-9e50f69ce469', 'academic.research.1', 11),          -- الإشراف على الرسائل العلمية
  ('2733939c-850c-465e-a552-a5cfbcd06c7f', 'academic.research.2', 12),          -- النشر العلمي في المجلات المحكمة والمصنفة
  ('482a36d4-a49e-4018-8ec2-9dfe1ef95b10', 'academic.research.3', 13),          -- تمكين الجيل القادم من الباحثين والتكامل الطلابي البحثي
  ('1f2dfc17-ac98-4f2e-b707-ffa0d9000f6d', 'academic.environment.1', 14),       -- التوجيه والإرشاد الأكاديمي
  ('f6705007-b153-40d2-8565-0968f7cbcb29', 'academic.environment.2', 15),       -- المساهمة في الإدارة الأكاديمية
  ('01e8da65-f640-468c-a529-c83673bc1994', 'academic.environment.3', 16),       -- المشاركة في الاعتماد الأكاديمي والتصنيف
  ('4f645a88-fe1d-4787-a354-76fdb613c20e', 'academic.teaching.1', 17),          -- التقويم والقياس
  ('cc5e4e94-9961-4ff9-b033-c0531da91a85', 'academic.teaching.2', 18),          -- تطوير المحتوى الأكاديمي
  ('27ab0159-3f69-4ab0-b745-bbaf135a6d60', 'academic.teaching.3', 19),          -- تنويع استراتيجيات وتقنيات التعلم
  ('b409e185-f26c-4f84-88e1-bee5b658602f', 'innovation.contribution.3', 20),    -- المشاركة في برامج تطوير الأعمال
  ('5cafa473-3122-4654-81af-a21f816dd45f', 'innovation.development.1', 21),     -- التخطيط والتطوير
  ('6ee4a895-20ae-4944-8d80-f4179aea6fe8', 'innovation.development.2', 22),     -- تبني التغيير
  ('7ac39c60-1e4a-4fcf-8c9f-27571d3cffe9', 'innovation.development.3', 23),     -- تطوير المواهب والتحسين المستمر
  ('de92a089-1f22-49c9-aefc-030f1161b956', 'innovation.entrepreneurship.1', 24),-- التصميم والتطوير الابتكاري
  ('07eb7df5-ef5d-4539-97b1-67bab94d5e07', 'innovation.entrepreneurship.2', 25),-- التفكير الريادي واقتناص الفرص
  ('c7772b31-40a8-4471-9d37-57014867c5f0', 'innovation.entrepreneurship.3', 26);-- تأسيس وإدارة المشاريع والشركات الناشئة

-- كانت NULL على الـ11 كلها -- الآن تُملأ فعليًا لتمييزها عن الـ16 القادمة.
UPDATE three_sixty_competencies
SET applies_to = 'all'
WHERE deleted_at IS NULL
  AND applies_to IS NULL;

INSERT INTO three_sixty_competencies (competency_code, name_ar, definition_ar, source_competency_id, applies_to)
SELECT m.competency_code, c.name_ar, c.definition_ar, c.id, 'specialized'
FROM tmp_specialized_competency_map m
JOIN competencies c ON c.id = m.source_competency_id;

-- توزيع متساوٍ على الـ27 كلها (100/27 ≈ 3.70%)، والباقي (0.10) لأي صف يقع
-- أخيرًا أبجديًا بترتيب competency_code -- توزيع اعتباطي للكسر المتبقي، بلا
-- دلالة على أهمية نسبية، بنفس أسلوب توزيع الباقي 0.01 على الجدارة الحادية
-- عشرة في الهجرة الأصلية 20260904000002.
UPDATE three_sixty_competencies tc
SET weight_pct = CASE WHEN sub.rn = sub.total THEN round(100 - 3.70 * (sub.total - 1), 2) ELSE 3.70 END
FROM (
  SELECT id, row_number() OVER (ORDER BY competency_code) AS rn, count(*) OVER () AS total
  FROM three_sixty_competencies
  WHERE deleted_at IS NULL
) sub
WHERE tc.id = sub.id;

-- 128 عبارة جديدة (16 جدارة × 4 مستويات × عبارتان)، مأخوذة حرفيًا من أول
-- سطرين غير فارغين في competency_levels.behavior_ar -- بلا عبارات "ممارس"
-- سابقة هنا يجب الحفاظ عليها (بخلاف 20260904000003)، فكل المستويات الأربعة
-- تُدرَج دفعة واحدة.
INSERT INTO three_sixty_items (
  item_code, competency_id, item_type, text_ar, rater_groups,
  required, reverse_scored, scale_code, display_order, behavioral_level
)
SELECT
  tc.competency_code || '.' || cl.level::text || '.i' || sub.rn,
  tc.id,
  'rating',
  sub.line,
  ARRAY['self', 'supervisor', 'peer', 'customer'],
  true,
  false,
  'behavior_freq_5',
  m.block_index * 8
    + (CASE cl.level WHEN 'basic' THEN 0 WHEN 'practitioner' THEN 1 WHEN 'advanced' THEN 2 WHEN 'professional' THEN 3 END) * 2
    + sub.rn,
  cl.level
FROM tmp_specialized_competency_map m
JOIN three_sixty_competencies tc ON tc.source_competency_id = m.source_competency_id AND tc.deleted_at IS NULL
JOIN competency_levels cl ON cl.competency_id = m.source_competency_id
JOIN LATERAL (
  SELECT trim(x) AS line, row_number() OVER () AS rn
  FROM regexp_split_to_table(cl.behavior_ar, E'\n') AS x
  WHERE trim(x) <> ''
  LIMIT 2
) sub ON true;

-- عبارة النص الحر تبقى آخر الترتيب دائمًا، بعد كل الـ27 كتلة (27*8=216).
UPDATE three_sixty_items
SET display_order = 217
WHERE item_code = 'general.feedback.open1'
  AND deleted_at IS NULL;

-- تحقّق قبل الاعتماد
SELECT
  (SELECT count(*) FROM three_sixty_competencies WHERE deleted_at IS NULL) AS total_competencies, -- متوقع 27
  (SELECT count(*) FROM three_sixty_competencies WHERE applies_to = 'all' AND deleted_at IS NULL) AS all_competencies, -- متوقع 11
  (SELECT count(*) FROM three_sixty_competencies WHERE applies_to = 'specialized' AND deleted_at IS NULL) AS specialized_competencies, -- متوقع 16
  (SELECT round(sum(weight_pct), 2) FROM three_sixty_competencies WHERE deleted_at IS NULL) AS weight_sum, -- متوقع 100.00
  (SELECT count(*) FROM three_sixty_items WHERE deleted_at IS NULL) AS total_items, -- متوقع 217 (89 + 128)
  (SELECT count(*) FROM three_sixty_items ti JOIN three_sixty_competencies tc ON tc.id = ti.competency_id WHERE tc.applies_to = 'specialized' AND ti.deleted_at IS NULL) AS specialized_items, -- متوقع 128
  (SELECT display_order FROM three_sixty_items WHERE item_code = 'general.feedback.open1') AS open_text_display_order; -- متوقع 217

COMMIT;
