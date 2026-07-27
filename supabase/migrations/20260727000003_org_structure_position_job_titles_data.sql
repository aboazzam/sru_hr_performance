-- ============================================================================
-- Links each of the 44 new org-chart positions to a job title in `job_titles`,
-- per direct request: "أضف مسمى وظيفي لكل منصب جديد في job_titles" (add a job
-- title for each new position in job_titles).
--
-- Read all 336 real job_titles rows (from the earlier HR Excel import) before
-- writing anything: 21 of the 44 positions already have a real, confidently
-- matched title (e.g. "مدير الأمن السيبراني" for إدارة الأمن السيبراني) -- those
-- are REUSED via job_title_id, not duplicated. 3 positions get no title at all:
-- عمداء الكليات/المجلس العلمي are collegial bodies with no individual head role,
-- and المشرفة على القسم النسائي's own position name already IS a personal role
-- title, not a department name needing a separate one.
--
-- The remaining 20 have NO existing match (confirmed by reading the full
-- table, including that no "عميد" / Dean title exists anywhere) and are
-- created new here. Naming convention, per direct confirmation: "مركز"/"مكتب"
-- type units get a "رئيس" prefix (not "مدير") -- matching the real pattern
-- already seen in the existing data (رئيس مكتب القبول، رئيس مكتب البيانات، etc.,
-- all grade 12). "إدارة"/"الإدارة"/"وحدة" type units keep "مدير" (grade 13,
-- the majority real value for that pattern; a few real exceptions run 14-16,
-- not mechanically copied here). Colleges (كلية) get "عميد" (Dean, the
-- unambiguous standard Arabic academic title) at grade 14 -- **[استنتاج]**, not
-- confirmed with the project owner beyond the رئيس/مدير rule itself; a real,
-- deliberate estimate reasoned from where Deans sit relative to the confirmed
-- C2/C3 tier grades, not a guess with no basis, but still an open point.
-- job_family_id for each new title was matched to the closest existing real
-- family by subject-matter (e.g. الهندسية for الإدارة الهندسية, البحث العلمي for
-- مكتب البحث العلمي/الدراسات العليا) rather than defaulted to the generic "عام"
-- family, since a more specific real match existed in every case.
-- ============================================================================

BEGIN;

