-- إعطاء "مركز القيم والسلوك المهني" مرجعية تنظيمية حقيقية مثل بقية الإدارات المرتبطة برئيس الجامعة:
-- إنشاء وحدة تنظيمية له، ثم ربط المنصب القائم بها وإعادة تسميته إلى "رئيس مركز القيم والسلوك المهني"
-- (كان منصبًا مستقلًا مربوطًا بوحدة "رئيس الجامعة" نفسها، لا وحدة خاصة به).
-- طُبّق هذا التغيير مباشرة على قاعدة بيانات الإنتاج عبر psql بتاريخ 2026-09-04، وهذه الهجرة توثّقه فقط.

BEGIN;

INSERT INTO org_units (name_ar, name_en, unit_code, parent_id, kind_id, sort_order)
SELECT 'مركز القيم والسلوك المهني', NULL, 'values-conduct-center',
       p.id,
       (SELECT id FROM org_unit_kinds WHERE name_ar = 'مركز'),
       0
FROM org_units p
WHERE p.name_ar = 'رئيس الجامعة'
  AND NOT EXISTS (SELECT 1 FROM org_units WHERE unit_code = 'values-conduct-center');

UPDATE org_structure_positions
SET name_ar = 'رئيس مركز القيم والسلوك المهني',
    org_unit_id = (SELECT id FROM org_units WHERE unit_code = 'values-conduct-center')
WHERE name_ar = 'مركز القيم والسلوك المهني';

-- SELECT للتحقق قبل COMMIT
SELECT p.id, p.name_ar AS position_name, u.name_ar AS org_unit_name, u.parent_id AS org_unit_parent
FROM org_structure_positions p
JOIN org_units u ON u.id = p.org_unit_id
WHERE u.unit_code = 'values-conduct-center';

COMMIT;
