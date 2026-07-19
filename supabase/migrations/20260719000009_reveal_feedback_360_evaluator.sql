-- ============================================================================
-- Builds the "reveal evaluator identity" RPC flagged as a deliberate
-- follow-up since `feedback_360`'s own creation (migration
-- 20260718000005): `evaluator_id` is stored (for audit/dispute purposes)
-- but hidden from everyone via column-level privileges (REVOKE SELECT on
-- the whole table, re-GRANT on an explicit column list omitting
-- `evaluator_id`) -- a bare `SELECT evaluator_id` fails for every
-- authenticated role, including RLS-authorized viewers of the rest of
-- the row.
--
-- **[معتمد]** SRU_System_Design.md §B (right after the `feedback_360`
-- ERD) documents the exact confirmed policy, not an inferred one: "the
-- identity is never shown to the target employee or their direct
-- supervisor via any RLS policy or view -- it appears only to
-- `super_admin` through a documented procedure logged to a SEPARATE
-- audit_log entry ('evaluator identity revealed -- reason: ...')." This
-- migration implements exactly that procedure, nothing broader.
--
-- `reveal_feedback_360_evaluator(p_feedback_id, p_reason)` is a
-- SECURITY DEFINER function matching the established pattern
-- (`check_vpra()`, `get_my_role_codes()`, `is_my_direct_report()`) --
-- running as the function owner, it bypasses both RLS and the
-- column-level lock to read `evaluator_id`, but only after:
--   1. requiring a non-empty `p_reason` (the documented procedure is
--      "reason: ...", not identity-reveal-with-no-justification);
--   2. confirming the caller holds `super_admin` specifically, via
--      `get_my_role_codes()` -- not `check_vpra()`, since this is a
--      one-off super_admin-only power, not a VPRA process-area check
--      (there is no dedicated process area for "reveal evaluator
--      identity" and none is invented here);
--   3. confirming the target `feedback_360` row actually exists.
-- Any failure RAISEs (not a quiet false/empty result) -- revealing PII
-- is significant enough to fail loudly, matching how the doc frames
-- this as a deliberate, logged administrative action, not a routine
-- read.
--
-- On success, writes an audit_log row BEFORE returning the identity --
-- `action='feedback_360_evaluator_revealed'`, `entity_id` the feedback
-- row, `after_data` carrying both the reason and the revealed
-- evaluator_id, so the "who saw whose identity, when, and why" trail
-- exists independent of whatever the caller does next. Returns the
-- evaluator's `profiles` identity (id, employee_number, full_name_ar) --
-- enough to answer "who wrote this," not the evaluator's entire profile
-- row.
--
-- EXECUTE is revoked from PUBLIC/anon and granted to `authenticated`
-- only, same lesson as every other SECURITY DEFINER function in this
-- project (`ALTER DEFAULT PRIVILEGES` would otherwise grant EXECUTE to
-- anon by default) -- the function's own internal role check is what
-- actually restricts it to `super_admin`, not the GRANT.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION reveal_feedback_360_evaluator(p_feedback_id UUID, p_reason TEXT)
RETURNS TABLE(evaluator_id UUID, employee_number TEXT, full_name_ar TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_super_admin BOOLEAN;
  v_evaluator_id UUID;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'a reason is required to reveal an evaluator identity';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM get_my_role_codes() code WHERE code = 'super_admin'
  ) INTO v_is_super_admin;

  IF NOT v_is_super_admin THEN
    RAISE EXCEPTION 'insufficient_privilege: only super_admin may reveal an evaluator identity';
  END IF;

  SELECT fb.evaluator_id INTO v_evaluator_id
  FROM feedback_360 fb
  WHERE fb.id = p_feedback_id AND fb.deleted_at IS NULL;

  IF v_evaluator_id IS NULL THEN
    RAISE EXCEPTION 'feedback_360 row not found';
  END IF;

  INSERT INTO audit_log (actor_id, action, entity, entity_id, after_data)
  VALUES (
    auth.uid(),
    'feedback_360_evaluator_revealed',
    'feedback_360',
    p_feedback_id,
    jsonb_build_object('reason', p_reason, 'revealed_evaluator_id', v_evaluator_id)
  );

  RETURN QUERY
  SELECT p.id, p.employee_number, p.full_name_ar
  FROM profiles p
  WHERE p.id = v_evaluator_id;
END;
$$;

REVOKE ALL ON FUNCTION reveal_feedback_360_evaluator(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION reveal_feedback_360_evaluator(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION reveal_feedback_360_evaluator(UUID, TEXT) TO authenticated;

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: anon cannot execute at all (no EXECUTE grant). A real
-- non-super_admin authenticated user (e.g. hr_admin) gets a raised
-- "insufficient_privilege" exception, not a row, and no audit_log entry
-- is written for the failed attempt. A real super_admin test user with
-- an empty/blank reason gets a raised "reason is required" exception,
-- also with no audit_log entry. A real super_admin with a real reason on
-- a real feedback_360 row gets back the true evaluator_id/employee_
-- number/full_name_ar, and exactly one new audit_log row
-- (feedback_360_evaluator_revealed) appears with that reason recorded.