-- New job_titles rows (20).
INSERT INTO job_titles (id, job_family_id, grade_level, name_ar, category) VALUES ('593110f7-2111-4f07-93e4-eb3832849284', '8e863e6d-36c2-42af-8bfc-5fcb9d2c0d56', 13, 'مدير إدارة التميز المؤسسي', 'leadership'); -- for 'إدارة التميز المؤسسي'
INSERT INTO job_titles (id, job_family_id, grade_level, name_ar, category) VALUES ('a8ba8152-bd17-42a2-aa4e-8e9a5d1b9fb1', '9d6e643c-ef92-43e2-aef1-f2e96a4f04ba', 13, 'مدير وحدة التوعية والسلوك المهني', 'leadership'); -- for 'وحدة التوعية والسلوك المهني'
INSERT INTO job_titles (id, job_family_id, grade_level, name_ar, category) VALUES ('494217f9-9d85-45c3-ad9d-137749d6f45f', '2c61360c-56b4-48c4-a8ef-023dd0f5ee11', 16, 'مساعد النائب للدراسات العليا والبحث العلمي', 'leadership'); -- for 'النائب المساعد للدراسات العليا والبحث العلمي'
INSERT INTO job_titles (id, job_family_id, grade_level, name_ar, category) VALUES ('709efc80-84c2-445d-8188-6951f8c402e1', 'fbade111-3fb1-4aaa-8014-d2e263a82445', 14, 'عميد كلية الطب', 'academic'); -- for 'كلية الطب'
INSERT INTO job_titles (id, job_family_id, grade_level, name_ar, category) VALUES ('d1e3ba24-5846-437f-9f7b-80485ace0e61', 'fbade111-3fb1-4aaa-8014-d2e263a82445', 14, 'عميد كلية التمريض', 'academic'); -- for 'كلية التمريض'
INSERT INTO job_titles (id, job_family_id, grade_level, name_ar, category) VALUES ('076048df-9a3a-42dc-b0f3-4dd229abdf6f', 'fbade111-3fb1-4aaa-8014-d2e263a82445', 14, 'عميد كلية العلوم الصحية', 'academic'); -- for 'كلية العلوم الصحية'
INSERT INTO job_titles (id, job_family_id, grade_level, name_ar, category) VALUES ('5dd9a02d-a230-413e-88b5-0ac9a313fed8', 'fbade111-3fb1-4aaa-8014-d2e263a82445', 14, 'عميد كلية الأعمال', 'academic'); -- for 'كلية الأعمال'
INSERT INTO job_titles (id, job_family_id, grade_level, name_ar, category) VALUES ('5cf9e256-3f3b-4292-ae41-41d21240b1ac', '8e00e163-0f06-4fff-a82c-3702c624edfa', 14, 'مدير الإدارة الهندسية', 'leadership'); -- for 'الإدارة الهندسية'
INSERT INTO job_titles (id, job_family_id, grade_level, name_ar, category) VALUES ('d8a40089-42df-4b5f-8081-bd7c9ef88a22', 'a6a5f3b2-ad1d-428e-b676-467dc57ffe9b', 14, 'مدير إدارة المستودعات', 'leadership'); -- for 'إدارة المستودعات'
INSERT INTO job_titles (id, job_family_id, grade_level, name_ar, category) VALUES ('b41bdee8-322a-4c8d-a088-e58d2ac510ce', '6cbdb198-182f-4fd3-bdec-25e357a9c4ea', 13, 'مدير إدارة التدريب والاستشارات', 'leadership'); -- for 'إدارة التدريب والاستشارات'
INSERT INTO job_titles (id, job_family_id, grade_level, name_ar, category) VALUES ('387127b4-5c90-4a12-a392-6f16092bdcfa', '6cbdb198-182f-4fd3-bdec-25e357a9c4ea', 13, 'مدير إدارة الشراكات', 'leadership'); -- for 'إدارة الشراكات'
INSERT INTO job_titles (id, job_family_id, grade_level, name_ar, category) VALUES ('bd9fdfc6-c2be-4f14-b324-0a628d5f702a', '6cbdb198-182f-4fd3-bdec-25e357a9c4ea', 13, 'مدير إدارة تطوير المنتجات والخدمات', 'leadership'); -- for 'إدارة تطوير المنتجات والخدمات'
INSERT INTO job_titles (id, job_family_id, grade_level, name_ar, category) VALUES ('d7dc268b-0982-408f-8c71-2750d359f1ea', '9d6e643c-ef92-43e2-aef1-f2e96a4f04ba', 12, 'رئيس مكتب المنح والحلول المالية', 'leadership'); -- for 'مكتب المنح والحلول المالية'
INSERT INTO job_titles (id, job_family_id, grade_level, name_ar, category) VALUES ('84c52f64-8ca4-4902-bb0a-ddb4d02238e1', '9d6e643c-ef92-43e2-aef1-f2e96a4f04ba', 12, 'رئيس مكتب رعاية الخريجين', 'leadership'); -- for 'مكتب رعاية الخريجين'
INSERT INTO job_titles (id, job_family_id, grade_level, name_ar, category) VALUES ('028552a8-cd4d-46aa-9711-8c90ec20665c', '6cbdb198-182f-4fd3-bdec-25e357a9c4ea', 12, 'رئيس مركز الاستشارات', 'leadership'); -- for 'مركز الاستشارات'
INSERT INTO job_titles (id, job_family_id, grade_level, name_ar, category) VALUES ('8118a8e4-d1b1-4895-a4bb-52851c40f86a', '2c61360c-56b4-48c4-a8ef-023dd0f5ee11', 12, 'رئيس مكتب الدراسات العليا', 'leadership'); -- for 'مكتب الدراسات العليا'
INSERT INTO job_titles (id, job_family_id, grade_level, name_ar, category) VALUES ('85ca6aaf-4d5f-4930-be65-7811b839ed6b', '2c61360c-56b4-48c4-a8ef-023dd0f5ee11', 12, 'رئيس مكتب البحث العلمي', 'leadership'); -- for 'مكتب البحث العلمي'
INSERT INTO job_titles (id, job_family_id, grade_level, name_ar, category) VALUES ('f72e1099-ddf2-4363-a91c-c4425c8e0770', '6cbdb198-182f-4fd3-bdec-25e357a9c4ea', 13, 'مدير إدارة التدريب', 'leadership'); -- for 'إدارة التدريب'
INSERT INTO job_titles (id, job_family_id, grade_level, name_ar, category) VALUES ('b95fe8e4-cfee-41cd-b529-08f5e291ef2c', 'f3df770a-f4a0-4d0f-8717-c6b61b6ca715', 13, 'مدير إدارة التجهيزات التعليمية', 'leadership'); -- for 'إدارة التجهيزات التعليمية'
INSERT INTO job_titles (id, job_family_id, grade_level, name_ar, category) VALUES ('8b5b3527-da58-461f-af99-81ffff23bfd2', '2834bda5-176d-4cb5-9d6f-eaf21ce4cbc5', 12, 'رئيس مركز إدارة المحتوى', 'leadership'); -- for 'مركز إدارة المحتوى'

