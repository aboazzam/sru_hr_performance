-- ============================================================================
-- auth.users -> profiles linking trigger (SRU_System_Design.md §C step 3)
--
-- ----------------------------------------------------------------------------
-- [تصحيح بنيوي ضروري، اكتُشف أثناء بناء هذه المهمة] `profiles.id` كان في
-- 20260716000004 مفتاحًا أساسيًا يحمل FK مباشرًا إلى auth.users(id) — أي أن
-- إنشاء صف profiles كان يتطلب وجود صف auth.users مطابق مسبقًا. هذا يتعارض
-- فعليًا مع تدفق الدعوة الموثّق في SRU_System_Design.md §C نفسه:
--   "2. hr_admin يضيف profile جديد من الواجهة -> Server Action يستدعي
--    inviteUserByEmail... 3. المستخدم يستلم الدعوة -> يضبط كلمة المرور ->
--    Trigger على auth.users (INSERT) يربط تلقائياً بسجل profiles الموجود
--    مسبقاً (عبر البريد الإلكتروني)."
-- هذا يفترض صراحة أن profiles يُنشأ *قبل* وجود أي auth.users مطابق (يتوافق
-- أيضاً مع §C's "الاستيراد لا يُنشئ حسابات Auth تلقائياً" -- استيراد Excel
-- الجماعي يُنشئ profiles لموظفين قد لا يُدعَون للدخول للنظام إطلاقاً، مثل
-- بعض فئات العمالة الميدانية). الـ FK المباشر على المفتاح الأساسي يجعل هذا
-- التدفق مستحيلاً حرفياً (INSERT على profiles كان سيفشل بخطأ FK قبل وجود
-- المستخدم). هذا الملف يصحح ذلك: `id` يصبح مفتاحاً سطحياً مستقلاً
-- (surrogate key، gen_random_uuid() افتراضياً)، ويُضاف عمود `email` (للمطابقة
-- والدعوة) وعمود `auth_user_id` (nullable، يُملأ بواسطة الـ trigger أدناه
-- بمجرد قبول المستخدم للدعوة). لا صفوف موجودة في profiles حالياً (0 صف
-- مُتحقَّق فعليًا قبل كتابة هذا الملف) — لا حاجة لخطوة ترحيل بيانات.
--
-- Scope: هذا الملف يبني الـ trigger + التعديل البنيوي اللازم له فقط. لا
-- يبني Server Action الدعوة نفسها (`auth.admin.inviteUserByEmail`) ولا شاشة
-- "إضافة موظف" -- تلك خطوة تالية منفصلة صراحة.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- profiles: فك الارتباط المباشر بين id والمصادقة، وإضافة عمودي المطابقة
-- ----------------------------------------------------------------------------

ALTER TABLE profiles DROP CONSTRAINT profiles_id_fkey;
ALTER TABLE profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE profiles ADD COLUMN email TEXT NOT NULL UNIQUE;
ALTER TABLE profiles ADD COLUMN auth_user_id UUID UNIQUE REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN profiles.email IS 'Match key for the invite-linking trigger (link_profile_to_auth_user) and the address inviteUserByEmail sends to. NOT auth.users.email — that column can differ (e.g. after an email change) and is not used for matching after the initial link.';
COMMENT ON COLUMN profiles.auth_user_id IS 'NULL until the invited person accepts and signs in for the first time (filled in by the on_auth_user_created trigger, matched on email). A profile with auth_user_id IS NULL is a real employee record with no system login yet -- expected for employees never invited (SRU_System_Design.md §C), not an error.';
COMMENT ON CONSTRAINT profiles_pkey ON profiles IS 'id is now an independent surrogate key (gen_random_uuid() default), not a mirror of auth.users.id -- see this migration''s header for why the prior direct FK was wrong.';

-- ----------------------------------------------------------------------------
-- Trigger: links a newly-created auth.users row back to its pre-existing
-- profiles row by email. SECURITY DEFINER because the role that inserts
-- into auth.users (Supabase's GoTrue service) is not `authenticated` and
-- has no reason to satisfy profiles' RLS UPDATE policy
-- (check_vpra('employeeData','prepare', org_unit_id)) -- this system-level
-- linkage must work regardless of that policy, exactly like check_vpra()
-- itself must bypass RLS to read role_permissions/user_roles.
--
-- Silently no-ops (does not raise) when no matching profiles row exists,
-- because Supabase Auth is not exclusively used for pre-provisioned
-- employees today -- e.g. the manually created test users used to verify
-- 20260716000004-000008's RLS policies in this session had no profiles row
-- at all. A future decision could make unmatched signups an error once
-- signup is confirmed fully invite-only end-to-end (CLAUDE.md §5-A's
-- "Signup disabled" deployment checklist item), but that enforcement
-- belongs in Supabase Auth configuration (disabling public signup), not
-- silently rejected here.
-- ----------------------------------------------------------------------------

CREATE FUNCTION link_profile_to_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET auth_user_id = NEW.id
  WHERE email = NEW.email
    AND auth_user_id IS NULL;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION link_profile_to_auth_user IS 'SRU_System_Design.md §C step 3. Fires on every auth.users insert; matches by email against a pre-existing, not-yet-linked profiles row. No-op (not an error) when nothing matches.';

REVOKE ALL ON FUNCTION link_profile_to_auth_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION link_profile_to_auth_user() FROM anon;
-- Deliberately NOT granted to `authenticated` either -- this function is
-- only ever meant to run via the trigger below, never called directly.

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION link_profile_to_auth_user();

-- ----------------------------------------------------------------------------
-- profiles_select policy: `id` no longer equals auth.uid() (see header) --
-- the self-visibility clause must check `auth_user_id` instead now.
-- ----------------------------------------------------------------------------

DROP POLICY profiles_select ON profiles;

CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR check_vpra('employeeData', 'view', org_unit_id));

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER and BEFORE trusting, per PROJECT_STRICT.md
-- rule 10. Expected results noted inline.
-- ============================================================================

-- Expect: 0 rows (the old direct id->auth.users FK is gone).
-- SELECT conname FROM pg_constraint WHERE conrelid = 'profiles'::regclass AND conname = 'profiles_id_fkey';

-- Expect: 2 rows (email NOT NULL/UNIQUE, auth_user_id UNIQUE nullable FK to auth.users).
-- SELECT column_name, is_nullable, data_type FROM information_schema.columns
--   WHERE table_name = 'profiles' AND column_name IN ('email','auth_user_id');

-- Expect: 1 row, tgrelid = 'auth.users'::regclass, tgfoid points to link_profile_to_auth_user.
-- SELECT tgname, tgrelid::regclass, tgfoid::regproc FROM pg_trigger WHERE tgname = 'on_auth_user_created';

-- Live end-to-end test (run manually, not as part of this file):
-- 1. INSERT INTO profiles (employee_number, full_name_ar, email, org_unit_id)
--      VALUES ('EMP-TEST', 'موظف اختبار', 'trigger-test@example.com', <any org_unit id>);
-- 2. Create a matching auth.users row via the Supabase Admin API
--    (POST /auth/v1/admin/users with that same email) -- NOT a raw INSERT,
--    to go through the real path the trigger is meant to intercept.
-- 3. SELECT auth_user_id FROM profiles WHERE email = 'trigger-test@example.com';
--    Expect: NOT NULL, equal to the created user's id.
-- 4. Clean up both rows afterward.
