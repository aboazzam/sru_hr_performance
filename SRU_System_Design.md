# SRU Employee Performance App — System Design
## مستند التصميم — Design + Planning Phase (لا تنفيذ)

**تاريخ:** 2026-07-13
**الحالة:** مسودة للمراجعة والاعتماد — لم يُنفَّذ أي كود أو SQL بعد.

**افتراضات مبنية على إجابات المستخدم:**
- ~275 موظف — **[غير مؤكد، معلّق 2026-07-14]** رقم متعارض مع افتراض آخر (1,050 موظف) ورد في نموذج أولي منفصل (`hr_performance_dashboard.jsx`، غير مدمج بهذا المشروع). CLAUDE.md لا يحدد عدداً. لا تُعتمد أي بطاقة KPI أو استيراد بيانات فعلي على أي من الرقمين حتى يُحسَم صراحة.
- دورة تقييم **نصف سنوية**، ودورة ترقيات/مكافآت **سنوية** (منفصلتان)
- 360° مجهول الهوية (anonymous) — يشارك: Supervisor, Peers, Customers, Self (Employee)
- Calibration: بدون توزيع إجباري (guided, not forced)
- إشعارات: in-app + email رسمي
- ربط جداول SalaryScale.xlsx و Career_path.xlsx بالـ DB منذ MVP
- Auth: email+password أولاً، SSO لاحقاً (Phase 2)
- يوجد ERP — تكامل مستقبلي (Phase 2، sync لاحق)
- i18n كامل وفعّال (AR ⇄ EN) من MVP
- Audit log retention: 5 سنوات

---

## (A) خريطة الوحدات والصفحات (Modules & Routes)

### Modules
1. **Auth & Onboarding** — دخول، دعوات (invite-only)
2. **Dashboard** — لوحة تختلف حسب الدور (KPIs، مهام معلّقة، تنبيهات)
3. **Employee Master Data** — بيانات الموظفين (إدخال يدوي + **استيراد جماعي من Excel**)، sync مع ERP لاحقاً (Phase 2)
4. **Org Structure** — org_units, job_families, job_titles
5. **Career & Compensation** — career_path, salary_scale (من الملفين المرفوعين)
6. **Competency Framework** — pillars/domains/competencies/behavioral levels
7. **Goals** — goal_library + goal assignment
8. **BAU Tasks**
9. **Evaluation** — self / supervisor / peer / customer (360)، بحالة lifecycle
10. **Calibration** — جلسات معايرة (guided، غير إجبارية)
11. **Promotions & Rewards** — دورة سنوية منفصلة
12. **Vacancies**
13. **User & Role Management (VPRA)** — روابط أدوار ديناميكية
14. **Notifications Center** — in-app + email
15. **Audit Log & Reports**
16. **Settings** — i18n، تفضيلات

### Routes (Next.js App Router — `[locale]` segment لدعم AR/EN كامل)
```
/[locale]/(auth)/login
/[locale]/(auth)/invite/[token]                 -- تفعيل الحساب من الدعوة

/[locale]/dashboard

/[locale]/employees
/[locale]/employees/[id]
/[locale]/employees/import                       -- استيراد جماعي من Excel (VPRA: employeeData ≥ prepare)
/[locale]/employees/import/[batchId]              -- مراجعة/تأكيد دفعة استيراد قبل الـ commit

/[locale]/org-units
/[locale]/job-titles
/[locale]/career-path
/[locale]/salary-scale                           -- VPRA: employeeData/careerPath فقط

/[locale]/competencies
/[locale]/competencies/framework

/[locale]/goals/library
/[locale]/goals/assign

/[locale]/bau-tasks

/[locale]/evaluations
/[locale]/evaluations/[id]
/[locale]/evaluations/[id]/360

/[locale]/calibration
/[locale]/calibration/[sessionId]

/[locale]/promotions
/[locale]/rewards
/[locale]/vacancies

/[locale]/admin/roles
/[locale]/admin/users
/[locale]/admin/audit-log

/[locale]/notifications
/[locale]/settings
```

### RTL / i18n — قواعد التنفيذ
- `next-intl` middleware يحدد `locale` من الـ URL segment (`ar` افتراضي، `en` ثانوي).
- `<html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>` يُضبط على مستوى الـ root layout.
- كل النصوص عبر ملفات `messages/ar.json` و `messages/en.json` — ممنوع نص مباشر (hardcoded) في الكومبوننتات.
- تبديل اللغة **لا يغيّر أي منطق صلاحيات** — VPRA وحالة الـ lifecycle يُتحققان server-side بغض النظر عن اللغة.
- الخط: Cairo لكل اللغات (حسب SRU_IDENTITY.md) — لا خط مختلف للإنجليزية إلا إذا حدّد الملف خلاف ذلك.