-- Link new positions to their new job_titles row.
UPDATE org_structure_positions SET job_title_id = '593110f7-2111-4f07-93e4-eb3832849284' WHERE id = '2c9eb1f8-2543-407f-809b-1e5f9074f83c';
UPDATE org_structure_positions SET job_title_id = 'a8ba8152-bd17-42a2-aa4e-8e9a5d1b9fb1' WHERE id = '87f52ac2-816f-4243-97db-8623fc28a9f3';
UPDATE org_structure_positions SET job_title_id = '494217f9-9d85-45c3-ad9d-137749d6f45f' WHERE id = 'a34d17b5-798d-4c71-8790-54f6efb0579b';
UPDATE org_structure_positions SET job_title_id = '709efc80-84c2-445d-8188-6951f8c402e1' WHERE id = 'bb661f22-00e4-4d22-a899-562f77c5a82b';
UPDATE org_structure_positions SET job_title_id = 'd1e3ba24-5846-437f-9f7b-80485ace0e61' WHERE id = 'd6b2914b-d3cb-4231-a205-e13604fa64e4';
UPDATE org_structure_positions SET job_title_id = '076048df-9a3a-42dc-b0f3-4dd229abdf6f' WHERE id = '1f58cd81-6a58-4092-bdb5-1428e92e4e48';
UPDATE org_structure_positions SET job_title_id = '5dd9a02d-a230-413e-88b5-0ac9a313fed8' WHERE id = 'e6340cae-fb72-4dc0-8528-fa3e00f8faff';
UPDATE org_structure_positions SET job_title_id = '5cf9e256-3f3b-4292-ae41-41d21240b1ac' WHERE id = 'e3248fff-c8da-4a28-a65a-b2ee15d2cca3';
UPDATE org_structure_positions SET job_title_id = 'd8a40089-42df-4b5f-8081-bd7c9ef88a22' WHERE id = 'b54fd954-e962-44ea-9a19-0b8a97a45ade';
UPDATE org_structure_positions SET job_title_id = 'b41bdee8-322a-4c8d-a088-e58d2ac510ce' WHERE id = 'b8e1194d-b827-47c6-8e97-45e39b184058';
UPDATE org_structure_positions SET job_title_id = '387127b4-5c90-4a12-a392-6f16092bdcfa' WHERE id = 'd76080dd-2662-40dc-b4f6-4a7c33e0d119';
UPDATE org_structure_positions SET job_title_id = 'bd9fdfc6-c2be-4f14-b324-0a628d5f702a' WHERE id = '1ca4403e-69fd-4d64-b9c0-3de3c60b0112';
UPDATE org_structure_positions SET job_title_id = 'd7dc268b-0982-408f-8c71-2750d359f1ea' WHERE id = '15b9a11d-bc56-4992-bd12-6984a56a29b1';
UPDATE org_structure_positions SET job_title_id = '84c52f64-8ca4-4902-bb0a-ddb4d02238e1' WHERE id = '4cf78019-c7ff-41fe-905a-beb2285115fc';
UPDATE org_structure_positions SET job_title_id = '028552a8-cd4d-46aa-9711-8c90ec20665c' WHERE id = 'a8e93ee4-c759-4260-8620-6dcbce5b20e8';
UPDATE org_structure_positions SET job_title_id = '8118a8e4-d1b1-4895-a4bb-52851c40f86a' WHERE id = 'cc197340-d641-4210-8831-36c2683d60c3';
UPDATE org_structure_positions SET job_title_id = '85ca6aaf-4d5f-4930-be65-7811b839ed6b' WHERE id = '0bbc2758-0ba9-4a27-9cb7-0598ed56b8a9';
UPDATE org_structure_positions SET job_title_id = 'f72e1099-ddf2-4363-a91c-c4425c8e0770' WHERE id = '603bf071-cef9-4248-9019-db227905d76d';
UPDATE org_structure_positions SET job_title_id = 'b95fe8e4-cfee-41cd-b529-08f5e291ef2c' WHERE id = '5fd75e42-0e7f-41ae-9f9d-0551e9cc049e';
UPDATE org_structure_positions SET job_title_id = '8b5b3527-da58-461f-af99-81ffff23bfd2' WHERE id = '05ec29d4-5b6b-4318-b3fc-8c8e9bf4d159';

