-- ============================================================================
-- `rewards` table (CLAUDE.md §6 "Promotions & Rewards"; also
-- SRU_System_Design.md §B line 208) -- schema + RLS, needed before the
-- requested "entering rewards" UI can have anything real to write to
-- (same "schema is a prerequisite" situation as `calibration_sessions`
-- and `promotions` before their own UIs).
--
-- Column set transcribed from SRU_System_Design.md's own ERD:
--   rewards(id, employee_id, cycle_id, reward_type, amount, status,
--            approved_by)
--
-- [استنتاج] `reward_type` is TEXT with no CHECK enum -- no documented
-- vocabulary exists (e.g. "cash bonus" vs. "recognition award" vs.
-- "certificate"), same precedent as `goals.status`/`promotions.status`.
-- `status` is likewise TEXT with no CHECK enum, defaults `'pending'`,
-- same precedent and same reasoning as `promotions.status`.
--
-- [استنتاج] `amount` is NUMERIC with only a non-negative CHECK
-- (`amount IS NULL OR amount >= 0`) -- unlike every 0-100 "score"/
-- "rating" column elsewhere in this schema, `amount` is a monetary
-- figure with no natural upper bound, so the 0-100 percentage
-- convention does NOT apply here; only ruling out a negative reward
-- amount is invented, not a specific currency/scale (SAR is the
-- implied currency per CLAUDE.md's Saudi context, but no column exists
-- to record a currency code and none is added here without being asked).
--
-- process_area: CLAUDE.md §4 lists 12 process areas and has none named
-- "rewards" -- `promotions` and `rewards` are documented as ONE bundled
-- module ("Promotions & Rewards", CLAUDE.md §2 point 11;
-- SRU_System_Design.md module 11) with no separate area for rewards, so
-- this reuses `process_area='promotions'` for `rewards`' own RLS --
-- same reasoning already used for `feedback_360` reusing `'evaluation'`
-- and `org_units`/`profiles` reusing `'employeeData'`, not a fresh
-- invention.
--
-- RLS mirrors `promotions` exactly (migration 20260719000005), same
-- role_permissions matrix already verified for `process_area=
-- 'promotions'`: {ceo: approve, cxo/hr_admin/manager: recommend, five
-- other roles: view}, no individual/self role holds any grant --
-- gating writes at `'recommend'` is safe, and a single UPDATE policy
-- covers both proposal edits and `ceo`'s eventual approval (not built
-- in this migration/UI -- only entering rewards was asked for here, not
-- a review/approve flow; `status`/`approved_by` exist for that future
-- follow-up but this slice doesn't build it).
--
-- `rewards` has no `org_unit_id` of its own -- derived via a join to
-- `profiles.org_unit_id` for the rewarded employee, same pattern as
-- `promotions`/`evaluation_scores`/`calibration_results`.
--
--   rewards_select: self-row (employee sees their own reward, `[استنتاج]`,
--     consistent with the self-visibility default posture everywhere
--     else in this schema) OR check_vpra('promotions','view', ...).
--   rewards_insert: check_vpra('promotions','recommend', ...) -- no
--     self-row bypass (an employee cannot grant themselves a reward).
--   rewards_update: check_vpra('promotions','recommend', ...) -- no
--     self-row bypass.
--
-- No DELETE policy (soft-delete via `deleted_at` only, CLAUDE.md §5-A
-- rule 7).
-- ============================================================================

BEGIN;

CREATE TABLE rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  cycle_id UUID NOT NULL REFERENCES evaluation_cycles(id) ON DELETE RESTRICT,
  reward_type TEXT NOT NULL,
  amount NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT rewards_amount_non_negative CHECK (amount IS NULL OR amount >= 0)
);

ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY rewards_select ON rewards
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = rewards.employee_id AND p.auth_user_id = auth.uid()
    )
    OR check_vpra(
      'promotions'::process_area,
      'view'::vpra_level,
      (SELECT p.org_unit_id FROM profiles p WHERE p.id = rewards.employee_id)
    )
  );

CREATE POLICY rewards_insert ON rewards
  FOR INSERT
  TO authenticated
  WITH CHECK (
    check_vpra(
      'promotions'::process_area,
      'recommend'::vpra_level,
      (SELECT p.org_unit_id FROM profiles p WHERE p.id = rewards.employee_id)
    )
  );

CREATE POLICY rewards_update ON rewards
  FOR UPDATE
  TO authenticated
  USING (
    check_vpra(
      'promotions'::process_area,
      'recommend'::vpra_level,
      (SELECT p.org_unit_id FROM profiles p WHERE p.id = rewards.employee_id)
    )
  )
  WITH CHECK (
    check_vpra(
      'promotions'::process_area,
      'recommend'::vpra_level,
      (SELECT p.org_unit_id FROM profiles p WHERE p.id = rewards.employee_id)
    )
  );

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: a real `manager`/`cxo`/`hr_admin` test user (recommend) can
-- create/update a reward in their scope; a real `committee` test user
-- (view only) can SELECT but not INSERT/UPDATE; a plain employee sees
-- zero reward rows for others but sees their OWN reward via the
-- self-row branch, and cannot write to it. The non-negative CHECK
-- rejects a negative amount.