---

## (B) ERD نصي + الجداول الأساسية

### Org & Career (مبنية على الملفين المرفوعين)
```
org_units
  id, name_ar, name_en, parent_id -> org_units.id, type, deleted_at

job_families                                   -- "القطاعات/Sectors" من الملف (المالية، التقنية، القبول...)
  id, name_ar, name_en

job_titles
  id, job_family_id -> job_families.id
  grade_level SMALLINT (1-14)                   -- من عمود "المستوى/المرتبة"
  name_ar, name_en
  qualification_required TEXT
  category ENUM('leadership','academic','admin') -- من "الفئة"

career_path                                     -- من ورقة "Career Path"
  id, from_job_title_id -> job_titles.id
  to_job_title_id -> job_titles.id
  requirements_ar, requirements_en

salary_scale                                    -- من ورقة "Admin/Academic Salary Structure"
  id, job_title_id -> job_titles.id
  step_a, step_b, step_c, step_d(mid_point), step_e, step_f, step_g NUMERIC
  annual_increase_cap NUMERIC
  effective_date DATE
```
**[معتمد]** لا تُدرج البدلات (نقل/سكن/انتداب داخلي وخارجي) ضمن `salary_scale` — لا في MVP ولا Phase 2 الحالي. الجدول يقتصر على درجات الأساسي (Steps A–G) فقط.

### Core
```
profiles                                        -- FK -> auth.users.id
  id, employee_number, full_name_ar, full_name_en
  org_unit_id -> org_units.id
  job_title_id -> job_titles.id
  hire_date, status ENUM('active','on_leave','terminated')
  deleted_at                                     -- soft delete فقط (قاعدة 7 في SECURITY_CHECKLIST)

employee_import_batches                          -- كل عملية استيراد Excel = دفعة (batch)
  id, file_name, uploaded_by -> profiles.id
  status ENUM('uploaded','validated','committed','cancelled')
  total_rows, valid_rows, error_rows
  created_at, committed_at

employee_import_rows                             -- staging: صف بصف قبل الاعتماد النهائي
  id, batch_id -> employee_import_batches.id
  row_number
  raw_data JSONB                                  -- القيم الخام كما في الملف، قبل أي تحويل
  mapped_employee_number, mapped_org_unit_id, mapped_job_title_id, mapped_hire_date, ...
  validation_status ENUM('valid','error','duplicate')
  validation_errors JSONB NULLABLE
  action ENUM('create','update','skip')           -- update لو employee_number موجود مسبقاً
  resulting_profile_id -> profiles.id NULLABLE     -- يُملأ بعد الـ commit
```

### Permissions (VPRA — مطابق لـ CLAUDE.md قسم 4-B)
```
roles(id, role_code, name_ar, name_en, is_system_role, created_by, created_at)
role_permissions(role_id, process_area, vpra_level)
user_roles(user_id, role_id, scope_type ENUM('all','org_unit'), org_unit_id NULLABLE, assigned_by, assigned_at)
```
process_area: enum ثابت بالقيم الاثنتي عشرة المذكورة في CLAUDE.md (goalsLibrary, evaluation, calibration...).

### Competency Framework
```
competency_pillars(id, name_ar, name_en)
competency_domains(id, pillar_id, name_ar, name_en)
competencies(id, domain_id, type ENUM('core','specialized'), job_family_id NULLABLE)
competency_levels(id, competency_id, level ENUM('basic','practitioner','advanced','professional'), behavior_ar, behavior_en)
```
**[مصحَّح 2026-07-14]** القيم أعلاه مطابقة للملفين الرسميين الفعليين (`إطار الجدارات لموظفي جامعة سليمان الراجحي.docx` و`مصفوفة الجدارات لموظفي الجامعة.xlsx`)، وليست الأسماء الأصلية في هذه الفقرة (`institutional`/`leadership`/`technical` و`intermediate`/`expert`) — تلك كانت خطأً افتراضياً قبل فحص الملفين فعلياً. راجع `src/lib/data/competencies.ts` للتفاصيل الكاملة (27 جدارة مستخرجة آلياً، مع تعليق يوثّق أن نوع "قيادية" (leadership) غير ممثَّل فعلياً في أي صف من المصفوفة الرسمية رغم ذكره في مقدمة الوثيقة).

