-- ============================================================================
-- Adds two new process_area values backing the Reports module's
-- upcoming tab-level permission gates, per direct request: "اضف التقارير
-- كعنوان في الصلاحيات وبعدها تضيف تقارير الاداء تقارير الاستراتيجية
-- تقارير الجدارات بحيث تظهر فقط لمن له الصلاحية" -- "هذه التقارير تظهر
-- كتبويبات في موديول التقارير وتضاف سكاشن في جدول الصلاحيات" (these
-- reports show as tabs in the Reports module, and are added as sections
-- in the permissions table).
--
-- Only TWO new areas, not three: "تقارير الاستراتيجية" (Strategic
-- Reports) deliberately REUSES the existing `strategicPlanning` area
-- rather than duplicating it -- that area's own VPRA-level design already
-- separates module management (`approve`, strategy_admin) from read-only
-- oversight (`view`, ceo -- confirmed in `/reports`'s own 2026-07-27 code
-- comment: "الرئيس التنفيذي يكون له صلاحية الاطلاع والمتابعة من خلال
-- داشبورد متابعة"). Adding a second, parallel grant for the exact same
-- "can view strategic reporting" question would fragment one already-
-- correct permission into two that must always be kept in sync -- not
-- requested, and against this project's established reuse-don't-duplicate
-- precedent (feedback_360/evaluation, org_units/employeeData, etc.).
--
-- `performanceReports` and `competencyReports` ARE genuinely new: no
-- existing area answers "can this person see the aggregate performance
-- dashboard" or "can this person see aggregate competency-framework
-- reporting" today -- performance data on /reports is currently a bundle
-- of many DIFFERENT existing grants (evaluation, calibration, promotions,
-- vacancies, employeeData, orgStructure/staffing, userManagement), each
-- gating its own card with no single umbrella permission; competency
-- reporting has no report surface at all yet.
--
-- No role_permissions rows seeded here -- per CLAUDE.md §4-B "new roles
-- inherit none on all Process Areas by default" and the request's own
-- explicit framing ("بحيث تظهر فقط لمن له الصلاحية"), access is granted
-- deliberately through the existing /admin role editor, not assumed.
-- ============================================================================

ALTER TYPE process_area ADD VALUE 'performanceReports';
ALTER TYPE process_area ADD VALUE 'competencyReports';

-- ============================================================================
-- Verification -- run AFTER applying, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect both new values present in the enum's labels.
-- SELECT enumlabel FROM pg_enum
--   WHERE enumtypid = 'process_area'::regtype
--   AND enumlabel IN ('performanceReports', 'competencyReports');

-- Expect zero role_permissions rows for either -- deliberately unseeded.
-- SELECT count(*) FROM role_permissions WHERE process_area IN ('performanceReports', 'competencyReports');
