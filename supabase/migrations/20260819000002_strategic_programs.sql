-- ============================================================================
-- برامج الاستراتيجية (strategic programs)
--
-- Requested 2026-08-19: "ثم تضيف تاب بعنوان برامج الاستراتيجية بحيث أستطيع
-- أنشئ برنامجا وأضيف إليه المبادرات المناسبة من قائمة المبادرات ويكون هناك
-- لجنة مسؤول عن إدارة هذا البرنامج بحيث يكون لكل عضو في اللجنة أكسس على
-- معلومات البرنامج وسير التقدم".
--
-- A program groups initiatives (20260819000001) that already serve the
-- plan's targets, and is run by a committee. Three tables:
--   strategic_programs                  — the program itself, per plan
--   strategic_program_initiatives       — which initiatives it contains
--   strategic_program_committee_members — who runs it
--
-- ---------------------------------------------------------------------------
-- COMMITTEE MEMBERS ARE PEOPLE, NOT POSITIONS  [استنتاج]
-- ---------------------------------------------------------------------------
-- The request ties access to the individual ("لكل عضو في اللجنة أكسس"), and
-- access is ultimately per auth user, so membership points at `profiles`.
-- Positions were the alternative (initiatives/sub-goals own by position via
-- is_my_strategic_position) — rejected here because a committee is a named
-- group of individuals drawn from different units, not a seat in the org
-- chart. `committee_role` is free TEXT (رئيس اللجنة / مقرر / عضو) with no
-- enum, since no vocabulary is documented — same precedent as every other
-- status column in this schema.
--
-- MEMBERSHIP ITSELF GRANTS READ ACCESS, with no strategicPlanning grant
-- needed: that is the explicit ask. It is read-only — a member sees the
-- program, its initiatives and its committee, but managing any of them
-- still requires strategicPlanning='approve'. Granting members write access
-- was NOT requested and is not inferred.
--
-- is_program_committee_member() must be SECURITY DEFINER: the committee
-- table's own SELECT policy asks "am I a member of this program?", which
-- would otherwise re-enter that same policy and recurse.
-- ============================================================================

CREATE TABLE strategic_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES strategic_plans(id) ON DELETE RESTRICT,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  description_ar TEXT,
  description_en TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'planned',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT strategic_programs_dates_valid CHECK (
    start_date IS NULL OR end_date IS NULL OR end_date >= start_date
  )
);

COMMENT ON TABLE strategic_programs IS 'برنامج استراتيجي يجمع عدة مبادرات وتديره لجنة.';

CREATE INDEX strategic_programs_plan_idx ON strategic_programs (plan_id) WHERE deleted_at IS NULL;

CREATE TABLE strategic_program_initiatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES strategic_programs(id) ON DELETE CASCADE,
  initiative_id UUID NOT NULL REFERENCES strategic_initiatives(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE strategic_program_initiatives IS 'المبادرات المدرجة تحت البرنامج. مبادرة واحدة يمكن أن تخدم أكثر من برنامج.';

-- Partial, so a soft-deleted membership never blocks re-adding the same
-- initiative later (the NULL-uniqueness trap this schema has hit before).
CREATE UNIQUE INDEX strategic_program_initiatives_uidx
  ON strategic_program_initiatives (program_id, initiative_id)
  WHERE deleted_at IS NULL;

CREATE TABLE strategic_program_committee_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES strategic_programs(id) ON DELETE CASCADE,
  member_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  committee_role TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE strategic_program_committee_members IS 'أعضاء اللجنة المشرفة على البرنامج. العضوية وحدها تمنح الاطلاع على البرنامج وسير تقدمه.';

CREATE UNIQUE INDEX strategic_program_committee_members_uidx
  ON strategic_program_committee_members (program_id, member_profile_id)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Membership helper — SECURITY DEFINER to avoid RLS recursion (see header)
-- ---------------------------------------------------------------------------
CREATE FUNCTION is_program_committee_member(p_program_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_program_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM strategic_program_committee_members m
    JOIN profiles p ON p.id = m.member_profile_id
    WHERE m.program_id = p_program_id
      AND m.deleted_at IS NULL
      AND p.auth_user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION is_program_committee_member IS 'TRUE iff the caller is an active committee member of p_program_id. SECURITY DEFINER: the committee table''s own SELECT policy calls this, which would otherwise recurse.';

-- Same lesson as migration 5: REVOKE FROM PUBLIC alone does NOT block anon
-- in this project (ALTER DEFAULT PRIVILEGES grants EXECUTE broadly), so anon
-- is revoked explicitly.
REVOKE EXECUTE ON FUNCTION is_program_committee_member(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_program_committee_member(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION is_program_committee_member(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE strategic_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategic_program_initiatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategic_program_committee_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY strategic_programs_select ON strategic_programs FOR SELECT TO authenticated
  USING (
    check_vpra_global('strategicPlanning', 'view')
    OR is_program_committee_member(id)
  );

CREATE POLICY strategic_programs_insert ON strategic_programs FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

CREATE POLICY strategic_programs_update ON strategic_programs FOR UPDATE TO authenticated
  USING (check_vpra_global('strategicPlanning', 'approve'))
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

-- Visible exactly when its program is: re-deriving the condition here would
-- be a second copy to keep in sync (the same shape used for
-- strategic_initiative_targets).
CREATE POLICY strategic_program_initiatives_select ON strategic_program_initiatives FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM strategic_programs p WHERE p.id = strategic_program_initiatives.program_id)
  );

CREATE POLICY strategic_program_initiatives_insert ON strategic_program_initiatives FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

CREATE POLICY strategic_program_initiatives_update ON strategic_program_initiatives FOR UPDATE TO authenticated
  USING (check_vpra_global('strategicPlanning', 'approve'))
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

-- The committee roster is readable by the module's viewers and by the
-- committee itself (via the SECURITY DEFINER helper, so no recursion), plus
-- an always-on self-row branch so a member can always see their own
-- membership even if the helper is later narrowed.
CREATE POLICY strategic_program_committee_members_select ON strategic_program_committee_members FOR SELECT TO authenticated
  USING (
    check_vpra_global('strategicPlanning', 'view')
    OR is_program_committee_member(program_id)
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = strategic_program_committee_members.member_profile_id
        AND p.auth_user_id = auth.uid()
    )
  );

CREATE POLICY strategic_program_committee_members_insert ON strategic_program_committee_members FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

CREATE POLICY strategic_program_committee_members_update ON strategic_program_committee_members FOR UPDATE TO authenticated
  USING (check_vpra_global('strategicPlanning', 'approve'))
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

-- No DELETE policy on any of the three: soft-delete only (CLAUDE.md §5-A
-- rule 7), consistent with the rest of this module.