### Goals / BAU
```
goal_library(id, title_ar, title_en, description, default_weight, job_family_id)
goals(id, employee_id, cycle_id, goal_library_id NULLABLE, custom_title, weight, target, status)
bau_tasks(id, employee_id, cycle_id, title, weight, status)
```

### Evaluation Cycles & Lifecycle
```
evaluation_cycles
  id, name, cycle_type ENUM('semi_annual_review','annual_promotion_rewards')
  period_start, period_end, status ENUM('planned','active','closed')

evaluations
  id, employee_id, cycle_id
  eval_type ENUM('self','supervisor','peer','customer')
  state ENUM('draft','submitted','supervisor_reviewed','manager_recommended',
             'committee_reviewed','approved','finalized')   -- state machine من CLAUDE.md 4-A
  created_by, updated_at

evaluation_scores(id, evaluation_id, competency_id NULLABLE, goal_id NULLABLE, score, comment)
```

### 360° Feedback — مع مراعاة "مجهول الهوية"
```
feedback_360
  id, cycle_id, target_employee_id -> profiles.id
  evaluator_relation ENUM('supervisor','peer','customer','self')
  evaluator_id -> profiles.id       -- محمي: RLS يمنع أي طرف من رؤيته إلا system/super_admin
  is_anonymous BOOLEAN DEFAULT true
  scores JSONB, comments TEXT
  submitted_at
```
**[معتمد]** استراتيجية إخفاء الهوية: `evaluator_id` **يُخزَّن** (لأغراض تدقيق/نزاعات) لكنه **لا يُعرض أبداً** للموظف المُقيَّم أو مديره المباشر عبر أي RLS policy أو view — يظهر فقط لـ `super_admin` عبر إجراء موثّق بـ audit_log منفصل ("كشف هوية مقيّم — سبب: ...").

### Calibration & Rewards
```
calibration_sessions(id, cycle_id, org_unit_id, status, mode ENUM('guided') , notes)
calibration_results(id, session_id, employee_id, original_rating, calibrated_rating, justification)

promotions(id, employee_id, cycle_id, from_job_title_id, to_job_title_id, status, approved_by)
rewards(id, employee_id, cycle_id, reward_type, amount, status, approved_by)
vacancies(id, job_title_id, org_unit_id, status, requirements)
```
ملاحظة: `calibration_sessions.mode = 'guided'` فقط (لا نسب إجبارية) — حسب إجابتك.

### System
```
audit_log
  id, actor_id, action, entity, entity_id
  before_data JSONB, after_data JSONB
  ip_address, created_at
  -- Retention: 5 سنوات -> job دوري (pg_cron/Edge Function) للأرشفة/الحذف بعد 5 سنوات
  -- كل عملية أرشفة/حذف نفسها تُسجَّل بسطر audit_log جديد

notifications(id, user_id, channel ENUM('in_app','email'), title, body, read_at, sent_at, related_entity)

erp_sync_log                                    -- Phase 2 — placeholder فقط الآن
  id, entity, external_ref, synced_at, status
```

---

## (C) خطة الأمان — Supabase Auth (Invite-only) + RLS

### تدفق الدخول (Invite-only، لا Signup عام)
1. **إعداد المشروع:** تعطيل Signup العام من Supabase Dashboard (`Authentication > Providers > Email > Disable signup`).
2. **إنشاء المستخدم:** `super_admin`/`hr_admin` يضيف `profile` جديد من الواجهة → Server Action يستدعي Supabase Admin API (`auth.admin.inviteUserByEmail`) — **service_role key يُستخدم فقط داخل Server Action، لا يصل للـ client أبداً**.
3. المستخدم يستلم بريد الدعوة → يضبط كلمة المرور → Trigger على `auth.users` (INSERT) يربط تلقائياً بسجل `profiles` الموجود مسبقاً (عبر البريد الإلكتروني كمطابقة).
4. **Phase 2:** SSO عبر Supabase (SAML/OIDC) — لا يغيّر جدول `profiles`، فقط طبقة الـ Auth provider.

