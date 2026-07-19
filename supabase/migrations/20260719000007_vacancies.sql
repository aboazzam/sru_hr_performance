-- ============================================================================
-- `vacancies` table (CLAUDE.md §4 process area "vacancies"; also
-- SRU_System_Design.md §B line 209) -- schema + RLS, needed before the
-- requested UI can have anything real to list/create.
--
-- Column set transcribed from SRU_System_Design.md's own ERD:
--   vacancies(id, job_title_id, org_unit_id, status, requirements)
--
-- [استنتاج] `requirements` is split into `requirements_ar`/`requirements_en`,
-- matching `career_path.requirements_ar`/`requirements_en` -- curated
-- HR-authored content when posting a vacancy, not one-off free-form prose
-- like `feedback_360.comments`, so the bilingual-split convention applies
-- here rather than the single-column convention.
--
-- [استنتاج] `status` is TEXT with no CHECK enum -- no documented
-- vocabulary exists (open/closed/filled are the obvious values but none
-- is confirmed), same precedent as `promotions.status`/`rewards.status`,
-- defaults `'open'`.
--
-- RLS designed directly against the real seeded role_permissions matrix
-- for process_area='vacancies', checked before writing any policy:
-- {hr_admin: approve, manager: recommend, ceo/cxo/employee/strategy_admin/
-- super_admin: view}. Notably `employee` holds `'view'` here (unlike
-- `promotions`/`rewards`/`calibration`, where no individual role held any
-- grant at all) -- vacancies are internal job postings, meant to be
-- visible to every staff member, not restricted to oversight roles. No
-- role holds `'prepare'`; only `hr_admin`/`manager` reach `'recommend'`+,
-- both genuinely administrative, so gating writes at `'recommend'` is
-- still safe -- `employee`'s `'view'` grant doesn't reach that bar so it
-- creates no ambiguity.
--
--   vacancies_select: check_vpra('vacancies','view', org_unit_id) --
--     broad, matches every seeded role's `'view'`+ grant.
--   vacancies_insert: check_vpra('vacancies','approve', org_unit_id) --
--     hr_admin only, creating a new posting is a distinct administrative
--     action (same distinction drawn for `promotions`/`calibration_
--     sessions` inserts).
--   vacancies_update: check_vpra('vacancies','recommend', org_unit_id) --
--     hr_admin + manager, e.g. closing/marking a vacancy filled within
--     their own org unit.
--
-- No self-row concept applies -- vacancies aren't owned by an individual
-- employee, same as `calibration_sessions`. No DELETE policy (soft-delete
-- via `deleted_at` only, CLAUDE.md §5-A rule 7).
-- ============================================================================

BEGIN;

CREATE TABLE vacancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_title_id UUID NOT NULL REFERENCES job_titles(id) ON DELETE RESTRICT,
  org_unit_id UUID NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'open',
  requirements_ar TEXT,
  requirements_en TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE vacancies ENABLE ROW LEVEL SECURITY;

CREATE POLICY vacancies_select ON vacancies
  FOR SELECT
  TO authenticated
  USING (check_vpra('vacancies'::process_area, 'view'::vpra_level, org_unit_id));

CREATE POLICY vacancies_insert ON vacancies
  FOR INSERT
  TO authenticated
  WITH CHECK (check_vpra('vacancies'::process_area, 'approve'::vpra_level, org_unit_id));

CREATE POLICY vacancies_update ON vacancies
  FOR UPDATE
  TO authenticated
  USING (check_vpra('vacancies'::process_area, 'recommend'::vpra_level, org_unit_id))
  WITH CHECK (check_vpra('vacancies'::process_area, 'recommend'::vpra_level, org_unit_id));

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: a real `hr_admin` test user (approve) can create and update a
-- vacancy in their scope; a real `manager` test user (recommend,
-- org_unit-scoped) can SELECT/UPDATE an in-scope vacancy but cannot
-- INSERT, and sees zero rows for a vacancy in a genuinely unrelated org
-- unit; a real `employee` test user (view only) can SELECT any in-scope
-- vacancy but cannot INSERT/UPDATE.
