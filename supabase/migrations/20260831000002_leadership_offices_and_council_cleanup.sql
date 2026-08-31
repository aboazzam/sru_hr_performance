-- =========================================================================
-- مكاتب القيادة، وحذف مناصب المجالس، وتسمية الأمانات (2026-08-31، بقرارات
-- صريحة من مالك المشروع في رسالة واحدة).
--
-- ١) «مكتب الرئيس» يصير «مكتب رئيس الجامعة»، وينتقل إليه منصب رئيس
--    الجامعة، ويصير منصب المكتب نفسه «مدير مكتب رئيس الجامعة» — فالوحدة
--    تحمل المنصبين معًا كما طُلب.
-- ٢) مكاتب مماثلة للنائب وللنواب المساعدين الثلاثة، وينتقل كل منصب قيادي
--    إلى مكتبه. المكتب يُنشأ تحت وحدة القيادة نفسها، على غرار «مكتب
--    الرئيس» الذي كان تحت وحدة «رئيس الجامعة».
-- ٣) مناصب المجالس واللجنة تُحذف: هيئات جماعية لا يُسكَّن عليها أحد.
--    **وأبناؤها التسعة يُرفعون إلى أب المحذوف** لا يُتركون معلّقين — وهذا
--    جوهر الخطورة هنا: الحذف المباشر كان سيقطع تسعة فروع من الشجرة.
-- ٤) «أمانة مجلس الأمناء/الجامعة» → «أمين مجلس الأمناء/الجامعة».
--
-- لا تسكين يُمسّ: أيٌّ من مناصب المجالس ليس مسكَّنًا (مفحوص قبل الكتابة).
-- =========================================================================

BEGIN;

-- ---------- ١) مكتب رئيس الجامعة ----------
UPDATE org_units SET name_ar = 'مكتب رئيس الجامعة' WHERE name_ar = 'مكتب الرئيس';

UPDATE org_structure_positions p SET name_ar = 'مدير مكتب رئيس الجامعة'
FROM org_units u WHERE u.id = p.org_unit_id AND u.name_ar = 'مكتب رئيس الجامعة'
  AND p.name_ar IN ('رئيس مكتب الرئيس', 'مكتب الرئيس');

UPDATE org_structure_positions SET org_unit_id = (SELECT id FROM org_units WHERE name_ar = 'مكتب رئيس الجامعة' AND deleted_at IS NULL)
WHERE name_ar = 'رئيس الجامعة' AND deleted_at IS NULL;

-- ---------- ٢) مكاتب النائب والنواب المساعدين ----------
INSERT INTO org_units (name_ar, name_en, unit_code, kind_id, parent_id, level_id)
SELECT 'مكتب ' || u.name_ar, NULL, codes.code,
       (SELECT id FROM org_unit_kinds WHERE code = 'office' AND deleted_at IS NULL),
       u.id, u.level_id
FROM org_units u
JOIN (VALUES
  ('نائب الرئيس للشؤون الأكاديمية', 'vp-academic-office'),
  ('النائب المساعد لتجربة الطالب', 'avp-student-experience-office'),
  ('النائب المساعد للتميز الأكاديمي', 'avp-academic-excellence-office'),
  ('النائب المساعد للدراسات العليا والبحث العلمي', 'avp-graduate-research-office')
) AS codes(unit_name, code) ON codes.unit_name = u.name_ar
WHERE u.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM org_units x WHERE x.unit_code = codes.code AND x.deleted_at IS NULL);

UPDATE org_structure_positions p SET org_unit_id = office.id
FROM org_units office
WHERE office.name_ar = 'مكتب ' || p.name_ar AND office.deleted_at IS NULL AND p.deleted_at IS NULL
  AND p.name_ar IN ('نائب الرئيس للشؤون الأكاديمية', 'النائب المساعد لتجربة الطالب',
                    'النائب المساعد للتميز الأكاديمي', 'النائب المساعد للدراسات العليا والبحث العلمي');

-- ---------- ٣) مناصب المجالس واللجنة ----------
-- الأبناء أولًا: يرثون أب المنصب المحذوف، فلا ينقطع فرع من الشجرة.
--
-- **بالتكرار لا مرة واحدة**: المجالس متداخلة — «مجلس الجامعة» نفسه ابن
-- «مجلس الأمناء» — فرفعة واحدة تجعل الابن يشير إلى أب محذوف هو الآخر.
-- أمسك ذلك تحققُ هذه الهجرة نفسه قبل أي كتابة (خمسة مناصب بقيت معلّقة).
DO $lift$
DECLARE moved integer; guard integer := 0;
BEGIN
  LOOP
    UPDATE org_structure_positions child
    SET parent_id = doomed.parent_id
    FROM org_structure_positions doomed
    WHERE child.parent_id = doomed.id AND child.deleted_at IS NULL
      AND doomed.name_ar IN ('مجلس الأمناء','مجلس الجامعة','المجلس الاستشاري','المجلس العلمي','لجنة المراجعة')
      AND doomed.deleted_at IS NULL;
    GET DIAGNOSTICS moved = ROW_COUNT;
    EXIT WHEN moved = 0;
    guard := guard + 1;
    IF guard > 20 THEN RAISE EXCEPTION 'رفع الأبناء لم يستقر'; END IF;
  END LOOP;
END $lift$;

UPDATE org_structure_positions SET deleted_at = now()
WHERE name_ar IN ('مجلس الأمناء','مجلس الجامعة','المجلس الاستشاري','المجلس العلمي','لجنة المراجعة')
  AND deleted_at IS NULL;

-- ---------- ٤) الأمانات ----------
UPDATE org_structure_positions SET name_ar = 'أمين مجلس الأمناء'  WHERE name_ar = 'أمانة مجلس الأمناء'  AND deleted_at IS NULL;
UPDATE org_structure_positions SET name_ar = 'أمين مجلس الجامعة' WHERE name_ar = 'أمانة مجلس الجامعة' AND deleted_at IS NULL;

-- ---------- تحقق ----------
DO $$
DECLARE orphans integer; councils integer; pres_unit text;
BEGIN
  SELECT count(*) INTO orphans FROM org_structure_positions c
   WHERE c.deleted_at IS NULL AND c.parent_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM org_structure_positions p WHERE p.id = c.parent_id AND p.deleted_at IS NULL);
  IF orphans > 0 THEN RAISE EXCEPTION 'بقي % منصبًا أبوه محذوف', orphans; END IF;

  SELECT count(*) INTO councils FROM org_structure_positions
   WHERE deleted_at IS NULL AND name_ar IN ('مجلس الأمناء','مجلس الجامعة','المجلس الاستشاري','المجلس العلمي','لجنة المراجعة');
  IF councils > 0 THEN RAISE EXCEPTION 'بقي % منصب مجلس', councils; END IF;

  SELECT u.name_ar INTO pres_unit FROM org_structure_positions p JOIN org_units u ON u.id = p.org_unit_id
   WHERE p.name_ar = 'رئيس الجامعة' AND p.deleted_at IS NULL;
  IF pres_unit IS DISTINCT FROM 'مكتب رئيس الجامعة' THEN
    RAISE EXCEPTION 'منصب رئيس الجامعة وحدته % لا مكتب رئيس الجامعة', coalesce(pres_unit,'(بلا)');
  END IF;
END $$;

COMMIT;