### RLS — القواعد غير القابلة للتفاوض (من CLAUDE.md §5-A و PROJECT_STRICT قاعدة 14)
- `ALTER TABLE x ENABLE ROW LEVEL SECURITY` على **كل** جدول فيه بيانات أعمال — من أول migration، بدون استثناء.
- **لا** `USING (true)` على أي جدول حساس.
- **لا وصول لـ `anon`** على أي جدول عمل — فقط `authenticated`.
- كل policy تتحقق من **VPRA + Scope + Evaluation State** معاً (وليس VPRA وحده) — عبر دالة `SECURITY DEFINER` مركزية، مثال منطقي:
  ```sql
  -- [استنتاج] شكل عام، ليس SQL نهائي — يُبنى فعلياً في جلسة تنفيذ لاحقة
  CREATE FUNCTION check_vpra(process_area text, min_level text, target_org_unit uuid)
  RETURNS boolean SECURITY DEFINER ...
  ```
- **state transitions** (draft → submitted → ...) تُنفَّذ فقط عبر Server Action / RPC، أبداً من تحديث مباشر على العميل.
- **feedback_360.evaluator_id**: RLS منفصلة أشد صرامة — `SELECT` مقيّد بدور `super_admin` فقط مع تسجيل audit_log لكل قراءة.

### نقاط أخرى (SECURITY_CHECKLIST.md)
| البند | القرار |
|---|---|
| Soft delete | `deleted_at` على `profiles` وكل الجداول الحساسة — لا `DELETE` فعلي |
| Zod | كل input في Server Action/Route Handler يُتحقق منه قبل لمس DB |
| Audit retention | 5 سنوات — job دوري + توثيق كل أرشفة |
| Rate limiting | على أي route عام (حتى endpoint الدعوة) عبر middleware/Upstash |
| Security headers | داخل `next.config.ts` → `headers()` |

### استيراد بيانات الموظفين من Excel — قواعد أمان إلزامية
[استنتاج] هذه نقطة إدخال بيانات جماعية حساسة (تشبه من حيث الخطورة "نقاط الدخول العامة" في قاعدة 12 من PROJECT_STRICT، وإن لم تكن anon):
1. **VPRA:** الرفع مقصور على `employeeData ≥ prepare`، والاعتماد النهائي (commit) يتطلب `employeeData ≥ approve` — دور منفصل عن الرفع (فصل الصلاحيات).
2. **لا ثقة بالملف كمصدر مباشر:** الملف يُرفع أولاً إلى Storage، ثم يُعاد **تحليله (parse) على السيرفر فقط** (SheetJS/`xlsx` في Server Action) — لا يُعتمد أي تحليل تم على المتصفح (client-side) كمصدر للبيانات النهائية، حتى لو استُخدم للعرض المسبق (preview) فقط.
3. **مرحلة Staging إلزامية:** لا كتابة مباشرة على `profiles`. كل صف يمر أولاً بـ `employee_import_rows` مع `validation_status` — المستخدم يراجع الأخطاء والتكرارات (`duplicate` عبر `employee_number`) قبل أي `commit`.
4. **Zod schema صارم** لكل عمود متوقَّع (نوع البيانات، القيم المسموحة لـ `org_unit_id`/`job_title_id` كـ FK صالحة فعلياً في الجداول المرجعية — لا قيمة نصية حرة).
5. **حد أقصى لحجم/عدد الصفوف** بالملف الواحد (مثلاً 2000 صف) لمنع DoS عبر ملف ضخم.
6. **audit_log إلزامي** لكل batch: من رفعه، من اعتمده، عدد السجلات المُنشأة/المُحدَّثة، ووقت الـ commit.
7. **لا حذف فعلي أبداً** حتى لو الملف يشير لموظف "منتهي الخدمة" — يُحدَّث `status` و`deleted_at` فقط، لا `DELETE`.
8. **الاستيراد لا يُنشئ حسابات Auth تلقائياً** — إنشاء `profile` عبر الاستيراد منفصل عن دعوة الدخول (invite)؛ الدعوة تُرسل لاحقاً يدوياً أو بإجراء منفصل صريح لكل موظف/دفعة (لتفادي إرسال دعوات جماعية بالخطأ لبيانات لم تُراجع بشرياً).

---

## (D) Backlog مرحلي (MVP → Phase 2)

### أول 10 مهام — MVP (مرتبة بالأولوية)

