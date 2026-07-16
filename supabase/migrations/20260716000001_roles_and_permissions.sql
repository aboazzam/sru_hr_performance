-- ============================================================================
-- Roles & Permissions (VPRA) — initial schema
--
-- STATUS: DRAFT, UNVERIFIED. No Supabase project is connected to this repo
-- yet (no .env.local, no live DB). This file has NOT been executed against
-- a real Postgres instance and has NOT been checked with `EXPLAIN` or any
-- parser. Review line by line before running. Once a project is linked,
-- run via `supabase db push` (or the SQL editor) and re-verify the row
-- counts / RLS state with the SELECT queries at the bottom of this file
-- before trusting it in any other environment.
--
-- Source: SRU_System_Design.md §B "Permissions (VPRA — مطابق لـ CLAUDE.md
-- قسم 4-B)", cross-checked against CLAUDE.md §4 and the already-tested
-- src/lib/vpra.ts (67 passing Vitest cases as of this writing).
--
-- [استنتاج] Assumes gen_random_uuid() is available without an explicit
-- CREATE EXTENSION (true on Postgres 13+ core / any current Supabase
-- project, but unverified against the actual project since none is linked).
--
-- Scope: roles, role_permissions, user_roles only. org_units does not exist
-- yet in this repo's migrations, so user_roles.org_unit_id is a plain UUID
-- column here (no FK) — a follow-up migration must add
-- `ALTER TABLE user_roles ADD CONSTRAINT ... FOREIGN KEY (org_unit_id)
-- REFERENCES org_units(id) ON DELETE CASCADE` once that table exists.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Enum types
-- process_area and vpra_level are a FIXED set of 12 / 5 values per CLAUDE.md
-- §4 — mirrored exactly from src/lib/vpra.ts's ProcessArea/VpraLevel TS
-- unions, so an enum is appropriate (unlike roles, which CLAUDE.md §4-B
-- explicitly says must stay admin-extensible at runtime — hence
-- roles.role_code below is free TEXT + UNIQUE, not an enum).
-- ----------------------------------------------------------------------------

CREATE TYPE process_area AS ENUM (
  'goalsLibrary',
  'competencyFramework',
  'defaultTemplates',
  'goalAssignment',
  'bauTasks',
  'evaluation',
  'calibration',
  'promotions',
  'vacancies',
  'careerPath',
  'employeeData',
  'userManagement'
);

CREATE TYPE vpra_level AS ENUM ('none', 'view', 'prepare', 'recommend', 'approve');

CREATE TYPE role_scope_type AS ENUM ('all', 'org_unit');

-- ----------------------------------------------------------------------------
-- roles — CLAUDE.md §4-B: seeded defaults only, admin-configurable at
-- runtime by super_admin/hr_admin. is_system_role = true means it ships
-- with the product and cannot be deleted from the UI (still just data,
-- not enforced by this migration — that check belongs in application code
-- / a future trigger, not invented here).
-- ----------------------------------------------------------------------------

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  is_system_role BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE roles IS 'CLAUDE.md §4/§4-B. 12 rows seeded below are defaults only, not a fixed enum — admins can add more.';

-- ----------------------------------------------------------------------------
-- role_permissions — the flat, state-independent VPRA baseline per
-- (role, process_area). Deliberately seeded EMPTY in this migration: the
-- 12 roles x 12 process areas baseline matrix is a real business decision
-- not documented anywhere in CLAUDE.md/SRU_System_Design.md today (CLAUDE.md
-- §4-A only documents the `evaluation` area's *per-lifecycle-state* table,
-- already implemented in src/lib/vpra.ts — that is a separate, more
-- granular mechanism layered on top of this flat table, not a substitute
-- for it). Populating this table requires an explicit decision from the
-- project owner, role by role — do not invent values here.
-- ----------------------------------------------------------------------------

CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  process_area process_area NOT NULL,
  vpra_level vpra_level NOT NULL DEFAULT 'none',
  PRIMARY KEY (role_id, process_area)
);

