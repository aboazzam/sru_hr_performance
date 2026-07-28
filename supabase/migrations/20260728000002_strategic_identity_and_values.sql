-- Vision / Mission / Values, requested directly as a prerequisite step for
-- strategy_admin before any strategic goal exists ("قبل اضافة اي هدف
-- استراتيجي اجعل مدير الاستراتيجية يضيف الرؤية والرسالة والقيم").
--
-- `strategic_identity` mirrors `org_identity`'s established singleton
-- pattern exactly (a UNIQUE index on the constant expression `(true)`,
-- find-or-create at the application layer) -- vision/mission are one
-- statement each, not a list, unlike values.
-- `strategic_values` is a small ordered list table (title/description per
-- value, soft-delete only via UPDATE, same convention already used for
-- org_structure_levels/positions -- no real DELETE policy).
--
-- Both reuse the existing `strategicPlanning` process area rather than
-- inventing a new one -- this is squarely the strategy_admin's own domain,
-- already the sole 'approve'-level owner of `strategic_goals`/`sub_goals`;
-- `ceo` already holds 'view' there too, so this stays visible to the same
-- read-only follow-up audience with zero extra grants needed.
BEGIN;

CREATE TABLE strategic_identity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vision_ar TEXT,
  vision_en TEXT,
  mission_ar TEXT,
  mission_en TEXT,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX strategic_identity_singleton_uidx ON strategic_identity ((true));

ALTER TABLE strategic_identity ENABLE ROW LEVEL SECURITY;

CREATE POLICY strategic_identity_select ON strategic_identity FOR SELECT TO authenticated
  USING (check_vpra_global('strategicPlanning', 'view'));

CREATE POLICY strategic_identity_insert ON strategic_identity FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

CREATE POLICY strategic_identity_update ON strategic_identity FOR UPDATE TO authenticated
  USING (check_vpra_global('strategicPlanning', 'approve'))
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

CREATE TABLE strategic_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_ar TEXT NOT NULL,
  title_en TEXT,
  description_ar TEXT,
  description_en TEXT,
  display_order INTEGER NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX strategic_values_order_uidx ON strategic_values (display_order) WHERE deleted_at IS NULL;

ALTER TABLE strategic_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY strategic_values_select ON strategic_values FOR SELECT TO authenticated
  USING (check_vpra_global('strategicPlanning', 'view'));

CREATE POLICY strategic_values_insert ON strategic_values FOR INSERT TO authenticated
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

CREATE POLICY strategic_values_update ON strategic_values FOR UPDATE TO authenticated
  USING (check_vpra_global('strategicPlanning', 'approve'))
  WITH CHECK (check_vpra_global('strategicPlanning', 'approve'));

COMMIT;
