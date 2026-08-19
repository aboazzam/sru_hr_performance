-- ============================================================================
-- إسناد المبادرات للإدارات والكليات (initiative assignments)
--
-- Requested 2026-08-19, with the open questions answered directly 2026-08-20:
--   * "الاسناد بالوحدات الادارية او مكتب كرئيس الجامعة ومكتب نائب الرئيس
--     ومكتب النائب المساعد"  -> assignment targets `org_units`, the 58-row
--     tree that already holds both departments/colleges AND those offices —
--     NOT org_structure_positions (which the strategic cascade uses).
--   * "نعم يجب ان يبلغ نسب الادارات المسندة 100% والداعمة بلا نسبة"
--     -> lead + participant percentages must total exactly 100 per
--        initiative; supporters carry no percentage at all.
--
-- Three roles, matching the wording of the request ("مسند إليها بشكل أساسي"
-- / "الإدارات المشاركة" / "الإدارات الداعمة الأخرى"):
--   lead        — the unit primarily responsible          (percentage required)
--   participant — a unit sharing execution                (percentage required)
--   supporter   — a unit that supports without a share    (percentage MUST be NULL)
--
-- ---------------------------------------------------------------------------
-- WHY THE 100% RULE IS AN RPC AND NOT A CHECK CONSTRAINT
-- ---------------------------------------------------------------------------
-- The rule spans ROWS, so a CHECK cannot express it, and a plain row-level
-- trigger would make the set impossible to build incrementally (adding the
-- first unit at 60% would fail before the second at 40% exists).
-- `save_initiative_assignments()` therefore replaces an initiative's whole
-- assignment set in ONE statement/transaction and validates the total there
-- — the same whole-form save shape already used by saveEvaluationScores and
-- saveCalibrationResults, but with the invariant enforced in Postgres rather
-- than only in the Server Action.
--
-- It is SECURITY INVOKER (the default) on purpose: RLS still applies to
-- every row it writes, so the function grants no privilege of its own.
-- ============================================================================

CREATE TABLE initiative_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id UUID NOT NULL REFERENCES strategic_initiatives(id) ON DELETE CASCADE,
  org_unit_id UUID NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
  role TEXT NOT NULL,
  -- NULL for supporters, required (0 < p <= 100) for lead/participant.
  percentage NUMERIC(5,2),
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT initiative_assignments_role_valid CHECK (role IN ('lead', 'participant', 'supporter')),
  CONSTRAINT initiative_assignments_percentage_valid CHECK (
    (role = 'supporter' AND percentage IS NULL)
    OR (role IN ('lead', 'participant') AND percentage IS NOT NULL AND percentage > 0 AND percentage <= 100)
  )
);

COMMENT ON TABLE initiative_assignments IS 'إسناد المبادرة لوحدات تنظيمية: مسؤولة/مشاركة بنسب مجموعها 100%، وداعمة بلا نسبة.';

-- One row per (initiative, unit) among live rows — partial, so a
-- soft-deleted assignment never blocks re-assigning the same unit later.
CREATE UNIQUE INDEX initiative_assignments_unit_uidx
  ON initiative_assignments (initiative_id, org_unit_id)
  WHERE deleted_at IS NULL;

-- At most one lead per initiative.
CREATE UNIQUE INDEX initiative_assignments_single_lead_uidx
  ON initiative_assignments (initiative_id)
  WHERE role = 'lead' AND deleted_at IS NULL;

CREATE INDEX initiative_assignments_initiative_idx
  ON initiative_assignments (initiative_id) WHERE deleted_at IS NULL;

ALTER TABLE initiative_assignments ENABLE ROW LEVEL SECURITY;

-- Readable by anyone who can read the initiative itself: re-deriving the
-- condition here would be a second copy to keep in sync, and the initiative
-- policy already covers the module grant, the owning position, and program
-- committee membership (20260819000001 / 20260819000003).
CREATE POLICY initiative_assignments_select ON initiative_assignments FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM strategic_initiatives i WHERE i.id = initiative_assignments.initiative_id)
  );

CREATE POLICY initiative_assignments_insert ON initiative_assignments FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

CREATE POLICY initiative_assignments_update ON initiative_assignments FOR UPDATE TO authenticated
  USING (check_vpra_global('strategicPlanning', 'approve'))
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

-- No DELETE policy: soft-delete only (CLAUDE.md §5-A rule 7).

-- ---------------------------------------------------------------------------
-- Whole-set save with the 100% invariant
-- ---------------------------------------------------------------------------
-- p_rows: [{"org_unit_id": uuid, "role": "lead|participant|supporter",
--           "percentage": number|null, "notes": text|null}, ...]
-- An empty array clears the initiative's assignments (it becomes unassigned).
CREATE FUNCTION save_initiative_assignments(p_initiative_id UUID, p_rows JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC(7,2);
  v_leads INT;
  v_units INT;
  v_distinct_units INT;
  v_me UUID;
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  SELECT id INTO v_me FROM profiles WHERE auth_user_id = auth.uid();

  -- Validate the incoming set BEFORE touching anything, so a rejected save
  -- leaves the existing assignments exactly as they were.
  SELECT
    coalesce(sum(CASE WHEN r.role IN ('lead', 'participant') THEN r.percentage ELSE 0 END), 0),
    count(*) FILTER (WHERE r.role = 'lead'),
    count(*),
    count(DISTINCT r.org_unit_id)
  INTO v_total, v_leads, v_units, v_distinct_units
  FROM jsonb_to_recordset(p_rows) AS r(org_unit_id UUID, role TEXT, percentage NUMERIC, notes TEXT);

  IF v_units > 0 THEN
    IF v_units <> v_distinct_units THEN
      RAISE EXCEPTION 'duplicate org unit in assignment set';
    END IF;
    IF v_leads <> 1 THEN
      RAISE EXCEPTION 'exactly one lead unit is required, got %', v_leads;
    END IF;
    -- The confirmed rule: lead + participants must total exactly 100.
    IF v_total <> 100 THEN
      RAISE EXCEPTION 'assigned percentages must total 100, got %', v_total;
    END IF;
  END IF;

  -- Replace the whole set. UPDATE (not DELETE) because these tables are
  -- soft-delete only, and this runs under the caller's own RLS, so a caller
  -- without strategicPlanning='approve' silently affects zero rows here and
  -- is then rejected by the INSERT policy below.
  UPDATE initiative_assignments
     SET deleted_at = now()
   WHERE initiative_id = p_initiative_id
     AND deleted_at IS NULL;

  INSERT INTO initiative_assignments (initiative_id, org_unit_id, role, percentage, notes, created_by)
  SELECT p_initiative_id, r.org_unit_id, r.role, r.percentage, r.notes, v_me
    FROM jsonb_to_recordset(p_rows) AS r(org_unit_id UUID, role TEXT, percentage NUMERIC, notes TEXT);
END;
$$;

COMMENT ON FUNCTION save_initiative_assignments IS 'يستبدل مجموعة إسنادات المبادرة كاملةً في معاملة واحدة، ويتحقق أن مجموع نسب المسؤولة والمشاركة = 100% وأن هناك جهة مسؤولة واحدة. SECURITY INVOKER: RLS تبقى هي البوابة.';

REVOKE EXECUTE ON FUNCTION save_initiative_assignments(UUID, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION save_initiative_assignments(UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION save_initiative_assignments(UUID, JSONB) TO authenticated;
