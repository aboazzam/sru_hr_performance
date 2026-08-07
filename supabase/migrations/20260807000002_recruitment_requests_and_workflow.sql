-- ============================================================================
-- طلبات الاحتياج الوظيفي + دورة اعتماد خطة التوظيف
-- (Recruitment demand requests + the plan approval workflow)
--
-- Scope confirmed with the project owner (2026-08-07): build ON TOP of the
-- existing recruitment module ("ابني فوقه") rather than redesigning it. So
-- `recruitment_plans` / `recruitment_plan_items` (20260804000002) keep their
-- shape, their "import vacant positions from the org chart" flow and their
-- "publish an item as a real vacancy" flow. This migration adds the demand
-- side that was missing entirely, and the multi-stage approval workflow.
--
-- Documented workflow (project owner's own spec):
--   section head / department manager  -> raises a request
--   hr_admin                           -> consolidates into one plan, prices
--                                         it, recommends
--   finance                            -> reviews the budget (note REQUIRED)
--   approval authority                 -> final approval
-- At every stage the reviewer may return it (`returned_for_revision`) with a
-- mandatory reason, sending it back to the previous party.
--
-- ---------------------------------------------------------------------------
-- HOW REQUESTS AND PLAN ITEMS RELATE (the one real design decision here)
-- ---------------------------------------------------------------------------
-- The spec models a single entity whose `planId` stays null until HR merges
-- it. This database already has a line-item table with two working flows
-- that predate the spec, so collapsing the two would mean deleting working,
-- data-backed behaviour. Instead:
--
--   recruitment_requests.plan_id  -> which plan consolidated this request
--   recruitment_plan_items.request_id -> which request produced this item
--                                        (NULL = imported from the org chart
--                                        or added directly by HR)
--
-- So a plan's line items have two legitimate provenances, both visible, and
-- the item-level decision (§"الاعتماد على مستويين") happens on the REQUEST,
-- which is the thing a department actually submitted and can have returned.
-- [استنتاج] -- this split is inferred; the spec describes one entity.
--
-- ---------------------------------------------------------------------------
-- STATUS VOCABULARIES
-- ---------------------------------------------------------------------------
-- TEXT + CHECK (not a Postgres ENUM), matching `evaluations.state` -- the
-- established precedent in this schema for a status whose vocabulary IS
-- documented, as opposed to `promotions.status`/`vacancies.status`, which
-- are unconstrained TEXT precisely because no vocabulary was ever confirmed.
-- Values are lowercase snake_case, same as `evaluations.state`.
--
-- Both recruitment tables are EMPTY in production (verified: 0 rows in
-- `recruitment_plans` and `recruitment_plan_items` before applying), so
-- adding a CHECK to the existing `recruitment_plans.status` needs no
-- backfill and cannot reject existing data.
--
-- ---------------------------------------------------------------------------
-- WHAT IS DELIBERATELY *NOT* HERE
-- ---------------------------------------------------------------------------
--  * `total_estimated_cost` / `budget_variance` are NOT stored columns. The
--    spec's own rule is that they must never be hand-entered but recomputed
--    from the items on every change -- computing them on READ satisfies that
--    rule more strongly than a stored column, which can silently drift if any
--    future write path forgets to recompute. `computeRecruitmentPlanTotals`
--    in src/lib/recruitmentPlan.ts already does exactly this and is unit
--    tested. `approved_budget` IS stored: it is an external fact (what
--    finance granted), not a derivation.
--  * No `ApprovalAuthority` table: the approval authority is already
--    configurable as "whoever holds recruitmentPlan = approve", moved between
--    roles from /admin with no code change (confirmed with the owner).
--  * No notifications table: this database has none at all, and building one
--    is its own slice (workflow phase), not smuggled into the schema slice.
--
-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- `recruitment_requests` carries a real `org_unit_id`, so unlike the
-- university-wide `recruitment_plans` (which uses `check_vpra_global`) it
-- uses the ORG-SCOPED `check_vpra()`. That is the whole mechanism behind
-- "a section head sees their own unit's requests": grant the role
-- `recruitmentPlan` with `scope_type='org_unit'` and Postgres itself
-- restricts them to their own subtree via `is_org_unit_in_scope()`, while an
-- `hr_admin` holding `scope_type='all'` passes for every unit. No new
-- function and no application-level filtering is involved.
--
-- Finance reviewers may hold no `recruitmentPlan` grant at all, so SELECT
-- also accepts `check_vpra_global('recruitmentBudget','view')` (the area
-- added in 20260807000001).
--
-- No employee/supervisor level-collision risk of the kind that forced
-- `evaluations`' non-self branch up to 'approve': no individual-facing role
-- holds ANY `recruitmentPlan` grant today (verified: only hr_admin=approve
-- and super_admin=view exist), so 'prepare' unambiguously means "a role
-- deliberately granted request-raising rights".
--
-- Column-level rules that RLS structurally cannot express -- only HR may set
-- `estimated_cost_by_hr`, only the approval authority may move a plan to
-- `approved`, `finance_note` is mandatory for a finance action -- are
-- enforced in the Server Actions and the transition guard, exactly as
-- `approveRecruitmentPlan` already documents for the existing plan table.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Enum types (fixed, documented vocabularies from the spec)
-- ---------------------------------------------------------------------------

CREATE TYPE recruitment_request_reason AS ENUM ('vacant', 'expansion', 'replacement');
COMMENT ON TYPE recruitment_request_reason IS 'سبب الطلب: شاغرة | توسع | إحلال';

CREATE TYPE recruitment_contract_type AS ENUM ('permanent', 'temporary', 'part_time');
COMMENT ON TYPE recruitment_contract_type IS 'نوع التعاقد: دائم | مؤقت | دوام جزئي';

-- Future hook (spec §8): an approved need may end up filled by an internal
-- promotion instead of an external hire. The column exists and defaults now
-- so the distinction can be recorded from day one; nothing consumes it yet.
CREATE TYPE recruitment_fulfillment_type AS ENUM ('new_hire', 'internal_promotion');
COMMENT ON TYPE recruitment_fulfillment_type IS 'طريقة سد الاحتياج: تعيين جديد | ترقية داخلية (خطاف مستقبلي)';

-- ---------------------------------------------------------------------------
-- recruitment_requests -- طلب الاحتياج الوظيفي
-- ---------------------------------------------------------------------------

CREATE TABLE recruitment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULL until hr_admin consolidates the request into a plan.
  plan_id UUID REFERENCES recruitment_plans (id) ON DELETE SET NULL,

  -- The requesting unit. NOT NULL: it is what the org-scoped RLS below keys
  -- on, so a request without one would be invisible to scoped roles.
  org_unit_id UUID NOT NULL REFERENCES org_units (id) ON DELETE RESTRICT,
  requested_by UUID REFERENCES profiles (id) ON DELETE SET NULL,

  -- Reuse the real 356-row catalogue when the title exists; allow free text
  -- for a genuinely new role not yet in `job_titles`. Exactly one of the two
  -- must be present -- same XOR-ish discipline as `goals`' own title source.
  job_title_id UUID REFERENCES job_titles (id) ON DELETE RESTRICT,
  custom_job_title TEXT,
  CONSTRAINT recruitment_requests_job_title_source
    CHECK (job_title_id IS NOT NULL OR custom_job_title IS NOT NULL),

  headcount INTEGER NOT NULL DEFAULT 1 CHECK (headcount > 0),
  request_reason recruitment_request_reason NOT NULL,
  contract_type recruitment_contract_type NOT NULL,

  -- Only for a custom title with no catalogue row to read the grade from.
  -- Range matches `job_titles.grade_level`'s real widened 1-16 scale.
  salary_grade SMALLINT CHECK (salary_grade IS NULL OR salary_grade BETWEEN 1 AND 16),

  proposed_quarter SMALLINT CHECK (proposed_quarter IS NULL OR proposed_quarter BETWEEN 1 AND 4),
  proposed_month SMALLINT CHECK (proposed_month IS NULL OR proposed_month BETWEEN 1 AND 12),

  qualifications TEXT,

  -- Justifies the need with a real performance record when one applies.
  evaluation_id UUID REFERENCES evaluations (id) ON DELETE SET NULL,

  estimated_cost_by_requester NUMERIC(12, 2)
    CHECK (estimated_cost_by_requester IS NULL OR estimated_cost_by_requester >= 0),
  estimated_cost_by_hr NUMERIC(12, 2)
    CHECK (estimated_cost_by_hr IS NULL OR estimated_cost_by_hr >= 0),

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status = ANY (ARRAY[
      'draft', 'submitted', 'under_hr_review', 'included_in_plan',
      'returned_for_revision', 'approved', 'rejected'
    ])),
  decision_note TEXT,

  -- Future hooks (spec §8) -- present, defaulted, unconsumed.
  strategic_project_ref TEXT,
  fulfilled_by recruitment_fulfillment_type NOT NULL DEFAULT 'new_hire',
  ready_for_posting_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE recruitment_requests IS 'طلبات الاحتياج الوظيفي -- raised per org unit, consolidated by HR into a recruitment_plans row.';
