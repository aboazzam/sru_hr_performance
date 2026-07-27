-- ============================================================================
-- Builds out the org-chart position tree beneath the existing "الرئيس التنفيذي"
-- (already linked to "رئيس الجامعة"), per direct request: "اترك [الرئيس التنفيذي] كما
-- هي وابدأ بالبناء تحتها" (leave it as-is, start building beneath it), followed by
-- "أضف الإدارة التنفيذية كمناصب حقيقية" (add the three "الإدارة التنفيذية" / Executive
-- Management units as real intermediate positions, not skipped).
--
-- Source of truth: `org_units.parent_id`'s own real, already-existing hierarchy
-- (confirmed fully connected -- single root, all 58 units reachable, no orphans --
-- before writing this migration). Every new position is named identically to its
-- linked org unit (matching the precedent already set by "النائب المساعد للتميز
-- الأكاديمي", whose position and unit share the same name) -- no titles were
-- invented. `name_en` is left NULL for all of them: none of the 58 org_units rows
-- have an English name populated, so there is nothing real to copy.
--
-- Level = organizational RANK TIER, not tree depth (already-established convention
-- -- confirmed the existing `النائب المساعد للتميز الأكاديمي`/`مدير رأس المال
-- البشري` positions sit at different levels despite both being real descendants of
-- الرئيس التنفيذي). Assigned here by depth RELATIVE TO رئيس الجامعة/الرئيس التنفيذي:
-- direct children -> C2 (peer tier to the existing نائب الرئيس التنفيذي), their
-- children -> C3 (peer tier to النائب المساعد للتميز الأكاديمي), and the deepest
-- tier -> C4. The existing 4 levels (1/C2/C3/C4) exactly cover this range with no
-- new level needed.
--
-- Real consequence of adding the three "الإدارة التنفيذية" (Executive Management)
-- units as genuine intermediate positions (the explicitly chosen option, not the
-- alternative of flattening their children directly under الرئيس التنفيذي): the two
-- already-existing positions "مدير رأس المال البشري" و"مدير الادارة المالية" move
-- one tier deeper -- from direct children of الرئيس التنفيذي at C4 to children of the
-- new "الإدارة التنفيذية للخدمات المشتركة" position at C3 -- since their real
-- org_units (إدارة رأس المال البشري / إدارة الشؤون المالية) sit under that unit, not
-- directly under رئيس الجامعة. This was surfaced explicitly and confirmed before
-- writing this migration, not applied silently.
-- ============================================================================

BEGIN;

-- New positions (44), inserted with pre-generated ids so children below can
-- reference their exact parent without a round trip.
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('50e67b79-228b-4b17-9bad-7519710cb636', 'c4dc0c39-05fd-46c4-b142-ce9b062c13f7', '68f9b56e-11ea-46dc-a127-e9751d78ee3a', 'مكتب إدارة الاستراتيجية', NULL, 'ddfc7def-e300-48fc-a67f-3e5c2b0e7200');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('2c9eb1f8-2543-407f-809b-1e5f9074f83c', 'c4dc0c39-05fd-46c4-b142-ce9b062c13f7', '68f9b56e-11ea-46dc-a127-e9751d78ee3a', 'إدارة التميز المؤسسي', NULL, '1cd54c54-c5ca-4a94-b785-cb5c23ba12df');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('f4e1e301-b949-436f-8c77-7d0437549f3e', 'c4dc0c39-05fd-46c4-b142-ce9b062c13f7', '68f9b56e-11ea-46dc-a127-e9751d78ee3a', 'إدارة الاتصال المؤسسي', NULL, 'fef0736e-f3b2-46de-a6ac-032bc87d20ee');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('a72394ba-93d5-400a-8928-c691e0dc7a0c', 'c4dc0c39-05fd-46c4-b142-ce9b062c13f7', '68f9b56e-11ea-46dc-a127-e9751d78ee3a', 'إدارة المسؤولية المجتمعية', NULL, '437326f5-c582-46db-8b25-770c76444bf7');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('330a4822-0664-40b3-9522-8f2f7cb41c06', 'c4dc0c39-05fd-46c4-b142-ce9b062c13f7', '68f9b56e-11ea-46dc-a127-e9751d78ee3a', 'مكتب الرئيس', NULL, 'b62cac4c-e7e5-464e-a450-421fd9dac7ab');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('87f52ac2-816f-4243-97db-8623fc28a9f3', 'c4dc0c39-05fd-46c4-b142-ce9b062c13f7', '68f9b56e-11ea-46dc-a127-e9751d78ee3a', 'وحدة التوعية والسلوك المهني', NULL, 'acb3c94d-b36d-4987-8318-c389d20f2c91');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('8b2c8dbc-6b8c-4c23-99e8-27be249d8151', 'c4dc0c39-05fd-46c4-b142-ce9b062c13f7', '68f9b56e-11ea-46dc-a127-e9751d78ee3a', 'عمداء الكليات', NULL, '29c0e994-70e1-4bb9-8dcb-f43cdf4e7cee');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('f6bb64d3-f1cc-4dfa-b28a-83c38ebb41a4', 'c4dc0c39-05fd-46c4-b142-ce9b062c13f7', '68f9b56e-11ea-46dc-a127-e9751d78ee3a', 'المجلس العلمي', NULL, '93d7e94f-926d-473d-9638-586722a19a29');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('bd2febd9-d174-41f3-aead-792081d06af5', 'c4dc0c39-05fd-46c4-b142-ce9b062c13f7', '68f9b56e-11ea-46dc-a127-e9751d78ee3a', 'المشرفة على القسم النسائي', NULL, '45b6c9a6-7b18-41a3-9822-5a58bf57f6e4');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('98c02ccf-7bdd-4450-a1c8-7b019df3b5cb', 'c4dc0c39-05fd-46c4-b142-ce9b062c13f7', '68f9b56e-11ea-46dc-a127-e9751d78ee3a', 'الإدارة التنفيذية للاتصالات وتقنية المعلومات', NULL, '658de448-85ff-4e4f-ab7e-61a774e17d6f');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('4f24f9e4-a74f-4bb9-8818-4e44a961a874', 'c4dc0c39-05fd-46c4-b142-ce9b062c13f7', '68f9b56e-11ea-46dc-a127-e9751d78ee3a', 'الإدارة التنفيذية للخدمات المشتركة', NULL, '2431f2e4-c4d2-4d53-9872-1c309d04c289');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('e363b29f-20af-44c4-9555-b4786a6e727d', 'c4dc0c39-05fd-46c4-b142-ce9b062c13f7', '68f9b56e-11ea-46dc-a127-e9751d78ee3a', 'الإدارة التنفيذية لتطوير الأعمال', NULL, 'bd133152-798f-4aec-9fba-c895ed79f7a7');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('bb661f22-00e4-4d22-a899-562f77c5a82b', '2bf122c3-a747-4d80-bd04-c3e32708bc5d', '8b2c8dbc-6b8c-4c23-99e8-27be249d8151', 'كلية الطب', NULL, 'c6f137ed-7dcd-42e8-b2d6-a2ffa0d89398');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('d6b2914b-d3cb-4231-a205-e13604fa64e4', '2bf122c3-a747-4d80-bd04-c3e32708bc5d', '8b2c8dbc-6b8c-4c23-99e8-27be249d8151', 'كلية التمريض', NULL, '1888a2e9-3b35-47d8-bf11-9f558813017b');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('1f58cd81-6a58-4092-bdb5-1428e92e4e48', '2bf122c3-a747-4d80-bd04-c3e32708bc5d', '8b2c8dbc-6b8c-4c23-99e8-27be249d8151', 'كلية العلوم الصحية', NULL, '18653ddc-7b1a-4331-857b-563a3b8e040e');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('e6340cae-fb72-4dc0-8528-fa3e00f8faff', '2bf122c3-a747-4d80-bd04-c3e32708bc5d', '8b2c8dbc-6b8c-4c23-99e8-27be249d8151', 'كلية الأعمال', NULL, '83aae9a2-878d-46a5-b17e-5ba6542ba285');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('d71eebde-ab0f-4e13-942a-fcb74bd39e69', '2bf122c3-a747-4d80-bd04-c3e32708bc5d', '433fd3ab-c98a-4666-a9cd-d3b65554d3c3', 'النائب المساعد لتجربة الطالب', NULL, '8a3086f7-61ab-46f5-b1fc-563d3297ed39');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('a34d17b5-798d-4c71-8790-54f6efb0579b', '2bf122c3-a747-4d80-bd04-c3e32708bc5d', '433fd3ab-c98a-4666-a9cd-d3b65554d3c3', 'النائب المساعد للدراسات العليا والبحث العلمي', NULL, 'c1c691c3-9ec1-4ade-a3f6-c9bdcdd9102e');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('21bd3b45-b1c5-4a18-9fdc-e2c20222af6d', '2bf122c3-a747-4d80-bd04-c3e32708bc5d', '98c02ccf-7bdd-4450-a1c8-7b019df3b5cb', 'إدارة الأمن السيبراني', NULL, '1e6d4700-2214-4de1-80d9-35f68f1e4dc0');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('55788b4c-850f-45a3-887f-c82c43843bbb', '2bf122c3-a747-4d80-bd04-c3e32708bc5d', '98c02ccf-7bdd-4450-a1c8-7b019df3b5cb', 'إدارة التحول الرقمي', NULL, '764dc1e4-ee9a-4bcd-ba29-9101189116c3');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('def5001c-f759-4baf-8495-29d4dcba16e3', '2bf122c3-a747-4d80-bd04-c3e32708bc5d', '98c02ccf-7bdd-4450-a1c8-7b019df3b5cb', 'إدارة تقنية المعلومات', NULL, '26a63990-c355-4ac0-b495-393fc7d7fed0');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('ebac99fb-e930-4333-b2a5-2ec9b24cb002', '2bf122c3-a747-4d80-bd04-c3e32708bc5d', '98c02ccf-7bdd-4450-a1c8-7b019df3b5cb', 'مكتب إدارة البيانات', NULL, 'd9c15cee-71b4-448e-8042-0e083a64e7bf');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('e053a466-f91c-4e03-be80-6e42201ba2da', '2bf122c3-a747-4d80-bd04-c3e32708bc5d', '4f24f9e4-a74f-4bb9-8818-4e44a961a874', 'إدارة المرافق', NULL, '5d47ac11-2523-464c-b4e9-0c325851685a');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('e3248fff-c8da-4a28-a65a-b2ee15d2cca3', '2bf122c3-a747-4d80-bd04-c3e32708bc5d', '4f24f9e4-a74f-4bb9-8818-4e44a961a874', 'الإدارة الهندسية', NULL, 'f74125bc-03e4-4516-8d96-9424b8575893');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('241af612-179b-47ec-8e23-221158d09f9d', '2bf122c3-a747-4d80-bd04-c3e32708bc5d', '4f24f9e4-a74f-4bb9-8818-4e44a961a874', 'إدارة المشتريات', NULL, 'f1e956f3-eb5f-4b72-874b-2a97b71c791b');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('b54fd954-e962-44ea-9a19-0b8a97a45ade', '2bf122c3-a747-4d80-bd04-c3e32708bc5d', '4f24f9e4-a74f-4bb9-8818-4e44a961a874', 'إدارة المستودعات', NULL, '91032338-66fd-45a3-9c78-2923a3fac98f');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('b8e1194d-b827-47c6-8e97-45e39b184058', '2bf122c3-a747-4d80-bd04-c3e32708bc5d', 'e363b29f-20af-44c4-9555-b4786a6e727d', 'إدارة التدريب والاستشارات', NULL, 'f11ceefb-9e0f-496b-90a5-361a7d4841b0');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('d76080dd-2662-40dc-b4f6-4a7c33e0d119', '2bf122c3-a747-4d80-bd04-c3e32708bc5d', 'e363b29f-20af-44c4-9555-b4786a6e727d', 'إدارة الشراكات', NULL, '74fd1ab7-1769-4662-926b-f4bcaa2d8f39');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('1ca4403e-69fd-4d64-b9c0-3de3c60b0112', '2bf122c3-a747-4d80-bd04-c3e32708bc5d', 'e363b29f-20af-44c4-9555-b4786a6e727d', 'إدارة تطوير المنتجات والخدمات', NULL, 'ba53a182-ed9d-4a33-ba0e-aad3f497c2ac');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('d6b980cb-3d4c-4717-bcb0-ac93cdccc065', 'c0b56059-ba5e-4b7e-9085-7feb080b4033', 'd71eebde-ab0f-4e13-942a-fcb74bd39e69', 'مكتب القبول', NULL, 'e22ffc15-1041-4146-8034-8a3e25f37ebc');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('15b9a11d-bc56-4992-bd12-6984a56a29b1', 'c0b56059-ba5e-4b7e-9085-7feb080b4033', 'd71eebde-ab0f-4e13-942a-fcb74bd39e69', 'مكتب المنح والحلول المالية', NULL, '000ef2cc-a205-41c7-889c-356e082c6e2d');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('541b4fd5-2e8a-4d9f-a9d8-bb5d85f5a544', 'c0b56059-ba5e-4b7e-9085-7feb080b4033', 'd71eebde-ab0f-4e13-942a-fcb74bd39e69', 'مكتب التسجيل والإرشاد الأكاديمي', NULL, 'bd2fe000-97a9-4c9b-966d-b50e016f6f98');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('87f33b59-e621-46d7-9e69-50c4f3c4e7f3', 'c0b56059-ba5e-4b7e-9085-7feb080b4033', 'd71eebde-ab0f-4e13-942a-fcb74bd39e69', 'إدارة الحياة الجامعية', NULL, '0979c59f-aa8b-4c0f-b471-99028775d54f');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('4cf78019-c7ff-41fe-905a-beb2285115fc', 'c0b56059-ba5e-4b7e-9085-7feb080b4033', 'd71eebde-ab0f-4e13-942a-fcb74bd39e69', 'مكتب رعاية الخريجين', NULL, 'b8fcaf9f-83d2-4dd3-b9dc-b411bec75ede');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('3174053f-06bd-41b0-bd0c-5824f23e8472', 'c0b56059-ba5e-4b7e-9085-7feb080b4033', '869d76e6-d3d4-47f3-8bcb-11ad307b8b91', 'مركز التعليم والتعلم', NULL, 'd2fdd3ca-c226-4180-8eea-227963381807');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('4ee84027-26be-4c7d-8750-23926b1c1782', 'c0b56059-ba5e-4b7e-9085-7feb080b4033', '869d76e6-d3d4-47f3-8bcb-11ad307b8b91', 'مركز التقييم والقياس', NULL, '2493126b-9c53-4b48-9f64-c0d373fc6fb2');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('5fd75e42-0e7f-41ae-9f9d-0551e9cc049e', 'c0b56059-ba5e-4b7e-9085-7feb080b4033', '869d76e6-d3d4-47f3-8bcb-11ad307b8b91', 'إدارة التجهيزات التعليمية', NULL, '664f11d4-af2f-4783-af0b-ad9efcf88247');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('78657486-a7e5-442c-83f3-e25770260429', 'c0b56059-ba5e-4b7e-9085-7feb080b4033', '869d76e6-d3d4-47f3-8bcb-11ad307b8b91', 'مكتب الاعتماد الأكاديمي', NULL, '44c2f55b-879c-49ad-a421-b8f64d6326ec');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('cc197340-d641-4210-8831-36c2683d60c3', 'c0b56059-ba5e-4b7e-9085-7feb080b4033', 'a34d17b5-798d-4c71-8790-54f6efb0579b', 'مكتب الدراسات العليا', NULL, '2c85b768-e7c2-42d7-bc7e-fb8f7a8f2d3c');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('0bbc2758-0ba9-4a27-9cb7-0598ed56b8a9', 'c0b56059-ba5e-4b7e-9085-7feb080b4033', 'a34d17b5-798d-4c71-8790-54f6efb0579b', 'مكتب البحث العلمي', NULL, 'bd22daf5-dfce-44bc-9d70-ccbd1cff34f8');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('603bf071-cef9-4248-9019-db227905d76d', 'c0b56059-ba5e-4b7e-9085-7feb080b4033', 'b8e1194d-b827-47c6-8e97-45e39b184058', 'إدارة التدريب', NULL, '0ce757b5-c103-4f99-b27f-48abb1e07fe6');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('a8e93ee4-c759-4260-8620-6dcbce5b20e8', 'c0b56059-ba5e-4b7e-9085-7feb080b4033', 'b8e1194d-b827-47c6-8e97-45e39b184058', 'مركز الاستشارات', NULL, '9f42ee56-9199-478a-af00-3c1ba8e85820');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('bb1873d3-5937-4d99-8fa4-fa7898e49c74', 'c0b56059-ba5e-4b7e-9085-7feb080b4033', '1ca4403e-69fd-4d64-b9c0-3de3c60b0112', 'مركز الابتكار وريادة الأعمال', NULL, '9ad811b8-cf8d-4156-a61e-fc464e66aaa5');
INSERT INTO org_structure_positions (id, level_id, parent_id, name_ar, name_en, org_unit_id) VALUES ('05ec29d4-5b6b-4318-b3fc-8c8e9bf4d159', 'c0b56059-ba5e-4b7e-9085-7feb080b4033', '1ca4403e-69fd-4d64-b9c0-3de3c60b0112', 'مركز إدارة المحتوى', NULL, '406ebd57-66e7-412d-8e7b-d8d741435c0a');

-- Re-parent + re-level the 2 existing positions whose real department now sits
-- under a newly-added Executive Management position, not directly under الرئيس
-- التنفيذي as before.
UPDATE org_structure_positions SET parent_id = '4f24f9e4-a74f-4bb9-8818-4e44a961a874', level_id = '2bf122c3-a747-4d80-bd04-c3e32708bc5d' WHERE id = 'fe8cb844-2575-4993-9148-4edbc13c1b3e'; -- مدير الادارة المالية -> now under الإدارة التنفيذية للخدمات المشتركة (C3)
UPDATE org_structure_positions SET parent_id = '4f24f9e4-a74f-4bb9-8818-4e44a961a874', level_id = '2bf122c3-a747-4d80-bd04-c3e32708bc5d' WHERE id = '74eea20f-ec95-45b7-a49b-6f236d359a07'; -- مدير رأس المال البشري -> now under الإدارة التنفيذية للخدمات المشتركة (C3)

COMMIT;

-- ============================================================================
-- Verification — run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 5 (original) + 44 (new) = 49 real, non-deleted positions total.
-- SELECT count(*) FROM org_structure_positions WHERE deleted_at IS NULL;

-- Expect: مدير رأس المال البشري / مدير الادارة المالية now parented under
-- الإدارة التنفيذية للخدمات المشتركة at level C3, not الرئيس التنفيذي at C4.
