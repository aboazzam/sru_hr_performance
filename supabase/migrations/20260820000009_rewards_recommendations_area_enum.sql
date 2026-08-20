-- ============================================================================
-- مجال صلاحيات مستقل للمكافآت والتوصيات (الخطوة 1: قيمة المجال)
--
-- Requested 2026-08-20 ("افصل مجال المكافآت والتوصيات عن الترقيات"), after
-- raising cxo on `promotions` revealed the coupling in practice: the same
-- area gated `promotions`, `rewards` AND `recommendations`, so a promotions
-- decision necessarily handed out reward and recommendation powers too.
--
-- ONE new area, not two, matching the request's own wording («مجال المكافآت
-- والتوصيات», singular). The name says what it covers so nobody has to
-- rediscover the coverage the way this coupling had to be rediscovered —
-- which is exactly the failure this migration exists to end.
--
-- Split across two migrations because Postgres forbids using a value added by
-- ALTER TYPE ... ADD VALUE inside the same transaction that added it — the
-- same two-step already used for orgStructure, staffing, identity,
-- systemSettings and every other area added to this enum.
-- ============================================================================

ALTER TYPE process_area ADD VALUE IF NOT EXISTS 'rewardsAndRecommendations';
