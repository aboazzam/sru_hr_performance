-- 2026-08-28: adds the real Board-of-Trustees / University-Council governance
-- tier above the existing org_structure_positions tree, per a direct request
-- with the official org chart image (v2.0, 27/5/2025) and "اعمل الهيكل
-- التنظيمي بنفس الشكل" -- match the real, official shape.
--
-- The existing tree's root ("الرئيس التنفيذي") already had 13 direct
-- children matching EXACTLY رئيس الجامعة's own real org_units.parent_id
-- children (confirmed by a direct query before writing this) -- the whole
-- middle/lower tree was already correct, just missing everything above it
-- and carrying two role-label mismatches against the official chart.
--
-- Confirmed directly with the project owner before writing this: "رئيس
-- الجامعة هو الرئيس التنفيذي / ونائب رئيس الجامعة للشؤون الأكاديمية هو نائب
-- الرئيس التنفيذي" -- these are the SAME real roles/employees, not new
-- positions, so this relabels + re-parents the two existing rows in place
-- (preserving their real org_structure_assignments, org_unit_id, and
-- job_title_id untouched) rather than inserting duplicates.
--
-- Every new position's org_unit_id comes directly from the real `org_units`
-- table, which already encodes this EXACT governance hierarchy (built
-- earlier from real official source documents) -- confirmed via a direct
-- query of org_units.parent_id for every new entity before writing any
-- INSERT, not guessed from the chart image's pixel layout. No job_title_id
-- was found or invented for the 8 new positions -- board/council bodies
-- (مجلس الأمناء، لجنة المراجعة، مجلس الجامعة، المجلس الاستشاري) are
-- collegial, matching the existing NULL-job-title precedent already set by
-- عمداء الكليات/المجلس العلمي in this same tree; the 4 new department-like
-- offices (أمانة مجلس الجامعة، إدارة المراجعة الداخلية، مكتب الحوكمة...،
-- إدارة الشؤون القانونية) had no matching job_titles row either -- left
-- NULL rather than fabricated, consistent with this project's discipline.
--
-- Two independent bugs were caught by dry-running this in a rolled-back
-- transaction before ever touching real data: (1) two OLD soft-deleted test
-- rows (2026-07-22, "مستوى اختبار مؤقت" and "الرئيس التنفيذي - رئيس
-- الجامعة") still carry level_order values 1 and 2 -- every level_order
-- filter below is scoped `deleted_at IS NULL` specifically because of this,
-- confirmed via a direct query first; without it, the level-renumbering
-- UPDATEs silently touched 2 rows instead of 1, and worse, the new-position
-- CTEs' `lvl2`/`lvl1`/`lvl3` lookups would have matched both the live and
-- the dead row, cross-joining every "FROM lvl2, board" INSERT into a
-- duplicate row (caught live: a second "مجلس الجامعة" row actually got
-- inserted on the first flawed dry run, then the very next UPDATE trying to
-- resolve its parent by name failed loudly with "more than one row returned
-- by a subquery" rather than silently picking one). (2) the very first
-- attempt to apply this for real silently rolled back on every run --
-- the script never actually had a closing `COMMIT;` (only the initial
-- `BEGIN;`), so `psql -f` correctly ran everything through the verification
-- SELECTs and then rolled back on disconnect with no error at all, three
-- times in a row, before this was noticed by re-querying the live table
-- directly after the "successful" run and finding nothing had changed.
--
-- Verified live after applying for real: 6 levels (up from 4), 57 positions
-- (up from 49, +8 new), tree confirmed via a fresh full dump to render
-- exactly as designed (مجلس الأمناء at the root; المجلس الاستشاري/لجنة
-- المراجعة/مجلس الجامعة as its three children; رئيس الجامعة + 4 new council
-- offices under مجلس الجامعة; the entire pre-existing 49-position subtree
-- unchanged and now hanging correctly under the renamed رئيس الجامعة), and
-- both real employee assignments (محمد عبدالله المحيميد -> رئيس الجامعة,
-- عبدالله الصالح -> نائب الرئيس للشؤون الأكاديمية) confirmed still intact
-- under the new names.

BEGIN;

-- Step 1: renumber the 4 existing levels to make room for 2 new tiers above.
-- Two-pass negative-placeholder trick (level_order is a live UNIQUE index) --
-- same pattern already established by reorderLevels() in this codebase.
-- `deleted_at IS NULL` matters here: two OLD soft-deleted test level rows
-- (2026-07-22) happen to share level_order 1 and 2 with the live rows --
-- confirmed via a direct query before writing this -- so an unfiltered
-- WHERE would silently renumber those dead rows too.
UPDATE org_structure_levels SET level_order = -1 WHERE level_order = 1 AND deleted_at IS NULL;
UPDATE org_structure_levels SET level_order = -2 WHERE level_order = 2 AND deleted_at IS NULL;
UPDATE org_structure_levels SET level_order = -3 WHERE level_order = 3 AND deleted_at IS NULL;
UPDATE org_structure_levels SET level_order = -4 WHERE level_order = 4 AND deleted_at IS NULL;

UPDATE org_structure_levels SET level_order = 3, name_ar = 'C3', name_en = 'C3' WHERE level_order = -1 AND deleted_at IS NULL;
UPDATE org_structure_levels SET level_order = 4, name_ar = 'C4', name_en = 'C4' WHERE level_order = -2 AND deleted_at IS NULL;
UPDATE org_structure_levels SET level_order = 5, name_ar = 'C5', name_en = 'C5' WHERE level_order = -3 AND deleted_at IS NULL;
UPDATE org_structure_levels SET level_order = 6, name_ar = 'C6', name_en = 'C6' WHERE level_order = -4 AND deleted_at IS NULL;

-- Step 2: insert the 2 new top tiers.
INSERT INTO org_structure_levels (name_ar, name_en, level_order)
VALUES ('1', '1', 1), ('C2', 'C2', 2);

-- Step 3: insert the 8 new positions, wired via CTEs so parent_id references
-- resolve within one statement. org_unit_id values come directly from the
-- real org_units table (already the source of truth for this exact
-- hierarchy -- no fabricated names or relationships).
-- `deleted_at IS NULL` matters again here for the same reason as Step 1 --
-- without it, `lvl2` would match BOTH the new live "C2" level row AND the
-- old soft-deleted "مستوى اختبار مؤقت" test level (which also still has
-- level_order = 2, untouched by Step 1), cross-joining every INSERT ...
-- SELECT ... FROM lvl2 below into a duplicate row. Caught by a dry run
-- inside a rolled-back transaction before this ever touched real data.
WITH
  lvl1 AS (SELECT id FROM org_structure_levels WHERE level_order = 1 AND deleted_at IS NULL),
  lvl2 AS (SELECT id FROM org_structure_levels WHERE level_order = 2 AND deleted_at IS NULL),
  lvl3 AS (SELECT id FROM org_structure_levels WHERE level_order = 3 AND deleted_at IS NULL),
  board AS (
    INSERT INTO org_structure_positions (name_ar, name_en, level_id, parent_id, org_unit_id)
    SELECT 'مجلس الأمناء', 'Board of Trustees', lvl1.id, NULL, '792db7e0-f276-4275-aa21-da184dabbe09'
    FROM lvl1
    RETURNING id
  ),
  council AS (
    INSERT INTO org_structure_positions (name_ar, name_en, level_id, parent_id, org_unit_id)
    SELECT 'مجلس الجامعة', 'University Council', lvl2.id, board.id, '3a4121ac-b2b0-4a70-8e9a-b9be547f2234'
    FROM lvl2, board
    RETURNING id
  ),
  audit_committee AS (
    INSERT INTO org_structure_positions (name_ar, name_en, level_id, parent_id, org_unit_id)
    SELECT 'لجنة المراجعة', 'Audit Committee', lvl2.id, board.id, 'c0eabf7a-1a29-4c75-b101-c255a696cd74'
    FROM lvl2, board
    RETURNING id
  ),
  advisory AS (
    INSERT INTO org_structure_positions (name_ar, name_en, level_id, parent_id, org_unit_id)
    SELECT 'المجلس الاستشاري', 'Advisory Council', lvl2.id, board.id, '14faf29a-5b16-4cfc-9b00-5e4e8f89cd20'
    FROM lvl2, board
    RETURNING id
  ),
  secretariat AS (
    INSERT INTO org_structure_positions (name_ar, name_en, level_id, parent_id, org_unit_id)
    SELECT 'أمانة مجلس الجامعة', 'University Council Secretariat', lvl3.id, council.id, 'efd44c37-3774-4f48-95c3-d23259b39c3c'
    FROM lvl3, council
    RETURNING id
  ),
  internal_audit AS (
    INSERT INTO org_structure_positions (name_ar, name_en, level_id, parent_id, org_unit_id)
    SELECT 'إدارة المراجعة الداخلية', 'Internal Audit', lvl3.id, council.id, '0aa78bef-2ca9-4618-874e-6b44aea86257'
    FROM lvl3, council
    RETURNING id
  ),
  governance AS (
    INSERT INTO org_structure_positions (name_ar, name_en, level_id, parent_id, org_unit_id)
    SELECT 'مكتب الحوكمة وإدارة المخاطر والالتزام', 'Governance, Risk & Compliance Office', lvl3.id, council.id, 'dc7e26df-a1dc-47bb-83e4-bb87030e0b62'
    FROM lvl3, council
    RETURNING id
  ),
  legal AS (
    INSERT INTO org_structure_positions (name_ar, name_en, level_id, parent_id, org_unit_id)
    SELECT 'إدارة الشؤون القانونية', 'Legal Affairs', lvl3.id, council.id, 'b224aaca-01dc-4403-b2e9-f0dc478b675c'
    FROM lvl3, council
    RETURNING id
  )
SELECT
  (SELECT id FROM board) AS board_id,
  (SELECT id FROM council) AS council_id;

-- Step 4: re-parent + relabel the real President/Deputy positions to match
-- the official chart -- same real positions, same real employees staffed,
-- only name/parent changing.
UPDATE org_structure_positions
SET name_ar = 'رئيس الجامعة',
    name_en = 'University President',
    parent_id = (SELECT id FROM org_structure_positions WHERE name_ar = 'مجلس الجامعة' AND deleted_at IS NULL)
WHERE id = '68f9b56e-11ea-46dc-a127-e9751d78ee3a';

UPDATE org_structure_positions
SET name_ar = 'نائب الرئيس للشؤون الأكاديمية',
    name_en = 'VP, Academic Affairs'
WHERE id = '433fd3ab-c98a-4666-a9cd-d3b65554d3c3';

-- Step 5: two label corrections to match the chart's department-name
-- convention (every sibling at this tier is "إدارة X", these two were the
-- only "مدير X" outliers) -- real org_unit matches confirmed to exist.
UPDATE org_structure_positions
SET name_ar = 'إدارة رأس المال البشري',
    name_en = 'Human Capital Department',
    org_unit_id = COALESCE(org_unit_id, '4432fb4d-0d7f-4049-bc62-ad72355797fb')
WHERE name_ar = 'مدير رأس المال البشري' AND deleted_at IS NULL;

UPDATE org_structure_positions
SET name_ar = 'إدارة الشؤون المالية',
    name_en = 'Financial Affairs Department',
    org_unit_id = COALESCE(org_unit_id, 'f163d9db-d6e1-492b-a6fe-a8e0ba941f5a')
WHERE name_ar = 'مدير الادارة المالية' AND deleted_at IS NULL;

-- Verification before commit.
SELECT level_order, name_ar FROM org_structure_levels WHERE deleted_at IS NULL ORDER BY level_order;
SELECT count(*) AS total_positions FROM org_structure_positions WHERE deleted_at IS NULL;
SELECT name_ar, parent_id, level_id FROM org_structure_positions WHERE parent_id IS NULL AND deleted_at IS NULL;

COMMIT;
