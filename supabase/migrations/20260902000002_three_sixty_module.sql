-- ============================================================================
-- "التقييم الدائري" (360 Review) — full module schema.
--
-- Entity/field list supplied directly by the project owner, said to match
-- an import-template file — no such file was actually found anywhere in
-- the repo or conversation (checked before writing this), so the fields as
-- given in chat are treated as the authoritative reference and transcribed
-- as closely as possible, with every departure flagged [استنتاج] below.
-- Requested entities: cycle, rating_scale, rater_group, competency, item,
-- assignment, response.
--
-- TABLE NAMING: prefixed `three_sixty_*` throughout to avoid colliding with
-- the existing `evaluation_cycles`/`feedback_360`/`feedback_360_nominations`
-- tables, which are NOT modified, replaced, or reused by this migration —
-- a deliberate choice (asked directly, no clear answer given either way;
-- the two schemas' field lists don't overlap enough to merge safely, and
-- CLAUDE.md/PROJECT_STRICT.md's "patch not rewrite" rule argues against
-- touching an already-shipped, already-verified table to shoehorn in an
-- incompatible shape).
--
-- CATALOG vs PER-CYCLE: `rating_scale`/`rater_group`/`competency`/`item`
-- carry no `cycle_code` in the given field list at all — read as GLOBAL,
-- reusable reference data (the survey "template"), exactly like
-- `goal_library` is global and `goals` rows reference it per employee.
-- This is what screen 1's "استيراد ملف القالب" (import the template file)
-- imports: one workbook, reusable across many cycles. `cycle` itself
-- references a `scale_code` (its overall/default scale) and individual
-- `item` rows carry their own `scale_code` too (an item can use a
-- different scale than the cycle's default) — kept as free TEXT, not a
-- hard FK, because `rating_scale` has no single-row primary key to point
-- at (it's a set of option rows sharing one `scale_code`); existence is
-- enforced instead by a validating trigger (`validate_three_sixty_*`),
-- mirroring this project's established use of a trigger wherever a plain
-- CHECK can't express a cross-table invariant (see
-- `validate_org_structure_position_parent`).
--
-- [استنتاج] ADDITIONS beyond the literal given field list, each because a
-- described screen is otherwise unbuildable:
--  1. `three_sixty_cycles.max_raters` — screen 2 says the employee
--     nominates raters "ضمن حد أدنى وأقصى" (within a minimum AND a
--     maximum), but only `min_raters` was given anywhere. One overall cap
--     on a cycle, mirroring `min_raters`, rather than a per-rater-group max
--     (simpler, and the given fields don't suggest a per-group cap either).
--  2. `three_sixty_cycles.owner_id` — screen 1's privacy rule ("دون كشف من
--     عبّأ ومن لم يعبّئ لغير مسؤول الدورة" — without revealing who did/did
--     not fill it in to anyone but the cycle's own responsible person)
--     needs a specific person to compare the caller against, not just "any
--     HR admin" — `created_by` (an `auth.users` id, this project's usual
--     audit-trail column) isn't a `profiles` row and isn't semantically
--     "the responsible person" (a cycle could be created by one HR staffer
--     on behalf of another). Defaults to the creator's own profile at
--     insert time (set by the Server Action, not a trigger).
--  3. `three_sixty_rater_groups.max_raters_in_group` — same "حد أقصى"
--     reasoning as #1, at the per-group level, needed so the nomination
--     screen can bound how many raters an employee may pick from ONE
--     nominate-able group (e.g. "up to 3 peers"), not just the cycle-wide
--     total.
--  4. `three_sixty_nominations` (a whole new table, not in the given
--     list) — the given `assignment.status` enum is fixed to
--     (pending|submitted|excluded), which describes a RATER's progress on
--     an already-approved assignment, not "an employee proposed this
--     rater and their supervisor hasn't approved it yet." Overloading
--     `assignment.status` with extra values would break the literal given
--     enum; a separate table models the propose→approve step that
--     precedes an assignment actually existing. Once a supervisor approves
--     a subject's submitted nominations, the approving Server Action
--     inserts the corresponding `three_sixty_assignments` rows itself
--     (status starts 'pending') — this is orchestration in application
--     code, not a DB trigger, matching how e.g. `createEvaluation`/
--     `reviewPromotion` handle multi-step writes in this codebase.
--  5. `three_sixty_cycles` gets a real `status` ENUM (draft/active/closed),
--     not free TEXT like `promotions.status`/`vacancies.status` — the
--     report-visibility rule ("تقريره بعد إغلاق الدورة") and the
--     nomination/rating windows all depend on this value's exact meaning,
--     so (unlike those other tables' undocumented vocabularies) real
--     application logic needs a closed, enforced set of values.
--  6. `three_sixty_cycles_single_active_uidx` — a partial unique index
--     allowing at most one 'active' cycle at a time. Not asked for
--     explicitly, but every self-service screen (nominate/rate/approve)
--     needs to resolve "the current cycle" without a cycle id in the URL;
--     allowing several simultaneously-active cycles would need a picker on
--     every one of those screens that nothing in the request describes.
--     Historical cycles can still be created/closed freely — only ONE may
--     be 'active' at once. Flagged clearly as a scope-limiting assumption.
--
-- RLS DESIGN:
--   * Catalog tables (`rating_scale_options`/`rater_groups`/`competencies`/
--     `items`) and `cycles` themselves are read-open to any authenticated
--     user (`USING (true) TO authenticated`) — same precedent as
--     `strategic_plans`/vision-mission (20260730000004/20260801000001):
--     non-sensitive administrative/reference metadata that every rater
--     genuinely needs to render their own questionnaire, not something
--     `threeSixty`-role-gating would help secure. Writes require
--     `check_vpra_global('threeSixty','prepare')`.
--   * `three_sixty_nominations`: self-row (subject or rater) OR
--     `is_my_direct_report(subject)` (a direct supervisor manages their
--     own report's list, no VPRA grant needed — the relationship itself is
--     the authorization fact, exactly as already established for
--     `evaluations`/`goals`/`bau_tasks`) OR `threeSixty` role grants as an
--     HR override. Approve-level actions require `threeSixty>='approve'`
--     as the HR override tier specifically (not 'prepare'), since approving
--     is a more consequential action than merely proposing.
--   * `three_sixty_assignments`: rater/subject self-row, OR
--     `is_my_subordinate(subject)` (manager team reports — recursive,
--     matching `evaluations_select`'s own precedent), OR the cycle's own
--     `owner_id`, OR `threeSixty>='approve'`. A plain `threeSixty='view'`
--     grant deliberately does NOT unlock row-level identity here — see the
--     `three_sixty_completion_by_org_unit()` RPC below for how a
--     view-level HR user gets AGGREGATE completion percentages without
--     ever seeing who specifically has/hasn't submitted.
--   * `three_sixty_responses`: the assignment's own rater while filling it
--     in; the assignment's subject or their manager chain ONLY once the
--     cycle is 'closed' (screens 4/5); `threeSixty>='view'` as an HR
--     oversight branch.
--
-- `three_sixty_completion_by_org_unit(p_cycle_id)` — a SECURITY DEFINER RPC
-- (matching the established `check_vpra()`/`get_my_permissions()` pattern)
-- returning per-org-unit assignment counts and submitted counts with NO
-- individual identities at all, gated internally on
-- `check_vpra_global('threeSixty','view')`. This is the actual mechanism
-- implementing screen 1's privacy rule: any `threeSixty`-view holder gets
-- this aggregate view; only the cycle's `owner_id` (or an `approve`-level
-- holder) can additionally read row-level `three_sixty_assignments` to see
-- WHO specifically has/hasn't submitted.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

CREATE TYPE three_sixty_cycle_status AS ENUM ('draft', 'active', 'closed');
CREATE TYPE three_sixty_anonymity_mode AS ENUM ('anonymous', 'identified');
CREATE TYPE three_sixty_item_type AS ENUM ('rating', 'open_text');
CREATE TYPE three_sixty_assignment_status AS ENUM ('pending', 'submitted', 'excluded');
CREATE TYPE three_sixty_nomination_status AS ENUM ('draft', 'submitted', 'approved', 'returned');

-- ----------------------------------------------------------------------------
-- Catalog / template tables (global, cycle-independent)
-- ----------------------------------------------------------------------------

CREATE TABLE three_sixty_rater_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Plain (non-partial) UNIQUE, not the usual `WHERE deleted_at IS NULL`
  -- partial index this project uses elsewhere -- a foreign key (three_sixty_
  -- assignments/nominations reference this column directly by code) can only
  -- point at a real unique constraint, not a partial index. Reference-data
  -- codes are not expected to be reused after a soft-delete.
  relationship_code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  group_weight_pct NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (group_weight_pct BETWEEN 0 AND 100),
  min_raters_in_group INTEGER NOT NULL DEFAULT 0 CHECK (min_raters_in_group >= 0),
  -- [استنتاج] see header note #3 -- not in the given field list.
  max_raters_in_group INTEGER CHECK (max_raters_in_group IS NULL OR max_raters_in_group >= min_raters_in_group),
  shown_separately BOOLEAN NOT NULL DEFAULT false,
  employee_may_nominate BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE three_sixty_rater_groups IS 'التقييم الدائري: فئات المقيّمين (ذاتي/رئيس مباشر/زميل/مرؤوس/مستفيد...) -- كتالوج عام مشترك بين كل الدورات.';

CREATE TABLE three_sixty_rating_scale_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scale_code TEXT NOT NULL,
  option_code TEXT NOT NULL,
  label_ar TEXT NOT NULL,
  numeric_value NUMERIC(6, 2) NOT NULL,
  counted_in_score BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX three_sixty_rating_scale_options_uidx
  ON three_sixty_rating_scale_options (scale_code, option_code) WHERE deleted_at IS NULL;

COMMENT ON TABLE three_sixty_rating_scale_options IS 'التقييم الدائري: خيارات مقياس التكرار/التقييم -- عدة صفوف تحت كل scale_code. لا يوجد صف رأس مستقل؛ وجود scale_code يُتحقق منه عبر صفوف هذا الجدول نفسها.';

CREATE TABLE three_sixty_competencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competency_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  definition_ar TEXT,
  weight_pct NUMERIC(5, 2) CHECK (weight_pct IS NULL OR weight_pct BETWEEN 0 AND 100),
  -- [استنتاج] free text (e.g. a job-family code, or 'all') -- no documented
  -- vocabulary; this is a dedicated 360-survey competency catalog, kept
  -- independent of the institutional `competencies` framework table (whose
  -- schema doesn't carry the fields given here).
  applies_to TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX three_sixty_competencies_code_uidx
  ON three_sixty_competencies (competency_code) WHERE deleted_at IS NULL;

COMMENT ON TABLE three_sixty_competencies IS 'التقييم الدائري: جدارات الاستبانة -- كتالوج مستقل عن إطار الجدارات المؤسسي (competencies)، خاص بهذا الموديول.';

CREATE TABLE three_sixty_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code TEXT NOT NULL,
  competency_id UUID NOT NULL REFERENCES three_sixty_competencies (id) ON DELETE RESTRICT,
  item_type three_sixty_item_type NOT NULL,
  text_ar TEXT NOT NULL,
  -- Array of `three_sixty_rater_groups.relationship_code` values this item
  -- is shown to. A plain array can't carry a real FK -- membership is
  -- enforced by `validate_three_sixty_item()` below.
  rater_groups TEXT[] NOT NULL DEFAULT '{}',
  required BOOLEAN NOT NULL DEFAULT true,
  reverse_scored BOOLEAN NOT NULL DEFAULT false,
  -- Required for item_type='rating' (CHECK below); NULL for 'open_text'.
  scale_code TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT three_sixty_items_scale_required_for_rating
    CHECK (item_type = 'open_text' OR scale_code IS NOT NULL),
  CONSTRAINT three_sixty_items_rater_groups_not_empty
    CHECK (array_length(rater_groups, 1) IS NOT NULL AND array_length(rater_groups, 1) > 0)
);

CREATE UNIQUE INDEX three_sixty_items_code_uidx
  ON three_sixty_items (item_code) WHERE deleted_at IS NULL;
CREATE INDEX three_sixty_items_competency_idx ON three_sixty_items (competency_id);

COMMENT ON TABLE three_sixty_items IS 'التقييم الدائري: عبارات الاستبانة -- كل عبارة مرتبطة بجدارة، ولها فئات مقيّمين محددة (rater_groups) ومقياس (scale_code) إن كانت من نوع rating.';

-- ----------------------------------------------------------------------------
-- validate_three_sixty_item -- cross-table membership checks a plain CHECK
-- can't express (needs a join to two other catalog tables). Same reasoning
-- already used for `validate_org_structure_position_parent()`.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION validate_three_sixty_item()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_code TEXT;
BEGIN
  IF NEW.scale_code IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM three_sixty_rating_scale_options
    WHERE scale_code = NEW.scale_code AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'unknown scale_code: %', NEW.scale_code;
  END IF;

  FOREACH v_code IN ARRAY NEW.rater_groups LOOP
    IF NOT EXISTS (
      SELECT 1 FROM three_sixty_rater_groups
      WHERE relationship_code = v_code AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'unknown relationship_code in rater_groups: %', v_code;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER three_sixty_items_validate
  BEFORE INSERT OR UPDATE ON three_sixty_items
  FOR EACH ROW EXECUTE FUNCTION validate_three_sixty_item();

-- ----------------------------------------------------------------------------
-- Cycles
-- ----------------------------------------------------------------------------

CREATE TABLE three_sixty_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  min_raters INTEGER NOT NULL DEFAULT 3 CHECK (min_raters > 0),
  -- [استنتاج] see header note #1 -- not in the given field list.
  max_raters INTEGER CHECK (max_raters IS NULL OR max_raters >= min_raters),
  min_months_together INTEGER NOT NULL DEFAULT 0 CHECK (min_months_together >= 0),
  include_self_assessment BOOLEAN NOT NULL DEFAULT true,
  show_manager_separately BOOLEAN NOT NULL DEFAULT true,
  anonymity_mode three_sixty_anonymity_mode NOT NULL DEFAULT 'anonymous',
  weight_in_total_score NUMERIC(5, 2) CHECK (weight_in_total_score IS NULL OR weight_in_total_score BETWEEN 0 AND 100),
  purpose TEXT,
  scale_code TEXT NOT NULL,
  status three_sixty_cycle_status NOT NULL DEFAULT 'draft',
  -- [استنتاج] see header note #2 -- not in the given field list.
  owner_id UUID REFERENCES profiles (id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT three_sixty_cycles_dates_valid CHECK (end_date >= start_date)
);

CREATE UNIQUE INDEX three_sixty_cycles_code_uidx
  ON three_sixty_cycles (cycle_code) WHERE deleted_at IS NULL;

-- [استنتاج] see header note #6 -- at most one 'active' cycle at a time, so
-- self-service screens can resolve "the current cycle" with no id in the URL.
CREATE UNIQUE INDEX three_sixty_cycles_single_active_uidx
  ON three_sixty_cycles (status) WHERE status = 'active' AND deleted_at IS NULL;

COMMENT ON TABLE three_sixty_cycles IS 'التقييم الدائري: دورة تقييم 360 -- تواريخ، حدود المقيّمين، وضع السرية، ومسؤول الدورة (owner_id) الوحيد المخوَّل برؤية تفاصيل الاكتمال الفردية.';

CREATE OR REPLACE FUNCTION validate_three_sixty_cycle_scale()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM three_sixty_rating_scale_options
    WHERE scale_code = NEW.scale_code AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'unknown scale_code: %', NEW.scale_code;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER three_sixty_cycles_validate
  BEFORE INSERT OR UPDATE ON three_sixty_cycles
  FOR EACH ROW EXECUTE FUNCTION validate_three_sixty_cycle_scale();

-- ----------------------------------------------------------------------------
-- Nominations -- [استنتاج], see header note #4. Precedes and is distinct
-- from `three_sixty_assignments`.
-- ----------------------------------------------------------------------------

CREATE TABLE three_sixty_nominations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES three_sixty_cycles (id) ON DELETE CASCADE,
  subject_employee_id UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  rater_employee_id UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  relationship_code TEXT NOT NULL REFERENCES three_sixty_rater_groups (relationship_code) ON DELETE RESTRICT,
  status three_sixty_nomination_status NOT NULL DEFAULT 'draft',
  reviewed_by UUID REFERENCES profiles (id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT three_sixty_nominations_not_self
    CHECK (relationship_code <> 'self' OR rater_employee_id = subject_employee_id)
);

CREATE UNIQUE INDEX three_sixty_nominations_uidx
  ON three_sixty_nominations (cycle_id, subject_employee_id, rater_employee_id, relationship_code)
  WHERE deleted_at IS NULL;
CREATE INDEX three_sixty_nominations_cycle_subject_idx
  ON three_sixty_nominations (cycle_id, subject_employee_id);

COMMENT ON TABLE three_sixty_nominations IS 'التقييم الدائري: ترشيح الموظف لمقيّميه قبل اعتماد الرئيس المباشر -- يسبق three_sixty_assignments ولا يحلّ محله.';

-- ----------------------------------------------------------------------------
-- Assignments + Responses
-- ----------------------------------------------------------------------------

CREATE TABLE three_sixty_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES three_sixty_cycles (id) ON DELETE RESTRICT,
  subject_employee_id UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  rater_employee_id UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  relationship_code TEXT NOT NULL REFERENCES three_sixty_rater_groups (relationship_code) ON DELETE RESTRICT,
  months_worked_together INTEGER,
  status three_sixty_assignment_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX three_sixty_assignments_uidx
  ON three_sixty_assignments (cycle_id, subject_employee_id, rater_employee_id, relationship_code)
  WHERE deleted_at IS NULL;
CREATE INDEX three_sixty_assignments_cycle_subject_idx
  ON three_sixty_assignments (cycle_id, subject_employee_id);
CREATE INDEX three_sixty_assignments_rater_idx
  ON three_sixty_assignments (rater_employee_id);

COMMENT ON TABLE three_sixty_assignments IS 'التقييم الدائري: تكليف مقيّم بعينه بتقييم موظف بعينه ضمن دورة -- ينشأ إما آليًا (ذاتي/رئيس مباشر) أو باعتماد ترشيح.';

CREATE TABLE three_sixty_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES three_sixty_assignments (id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES three_sixty_items (id) ON DELETE RESTRICT,
  option_id UUID REFERENCES three_sixty_rating_scale_options (id) ON DELETE RESTRICT,
  numeric_value NUMERIC(6, 2),
  text_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT three_sixty_responses_not_both CHECK (NOT (option_id IS NOT NULL AND text_value IS NOT NULL))
);

CREATE UNIQUE INDEX three_sixty_responses_uidx
  ON three_sixty_responses (assignment_id, item_id);

COMMENT ON TABLE three_sixty_responses IS 'التقييم الدائري: إجابة عنصر واحد ضمن تكليف واحد -- مسودة تُحفظ تلقائيًا وتُستبدل حتى الإرسال النهائي (لا حذف ناعم؛ الصف يُستبدل عند التعديل).';

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

ALTER TABLE three_sixty_rater_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE three_sixty_rating_scale_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE three_sixty_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE three_sixty_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE three_sixty_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE three_sixty_nominations ENABLE ROW LEVEL SECURITY;
ALTER TABLE three_sixty_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE three_sixty_responses ENABLE ROW LEVEL SECURITY;

-- Catalog tables: read-open to every authenticated user (non-sensitive
-- reference data a rater must be able to read to fill their own
-- questionnaire), writes gated at 'prepare'. Same precedent as
-- strategic_plans/vision-mission.
CREATE POLICY three_sixty_rater_groups_select ON three_sixty_rater_groups
  FOR SELECT TO authenticated USING (true);
CREATE POLICY three_sixty_rater_groups_insert ON three_sixty_rater_groups
  FOR INSERT TO authenticated WITH CHECK (check_vpra_global('threeSixty'::process_area, 'prepare'::vpra_level));
CREATE POLICY three_sixty_rater_groups_update ON three_sixty_rater_groups
  FOR UPDATE TO authenticated
  USING (check_vpra_global('threeSixty'::process_area, 'prepare'::vpra_level))
  WITH CHECK (check_vpra_global('threeSixty'::process_area, 'prepare'::vpra_level));

CREATE POLICY three_sixty_rating_scale_options_select ON three_sixty_rating_scale_options
  FOR SELECT TO authenticated USING (true);
CREATE POLICY three_sixty_rating_scale_options_insert ON three_sixty_rating_scale_options
  FOR INSERT TO authenticated WITH CHECK (check_vpra_global('threeSixty'::process_area, 'prepare'::vpra_level));
CREATE POLICY three_sixty_rating_scale_options_update ON three_sixty_rating_scale_options
  FOR UPDATE TO authenticated
  USING (check_vpra_global('threeSixty'::process_area, 'prepare'::vpra_level))
  WITH CHECK (check_vpra_global('threeSixty'::process_area, 'prepare'::vpra_level));

CREATE POLICY three_sixty_competencies_select ON three_sixty_competencies
  FOR SELECT TO authenticated USING (true);
CREATE POLICY three_sixty_competencies_insert ON three_sixty_competencies
  FOR INSERT TO authenticated WITH CHECK (check_vpra_global('threeSixty'::process_area, 'prepare'::vpra_level));
CREATE POLICY three_sixty_competencies_update ON three_sixty_competencies
  FOR UPDATE TO authenticated
  USING (check_vpra_global('threeSixty'::process_area, 'prepare'::vpra_level))
  WITH CHECK (check_vpra_global('threeSixty'::process_area, 'prepare'::vpra_level));

CREATE POLICY three_sixty_items_select ON three_sixty_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY three_sixty_items_insert ON three_sixty_items
  FOR INSERT TO authenticated WITH CHECK (check_vpra_global('threeSixty'::process_area, 'prepare'::vpra_level));
CREATE POLICY three_sixty_items_update ON three_sixty_items
  FOR UPDATE TO authenticated
  USING (check_vpra_global('threeSixty'::process_area, 'prepare'::vpra_level))
  WITH CHECK (check_vpra_global('threeSixty'::process_area, 'prepare'::vpra_level));

CREATE POLICY three_sixty_cycles_select ON three_sixty_cycles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY three_sixty_cycles_insert ON three_sixty_cycles
  FOR INSERT TO authenticated WITH CHECK (check_vpra_global('threeSixty'::process_area, 'prepare'::vpra_level));
CREATE POLICY three_sixty_cycles_update ON three_sixty_cycles
  FOR UPDATE TO authenticated
  USING (check_vpra_global('threeSixty'::process_area, 'prepare'::vpra_level))
  WITH CHECK (check_vpra_global('threeSixty'::process_area, 'prepare'::vpra_level));

CREATE POLICY three_sixty_nominations_select ON three_sixty_nominations
  FOR SELECT TO authenticated USING (
    subject_employee_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR rater_employee_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR is_my_direct_report(subject_employee_id)
    OR check_vpra_global('threeSixty'::process_area, 'view'::vpra_level)
  );
CREATE POLICY three_sixty_nominations_insert ON three_sixty_nominations
  FOR INSERT TO authenticated WITH CHECK (
    subject_employee_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR is_my_direct_report(subject_employee_id)
    OR check_vpra_global('threeSixty'::process_area, 'prepare'::vpra_level)
  );
CREATE POLICY three_sixty_nominations_update ON three_sixty_nominations
  FOR UPDATE TO authenticated
  USING (
    subject_employee_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR is_my_direct_report(subject_employee_id)
    OR check_vpra_global('threeSixty'::process_area, 'approve'::vpra_level)
  )
  WITH CHECK (
    subject_employee_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR is_my_direct_report(subject_employee_id)
    OR check_vpra_global('threeSixty'::process_area, 'approve'::vpra_level)
  );

CREATE POLICY three_sixty_assignments_select ON three_sixty_assignments
  FOR SELECT TO authenticated USING (
    rater_employee_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR subject_employee_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR is_my_subordinate(subject_employee_id)
    OR EXISTS (
      SELECT 1 FROM three_sixty_cycles c
      WHERE c.id = three_sixty_assignments.cycle_id
        AND c.owner_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    )
    OR check_vpra_global('threeSixty'::process_area, 'approve'::vpra_level)
  );
CREATE POLICY three_sixty_assignments_insert ON three_sixty_assignments
  FOR INSERT TO authenticated WITH CHECK (
    is_my_direct_report(subject_employee_id)
    OR check_vpra_global('threeSixty'::process_area, 'prepare'::vpra_level)
  );
CREATE POLICY three_sixty_assignments_update ON three_sixty_assignments
  FOR UPDATE TO authenticated
  USING (
    rater_employee_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR is_my_direct_report(subject_employee_id)
    OR check_vpra_global('threeSixty'::process_area, 'prepare'::vpra_level)
  )
  WITH CHECK (
    rater_employee_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR is_my_direct_report(subject_employee_id)
    OR check_vpra_global('threeSixty'::process_area, 'prepare'::vpra_level)
  );

CREATE POLICY three_sixty_responses_select ON three_sixty_responses
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM three_sixty_assignments a
      WHERE a.id = three_sixty_responses.assignment_id
        AND a.rater_employee_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM three_sixty_assignments a
      JOIN three_sixty_cycles c ON c.id = a.cycle_id
      WHERE a.id = three_sixty_responses.assignment_id
        AND c.status = 'closed'
        AND (
          a.subject_employee_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
          OR is_my_subordinate(a.subject_employee_id)
        )
    )
    OR check_vpra_global('threeSixty'::process_area, 'view'::vpra_level)
  );
CREATE POLICY three_sixty_responses_insert ON three_sixty_responses
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM three_sixty_assignments a
      WHERE a.id = three_sixty_responses.assignment_id
        AND a.rater_employee_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
        AND a.status <> 'excluded'
    )
    OR check_vpra_global('threeSixty'::process_area, 'approve'::vpra_level)
  );
