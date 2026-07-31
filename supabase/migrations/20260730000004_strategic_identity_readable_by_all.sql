-- ============================================================================
-- Vision / Mission / Values readable by EVERY authenticated user.
--
-- Reported live by the project owner (2026-07-30): logged in as an ordinary
-- user, the الخطة الاستراتيجية module showed only "الأهداف المسندة" and
-- "بنك الأهداف" -- the "الرؤية والرسالة والقيم" tab was missing entirely.
--
-- That contradicts the original instruction, which was explicitly about
-- everyone else: "بالنسبة لبقية المستخدمين اضف الخطة الاستراتيجية واضف تاب
-- للرؤية والرسالة والاهداف". The tab and the page were gated at
-- strategicPlanning>='view', and `strategic_identity_select` /
-- `strategic_values_select` (20260728000002) required the same -- but only
-- three roles hold ANY strategicPlanning grant (ceo=view,
-- strategy_admin=approve, super_admin=approve), so for every other role both
-- the tab AND the underlying rows were invisible. Fixing only the UI gate
-- would have produced an empty page, since RLS is the real filter.
--
-- The three tiers govern EDITING, not whether the text can be read at all:
--   (no grant / any grant) -> may read
--   prepare / approve      -> may edit (20260730000002, unchanged here)
--
-- On CLAUDE.md §5-A rule 2 ("never USING (true) on sensitive tables"): the
-- vision, mission and values are the university's own published identity
-- statement, not sensitive per-person or per-unit data -- they appear on the
-- public website. They are also the stated foundation every strategic goal
-- is built on, which staff cannot align to if they cannot see it. The policy
-- is still restricted TO authenticated, so this is not public exposure.
-- Write policies are deliberately untouched and remain permission-gated.
-- ============================================================================

BEGIN;

DROP POLICY strategic_identity_select ON strategic_identity;
CREATE POLICY strategic_identity_select ON strategic_identity FOR SELECT TO authenticated
  USING (true);

DROP POLICY strategic_values_select ON strategic_values;
CREATE POLICY strategic_values_select ON strategic_values FOR SELECT TO authenticated
  USING (true);

COMMIT;
