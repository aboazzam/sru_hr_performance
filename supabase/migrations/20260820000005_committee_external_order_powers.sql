-- ============================================================================
-- لجنة البرنامج: أعضاء من خارج المنظمة، وترتيب، وصلاحيات إدارة
--
-- Requested 2026-08-20:
--   * "من الممكن ان يكون أعضاء اللجنة من داخل المنظمة او خارجها"
--   * "ولهم عدد من الصلاحيات: ادارة البرنامج ومتابعة المبادرات الخاصة به"
--   * "اترك للادمن فرصة تغيير ترتيب اعضاء اللجنة"
--
-- ---------------------------------------------------------------------------
-- 1. EXTERNAL MEMBERS
-- ---------------------------------------------------------------------------
-- member_profile_id becomes nullable, paired with a name/affiliation/email
-- trio for people who have no account here at all. A CHECK keeps exactly one
-- of the two shapes per row — the same XOR pattern used by strategic_kpis
-- and strategic_initiative_targets.
--
-- HONEST LIMIT, stated rather than implied: an external member has no auth
-- account, so the access that membership grants (reading the program and its
-- initiatives) simply does not apply to them — there is nobody to
-- authenticate. They are recorded so the committee roster is complete and
-- printable; giving them real access would need an invited account, which is
-- a separate decision nobody has taken.
--
-- ---------------------------------------------------------------------------
-- 2. COMMITTEE POWERS
-- ---------------------------------------------------------------------------
-- 20260819000002 deliberately made membership READ-ONLY, noting that write
-- access "was NOT requested and is not inferred". It is requested now
-- ("ادارة البرنامج"), so internal members may UPDATE the program itself and
-- manage which initiatives sit under it.
--
-- What membership still does NOT grant: editing the initiatives' own content
-- (that belongs to the owning department), deleting the program, or touching
-- the committee roster — a committee that can rewrite its own membership is
-- not a committee. Those stay at strategicPlanning='approve'.
-- ============================================================================

ALTER TABLE strategic_program_committee_members
  ALTER COLUMN member_profile_id DROP NOT NULL;

ALTER TABLE strategic_program_committee_members
  ADD COLUMN external_name TEXT,
  ADD COLUMN external_org TEXT,
  ADD COLUMN external_email TEXT,
  ADD COLUMN display_order INTEGER NOT NULL DEFAULT 1;

ALTER TABLE strategic_program_committee_members
  ADD CONSTRAINT strategic_program_committee_members_member_xor CHECK (
    (member_profile_id IS NOT NULL AND external_name IS NULL)
    OR (member_profile_id IS NULL AND external_name IS NOT NULL)
  );

COMMENT ON COLUMN strategic_program_committee_members.external_name IS 'اسم العضو من خارج المنظمة. لا حساب له، فلا يمنحه هذا السطر وصولًا — يُسجَّل ليكتمل تشكيل اللجنة.';
COMMENT ON COLUMN strategic_program_committee_members.display_order IS 'ترتيب العضو في اللجنة، يغيّره المسؤول.';

-- Same person, twice, on one committee — blocked for external members too
-- (by email when given), mirroring the existing internal-member index.
CREATE UNIQUE INDEX strategic_program_committee_members_external_uidx
  ON strategic_program_committee_members (program_id, lower(external_email))
  WHERE external_email IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. RLS: what membership now allows
-- ---------------------------------------------------------------------------
DROP POLICY strategic_programs_update ON strategic_programs;

CREATE POLICY strategic_programs_update ON strategic_programs FOR UPDATE TO authenticated
  USING (check_vpra_global('strategicPlanning', 'approve') OR is_program_committee_member(id))
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve') OR is_program_committee_member(id));

DROP POLICY strategic_program_initiatives_insert ON strategic_program_initiatives;
DROP POLICY strategic_program_initiatives_update ON strategic_program_initiatives;

CREATE POLICY strategic_program_initiatives_insert ON strategic_program_initiatives FOR INSERT TO authenticated
  WITH CHECK (
    check_vpra_global('strategicPlanning', 'approve')
    OR is_program_committee_member(program_id)
  );

CREATE POLICY strategic_program_initiatives_update ON strategic_program_initiatives FOR UPDATE TO authenticated
  USING (check_vpra_global('strategicPlanning', 'approve') OR is_program_committee_member(program_id))
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve') OR is_program_committee_member(program_id));

-- The roster itself is deliberately NOT opened to members — see the header.

-- ---------------------------------------------------------------------------
-- 4. Reordering the roster in one statement
-- ---------------------------------------------------------------------------
-- display_order has no UNIQUE constraint, so a straightforward set-based
-- update is safe here (unlike org_structure_levels, whose unique level_order
-- forced a two-pass shuffle).
CREATE FUNCTION reorder_program_committee(p_program_id UUID, p_member_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_expected INT;
BEGIN
  SELECT count(*) INTO v_expected
    FROM strategic_program_committee_members
   WHERE program_id = p_program_id AND deleted_at IS NULL;

  -- Refuse a partial or foreign list rather than silently reordering around
  -- rows the caller never saw — the same guard reorder_levels uses.
  IF v_expected <> coalesce(array_length(p_member_ids, 1), 0) THEN
    RAISE EXCEPTION 'the id list must contain every active committee member (expected %, got %)',
      v_expected, coalesce(array_length(p_member_ids, 1), 0);
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_member_ids) AS m(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM strategic_program_committee_members c
      WHERE c.id = m.id AND c.program_id = p_program_id AND c.deleted_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'the id list contains a member that does not belong to this program';
  END IF;

  UPDATE strategic_program_committee_members c
     SET display_order = pos.ord
    FROM (SELECT id, ordinality AS ord FROM unnest(p_member_ids) WITH ORDINALITY AS t(id, ordinality)) AS pos
   WHERE c.id = pos.id;
END;
$$;

COMMENT ON FUNCTION reorder_program_committee IS 'يعيد ترتيب أعضاء لجنة البرنامج دفعةً واحدة. SECURITY INVOKER فتبقى RLS هي البوابة (التعديل عند strategicPlanning=approve).';

REVOKE EXECUTE ON FUNCTION reorder_program_committee(UUID, UUID[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reorder_program_committee(UUID, UUID[]) FROM anon;
GRANT EXECUTE ON FUNCTION reorder_program_committee(UUID, UUID[]) TO authenticated;
