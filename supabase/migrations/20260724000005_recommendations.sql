-- ============================================================================
-- `recommendations` table -- CLAUDE.md's "التوصيات" concept (2026-07-24):
-- the project owner explicitly asked for "الترقيات والمكافآت تكون تحت
-- التوصيات" (promotions/rewards live under Recommendations navigationally)
-- while also naming two entirely new recommendation types with no existing
-- table at all: تطوير (development) and استغناء (separation).
--
-- Deliberately does NOT merge promotions/rewards' own tables into this one
-- -- both already have complete, previously-reviewed propose/approve
-- workflows (migrations 20260719000005/20260719000006) tied to real
-- job-title-change semantics for promotions specifically. Rebuilding those
-- on a generic table would be a rewrite of working, signed-off features
-- for no functional gain, and wasn't asked for -- only the NAVIGATION
-- request ("under Recommendations") was explicit. `recommendations` here
-- covers only the two types with no existing home: 'development',
-- 'separation'. The new /recommendations hub page links out to the
-- existing /promotions and /rewards pages for those two types, and hosts
-- this table's list+create UI for development/separation.
--
-- Column set and RLS mirror `promotions`/`rewards` (migrations
-- 20260719000005/20260719000006) exactly: no dedicated `recommendations`
-- process area exists in CLAUDE.md's 12 areas, and "Promotions & Rewards"
-- is already documented as one bundled module -- reusing 'promotions' here
-- is the same established precedent `rewards` itself already used.
-- ============================================================================

BEGIN;

CREATE TABLE recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  cycle_id uuid REFERENCES evaluation_cycles(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('development', 'separation')),
  reasoning TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

-- Self-row bypass (an employee can see their own recommendation) OR
-- check_vpra('promotions','view', <employee's org_unit_id>) -- identical
-- shape to promotions_select/rewards_select.
CREATE POLICY recommendations_select ON recommendations FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = recommendations.employee_id AND p.auth_user_id = auth.uid())
    OR check_vpra('promotions', 'view', (SELECT p.org_unit_id FROM profiles p WHERE p.id = recommendations.employee_id))
  );

CREATE POLICY recommendations_insert ON recommendations FOR INSERT TO authenticated
  WITH CHECK (
    check_vpra('promotions', 'recommend', (SELECT p.org_unit_id FROM profiles p WHERE p.id = recommendations.employee_id))
  );

CREATE POLICY recommendations_update ON recommendations FOR UPDATE TO authenticated
  USING (check_vpra('promotions', 'recommend', (SELECT p.org_unit_id FROM profiles p WHERE p.id = recommendations.employee_id)))
  WITH CHECK (check_vpra('promotions', 'recommend', (SELECT p.org_unit_id FROM profiles p WHERE p.id = recommendations.employee_id)));

REVOKE ALL ON recommendations FROM anon;

COMMIT;

-- ============================================================================
-- Verification -- run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: a manager (recommend, org-unit-scoped) can insert/select/update a
-- recommendation for an in-scope employee, and is blocked for an
-- out-of-scope one -- same adversarial shape already verified for
-- promotions/rewards.
-- Expect: type check rejects any value other than 'development'/'separation'.