COMMENT ON COLUMN recruitment_requests.plan_id IS 'NULL until hr_admin consolidates this request into a plan.';
COMMENT ON COLUMN recruitment_requests.strategic_project_ref IS '[خطاف مستقبلي] free text now; designed to become an FK to a future StrategicProject table.';

CREATE INDEX recruitment_requests_plan_idx ON recruitment_requests (plan_id);
CREATE INDEX recruitment_requests_org_unit_idx ON recruitment_requests (org_unit_id);
CREATE INDEX recruitment_requests_status_idx ON recruitment_requests (status);

-- ---------------------------------------------------------------------------
-- recruitment_request_competencies -- الجدارات المطلوبة للطلب
-- ---------------------------------------------------------------------------
-- A real relation to the 27-row `competencies` framework rather than a text
-- array (the spec allowed either, "إن وُجد" -- it does exist). Mirrors
-- `job_title_competencies` exactly, including its `behavioral_level`, so a
-- request tied to a catalogue job title can be seeded from that title's own
-- required competencies instead of retyping them.

CREATE TABLE recruitment_request_competencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES recruitment_requests (id) ON DELETE CASCADE,
  competency_id UUID NOT NULL REFERENCES competencies (id) ON DELETE RESTRICT,
  required_level behavioral_level,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Partial (not plain) unique index: a soft-deleted link must not block
