-- ============================================================================
-- Organizational Structure (org_units)
--
-- STATUS: DRAFT, UNVERIFIED. Same caveat as the two prior migrations in
-- this repo — no Supabase project is connected, this file has NOT been
-- executed against a real Postgres instance.
--
-- Source: SRU_System_Design.md §B `org_units(id, name_ar, name_en,
-- parent_id -> org_units.id, type, deleted_at)`. Seed data is generated
-- verbatim from src/lib/data/org-units.ts (58 units transcribed from
-- "الهيكل التنظيمي لجامعة سليمان الراجحي.jpeg" v2.0 + 4 colleges supplied
-- directly by the project owner; 12 passing Vitest assertions on this
-- exact dataset as of this writing), not retyped by hand.
--
-- `type` here is populated from org-units.ts's `category` field, which is
-- the *org-chart box color* grouping (governance/support/academic/
-- administrative/business_development) documented in that file's own
-- header comment — NOT an independently documented "unit type" taxonomy
-- (deanship/department/office/...), which doesn't exist as a source
-- anywhere yet. If a real unit-type classification is introduced later,
-- it likely deserves its own column rather than overloading this one.
-- ============================================================================

BEGIN;

CREATE TYPE org_unit_category AS ENUM (
  'governance',
  'support',
  'academic',
  'administrative',
  'business_development'
);

CREATE TABLE org_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_code TEXT NOT NULL UNIQUE,
  parent_id UUID REFERENCES org_units (id) ON DELETE RESTRICT,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  type org_unit_category NOT NULL,
  deleted_at TIMESTAMPTZ,
  UNIQUE (parent_id, name_ar)
);

COMMENT ON COLUMN org_units.unit_code IS 'Stable slug matching src/lib/data/org-units.ts''s id field (e.g. "president", "exec-shared-services") — a business key alongside the UUID surrogate key, same pattern as roles.role_code.';
COMMENT ON CONSTRAINT org_units_parent_id_fkey ON org_units IS 'RESTRICT per SECURITY_CHECKLIST.md §1.4: deleting an org unit that still has children must fail loudly, not silently cascade-delete or orphan an entire subtree.';

