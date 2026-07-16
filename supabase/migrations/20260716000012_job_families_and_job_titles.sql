-- ============================================================================
-- job_families + job_titles (SRU_System_Design.md §B "Org & Career") — plus
-- completing the two FKs deliberately deferred in earlier migrations now
-- that these tables finally exist.
--
-- [مهم — لا بيانات بذر حقيقية في هذا الملف] على عكس org_units/competencies
-- (استُخرجت من ملفات رسمية مرفوعة فعليًا)، لا يوجد أي مصدر بيانات حقيقي
-- لهذين الجدولين في هذا المستودع. HANDOVER.md §5 يوثّق أن الملف الأصلي
-- (SalaryScale.xlsx / ورقة "Staff(Original)"، ومنه بيانات المسارات
-- الوظيفية والدرجات) حذفه المستخدم من المشروع قبل هذه الجلسة، ولم يُزوَّد
-- بديل. لذا هذه الـ migration تبني **البنية فقط** (schema)، بصفر صف مزروع —
-- زرع بيانات وهمية هنا يخالف الانضباط المتّبع طوال هذا المشروع (لا بيانات
-- مُختلَقة). زرع البيانات الحقيقية مهمة منفصلة صريحة تحتاج ملف Excel نظيف
-- من صاحب المشروع أولاً.
--
-- Source: SRU_System_Design.md §B:
--   job_families(id, name_ar, name_en)
--   job_titles(id, job_family_id -> job_families.id, grade_level SMALLINT(1-14),
--              name_ar, name_en, qualification_required, category)
-- ============================================================================

BEGIN;

CREATE TABLE job_families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL UNIQUE,
  name_en TEXT
);

COMMENT ON TABLE job_families IS 'SRU_System_Design.md §B. Sectors/job families (e.g. المالية، التقنية، القبول). Schema only -- zero seeded rows, no source file exists yet (see header note).';

CREATE TYPE job_title_category AS ENUM ('leadership', 'academic', 'admin');

CREATE TABLE job_titles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_family_id UUID NOT NULL REFERENCES job_families (id) ON DELETE RESTRICT,
  grade_level SMALLINT NOT NULL CHECK (grade_level BETWEEN 1 AND 14),
  name_ar TEXT NOT NULL,
  name_en TEXT,
  qualification_required TEXT,
  category job_title_category NOT NULL,
  deleted_at TIMESTAMPTZ,
  UNIQUE (job_family_id, name_ar)
);

COMMENT ON TABLE job_titles IS 'SRU_System_Design.md §B. The 1-14 grade career ladder. Schema only -- zero seeded rows, no source file exists yet (see header note). Has deleted_at (soft-delete only, CLAUDE.md §5-A rule 7) since profiles/career_path/salary_scale will reference it once built.';
COMMENT ON CONSTRAINT job_titles_job_family_id_fkey ON job_titles IS 'RESTRICT per SECURITY_CHECKLIST.md §1.4, same rationale as org_units.parent_id: deleting a job family that still has job titles under it must fail loudly.';

-- ----------------------------------------------------------------------------
-- Complete the two FKs deliberately deferred in earlier migrations, now
-- that the referenced table exists. Safe: profiles has 0 rows and every
-- seeded competencies row has job_family_id = NULL (both migrations'
-- headers already documented this exact follow-up).
-- ----------------------------------------------------------------------------

ALTER TABLE profiles
  ADD CONSTRAINT profiles_job_title_id_fkey
  FOREIGN KEY (job_title_id) REFERENCES job_titles (id) ON DELETE RESTRICT;

ALTER TABLE competencies
  ADD CONSTRAINT competencies_job_family_id_fkey
  FOREIGN KEY (job_family_id) REFERENCES job_families (id) ON DELETE RESTRICT;

-- ----------------------------------------------------------------------------
-- RLS — process_area = 'careerPath' (CLAUDE.md §4: "Career ladder
-- management" — a direct, documented fit, unlike org_units/profiles'
-- earlier [استنتاج] mapping to employeeData). No org_unit_id on either
-- table -> target_org_unit omitted, same reasoning as the competency
-- framework in migration 6 (global reference data, only 'all'-scope grants
-- can write it). role_permissions already has 11 real careerPath grants
-- from the existing matrix (migrations 7-8) -- no new seed needed here.
--
-- DELETE policy exists only for job_families (no deleted_at column); none
-- for job_titles (has deleted_at, soft-delete via UPDATE only) — same rule
-- established in migration 6.
-- ----------------------------------------------------------------------------

ALTER TABLE job_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_titles ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_families_select ON job_families FOR SELECT TO authenticated
  USING (check_vpra('careerPath', 'view'));
CREATE POLICY job_families_insert ON job_families FOR INSERT TO authenticated
  WITH CHECK (check_vpra('careerPath', 'prepare'));
CREATE POLICY job_families_update ON job_families FOR UPDATE TO authenticated
  USING (check_vpra('careerPath', 'prepare'))
  WITH CHECK (check_vpra('careerPath', 'prepare'));
CREATE POLICY job_families_delete ON job_families FOR DELETE TO authenticated
  USING (check_vpra('careerPath', 'approve'));

CREATE POLICY job_titles_select ON job_titles FOR SELECT TO authenticated
  USING (check_vpra('careerPath', 'view'));
CREATE POLICY job_titles_insert ON job_titles FOR INSERT TO authenticated
  WITH CHECK (check_vpra('careerPath', 'prepare'));
CREATE POLICY job_titles_update ON job_titles FOR UPDATE TO authenticated
  USING (check_vpra('careerPath', 'prepare'))
  WITH CHECK (check_vpra('careerPath', 'prepare'));

COMMIT;

-- ============================================================================
-- Verification — run AFTER and BEFORE trusting, per PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 2 rows, rowsecurity = true for both.
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('job_families','job_titles');

-- Expect: 7 rows total (4 + 3), none with qual/with_check = 'true'.
-- SELECT tablename, count(*), bool_or(qual = 'true') AS any_using_true,
--        bool_or(with_check = 'true') AS any_with_check_true
--   FROM pg_policies WHERE tablename IN ('job_families','job_titles') GROUP BY tablename;

-- Expect: both 0 (schema-only, no seed data).
-- SELECT (SELECT count(*) FROM job_families) AS job_families_count,
--        (SELECT count(*) FROM job_titles) AS job_titles_count;

-- Expect: 2 rows, both confirming the FK now exists.
-- SELECT conname, conrelid::regclass FROM pg_constraint
--   WHERE conname IN ('profiles_job_title_id_fkey', 'competencies_job_family_id_fkey');