-- Link positions to an already-existing, confidently-matched job_titles row (21).
UPDATE org_structure_positions SET job_title_id = '957cb597-e04e-450a-a1c5-30f7c3246e6d' WHERE id = '50e67b79-228b-4b17-9bad-7519710cb636'; -- 'مكتب إدارة الاستراتيجية'
UPDATE org_structure_positions SET job_title_id = '598efb16-cbaa-4171-a7d8-70e85a5e1e91' WHERE id = 'f4e1e301-b949-436f-8c77-7d0437549f3e'; -- 'إدارة الاتصال المؤسسي'
UPDATE org_structure_positions SET job_title_id = '60c2cc31-0ef4-4d69-8526-be716fac2720' WHERE id = 'a72394ba-93d5-400a-8928-c691e0dc7a0c'; -- 'إدارة المسؤولية المجتمعية'
UPDATE org_structure_positions SET job_title_id = '37bc5801-4088-43a6-a3ef-e49ea01abb90' WHERE id = '330a4822-0664-40b3-9522-8f2f7cb41c06'; -- 'مكتب الرئيس'
UPDATE org_structure_positions SET job_title_id = 'a2283006-e6a5-4c0c-b505-6493cc2a0a6c' WHERE id = '98c02ccf-7bdd-4450-a1c8-7b019df3b5cb'; -- 'الإدارة التنفيذية للاتصالات وتقنية المعلومات'
UPDATE org_structure_positions SET job_title_id = '6068cd61-ee34-4fef-ab5c-ad0c498fd894' WHERE id = '4f24f9e4-a74f-4bb9-8818-4e44a961a874'; -- 'الإدارة التنفيذية للخدمات المشتركة'
UPDATE org_structure_positions SET job_title_id = 'bef28e08-6a06-4c10-a229-d6990dc9ded2' WHERE id = 'e363b29f-20af-44c4-9555-b4786a6e727d'; -- 'الإدارة التنفيذية لتطوير الأعمال'
UPDATE org_structure_positions SET job_title_id = 'f5aa9993-0ebc-414f-9ec2-ea3806d8efa7' WHERE id = 'd71eebde-ab0f-4e13-942a-fcb74bd39e69'; -- 'النائب المساعد لتجربة الطالب'
UPDATE org_structure_positions SET job_title_id = '8e5715cb-6999-4149-a358-0d82f93fc490' WHERE id = '21bd3b45-b1c5-4a18-9fdc-e2c20222af6d'; -- 'إدارة الأمن السيبراني'
UPDATE org_structure_positions SET job_title_id = '106e8024-511e-4367-993a-1f2ae3ffa304' WHERE id = '55788b4c-850f-45a3-887f-c82c43843bbb'; -- 'إدارة التحول الرقمي'
UPDATE org_structure_positions SET job_title_id = '0f6541bb-64d0-41b0-82c2-2f173e080aca' WHERE id = 'def5001c-f759-4baf-8495-29d4dcba16e3'; -- 'إدارة تقنية المعلومات'
UPDATE org_structure_positions SET job_title_id = '52fbfb6a-8f50-4d71-aa58-267cd5d7c201' WHERE id = 'ebac99fb-e930-4333-b2a5-2ec9b24cb002'; -- 'مكتب إدارة البيانات'
UPDATE org_structure_positions SET job_title_id = 'af4b138d-cfed-4366-a657-e69585b897b2' WHERE id = 'e053a466-f91c-4e03-be80-6e42201ba2da'; -- 'إدارة المرافق'
UPDATE org_structure_positions SET job_title_id = 'b13d9059-1198-4be7-ad0a-0ba2da6c82c7' WHERE id = '241af612-179b-47ec-8e23-221158d09f9d'; -- 'إدارة المشتريات'
UPDATE org_structure_positions SET job_title_id = '17802c32-9afa-419a-95ca-909589efff1f' WHERE id = 'd6b980cb-3d4c-4717-bcb0-ac93cdccc065'; -- 'مكتب القبول'
UPDATE org_structure_positions SET job_title_id = 'a3b92722-3721-4bd1-8369-63affcd93da1' WHERE id = '541b4fd5-2e8a-4d9f-a9d8-bb5d85f5a544'; -- 'مكتب التسجيل والإرشاد الأكاديمي'
UPDATE org_structure_positions SET job_title_id = '8882eeba-5d66-44ba-aef1-bb31827d3aef' WHERE id = '87f33b59-e621-46d7-9e69-50c4f3c4e7f3'; -- 'إدارة الحياة الجامعية'
UPDATE org_structure_positions SET job_title_id = '8885141b-2d06-45a7-819f-9830bb71ae27' WHERE id = '3174053f-06bd-41b0-bd0c-5824f23e8472'; -- 'مركز التعليم والتعلم'
UPDATE org_structure_positions SET job_title_id = '5514e8b1-0a8b-4db0-ad5b-3b078c850031' WHERE id = '4ee84027-26be-4c7d-8750-23926b1c1782'; -- 'مركز التقييم والقياس'
UPDATE org_structure_positions SET job_title_id = '75f06d9f-5a32-4533-8d46-32a4ab46ce5f' WHERE id = '78657486-a7e5-442c-83f3-e25770260429'; -- 'مكتب الاعتماد الأكاديمي'
UPDATE org_structure_positions SET job_title_id = '9f95af40-98b3-4097-a7c0-a748b7164e62' WHERE id = 'bb1873d3-5937-4d99-8fa4-fa7898e49c74'; -- 'مركز الابتكار وريادة الأعمال'

COMMIT;

-- ============================================================================
-- Verification — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 20 new job_titles rows (336 + 20 = 356 total).
-- SELECT count(*) FROM job_titles WHERE deleted_at IS NULL;

-- Expect: exactly 41 of the 44 new positions now have a non-NULL job_title_id
-- (3 deliberately left NULL: عمداء الكليات، المجلس العلمي، المشرفة على القسم النسائي).
