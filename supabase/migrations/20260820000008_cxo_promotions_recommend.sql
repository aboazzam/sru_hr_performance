-- ============================================================================
-- رفع cxo على مجال promotions من view إلى recommend
--
-- Requested directly 2026-08-20 ("ارفع promotions لـ cxo إلى recommend"),
-- after the previous migration made employees visible to cxo but left them
-- unable to actually propose a promotion (`promotions_insert` requires
-- 'recommend'). This closes that.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS GRANT REACHES — stated because `promotions` is not one screen
-- ---------------------------------------------------------------------------
-- The `promotions` process area gates FOUR tables, verified directly against
-- pg_policies before writing this, not assumed:
--
--   promotions       -> cxo can now PROPOSE a promotion, and (since
--                       promotions_update sits at 'recommend') edit or
--                       approve/reject a pending one.
--   rewards          -> same shape: cxo can now enter and review rewards.
--   recommendations  -> same: cxo can now create and review development /
--                       separation recommendations.
--   audit_log        -> the narrow SELECT policy for promotions/rewards
--                       history (20260719000010) — cxo can already read this
--                       at 'view', unchanged by the raise.
--
-- This coupling is deliberate in the schema (rewards and recommendations were
-- built to reuse `promotions` rather than invent parallel areas — see
-- 20260719000006 and 20260804000001's header), so raising the level here
-- necessarily raises it for all three. It is written down rather than
-- discovered later: if cxo should propose promotions but NOT touch rewards or
-- recommendations, that needs a separate process area, which is a schema
-- change nobody has asked for.
--
-- cxo joins hr_admin, manager and admin_off at 'recommend'; final approval
-- stays with ceo/super_admin at 'approve', unchanged.
-- ============================================================================

INSERT INTO role_permissions (role_id, process_area, vpra_level)
SELECT r.id, 'promotions', 'recommend'
  FROM roles r
 WHERE r.role_code = 'cxo'
ON CONFLICT (role_id, process_area) DO UPDATE
   SET vpra_level = EXCLUDED.vpra_level;

-- Expect: cxo/promotions/recommend, and ceo/super_admin still at 'approve'.
-- SELECT r.role_code, rp.vpra_level
--   FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
--  WHERE rp.process_area = 'promotions' ORDER BY rp.vpra_level DESC;