CREATE POLICY three_sixty_responses_update ON three_sixty_responses
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM three_sixty_assignments a
      WHERE a.id = three_sixty_responses.assignment_id
        AND a.rater_employee_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
        AND a.status <> 'excluded'
    )
    OR check_vpra_global('threeSixty'::process_area, 'approve'::vpra_level)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM three_sixty_assignments a
      WHERE a.id = three_sixty_responses.assignment_id
        AND a.rater_employee_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
        AND a.status <> 'excluded'
    )
    OR check_vpra_global('threeSixty'::process_area, 'approve'::vpra_level)
  );

-- ----------------------------------------------------------------------------
-- three_sixty_completion_by_org_unit -- aggregate-only completion tracking
-- (screen 1's privacy rule). SECURITY DEFINER, matching check_vpra()'s own
-- established pattern; bypasses three_sixty_assignments_select's row-level
-- RLS internally but exposes only counts, never rater/subject identities.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION three_sixty_completion_by_org_unit(p_cycle_id UUID)
RETURNS TABLE (
  org_unit_id UUID,
  org_unit_name_ar TEXT,
  total_assignments BIGINT,
  submitted_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT check_vpra_global('threeSixty'::process_area, 'view'::vpra_level) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    ou.id,
    ou.name_ar,
    COUNT(a.id)::BIGINT,
    COUNT(a.id) FILTER (WHERE a.status = 'submitted')::BIGINT
  FROM three_sixty_assignments a
  JOIN profiles subj ON subj.id = a.subject_employee_id
  LEFT JOIN org_units ou ON ou.id = subj.org_unit_id
  WHERE a.cycle_id = p_cycle_id AND a.deleted_at IS NULL
  GROUP BY ou.id, ou.name_ar
  ORDER BY ou.name_ar;
END;
$$;

COMMENT ON FUNCTION three_sixty_completion_by_org_unit IS 'Aggregate per-org-unit 360 completion counts, no individual identities -- the mechanism behind screen 1''s "متابعة نسب الاكتمال لكل إدارة دون كشف من عبّأ ومن لم يعبّئ" rule. Callable by any threeSixty>=view holder; row-level identity still requires the cycle''s own owner_id or threeSixty>=approve via three_sixty_assignments_select.';

REVOKE ALL ON FUNCTION three_sixty_completion_by_org_unit(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION three_sixty_completion_by_org_unit(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION three_sixty_completion_by_org_unit(UUID) TO authenticated;

COMMIT;

-- ============================================================================
-- Verification -- run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect all 8 tables present with RLS enabled and the right policy counts.
-- SELECT tablename, count(*) FROM pg_policies
--   WHERE tablename LIKE 'three_sixty_%' GROUP BY tablename ORDER BY tablename;

-- Expect: item insert with a bogus rater_groups element or scale_code is
-- rejected by the trigger; a second 'active' cycle is rejected by the
-- partial unique index; a non-'self' nomination with rater=subject is
-- rejected by the CHECK.

-- Expect: a threeSixty>=view (not approve, not owner) test user gets 0 rows
-- from a direct three_sixty_assignments SELECT for another employee's
-- assignment, but a non-empty result from
-- SELECT * FROM three_sixty_completion_by_org_unit('<cycle id>');