-- re-adding the same competency. Same NULL-safe pattern used throughout.
CREATE UNIQUE INDEX recruitment_request_competencies_uidx
  ON recruitment_request_competencies (request_id, competency_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE recruitment_request_competencies IS 'الجدارات المطلوبة لكل طلب احتياج -- mirrors job_title_competencies.';

-- ---------------------------------------------------------------------------
-- recruitment_plans -- workflow columns
-- ---------------------------------------------------------------------------

ALTER TABLE recruitment_plans
  ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN hr_recommendation TEXT,
  ADD COLUMN finance_note TEXT,
  ADD COLUMN approval_note TEXT,
  ADD COLUMN approved_budget NUMERIC(14, 2)
    CHECK (approved_budget IS NULL OR approved_budget >= 0),
  ADD COLUMN submitted_at TIMESTAMPTZ,
  ADD COLUMN finance_reviewed_at TIMESTAMPTZ,
  ADD COLUMN finance_reviewed_by UUID REFERENCES profiles (id) ON DELETE SET NULL,
  -- Self relation for the year-over-year comparison screen.
  ADD COLUMN previous_plan_id UUID REFERENCES recruitment_plans (id) ON DELETE SET NULL,
  ADD CONSTRAINT recruitment_plans_previous_not_self
    CHECK (previous_plan_id IS NULL OR previous_plan_id <> id);

-- The plan's documented lifecycle vocabulary. Safe to add unconditionally:
-- the table is empty in production (verified before applying).
ALTER TABLE recruitment_plans
  ADD CONSTRAINT recruitment_plans_status_check
    CHECK (status = ANY (ARRAY[
      'draft', 'submitted', 'consolidated', 'finance_review',
      'returned_for_revision', 'approved', 'ready_for_execution', 'rejected'
    ]));

COMMENT ON COLUMN recruitment_plans.approved_budget IS 'الميزانية المعتمدة من المالية -- an external fact, stored. Totals/variance are computed from the items on read, never stored.';
COMMENT ON COLUMN recruitment_plans.previous_plan_id IS 'الخطة السابقة للمقارنة السنوية.';

-- ---------------------------------------------------------------------------
-- recruitment_plan_items -- provenance link back to the request
-- ---------------------------------------------------------------------------

ALTER TABLE recruitment_plan_items
  ADD COLUMN request_id UUID REFERENCES recruitment_requests (id) ON DELETE SET NULL;

-- One request can only become one item within a given plan (keeps the
-- consolidate action idempotent, same role the position_id index plays for
-- the org-chart import). Partial, since most items have no request.
CREATE UNIQUE INDEX recruitment_plan_items_plan_request_uidx
  ON recruitment_plan_items (plan_id, request_id)
  WHERE request_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN recruitment_plan_items.request_id IS 'The demand request this item came from; NULL = imported from the org chart or added directly by HR.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE recruitment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruitment_request_competencies ENABLE ROW LEVEL SECURITY;

-- Read: my own request, OR my org-unit-scoped view grant covers its unit,
-- OR I am a budget reviewer (who needs to read every request in the plan).
CREATE POLICY recruitment_requests_select ON recruitment_requests
  FOR SELECT TO authenticated
  USING (
    requested_by = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR check_vpra('recruitmentPlan'::process_area, 'view'::vpra_level, org_unit_id)
    OR check_vpra_global('recruitmentBudget'::process_area, 'view'::vpra_level)
  );

-- Write: 'prepare' on the request's own unit. No self-row bypass -- raising a
-- request is a delegated departmental act, not a personal one, so holding
-- the grant is the whole requirement (mirrors `goals`, which likewise has no
-- self-row write bypass because goals are assigned, not self-authored).
-- `requested_by` must be the caller's own profile: authorship of a request
-- that carries budget consequences must not be forgeable.
CREATE POLICY recruitment_requests_insert ON recruitment_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    check_vpra('recruitmentPlan'::process_area, 'prepare'::vpra_level, org_unit_id)
    AND requested_by = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY recruitment_requests_update ON recruitment_requests
  FOR UPDATE TO authenticated
  USING (check_vpra('recruitmentPlan'::process_area, 'prepare'::vpra_level, org_unit_id))
  WITH CHECK (check_vpra('recruitmentPlan'::process_area, 'prepare'::vpra_level, org_unit_id));

-- No DELETE policy: soft-delete via `deleted_at` only (CLAUDE.md §5-A rule 7).

-- The competency links inherit their parent request's visibility, resolved
-- through it (this table has no org_unit_id of its own) -- the same pattern
-- `evaluation_scores` uses via `evaluations` and `calibration_results` via
-- `calibration_sessions`.
CREATE POLICY recruitment_request_competencies_select ON recruitment_request_competencies
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recruitment_requests r
      WHERE r.id = request_id
        AND (
          r.requested_by = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
          OR check_vpra('recruitmentPlan'::process_area, 'view'::vpra_level, r.org_unit_id)
          OR check_vpra_global('recruitmentBudget'::process_area, 'view'::vpra_level)
        )
    )
  );

