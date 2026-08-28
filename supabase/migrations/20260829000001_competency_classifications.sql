-- ============================================================================
-- competency_classifications — replaces the fixed competency_type ENUM
-- ('core'/'specialized') with an admin-manageable table, per direct request
-- ("زر اضف تصنيف (اساسية تخصصية مؤسسية) ... تصنيفات قابلة للإضافة لاحقًا").
--
-- `type='core'` was never JUST a label -- several screens use it to decide
-- which competencies are automatically listed/pre-populated for EVERY job
-- title / employee (career-path job-title creation & detail, the Excel
-- import, employee competency scoring, 360 nomination). Converting to a
-- free-form list without preserving that behavior would be a real
-- regression. Resolved with the project owner directly (not guessed):
-- `auto_apply_everywhere BOOLEAN`, an admin-controllable per-classification
-- toggle -- seeded true on "أساسية" (matching the exact prior 'core'
-- behavior, zero behavior change for existing data) and false on the two
-- others. Application code that used to check `type = 'core'` now checks
-- `classification.auto_apply_everywhere = true` instead (see
-- src/lib/competencyFramework.ts's `computeAutoApplyClassificationIds`).
--
-- No deleted_at (soft-delete): mirrors competency_pillars/competency_domains,
-- not competencies itself -- a classification is reference/lookup data with
-- no direct FK-restricted dependents of its own beyond `competencies`, and
-- deletion is blocked in application code (has_dependents guard) exactly
-- like pillar/domain deletion already is, not left to the RESTRICT FK alone.
-- ============================================================================

BEGIN;

CREATE TABLE competency_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL UNIQUE,
  name_en TEXT,
  auto_apply_everywhere BOOLEAN NOT NULL DEFAULT false
);

COMMENT ON COLUMN competency_classifications.auto_apply_everywhere IS
  'When true, every competency of this classification is automatically listed/pre-populated for every job title and every employee (career-path job-title screens, the job-titles Excel import, employee competency scoring, 360 nomination) -- the exact behavior this schema previously hardcoded to competencies.type = ''core''. Admin-controllable per classification via /competencies, not tied to a fixed name.';

ALTER TABLE competency_classifications ENABLE ROW LEVEL SECURITY;

-- Same competencyFramework view/prepare/approve gate as competency_pillars/
-- competency_domains (20260716000006, migrated to check_vpra_global in
-- 20260719000011) -- a classification is exactly the same kind of
-- university-wide reference data.
CREATE POLICY competency_classifications_select ON competency_classifications FOR SELECT TO authenticated
  USING (check_vpra_global('competencyFramework'::process_area, 'view'::vpra_level));
CREATE POLICY competency_classifications_insert ON competency_classifications FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('competencyFramework'::process_area, 'prepare'::vpra_level));
CREATE POLICY competency_classifications_update ON competency_classifications FOR UPDATE TO authenticated
  USING (check_vpra_global('competencyFramework'::process_area, 'prepare'::vpra_level))
  WITH CHECK (check_vpra_global('competencyFramework'::process_area, 'prepare'::vpra_level));
CREATE POLICY competency_classifications_delete ON competency_classifications FOR DELETE TO authenticated
  USING (check_vpra_global('competencyFramework'::process_area, 'approve'::vpra_level));

-- Seed exactly the three classifications named in the request. "أساسية"
-- carries auto_apply_everywhere=true so the migration below is a pure
-- rename of the existing 'core' concept, not a behavior change; "تخصصية"
-- and the new "مؤسسية" both start false (admin can flip either later).
INSERT INTO competency_classifications (id, name_ar, name_en, auto_apply_everywhere) VALUES
  ('a1a1a1a1-0000-4000-8000-000000000001', 'أساسية', 'Core', true),
  ('a1a1a1a1-0000-4000-8000-000000000002', 'تخصصية', 'Specialized', false),
  ('a1a1a1a1-0000-4000-8000-000000000003', 'مؤسسية', 'Institutional', false);

-- ----------------------------------------------------------------------------
-- Migrate competencies.type -> competencies.classification_id, then drop the
-- old ENUM column and type entirely (no dual source of truth left behind).
-- ----------------------------------------------------------------------------

ALTER TABLE competencies ADD COLUMN classification_id UUID;

UPDATE competencies SET classification_id = 'a1a1a1a1-0000-4000-8000-000000000001' WHERE type = 'core';
UPDATE competencies SET classification_id = 'a1a1a1a1-0000-4000-8000-000000000002' WHERE type = 'specialized';

ALTER TABLE competencies ALTER COLUMN classification_id SET NOT NULL;
ALTER TABLE competencies
  ADD CONSTRAINT competencies_classification_id_fkey
  FOREIGN KEY (classification_id) REFERENCES competency_classifications (id) ON DELETE RESTRICT;

ALTER TABLE competencies DROP COLUMN type;
DROP TYPE competency_type;

COMMIT;

-- ----------------------------------------------------------------------------
-- Verification (run manually before/after in a real session, not part of the
-- transaction):
--
--   SELECT c.name_ar, cl.name_ar AS classification, cl.auto_apply_everywhere
--   FROM competencies c JOIN competency_classifications cl ON cl.id = c.classification_id
--   ORDER BY cl.name_ar, c.name_ar;
--   -- every one of the 27 seeded competencies should show either أساسية or
--   -- تخصصية, matching its original `type`, none NULL/مؤسسية.
--
--   SELECT count(*) FROM competencies WHERE classification_id IS NULL; -- 0
-- ----------------------------------------------------------------------------
