-- Initiative card: the three things the real cards carry and the app did not
-- (2026-08-20)
--
-- Source: the initiative decks the project owner supplied
-- ("مبادرات مركز القيم والسلوكيات المهنية", "مبادرات الاتصال وتقنية المعلومات").
-- Every other block on those cards already existed in the schema — code,
-- definition, goal chain, horizon, budget, owner, period, activities. These
-- three did not:
--
--   1. the BSC perspective strip (المالي / العميل / الداخلي / التعلم والتطوير)
--      printed across the top, with the initiative's own one highlighted;
--   2. "النتائج / المخرجات" — a short bulleted list, distinct from the single
--      `deliverable_ar` headline already stored;
--   3. "التبعية مع المبادرات الاخرى" — other initiatives this one depends on,
--      listed by code and name.
--
-- ---------------------------------------------------------------------------
-- 1) perspective — a lookup, not a free TEXT column
-- ---------------------------------------------------------------------------
-- Same shape and the same admin gate as `initiative_statuses`
-- (20260820000003): readable by every authenticated user, maintained under
-- systemSettings='approve'. The four values are fixed vocabulary from the
-- balanced-scorecard strip on the real cards, not invented here.
CREATE TABLE initiative_perspectives (
  code TEXT PRIMARY KEY,
  label_ar TEXT NOT NULL,
  label_en TEXT,
  display_order INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE initiative_perspectives ENABLE ROW LEVEL SECURITY;

CREATE POLICY initiative_perspectives_select ON initiative_perspectives FOR SELECT TO authenticated
  USING (true);

CREATE POLICY initiative_perspectives_insert ON initiative_perspectives FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('systemSettings', 'approve'));

CREATE POLICY initiative_perspectives_update ON initiative_perspectives FOR UPDATE TO authenticated
  USING (check_vpra_global('systemSettings', 'approve'))
  WITH CHECK (check_vpra_global('systemSettings', 'approve'));

INSERT INTO initiative_perspectives (code, label_ar, label_en, display_order) VALUES
  ('financial', 'المالي', 'Financial', 1),
  ('customer', 'العميل', 'Customer', 2),
  ('internal', 'الداخلي', 'Internal', 3),
  ('learning', 'التعلم والتطوير', 'Learning & Growth', 4);

-- NULLABLE: the perspective is a classification the owner makes, and an
-- initiative recorded before this column existed genuinely has none. A default
-- would silently file every existing initiative under one perspective.
ALTER TABLE strategic_initiatives
  ADD COLUMN perspective_code TEXT REFERENCES initiative_perspectives(code) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- 2) outcomes — one TEXT, one line per outcome
-- ---------------------------------------------------------------------------
-- A child table was considered and rejected: the cards show a short bullet
-- list with no per-item data of its own (no owner, no date, no status), so
-- rows would buy ordering and nothing else while costing a join everywhere the
-- card is drawn. Line breaks carry the bullets; the UI splits on them.
ALTER TABLE strategic_initiatives
  ADD COLUMN outcomes_ar TEXT;

COMMENT ON COLUMN strategic_initiatives.outcomes_ar IS
  'النتائج / المخرجات — one outcome per line. Distinct from deliverable_ar, which is the single headline deliverable.';

-- ---------------------------------------------------------------------------
-- 3) dependencies between initiatives
-- ---------------------------------------------------------------------------
CREATE TABLE initiative_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id UUID NOT NULL REFERENCES strategic_initiatives(id) ON DELETE CASCADE,
  depends_on_initiative_id UUID NOT NULL REFERENCES strategic_initiatives(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT initiative_dependencies_not_self CHECK (initiative_id <> depends_on_initiative_id)
);

-- Partial, like every other uniqueness in this schema: a soft-deleted row must
-- not block the same pair being recorded again.
CREATE UNIQUE INDEX initiative_dependencies_pair_uidx
  ON initiative_dependencies (initiative_id, depends_on_initiative_id)
  WHERE deleted_at IS NULL;

CREATE INDEX initiative_dependencies_initiative_idx ON initiative_dependencies (initiative_id);

ALTER TABLE initiative_dependencies ENABLE ROW LEVEL SECURITY;

-- A dependency row is visible exactly when the initiative it belongs to is:
-- re-deriving strategic_initiatives_select's condition here would be a second
-- copy to keep in sync (the same reasoning as
-- strategic_initiative_targets_select, 20260819000001).
CREATE POLICY initiative_dependencies_select ON initiative_dependencies FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM strategic_initiatives i
      WHERE i.id = initiative_dependencies.initiative_id AND i.deleted_at IS NULL
    )
  );

CREATE POLICY initiative_dependencies_insert ON initiative_dependencies FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

CREATE POLICY initiative_dependencies_update ON initiative_dependencies FOR UPDATE TO authenticated
  USING (check_vpra_global('strategicPlanning', 'approve'))
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

-- No DELETE policy: soft-delete via deleted_at only (CLAUDE.md §5-A rule 7),
-- same as every other table in this module.
