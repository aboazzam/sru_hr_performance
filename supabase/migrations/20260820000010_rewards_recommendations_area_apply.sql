-- ============================================================================
-- مجال صلاحيات مستقل للمكافآت والتوصيات (الخطوة 2: السياسات والمنح)
--
-- Moves `rewards` and `recommendations` off the `promotions` area and onto
-- `rewardsAndRecommendations`. `promotions` keeps gating promotions alone.
--
-- ---------------------------------------------------------------------------
-- WHO KEEPS WHAT — the one judgement call here, made explicit
-- ---------------------------------------------------------------------------
-- A split alone would strip every role of rewards/recommendations access,
-- since the new area starts empty. That is not what "separate the areas"
-- asks for, so each role's CURRENT effective level is carried across… with
-- one deliberate exception:
--
--   * every role EXCEPT cxo -> copied verbatim from its `promotions` level,
--     so today's behaviour is unchanged for them.
--   * cxo -> 'view', its level BEFORE the raise in 20260820000008.
--
-- Why the exception: cxo was raised to 'recommend' minutes earlier for
-- PROMOTIONS specifically, and the reward/recommendation powers that came
-- with it were the unintended side effect that prompted this very request.
-- Carrying 'recommend' across would leave that side effect fully in place and
-- make the split cosmetic. cxo therefore returns to exactly the reward and
-- recommendation access it had before that raise — no more, no less — while
-- keeping the promotions authority that WAS asked for.
--
-- If cxo should also propose rewards/recommendations, that is now one row in
-- /admin and no longer entangled with promotions. Which is the point.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Grants: carry each role across (cxo pinned to its pre-raise level)
-- ---------------------------------------------------------------------------
INSERT INTO role_permissions (role_id, process_area, vpra_level)
SELECT rp.role_id,
       'rewardsAndRecommendations',
       CASE WHEN r.role_code = 'cxo' THEN 'view'::vpra_level ELSE rp.vpra_level END
  FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
 WHERE rp.process_area = 'promotions'
ON CONFLICT (role_id, process_area) DO UPDATE
   SET vpra_level = EXCLUDED.vpra_level;

-- ---------------------------------------------------------------------------
-- 2. rewards: same policy shapes, new area
-- ---------------------------------------------------------------------------
DROP POLICY rewards_select ON rewards;
DROP POLICY rewards_insert ON rewards;
DROP POLICY rewards_update ON rewards;

CREATE POLICY rewards_select ON rewards FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = rewards.employee_id AND p.auth_user_id = auth.uid())
    OR check_vpra('rewardsAndRecommendations', 'view', (SELECT p.org_unit_id FROM profiles p WHERE p.id = rewards.employee_id))
  );

CREATE POLICY rewards_insert ON rewards FOR INSERT TO authenticated
  WITH CHECK (
    check_vpra('rewardsAndRecommendations', 'recommend', (SELECT p.org_unit_id FROM profiles p WHERE p.id = rewards.employee_id))
  );

CREATE POLICY rewards_update ON rewards FOR UPDATE TO authenticated
  USING (
    check_vpra('rewardsAndRecommendations', 'recommend', (SELECT p.org_unit_id FROM profiles p WHERE p.id = rewards.employee_id))
  )
  WITH CHECK (
    check_vpra('rewardsAndRecommendations', 'recommend', (SELECT p.org_unit_id FROM profiles p WHERE p.id = rewards.employee_id))
  );

-- ---------------------------------------------------------------------------
-- 3. recommendations: same
-- ---------------------------------------------------------------------------
DROP POLICY recommendations_select ON recommendations;
DROP POLICY recommendations_insert ON recommendations;
DROP POLICY recommendations_update ON recommendations;

CREATE POLICY recommendations_select ON recommendations FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = recommendations.employee_id AND p.auth_user_id = auth.uid())
    OR check_vpra('rewardsAndRecommendations', 'view', (SELECT p.org_unit_id FROM profiles p WHERE p.id = recommendations.employee_id))
  );

CREATE POLICY recommendations_insert ON recommendations FOR INSERT TO authenticated
  WITH CHECK (
    check_vpra('rewardsAndRecommendations', 'recommend', (SELECT p.org_unit_id FROM profiles p WHERE p.id = recommendations.employee_id))
  );

CREATE POLICY recommendations_update ON recommendations FOR UPDATE TO authenticated
  USING (
    check_vpra('rewardsAndRecommendations', 'recommend', (SELECT p.org_unit_id FROM profiles p WHERE p.id = recommendations.employee_id))
  )
  WITH CHECK (
    check_vpra('rewardsAndRecommendations', 'recommend', (SELECT p.org_unit_id FROM profiles p WHERE p.id = recommendations.employee_id))
  );

-- ---------------------------------------------------------------------------
-- 4. audit_log's promotions/rewards history policy
-- ---------------------------------------------------------------------------
-- Deliberately LEFT ALONE. It is one narrow SELECT policy covering the
-- combined decision history of both entities (20260719000010); splitting it
-- would mean either two policies or an OR across both areas, and the request
-- was about who may ACT, not about who may read the history screen that
-- already shows both side by side. Flagged rather than changed silently.
