-- ============================================================================
-- أنشطة المبادرة وجدولها الزمني (initiative activities)
--
-- The last block of the real initiative cards supplied 2026-08-20: a Gantt
-- strip of months (M7…M12 of 2024 then M1…M7 of 2025 on one card, M1…M12 of
-- 2026 on another) with one row per «أبرز الأنشطة» and a «الشخص المسؤول»
-- column beside it.
--
-- MODELLED AS DATES, NOT (year, month) PAIRS: the cards happen to draw whole
-- months, but the underlying fact is "this activity runs from here to here",
-- and dates make the month strip derivable while (year, month) columns would
-- make anything finer impossible and every comparison hand-rolled. The strip
-- is computed from these dates at render time.
--
-- THE RESPONSIBLE PERSON is either a real employee (responsible_profile_id)
-- or a free-text name — the cards name people who may not have an account,
-- and an activity may legitimately be recorded before its owner is decided.
-- Unlike the committee's XOR, both may be NULL here: an activity with no
-- named owner yet is a normal state on these very cards.
--
-- [استنتاج] «التي تغذي عن طريق اسناد المستهدفات من مدير الادارة على موظفي
-- الادارة» — the request describes activities being fed by a manager
-- assigning targets to staff. That cascade already exists as `targets`
-- (20260727000005), so this table carries an OPTIONAL target_id link rather
-- than duplicating the cascade: an activity may point at the target row it
-- came from, and nothing breaks when it does not.
-- ============================================================================

CREATE TABLE initiative_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id UUID NOT NULL REFERENCES strategic_initiatives(id) ON DELETE CASCADE,
  title_ar TEXT NOT NULL,
  title_en TEXT,
  responsible_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  responsible_name TEXT,
  target_id UUID REFERENCES targets(id) ON DELETE SET NULL,
  start_date DATE,
  end_date DATE,
  display_order INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT initiative_activities_dates_valid CHECK (
    start_date IS NULL OR end_date IS NULL OR end_date >= start_date
  ),
  -- A real employee OR a written name, never both — but neither is fine.
  CONSTRAINT initiative_activities_responsible_shape CHECK (
    responsible_profile_id IS NULL OR responsible_name IS NULL
  )
);

COMMENT ON TABLE initiative_activities IS 'أبرز أنشطة المبادرة ومسؤولوها وفترة كل نشاط — تُرسم منها الأشهر في بطاقة المبادرة.';
COMMENT ON COLUMN initiative_activities.target_id IS 'المستهدف المسند الذي غذّى هذا النشاط، إن وُجد. اختياري: النشاط قد يُسجَّل قبل الإسناد.';

CREATE INDEX initiative_activities_initiative_idx
  ON initiative_activities (initiative_id) WHERE deleted_at IS NULL;

ALTER TABLE initiative_activities ENABLE ROW LEVEL SECURITY;

-- Visible exactly when its initiative is — that policy already covers the
-- module grant, the owning department, and program-committee membership, so
-- re-deriving it here would be a second copy to keep in sync.
CREATE POLICY initiative_activities_select ON initiative_activities FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM strategic_initiatives i WHERE i.id = initiative_activities.initiative_id)
  );

-- Writing is the OWNING DEPARTMENT's job as much as the planners': the card's
-- activity rows are what that department actually commits to, and the
-- committee follows their performance through them. So a member of the
-- owning org unit may maintain them, alongside strategicPlanning='approve'.
CREATE POLICY initiative_activities_insert ON initiative_activities FOR INSERT TO authenticated
  WITH CHECK (
    check_vpra_global('strategicPlanning', 'approve')
    OR EXISTS (
      SELECT 1 FROM strategic_initiatives i
      WHERE i.id = initiative_activities.initiative_id
        AND i.owner_org_unit_id IS NOT NULL
        AND is_my_org_unit(i.owner_org_unit_id)
    )
  );

CREATE POLICY initiative_activities_update ON initiative_activities FOR UPDATE TO authenticated
  USING (
    check_vpra_global('strategicPlanning', 'approve')
    OR EXISTS (
      SELECT 1 FROM strategic_initiatives i
      WHERE i.id = initiative_activities.initiative_id
        AND i.owner_org_unit_id IS NOT NULL
        AND is_my_org_unit(i.owner_org_unit_id)
    )
  )
  WITH CHECK (
    check_vpra_global('strategicPlanning', 'approve')
    OR EXISTS (
      SELECT 1 FROM strategic_initiatives i
      WHERE i.id = initiative_activities.initiative_id
        AND i.owner_org_unit_id IS NOT NULL
        AND is_my_org_unit(i.owner_org_unit_id)
    )
  );

-- No DELETE policy: soft-delete only (CLAUDE.md §5-A rule 7).
