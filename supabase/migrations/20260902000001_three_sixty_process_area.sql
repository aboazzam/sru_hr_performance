-- ============================================================================
-- "التقييم الدائري" (360 Review) — new module, requested as a standalone
-- addition alongside the existing simpler `feedback_360` table (built
-- 2026-07-18) and `feedback_360_nominations` (2026-08-27). The project
-- owner supplied a full, richer entity/field list of their own (cycle,
-- rating_scale, rater_group, competency, item, assignment, response) that
-- does not map onto either of those existing tables, and described five
-- screens (HR cycle/template management + completion tracking, employee
-- self-nomination + supervisor approval, a rater-group-filtered
-- questionnaire, a post-close employee report, and manager team reports)
-- that only make sense against this new, dedicated schema. Neither
-- `feedback_360`/`feedback_360_nominations` is touched, removed, or reused
-- here — see 20260902000002's header for the full design.
--
-- Adds ONE new process_area value, `threeSixty`, deserving its own area
-- rather than reusing `evaluation` (the way the older, simpler
-- `feedback_360` did) — this is a full module with its own catalog
-- (rating scales/rater groups/competencies/items), cycles, assignments and
-- responses, comparable in scope to `recruitmentPlan`/`calibration`, not a
-- single-table bolt-on.
--
-- `ALTER TYPE ... ADD VALUE` is deliberately alone in this file: Postgres
-- forbids USING a value added by ALTER TYPE inside the same transaction
-- that added it — the same two-step pattern every prior process_area
-- addition in this project used (orgStructure, recruitmentPlan, etc.).
--
-- No role_permissions rows seeded — CLAUDE.md §4-B ("new roles inherit
-- none on all Process Areas by default"), same precedent as
-- `recruitmentPlan`/`performanceReports`: HR access is granted through the
-- already-built /admin role editor, not assumed here. Self-service actions
-- (employee nominating raters, a rater filling their own questionnaire, an
-- employee viewing their own report, a manager viewing their team's) do
-- NOT depend on this process area at all — they are authorized purely by
-- row ownership / `is_my_direct_report()` / `is_my_subordinate()`, the same
-- "the relationship itself is the authorization fact" trust model already
-- established for `evaluations`/`goals`/`bau_tasks`.
-- ============================================================================

ALTER TYPE process_area ADD VALUE 'threeSixty';

-- ============================================================================
-- Verification -- run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect the new value present in the enum's labels.
-- SELECT enumlabel FROM pg_enum
--   WHERE enumtypid = 'process_area'::regtype AND enumlabel = 'threeSixty';

-- Expect zero role_permissions rows for it -- deliberately unseeded.
-- SELECT count(*) FROM role_permissions WHERE process_area = 'threeSixty';
