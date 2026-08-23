-- ============================================================================
-- إسقاط مستهدفات الخطة على الجهات ثم على الموظفين
--
-- Requested 2026-08-23: "نحتاج تظهر جميع مستهدفات الخطة الاستراتيجية لكامل
-- الخطة ثم يختار من عنده الصلاحية المستهدف منها لهذا العام ... وفيه الإسناد
-- للإدارة وبالإمكان الإسناد لأكثر من إدارة على النسب ومن ثم إسنادها للموظف
-- من قبل مدير الإدارة وكذلك بالنسب".
--
-- ---------------------------------------------------------------------------
-- WHY NOT REUSE `targets`
-- ---------------------------------------------------------------------------
-- `targets` (20260727000005) already cascades — parent_target_id, weight, and
-- an assignee — but its assignee is a POSITION or an EMPLOYEE, never an org
-- unit, and the first hop asked for here is exactly "college / department".
-- It also hangs off `cycle_id NOT NULL`, and production has ZERO evaluation
-- cycles, so anything anchored there would ship unusable. These tables anchor
-- to the EXECUTIVE PLAN instead — which is what "this year" means in the
-- request — and leave `targets` untouched for the position/employee cascade
-- it already models.
--
-- ---------------------------------------------------------------------------
-- THE THREE LEVELS
-- ---------------------------------------------------------------------------
--   executive_plan_targets            — which strategic KPI is being pursued
--                                       in this plan's year, and its value
--   executive_plan_target_org_units   — the split across colleges/departments
--   executive_plan_target_employees   — the department's own split across its
--                                       staff (UI lands in the next slice)
--
-- Percentages are validated in ONE transaction per level by the two RPCs at
-- the bottom, mirroring save_initiative_assignments() exactly: validate the
-- whole incoming set first, so a rejected save leaves the existing rows
-- untouched. Both are SECURITY INVOKER — RLS stays the gate, the functions
-- grant nothing.
--
-- ---------------------------------------------------------------------------
-- WHO MAY WRITE WHAT  [قرار مؤكَّد من مالك المشروع 2026-08-23]
-- ---------------------------------------------------------------------------
-- Choosing the year's targets and splitting them across units:
--   check_vpra_global('strategicPlanning', 'approve')  — strategy admin.
-- Splitting a unit's share across ITS OWN staff:
--   the same global approve, OR check_vpra('strategicPlanning', 'prepare',
--   <that unit>) — the scoped form, so a dean/manager whose role is scoped to
--   their college/department can assign inside it and nowhere else. This is
--   the first scoped write in the strategy module; every other policy there
--   uses the global form, and it is deliberate rather than an oversight.
-- ============================================================================

CREATE TABLE executive_plan_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executive_plan_id UUID NOT NULL REFERENCES executive_plans(id) ON DELETE RESTRICT,
  strategic_kpi_id UUID NOT NULL REFERENCES strategic_kpis(id) ON DELETE RESTRICT,
  -- This year's target. Nullable because a KPI can be pulled into the year
  -- before its number is agreed; the plan-wide target still lives on
  -- strategic_kpis.plan_target_value and is shown beside it.
  target_value NUMERIC(14,2),
  actual_value NUMERIC(14,2),
  weight NUMERIC(5,2),
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT executive_plan_targets_weight_range CHECK (weight IS NULL OR (weight > 0 AND weight <= 100))
);

COMMENT ON TABLE executive_plan_targets IS 'مستهدفات الخطة الاستراتيجية المختارة لسنة خطة تنفيذية بعينها، بقيمتها لهذا العام.';

-- One row per (plan, KPI) among live rows — partial, so a soft-deleted
-- selection never blocks choosing the same KPI again later.
CREATE UNIQUE INDEX executive_plan_targets_uidx
  ON executive_plan_targets (executive_plan_id, strategic_kpi_id)
  WHERE deleted_at IS NULL;

CREATE INDEX executive_plan_targets_plan_idx
  ON executive_plan_targets (executive_plan_id) WHERE deleted_at IS NULL;

CREATE TABLE executive_plan_target_org_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executive_plan_target_id UUID NOT NULL REFERENCES executive_plan_targets(id) ON DELETE CASCADE,
  org_unit_id UUID NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
  percentage NUMERIC(5,2) NOT NULL,
  -- What the unit itself reports. The share of the target VALUE is derived
  -- from `percentage` rather than stored, so the two can never disagree.
  actual_value NUMERIC(14,2),
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT executive_plan_target_org_units_percentage_valid
    CHECK (percentage > 0 AND percentage <= 100)
);