-- A plain UNIQUE/NOT NULL on parent_id can't express "at most one root":
-- the root is exactly the row where parent_id IS NULL, and (learned from
-- the bug found in 20260716000001_roles_and_permissions.sql's review)
-- indexing a nullable column never enforces uniqueness among its NULLs —
-- every NULL is distinct from every other NULL, partial index or not.
-- Indexing a constant expression instead makes every qualifying row
-- collide on the same indexed value, which is what actually enforces
-- "at most one row with parent_id IS NULL".
CREATE UNIQUE INDEX org_units_single_root ON org_units ((true)) WHERE parent_id IS NULL;

-- ----------------------------------------------------------------------------
-- RLS — enabled from creation with ZERO policies, same rationale as the
-- prior two migrations (PROJECT_STRICT.md rule 14). Org structure is
-- plausibly safe to expose broadly (every employee's own profile will
-- reference an org_unit_id, and org charts are rarely sensitive) but that
-- is still a real access-control decision for the project owner to
-- confirm, not assumed here.
-- ----------------------------------------------------------------------------

ALTER TABLE org_units ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Seed: all 58 units, generated verbatim from src/lib/data/org-units.ts
-- (not retyped by hand).
-- ----------------------------------------------------------------------------

INSERT INTO org_units (id, unit_code, parent_id, name_ar, type) VALUES
  ('792db7e0-f276-4275-aa21-da184dabbe09', 'board-of-trustees', NULL, 'مجلس الأمناء', 'governance'),
  ('14faf29a-5b16-4cfc-9b00-5e4e8f89cd20', 'advisory-council', '792db7e0-f276-4275-aa21-da184dabbe09', 'المجلس الاستشاري', 'governance'),
  ('49884a6b-aa88-4ea8-a8ea-f0f2bcdf8e4f', 'bot-secretariat', '792db7e0-f276-4275-aa21-da184dabbe09', 'أمانة مجلس الأمناء', 'governance'),
  ('c0eabf7a-1a29-4c75-b101-c255a696cd74', 'audit-committee', '792db7e0-f276-4275-aa21-da184dabbe09', 'لجنة المراجعة', 'governance'),
  ('3a4121ac-b2b0-4a70-8e9a-b9be547f2234', 'university-council', '792db7e0-f276-4275-aa21-da184dabbe09', 'مجلس الجامعة', 'governance'),
  ('efd44c37-3774-4f48-95c3-d23259b39c3c', 'university-council-secretariat', '3a4121ac-b2b0-4a70-8e9a-b9be547f2234', 'أمانة مجلس الجامعة', 'governance'),
  ('dc7e26df-a1dc-47bb-83e4-bb87030e0b62', 'grc-office', '3a4121ac-b2b0-4a70-8e9a-b9be547f2234', 'مكتب الحوكمة وإدارة المخاطر والالتزام', 'support'),
  ('b224aaca-01dc-4403-b2e9-f0dc478b675c', 'legal-affairs', '3a4121ac-b2b0-4a70-8e9a-b9be547f2234', 'إدارة الشؤون القانونية', 'support'),
  ('0aa78bef-2ca9-4618-874e-6b44aea86257', 'internal-audit', '3a4121ac-b2b0-4a70-8e9a-b9be547f2234', 'إدارة المراجعة الداخلية', 'support'),
  ('be0743db-93df-4355-a975-917a8fecbd98', 'president', '3a4121ac-b2b0-4a70-8e9a-b9be547f2234', 'رئيس الجامعة', 'governance'),
  ('ddfc7def-e300-48fc-a67f-3e5c2b0e7200', 'strategy-office', 'be0743db-93df-4355-a975-917a8fecbd98', 'مكتب إدارة الاستراتيجية', 'support'),
  ('1cd54c54-c5ca-4a94-b785-cb5c23ba12df', 'institutional-excellence', 'be0743db-93df-4355-a975-917a8fecbd98', 'إدارة التميز المؤسسي', 'support'),
  ('fef0736e-f3b2-46de-a6ac-032bc87d20ee', 'institutional-communication', 'be0743db-93df-4355-a975-917a8fecbd98', 'إدارة الاتصال المؤسسي', 'support'),
  ('437326f5-c582-46db-8b25-770c76444bf7', 'community-responsibility', 'be0743db-93df-4355-a975-917a8fecbd98', 'إدارة المسؤولية المجتمعية', 'support'),
  ('b62cac4c-e7e5-464e-a450-421fd9dac7ab', 'president-office', 'be0743db-93df-4355-a975-917a8fecbd98', 'مكتب الرئيس', 'support'),
  ('acb3c94d-b36d-4987-8318-c389d20f2c91', 'ethics-conduct-unit', 'be0743db-93df-4355-a975-917a8fecbd98', 'وحدة التوعية والسلوك المهني', 'support'),
  ('29c0e994-70e1-4bb9-8dcb-f43cdf4e7cee', 'deans-of-colleges', 'be0743db-93df-4355-a975-917a8fecbd98', 'عمداء الكليات', 'academic'),
  ('c6f137ed-7dcd-42e8-b2d6-a2ffa0d89398', 'college-medicine', '29c0e994-70e1-4bb9-8dcb-f43cdf4e7cee', 'كلية الطب', 'academic'),
  ('1888a2e9-3b35-47d8-bf11-9f558813017b', 'college-nursing', '29c0e994-70e1-4bb9-8dcb-f43cdf4e7cee', 'كلية التمريض', 'academic'),
  ('18653ddc-7b1a-4331-857b-563a3b8e040e', 'college-health-sciences', '29c0e994-70e1-4bb9-8dcb-f43cdf4e7cee', 'كلية العلوم الصحية', 'academic'),
  ('83aae9a2-878d-46a5-b17e-5ba6542ba285', 'college-business', '29c0e994-70e1-4bb9-8dcb-f43cdf4e7cee', 'كلية الأعمال', 'academic'),
  ('93d7e94f-926d-473d-9638-586722a19a29', 'scientific-council', 'be0743db-93df-4355-a975-917a8fecbd98', 'المجلس العلمي', 'academic'),
  ('51a626dd-001a-4117-990d-79af3fd1c0fd', 'vp-academic-affairs', 'be0743db-93df-4355-a975-917a8fecbd98', 'نائب الرئيس للشؤون الأكاديمية', 'academic'),
  ('8a3086f7-61ab-46f5-b1fc-563d3297ed39', 'avp-student-experience', '51a626dd-001a-4117-990d-79af3fd1c0fd', 'النائب المساعد لتجربة الطالب', 'academic'),
  ('e22ffc15-1041-4146-8034-8a3e25f37ebc', 'admissions-office', '8a3086f7-61ab-46f5-b1fc-563d3297ed39', 'مكتب القبول', 'academic'),
  ('000ef2cc-a205-41c7-889c-356e082c6e2d', 'scholarships-financial-solutions', '8a3086f7-61ab-46f5-b1fc-563d3297ed39', 'مكتب المنح والحلول المالية', 'academic'),
  ('bd2fe000-97a9-4c9b-966d-b50e016f6f98', 'registration-advising', '8a3086f7-61ab-46f5-b1fc-563d3297ed39', 'مكتب التسجيل والإرشاد الأكاديمي', 'academic'),
  ('0979c59f-aa8b-4c0f-b471-99028775d54f', 'university-life', '8a3086f7-61ab-46f5-b1fc-563d3297ed39', 'إدارة الحياة الجامعية', 'academic'),
  ('b8fcaf9f-83d2-4dd3-b9dc-b411bec75ede', 'alumni-care', '8a3086f7-61ab-46f5-b1fc-563d3297ed39', 'مكتب رعاية الخريجين', 'academic'),
  ('44b8b063-9889-45dd-8798-863eb60f0134', 'avp-academic-excellence', '51a626dd-001a-4117-990d-79af3fd1c0fd', 'النائب المساعد للتميز الأكاديمي', 'academic'),
  ('d2fdd3ca-c226-4180-8eea-227963381807', 'teaching-learning-center', '44b8b063-9889-45dd-8798-863eb60f0134', 'مركز التعليم والتعلم', 'academic'),
  ('2493126b-9c53-4b48-9f64-c0d373fc6fb2', 'assessment-measurement-center', '44b8b063-9889-45dd-8798-863eb60f0134', 'مركز التقييم والقياس', 'academic'),
  ('664f11d4-af2f-4783-af0b-ad9efcf88247', 'educational-equipment', '44b8b063-9889-45dd-8798-863eb60f0134', 'إدارة التجهيزات التعليمية', 'academic'),
  ('44c2f55b-879c-49ad-a421-b8f64d6326ec', 'academic-accreditation-office', '44b8b063-9889-45dd-8798-863eb60f0134', 'مكتب الاعتماد الأكاديمي', 'academic'),
  ('c1c691c3-9ec1-4ade-a3f6-c9bdcdd9102e', 'avp-graduate-research', '51a626dd-001a-4117-990d-79af3fd1c0fd', 'النائب المساعد للدراسات العليا والبحث العلمي', 'academic'),
  ('2c85b768-e7c2-42d7-bc7e-fb8f7a8f2d3c', 'graduate-studies-office', 'c1c691c3-9ec1-4ade-a3f6-c9bdcdd9102e', 'مكتب الدراسات العليا', 'academic'),
  ('bd22daf5-dfce-44bc-9d70-ccbd1cff34f8', 'scientific-research-office', 'c1c691c3-9ec1-4ade-a3f6-c9bdcdd9102e', 'مكتب البحث العلمي', 'academic'),
  ('45b6c9a6-7b18-41a3-9822-5a58bf57f6e4', 'women-section-supervisor', 'be0743db-93df-4355-a975-917a8fecbd98', 'المشرفة على القسم النسائي', 'administrative'),
  ('658de448-85ff-4e4f-ab7e-61a774e17d6f', 'exec-it-communications', 'be0743db-93df-4355-a975-917a8fecbd98', 'الإدارة التنفيذية للاتصالات وتقنية المعلومات', 'administrative'),
  ('1e6d4700-2214-4de1-80d9-35f68f1e4dc0', 'cybersecurity', '658de448-85ff-4e4f-ab7e-61a774e17d6f', 'إدارة الأمن السيبراني', 'administrative'),
  ('764dc1e4-ee9a-4bcd-ba29-9101189116c3', 'digital-transformation', '658de448-85ff-4e4f-ab7e-61a774e17d6f', 'إدارة التحول الرقمي', 'administrative'),
  ('26a63990-c355-4ac0-b495-393fc7d7fed0', 'it-department', '658de448-85ff-4e4f-ab7e-61a774e17d6f', 'إدارة تقنية المعلومات', 'administrative'),
  ('d9c15cee-71b4-448e-8042-0e083a64e7bf', 'data-management-office', '658de448-85ff-4e4f-ab7e-61a774e17d6f', 'مكتب إدارة البيانات', 'administrative'),
  ('2431f2e4-c4d2-4d53-9872-1c309d04c289', 'exec-shared-services', 'be0743db-93df-4355-a975-917a8fecbd98', 'الإدارة التنفيذية للخدمات المشتركة', 'administrative'),
  ('f163d9db-d6e1-492b-a6fe-a8e0ba941f5a', 'financial-affairs', '2431f2e4-c4d2-4d53-9872-1c309d04c289', 'إدارة الشؤون المالية', 'administrative'),
  ('4432fb4d-0d7f-4049-bc62-ad72355797fb', 'human-capital', '2431f2e4-c4d2-4d53-9872-1c309d04c289', 'إدارة رأس المال البشري', 'administrative'),
  ('5d47ac11-2523-464c-b4e9-0c325851685a', 'facilities', '2431f2e4-c4d2-4d53-9872-1c309d04c289', 'إدارة المرافق', 'administrative'),
  ('f74125bc-03e4-4516-8d96-9424b8575893', 'engineering-dept', '2431f2e4-c4d2-4d53-9872-1c309d04c289', 'الإدارة الهندسية', 'administrative'),
  ('f1e956f3-eb5f-4b72-874b-2a97b71c791b', 'procurement', '2431f2e4-c4d2-4d53-9872-1c309d04c289', 'إدارة المشتريات', 'administrative'),
  ('91032338-66fd-45a3-9c78-2923a3fac98f', 'warehouses', '2431f2e4-c4d2-4d53-9872-1c309d04c289', 'إدارة المستودعات', 'administrative'),
  ('bd133152-798f-4aec-9fba-c895ed79f7a7', 'exec-business-development', 'be0743db-93df-4355-a975-917a8fecbd98', 'الإدارة التنفيذية لتطوير الأعمال', 'business_development'),
  ('f11ceefb-9e0f-496b-90a5-361a7d4841b0', 'training-consulting', 'bd133152-798f-4aec-9fba-c895ed79f7a7', 'إدارة التدريب والاستشارات', 'business_development'),
  ('0ce757b5-c103-4f99-b27f-48abb1e07fe6', 'training-dept', 'f11ceefb-9e0f-496b-90a5-361a7d4841b0', 'إدارة التدريب', 'business_development'),
  ('9f42ee56-9199-478a-af00-3c1ba8e85820', 'consulting-center', 'f11ceefb-9e0f-496b-90a5-361a7d4841b0', 'مركز الاستشارات', 'business_development'),
  ('74fd1ab7-1769-4662-926b-f4bcaa2d8f39', 'partnerships', 'bd133152-798f-4aec-9fba-c895ed79f7a7', 'إدارة الشراكات', 'business_development'),
  ('ba53a182-ed9d-4a33-ba0e-aad3f497c2ac', 'products-services-development', 'bd133152-798f-4aec-9fba-c895ed79f7a7', 'إدارة تطوير المنتجات والخدمات', 'business_development'),
  ('9ad811b8-cf8d-4156-a61e-fc464e66aaa5', 'innovation-entrepreneurship-center', 'ba53a182-ed9d-4a33-ba0e-aad3f497c2ac', 'مركز الابتكار وريادة الأعمال', 'business_development'),
  ('406ebd57-66e7-412d-8e7b-d8d741435c0a', 'content-management-center', 'ba53a182-ed9d-4a33-ba0e-aad3f497c2ac', 'مركز إدارة المحتوى', 'business_development');

COMMIT;

-- ============================================================================
-- Verification queries -- run these AFTER the migration and BEFORE trusting
-- it, per PROJECT_STRICT.md rule 10. Expected results noted inline.
-- ============================================================================

-- Expect: 1 row, rowsecurity = true.
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'org_units';

-- Expect: 0 rows (confirms no accidental USING (true) policy exists).
-- SELECT tablename, policyname, qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'org_units';

-- Expect: exactly 58.
-- SELECT count(*) FROM org_units;

-- Expect: exactly 1 row (board-of-trustees) -- proves the single-root index actually works.
-- SELECT unit_code, name_ar FROM org_units WHERE parent_id IS NULL;

-- Expect: 0 rows (no unit references a nonexistent parent -- FK already
-- guarantees this at insert time, this is a redundant belt-and-suspenders check).
-- SELECT id, unit_code FROM org_units u
--   WHERE parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM org_units p WHERE p.id = u.parent_id);