CREATE POLICY recruitment_request_competencies_insert ON recruitment_request_competencies
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recruitment_requests r
      WHERE r.id = request_id
        AND check_vpra('recruitmentPlan'::process_area, 'prepare'::vpra_level, r.org_unit_id)
    )
  );

CREATE POLICY recruitment_request_competencies_update ON recruitment_request_competencies
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recruitment_requests r
      WHERE r.id = request_id
        AND check_vpra('recruitmentPlan'::process_area, 'prepare'::vpra_level, r.org_unit_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recruitment_requests r
      WHERE r.id = request_id
        AND check_vpra('recruitmentPlan'::process_area, 'prepare'::vpra_level, r.org_unit_id)
    )
  );

COMMIT;

-- ============================================================================
-- Verification -- run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================
-- Expect the 3 new enum types:
--   SELECT typname FROM pg_type WHERE typname LIKE 'recruitment\_%';
-- Expect RLS enabled + 3 policies on recruitment_requests, 3 on the link table:
--   SELECT tablename, count(*) FROM pg_policies
--     WHERE tablename LIKE 'recruitment_request%' GROUP BY tablename;
-- Expect the plan status CHECK to reject an unknown value:
--   INSERT INTO recruitment_plans (name_ar, plan_year, status)
--     VALUES ('x', 2099, 'bogus');  -- must fail 23514
-- Expect an org-unit-scoped 'recruitmentPlan' role to see ONLY its own
-- subtree's requests, while a scope='all' role sees every request.