COMMENT ON TABLE executive_plan_target_org_units IS 'توزيع المستهدف على الكليات والإدارات بنسب مجموعها 100%.';

CREATE UNIQUE INDEX executive_plan_target_org_units_uidx
  ON executive_plan_target_org_units (executive_plan_target_id, org_unit_id)
  WHERE deleted_at IS NULL;

CREATE INDEX executive_plan_target_org_units_target_idx
  ON executive_plan_target_org_units (executive_plan_target_id) WHERE deleted_at IS NULL;

CREATE TABLE executive_plan_target_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_org_unit_id UUID NOT NULL REFERENCES executive_plan_target_org_units(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  -- A share of the UNIT's share, not of the whole target: a department that
  -- holds 40% and gives an employee 50% has given them 20% of the target.
  percentage NUMERIC(5,2) NOT NULL,
  actual_value NUMERIC(14,2),
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT executive_plan_target_employees_percentage_valid
    CHECK (percentage > 0 AND percentage <= 100)
);

COMMENT ON TABLE executive_plan_target_employees IS 'توزيع حصة الجهة من المستهدف على موظفيها بنسب مجموعها 100% من حصة الجهة.';

CREATE UNIQUE INDEX executive_plan_target_employees_uidx
  ON executive_plan_target_employees (target_org_unit_id, employee_id)
  WHERE deleted_at IS NULL;

CREATE INDEX executive_plan_target_employees_share_idx
  ON executive_plan_target_employees (target_org_unit_id) WHERE deleted_at IS NULL;

CREATE INDEX executive_plan_target_employees_employee_idx
  ON executive_plan_target_employees (employee_id) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
ALTER TABLE executive_plan_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE executive_plan_target_org_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE executive_plan_target_employees ENABLE ROW LEVEL SECURITY;

-- Readable by any authenticated user, like `executive_plans` itself
-- (20260820000001 / 20260801000001): what the university is aiming at this
-- year, and which department carries which share, is the plan everyone is
-- being asked to execute — not personal data.
CREATE POLICY executive_plan_targets_select ON executive_plan_targets FOR SELECT TO authenticated
  USING (true);

CREATE POLICY executive_plan_targets_insert ON executive_plan_targets FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

CREATE POLICY executive_plan_targets_update ON executive_plan_targets FOR UPDATE TO authenticated
  USING (check_vpra_global('strategicPlanning', 'approve'))
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

CREATE POLICY executive_plan_target_org_units_select ON executive_plan_target_org_units FOR SELECT TO authenticated
  USING (true);

CREATE POLICY executive_plan_target_org_units_insert ON executive_plan_target_org_units FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

CREATE POLICY executive_plan_target_org_units_update ON executive_plan_target_org_units FOR UPDATE TO authenticated
  USING (check_vpra_global('strategicPlanning', 'approve'))
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

-- The employee level is the one a dean/manager writes. `check_vpra` (scoped)
-- rather than `check_vpra_global`: a role scoped to one college/department
-- passes only for that unit's own share.
CREATE POLICY executive_plan_target_employees_select ON executive_plan_target_employees FOR SELECT TO authenticated
  USING (true);

CREATE POLICY executive_plan_target_employees_insert ON executive_plan_target_employees FOR INSERT TO authenticated
  WITH CHECK (
    check_vpra_global('strategicPlanning', 'approve')
    OR check_vpra(
      'strategicPlanning',
      'prepare',
      (SELECT u.org_unit_id FROM executive_plan_target_org_units u WHERE u.id = target_org_unit_id)
    )
  );

CREATE POLICY executive_plan_target_employees_update ON executive_plan_target_employees FOR UPDATE TO authenticated
  USING (
    check_vpra_global('strategicPlanning', 'approve')
    OR check_vpra(
      'strategicPlanning',
      'prepare',
      (SELECT u.org_unit_id FROM executive_plan_target_org_units u WHERE u.id = target_org_unit_id)
    )
  )
  WITH CHECK (
    check_vpra_global('strategicPlanning', 'approve')
    OR check_vpra(
      'strategicPlanning',
      'prepare',
      (SELECT u.org_unit_id FROM executive_plan_target_org_units u WHERE u.id = target_org_unit_id)
    )
  );