COMMENT ON TABLE role_permissions IS 'Flat per-process-area VPRA baseline. Evaluation''s per-lifecycle-state override lives in application logic (src/lib/vpra.ts), not here.';

-- ----------------------------------------------------------------------------
-- user_roles — CLAUDE.md §4-B. org_unit_id has no FK yet (see header note).
-- ----------------------------------------------------------------------------

CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
  scope_type role_scope_type NOT NULL DEFAULT 'all',
  org_unit_id UUID, -- no FK yet: org_units table doesn't exist in this repo's migrations. See header note.
  assigned_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE user_roles IS 'CLAUDE.md §4-B. org_unit_id FK to be added once an org_units migration exists.';

-- A single `UNIQUE (user_id, role_id, scope_type, org_unit_id)` table
-- constraint would NOT actually stop duplicate "all-scope" assignments:
-- SQL treats every NULL as distinct from every other NULL, and
-- org_unit_id is NULL whenever scope_type = 'all' — so two identical
-- (user, role, 'all', NULL) rows would both satisfy that constraint. Two
-- partial unique indexes are the correct way to express "unique per scope"
-- when one of the key columns is nullable.
CREATE UNIQUE INDEX user_roles_global_unique ON user_roles (user_id, role_id) WHERE scope_type = 'all';
CREATE UNIQUE INDEX user_roles_org_unit_unique ON user_roles (user_id, role_id, org_unit_id) WHERE scope_type = 'org_unit';

-- ----------------------------------------------------------------------------
-- RLS — enabled from creation with ZERO policies, per PROJECT_STRICT.md
-- rule 14 ("عدم وجود policy = منع كامل، وهذا أأمن من الانفتاح الافتراضي")
-- and CLAUDE.md §5-A #2 ("never USING (true) on a sensitive table"). This
-- is a deliberate default-deny, not a placeholder — do NOT add a
-- `USING (true)` policy to unblock local testing. Real policies depend on
-- a `profiles` table and a `check_vpra()` SECURITY DEFINER function
-- (sketched in SRU_System_Design.md §C) that don't exist yet; add them in
-- the migration that introduces `profiles` and auth, not here.
-- ----------------------------------------------------------------------------

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Seed: the 12 default roles, generated verbatim from
-- src/lib/vpra.ts's `defaultRoles` (not retyped by hand, to rule out
-- transcription drift between the TS source of truth and this seed).
-- ----------------------------------------------------------------------------

INSERT INTO roles (role_code, name_ar, is_system_role) VALUES
  ('super_admin', 'مدير النظام', true),
  ('ceo', 'الرئيس التنفيذي', true),
  ('cxo', 'رئيس تنفيذي', true),
  ('hr_admin', 'مدير الموارد البشرية', true),
  ('strategy_admin', 'مدير الاستراتيجية', true),
  ('competencies_admin', 'مدير الجدارات', true),
  ('committee', 'لجنة التقييم', true),
  ('manager', 'عميد / مدير', true),
  ('supervisor', 'رئيس مباشر', true),
  ('employee', 'موظف', true),
  ('field_supervisor', 'مشرف ميداني', true),
  ('mentor', 'مرشد', true);

COMMIT;

-- ============================================================================
-- Verification queries — run these AFTER the migration and BEFORE trusting
-- it, per PROJECT_STRICT.md rule 10. Expected results noted inline.
-- ============================================================================

-- Expect: 3 rows, rowsecurity = true for all three.
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND tablename IN ('roles', 'role_permissions', 'user_roles');

-- Expect: 0 rows (confirms no accidental USING (true) policy exists).
-- SELECT tablename, policyname, qual FROM pg_policies
--   WHERE schemaname = 'public' AND tablename IN ('roles', 'role_permissions', 'user_roles');

-- Expect: exactly 12 rows, role_code values matching src/lib/vpra.ts's defaultRoles exactly.
-- SELECT role_code, name_ar, is_system_role FROM roles ORDER BY role_code;

-- Expect: 2 rows (user_roles_global_unique, user_roles_org_unit_unique).
-- SELECT indexname FROM pg_indexes WHERE tablename = 'user_roles' AND indexname LIKE 'user_roles_%_unique';