| # | المهمة | الأولوية | تقدير المخاطرة | السبب |
|---|---|---|---|---|
| 1 | إعداد Next.js 15 + ربط Supabase project + متغيرات `.env.local` | P0 | منخفضة | أساس تقني، بدون منطق أعمال بعد |
| 2 | Schema: `org_units`, `job_families`, `job_titles`, `career_path`, `salary_scale` + استيراد منظّف من الملفين المرفوعين | P0 | **متوسطة** | بيانات الملفين غير موحدة البنية بين الأوراق (رأيناه أثناء الفحص) — تحتاج تنظيف يدوي قبل الاستيراد |
| 3 | Auth: تعطيل Signup العام + تدفق invite-only + ربط `profiles` بـ `auth.users` | P0 | **متوسطة-عالية** | نقطة دخول حرجة أمنياً — أي خطأ = وصول غير مصرح |
| 4 | Schema: `roles`, `role_permissions`, `user_roles` + seed الأدوار الافتراضية من CLAUDE.md §4 | P0 | متوسطة | مرجع لكل الصلاحيات اللاحقة |
| 5 | RLS baseline: تفعيل على كل جدول + دالة `check_vpra` المركزية | P0 | **عالية** | أخطاء هنا = تسريب بيانات مباشر، لا مجال للتجربة والخطأ في Production |
| 6 | Evaluation lifecycle state machine (server-side فقط) — جدولا `evaluation_cycles` و `evaluations` | P0 | **عالية** | قلب المنطق التجاري؛ أي ثغرة تسمح بتجاوز حالة = فساد بيانات التقييم |
| 7 | واجهة Competency Framework (CRUD للـ pillars/domains/competencies/levels) | P1 | منخفضة | إداري بحت، لا يمس صلاحيات حرجة |
| 8 | Goal library + goal assignment | P1 | متوسطة | يعتمد على VPRA (`goalsLibrary`, `goalAssignment`) الجاهزة من مهمة 4-5 |
| 9 | نماذج تقييم Self/Supervisor + `evaluation_scores` | P0 | متوسطة | يعتمد مباشرة على المهمة 6؛ يجب الالتزام بالـ state machine حرفياً |
| 10 | `audit_log` infrastructure (trigger أو تسجيل على مستوى التطبيق لكل كتابة حساسة) | P0 | متوسطة | يجب أن يكون جاهزاً **قبل** إطلاق أي مهمة تكتب بيانات حقيقية، لا بعدها |
| 11 | استيراد بيانات الموظفين من Excel (`employee_import_batches`/`employee_import_rows` + مراجعة/اعتماد) | P1 | **عالية** | نقطة إدخال بيانات جماعية حساسة (PII) — تعتمد على المهام 2-5 و10 (RLS + audit_log جاهزين أولاً) |

### Phase 2 (بدون ترتيب أولوية تفصيلي بعد — Backlog عام)
- 360° Feedback (peer/customer) + آلية إخفاء الهوية الموصوفة في (B)
- Calibration sessions (guided mode)
- Promotions & Rewards (دورة سنوية منفصلة عن دورة المراجعة)
- Vacancies module
- SSO (Azure AD / SAML)
- تكامل ERP (sync لبيانات الموظفين — يحتاج Scope Lock منفصل ومعرفة API/format الـ ERP)
- Notifications: بناء فعلي لقناتي in-app + email (البنية موجودة من Phase 1، التفعيل الكامل لاحقاً)
- Reports/Export (XLSX/PDF)
- QA كامل لتبديل اللغة (AR/EN) عبر كل الشاشات
- Job دوري لأرشفة/حذف audit_log بعد 5 سنوات

---

## قرارات معتمدة (تحديث 2026-07-13)
1. ✅ إخفاء هوية المقيّم في `feedback_360` — يظهر لـ `super_admin` فقط، مع audit_log لكل كشف.
2. ✅ لا بدلات مالية في `salary_scale` — Steps A–G فقط، لا نقل/سكن/انتداب.
3. ✅ `SalaryScale.xlsx` حُذف من الـ Project من قبل المستخدم (كان مرفوعاً بالخطأ). البيانات الهيكلية اللازمة (السلم 1–14، Steps A–G) موثّقة بالفعل أعلاه في القسم (B) ولا حاجة للملف بعد الآن.

## قرار معلّق واحد متبقٍ
- ✅ **آلية استيراد بيانات الموظفين أصبحت جزءاً رسمياً من التصميم** (Module 3 + مهمة Backlog #11 + قسم أمان مخصص) — لكن **مصدر الملف نفسه** لا يزال معلّقاً: الملف الأصلي (`SalaryScale.xlsx` / ورقة `Staff(Original)`) حُذف. عند الوصول فعلياً لتنفيذ المهمة #11، ستحتاج تزويدي بملف Excel نظيف ومحدَّث (تصدير جديد من ERP أو ملف يدوي) يطابق الأعمدة المتوقعة في `employee_import_rows` (رقم الموظف، الاسم، الوحدة التنظيمية، المسمى الوظيفي، تاريخ التعيين...).