-- ----------------------------------------------------------------------------
-- Whole-set saves, validated in one transaction
-- ----------------------------------------------------------------------------
CREATE FUNCTION save_executive_plan_target_org_units(p_target_id UUID, p_rows JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC(7,2);
  v_rows INT;
  v_distinct INT;
  v_me UUID;
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  SELECT id INTO v_me FROM profiles WHERE auth_user_id = auth.uid();

  -- Validate BEFORE touching anything, so a rejected save leaves the existing
  -- split exactly as it was.
  SELECT coalesce(sum(r.percentage), 0), count(*), count(DISTINCT r.org_unit_id)
    INTO v_total, v_rows, v_distinct
    FROM jsonb_to_recordset(p_rows) AS r(org_unit_id UUID, percentage NUMERIC, notes TEXT);

  IF v_rows > 0 THEN
    IF v_rows <> v_distinct THEN
      RAISE EXCEPTION 'duplicate org unit in target assignment set';
    END IF;
    IF v_total <> 100 THEN
      RAISE EXCEPTION 'assigned percentages must total 100, got %', v_total;
    END IF;
  END IF;

  -- Soft-delete then re-insert: these tables never hard-delete, and this runs
  -- under the caller's own RLS, so an unauthorised caller updates zero rows
  -- here and is rejected by the INSERT policy below.
  UPDATE executive_plan_target_org_units
     SET deleted_at = now()
   WHERE executive_plan_target_id = p_target_id
     AND deleted_at IS NULL;

  INSERT INTO executive_plan_target_org_units (executive_plan_target_id, org_unit_id, percentage, notes, created_by)
  SELECT p_target_id, r.org_unit_id, r.percentage, r.notes, v_me
    FROM jsonb_to_recordset(p_rows) AS r(org_unit_id UUID, percentage NUMERIC, notes TEXT);
END;
$$;

COMMENT ON FUNCTION save_executive_plan_target_org_units IS 'يستبدل توزيع المستهدف على الجهات كاملًا في معاملة واحدة، ويتحقق أن مجموع النسب = 100%. SECURITY INVOKER: RLS تبقى هي البوابة.';

REVOKE EXECUTE ON FUNCTION save_executive_plan_target_org_units(UUID, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION save_executive_plan_target_org_units(UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION save_executive_plan_target_org_units(UUID, JSONB) TO authenticated;

CREATE FUNCTION save_executive_plan_target_employees(p_share_id UUID, p_rows JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC(7,2);
  v_rows INT;
  v_distinct INT;
  v_me UUID;
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  SELECT id INTO v_me FROM profiles WHERE auth_user_id = auth.uid();

  SELECT coalesce(sum(r.percentage), 0), count(*), count(DISTINCT r.employee_id)
    INTO v_total, v_rows, v_distinct
    FROM jsonb_to_recordset(p_rows) AS r(employee_id UUID, percentage NUMERIC, notes TEXT);

  IF v_rows > 0 THEN
    IF v_rows <> v_distinct THEN
      RAISE EXCEPTION 'duplicate employee in target assignment set';
    END IF;
    -- 100% OF THE UNIT'S SHARE, not of the whole target.
    IF v_total <> 100 THEN
      RAISE EXCEPTION 'assigned percentages must total 100 of the unit share, got %', v_total;
    END IF;
  END IF;

  UPDATE executive_plan_target_employees
     SET deleted_at = now()
   WHERE target_org_unit_id = p_share_id
     AND deleted_at IS NULL;

  INSERT INTO executive_plan_target_employees (target_org_unit_id, employee_id, percentage, notes, created_by)
  SELECT p_share_id, r.employee_id, r.percentage, r.notes, v_me
    FROM jsonb_to_recordset(p_rows) AS r(employee_id UUID, percentage NUMERIC, notes TEXT);
END;
$$;

COMMENT ON FUNCTION save_executive_plan_target_employees IS 'يستبدل توزيع حصة الجهة على موظفيها كاملًا في معاملة واحدة، ويتحقق أن مجموع النسب = 100% من حصة الجهة. SECURITY INVOKER.';

REVOKE EXECUTE ON FUNCTION save_executive_plan_target_employees(UUID, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION save_executive_plan_target_employees(UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION save_executive_plan_target_employees(UUID, JSONB) TO authenticated;
