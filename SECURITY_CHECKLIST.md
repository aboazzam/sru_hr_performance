# SECURITY_CHECKLIST.md
## قائمة فحص أمنية لأنظمة HTML + Supabase + Netlify

---

## كيفية الاستخدام

هذه القائمة تُستخدم في حالتين:
1. **مراجعة أمنية لنظام موجود** — مرّ على كل بند، تحقق من الحالة الفعلية، سجّل الفجوات.
2. **بناء نظام جديد** — استخدمها كـ definition of done للأمان قبل النشر.

كل بند له:
- **الفحص:** كيفية التحقق.
- **الخطر:** ما السيناريو الذي يحدث لو فُقد البند.
- **العلاج:** الإجراء المطلوب.

**التحقق دائماً يفوق الافتراض. لا تضع علامة على بند بدون فحص فعلي.**

---

## القسم 1: قاعدة البيانات (Supabase / PostgreSQL)

### 1.1 — RLS مُفعَّل على كل جدول حساس

**الفحص:**
```sql
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```
كل سجل يجب أن يحتوي `rowsecurity = true`.

**الخطر:** أي مستخدم anon يستطيع قراءة/كتابة كل البيانات.

**العلاج:**
```sql
ALTER TABLE x ENABLE ROW LEVEL SECURITY;
```

---

### 1.2 — RLS policies محددة وليست `USING (true)`

**الفحص:**
```sql
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public';
```

ابحث عن policies بـ `qual = 'true'` أو شروط فضفاضة. خصوصاً في عمليات `UPDATE` و `DELETE`.

**الخطر:** RLS مُفعَّل بصورة شكلية لكن بدون حماية فعلية. أحياناً أسوأ من غياب RLS لأنه يعطي إحساساً زائفاً بالأمان.

**العلاج:** policy لكل عملية (SELECT/INSERT/UPDATE/DELETE) بشروط محددة. مثال:
```sql
CREATE POLICY "users see own appointments" ON appointments
FOR SELECT USING (auth.uid() = user_id);
```

---

### 1.3 — anon لا يستطيع UPDATE/DELETE حيث لا يجب

**الفحص:**
```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND roles = '{anon}'::name[];
```

تأكد أن anon لا يملك صلاحيات على جداول حساسة.

**الخطر:** زائر غير مسجل يعدّل بيانات أو يحذفها.

**العلاج:** drop policies غير المطلوبة لـ anon.

---

### 1.4 — FK constraints بسياسات DELETE صحيحة

**الفحص:**
```sql
SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table,
       rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
WHERE tc.table_schema='public' AND tc.constraint_type='FOREIGN KEY';
```

كل FK يجب أن يكون له سياسة محددة:
- **`CASCADE`** عندما حذف الأم يعني حذف الأبناء حتماً (مثل: حذف موعد → حذف تقييماته).
- **`SET NULL`** عندما الأم اختيارية (مثل: حذف موعد → slot يصبح حراً).
- **`RESTRICT/NO ACTION`** عندما يجب منع الحذف لو وجدت تبعيات (يستخدم احتياطياً، لكن يربك العمليات).

**الخطر:** عمليات الحذف تفشل بأخطاء FK غير متوقعة، أو تترك بيانات يتيمة (orphan data).

**العلاج:**
```sql
ALTER TABLE child DROP CONSTRAINT child_parent_id_fkey,
  ADD CONSTRAINT child_parent_id_fkey
    FOREIGN KEY (parent_id) REFERENCES parent(id)
    ON DELETE SET NULL; -- أو CASCADE حسب الحالة
```

---

### 1.5 — UNIQUE constraints على ما يجب ألا يتكرر

**الفحص:** راجع الجداول التي تتوقع أن يكون فيها سجل واحد لكل مفتاح (مثل: تقييم واحد لكل موعد، إشعار واحد لكل حدث).

```sql
SELECT conname, conrelid::regclass, pg_get_constraintdef(oid)
FROM pg_constraint WHERE contype = 'u';
```

**الخطر:** تكرار البيانات يربك الإحصاءات والعرض.

**العلاج:**
```sql
ALTER TABLE ratings ADD CONSTRAINT ratings_appt_unique UNIQUE (appointment_id);
```

---

### 1.6 — Triggers موثقة وسلوكها مفهوم

**الفحص:**
```sql
SELECT trigger_name, event_object_table, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public';
```

افحص كل trigger وافهم متى يعمل وما يفعل بالضبط.

**الخطر:** تأثيرات جانبية غير متوقعة (مثل: trigger يحدّث جدولاً آخر بصلاحيات owner متجاوزاً RLS).

**العلاج:** وثّق كل trigger في
HANDOVER.md
. اختبر سلوكه عند INSERT/UPDATE/DELETE.

---

### 1.7 — لا تسجيل ذاتي مفتوح (signup) إلا بحماية

**الفحص:**
- Supabase Dashboard → Authentication → Providers → Email → "Allow new users to sign up": **مغلق** للأنظمة الداخلية.
- إن كان مفتوحاً، يجب أن يكون عبر Edge Function تتحقق من شروط (دومين بريد، كود دعوة، إلخ).

**الخطر:** أي شخص يسجّل، يدخل النظام، يصل لكل ما يستطيع `authenticated` رؤيته.

**العلاج:** إغلاق التسجيل + إنشاء حسابات يدوياً عبر Edge Function محمية.

---

### 1.8 — Service role key ليس في frontend

**الفحص:** ابحث في كل ملفات
HTML/JS
عن:
- `service_role`
- `eyJ` (بداية JWT) — لو وُجد، تأكد أنه `anon` فقط.

**الخطر:**
service_role
يتجاوز RLS كاملاً. لو في frontend، يصبح النظام مكشوفاً تماماً.

**العلاج:** استخدم `anon` فقط في frontend. الـ
service_role
في Edge Functions أو backend فحسب.

---
1.9 — لا تخزين نتائج مشتقة بدون مصدرها (No Derived Data Without Source)
الفحص: راجع أي جدول يحتوي على قيم محسوبة مثل:

تقييم إجمالي، متوسط، درجة نهائية
حالة مشتقة من حالات أخرى

-- تحقق أن كل عمود محسوب له مرجع للبيانات الأصلية
SELECT column_name, table_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('total_score', 'average_rating', 'final_grade');
  
---
## القسم 2: الواجهة الأمامية (HTML/JS)

### 2.1 — escapeHtml على كل بيانات DB قبل innerHTML

**الفحص:**
```bash
grep -n 'innerHTML' index.html | grep -v 'escapeHtml'
```

كل سطر يستخدم `innerHTML` مع متغير من DB يجب أن يمر بـ
escapeHtml
.

**الخطر:** stored XSS عبر أي حقل DB أو إدخال مستخدم.

**العلاج:** أضف دالة
escapeHtml
:
```javascript
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
```
ثم طبّقها على كل قيمة من DB.

---

### 2.2 — لا تخزين JWT في مكان متاح لـ XSS

**الفحص:** أين يُخزَّن
access_token
؟
- `localStorage` ← قابل للقراءة عبر XSS.
- `sessionStorage` ← أفضل قليلاً، لكن نفس المشكلة.
- `httpOnly cookie` ← الأفضل لكن صعب الإعداد مع Supabase Auth الافتراضي.

**الخطر:** XSS واحد ينجح = سرقة JWT = حساب مخترق كاملاً.

**العلاج:**
1. أولاً: أصلح XSS بالكامل (البند 2.1).
2. ثانياً: قبل النشر للعموم، فكّر في cookie-based auth.

---

### 2.3 — لا اعتماد على إخفاء UI كحماية

**الفحص:** افتح Console، نفّذ:
```javascript
// محاولة عملية ممنوعة من الواجهة
fetch(SB_URL + '/rest/v1/users?id=eq.X', {
  method: 'DELETE',
  headers: {'apikey': SB_KEY, 'Authorization': 'Bearer ' + token}
});
```

لو نجحت رغم أن الزر مخفي = UI-only protection. غير مقبول.

**الخطر:** أي مستخدم يفتح Console يتجاوز الواجهة.

**العلاج:** RLS policies على DB تمنع العملية على مستوى DB.

---

### 2.4 — لا secrets في source code

**الفحص:**
```bash
grep -rn 'api_key\|password\|secret\|service_role' *.html *.js
```

**الخطر:** تسريب مفاتيح، حسابات بريد، APIs خارجية.

**العلاج:** انقلها إلى Edge Functions أو متغيرات بيئة Netlify.

---

### 2.5 — Content Security Policy (CSP)

**الفحص:** افحص headers في DevTools → Network → أي ملف HTML → Response Headers. ابحث عن `Content-Security-Policy`.

**الخطر:** بدون CSP، XSS بسيط يستطيع تحميل scripts من أي دومين خارجي.

**العلاج:** أضف في `_headers` على Netlify:
```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; ...
```

[ملاحظة] CSP صعب الإعداد ويكسر الـ inline styles. اختبر بحذر قبل التفعيل.

---

## القسم 3: المصادقة والصلاحيات (Auth)

### 3.1 — كل Edge Function تتحقق من صلاحية المستدعي

**الفحص:** افتح كل Edge Function وابحث عن:
1. هل تتحقق من JWT صحيح؟
2. هل تتحقق من صلاحيات المستخدم (role/permission)؟
3. هل تتحقق من حالة الحساب (active/suspended/deleted)؟

**الخطر:** Privilege escalation — مستخدم بصلاحيات منخفضة يستدعي function تنفّذ بـ
service_role
.

**العلاج:** نمط بداية كل Edge Function:
```typescript
const authHeader = req.headers.get('Authorization');
const supabase = createClient(URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
const { data: { user } } = await supabase.auth.getUser();
if (!user) return new Response('Unauthorized', { status: 401 });

// تحقق من الصلاحية المطلوبة
const { data: hasPerm } = await supabase
  .from('user_roles_with_perms')
  .select('permission_key')
  .eq('user_id', user.id)
  .eq('permission_key', 'admin.users')
  .single();
if (!hasPerm) return new Response('Forbidden', { status: 403 });

// تحقق من الحالة
const { data: profile } = await supabase
  .from('user_profiles')
  .select('status, deleted_at')
  .eq('id', user.id)
  .single();
if (profile.status !== 'active' || profile.deleted_at)
  return new Response('Forbidden', { status: 403 });

// الآن فقط نفّذ المهمة
```

---

### 3.2 — كلمات المرور: حد أدنى 8 أحرف

**الفحص:** Supabase Dashboard → Authentication → Policies → Password requirements.

**الخطر:** كلمات مرور ضعيفة قابلة للتخمين.

**العلاج:** فعّل:
- Minimum length: 8.
- Require: lowercase + uppercase + number (إن كان متاحاً).

---

### 3.3 — لا confidence assurance في رسائل الأخطاء

**الفحص:** عند فشل تسجيل الدخول، هل الرسالة:
- "البريد غير موجود" / "كلمة المرور خاطئة" ← **ضعيف**، يخبر المهاجم أي إيميل مسجَّل.
- "بيانات الدخول غير صحيحة" ← **آمن**، يخفي السبب.

**العلاج:** رسائل عامة لكل أخطاء auth.

---

### 3.4 — Soft delete بدلاً من hard delete للمستخدمين

**الفحص:** عند حذف مستخدم، هل يُفقد سجل المهام والاجتماعات التي أنشأها؟

**الخطر:** فقدان البيانات التاريخية + كسر FKs.

**العلاج:** عمود `deleted_at`، تُحدَّث بدل DELETE الفعلي. الواجهة تخفيهم. الحذف النهائي عبر إجراء منفصل ومدروس.

---

## القسم 4: التحقق من الإدخال (Input Validation)

### 4.1 — تحقق على frontend AND backend

**الفحص:** أي حقل إدخال له:
- تحقق في frontend (HTML5 + JS)؟
- تحقق على DB (CHECK constraint أو trigger)؟

**الخطر:** Frontend وحده يُتجاوَز عبر API مباشر.

**العلاج:**
```sql
ALTER TABLE appointments ADD CONSTRAINT phone_format
  CHECK (phone ~ '^[0-9+]{8,15}$');
```

---

### 4.2 — Rate limiting على نقاط الدخول العامة

**الفحص:** هل
booking.html
،
feedback.html
محميان من إرسال آلاف الطلبات في دقيقة؟

**الخطر:** spam، DoS، تلوّث DB.

**العلاج:**
- Supabase Edge Functions تدعم rate limiting.
- أو تطبيق محلي عبر تخزين IP في DB والتحقق.

---

### 4.3 — حدود حجم على الحقول النصية

**الفحص:** هل حقل `message` يستقبل 10MB من النص؟

**الخطر:** استنزاف DB، إبطاء الواجهة، تكلفة عالية.

**العلاج:**
```sql
ALTER TABLE feedback ADD CONSTRAINT message_length
  CHECK (length(message) <= 5000);
```

### 4.4 — Zod validation على كل المدخلات (Server-side)
الفحص: كل Server Action أو Edge Function تستقبل بيانات من المستخدم، هل تمر عبر Zod schema قبل المعالجة؟

// ابحث عن أي server action بدون zod parse
const schema = z.object({...});
const result = schema.safeParse(input);
if (!result.success) return { error: result.error.flatten() };

---

## القسم 5: التسجيل والمراقبة

### 5.1 — تسجيل العمليات الحساسة

**الفحص:** هل توجد جدول `audit_log` يسجّل:
- تسجيلات الدخول الناجحة والفاشلة.
- تغييرات الأدوار.
- حذف البيانات.

**الخطر:** عند اختراق، لا توجد طريقة لمعرفة ما حدث.

**العلاج:**
```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

ثم triggers تكتب فيها عند العمليات الحساسة.

---

### 5.2 — مراقبة Supabase Logs

**الفحص:** دخول دوري على Dashboard → Logs لرؤية:
- استعلامات بطيئة.
- أخطاء RLS.
- محاولات failed auth.

**الخطر:** هجمات تمر دون ملاحظة.

---

## القسم 6: النشر (Netlify)

### 6.1 — HTTPS إلزامي

**الفحص:** Netlify → Site settings → HTTPS → "Force HTTPS": **ON**.

**الخطر:** بيانات في النص الواضح، man-in-the-middle.

---

### 6.2 — Headers أمنية

**الفحص:** ملف `_headers` في root الموقع. يجب أن يحتوي:
```
/*
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
```

---

### 6.3 — لا preview deploys مفتوحة

**الفحص:** Netlify يولّد `https://random-name.netlify.app` لكل push. هل هذا متاح للجميع؟

**الخطر:** نسخة قديمة (قد تكون أقل أماناً) تظل مفتوحة على الإنترنت.

**العلاج:** Netlify → Deploy contexts → احذف previews غير المستخدمة دورياً.

---

## القسم 7: البيانات الحساسة (PII)

### 7.1 — تحديد ما يُعتبر PII

**الفحص:** قائمة كل الحقول التي تحتوي:
- اسم كامل.
- بريد إلكتروني.
- رقم جوال.
- رقم هوية.
- موقع جغرافي.

**العلاج:** كل بند يُحمى بـ RLS صارم. لا يصل anon لأي PII.

---

### 7.2 — تشفير البيانات الحساسة جداً

**الفحص:** لو يوجد رقم هوية وطنية أو معلومات صحية:
- هل مشفّرة في DB؟

**العلاج:** PostgreSQL يدعم `pgcrypto`:
```sql
INSERT INTO ssn_table (data) VALUES (pgp_sym_encrypt('1234567890', 'secret_key'));
```

[ملاحظة] إدارة المفاتيح هذه معقدة. لو لزم، استخدم Supabase Vault.

---

### 7.3 — حذف البيانات بناء على الطلب (GDPR-like)

**الفحص:** هل يستطيع المستخدم طلب حذف بياناته؟

**العلاج:** إجراء موثَّق + Edge Function تنظّف كل الجداول المرتبطة.

---

## القسم 8: النسخ الاحتياطي والتعافي

### 8.1 — Supabase backups مفعَّلة

**الفحص:** Dashboard → Database → Backups. متى آخر backup؟ هل دوري؟

**الخطر:** حذف خاطئ + لا نسخة احتياطية = فقدان دائم.

---

### 8.2 — Disaster recovery test

**الفحص:** هل جرّبت استعادة من backup فعلياً؟

**العلاج:** كل 3-6 شهور: استعد backup إلى مشروع تجريبي وتأكد أنه يعمل.

---

## القسم 9: حدود Claude

ما **لا** يفعله هذا الـ checklist:

- لا يضمن الأمان ضد المهاجم المتمرس. هذا checklist للأخطاء الشائعة، ليس للهجمات المتقدمة (zero-days، social engineering، supply chain).
- لا يحلّ محل
penetration test
بشري.
- لا يغطي تكاملات خارجية محددة (EmailJS, Stripe, إلخ) — كل تكامل يحتاج فحصاً منفصلاً.

---

## ملخص الأولويات

لو طُلب اختصار، رتّب الفحوصات:

**أولوية حرجة (يجب قبل أي نشر):**
- 1.1 RLS مُفعَّل
- 1.2 RLS policies محددة
- 2.1 escapeHtml
- 2.4 لا secrets في source
- 3.1 Edge Functions محمية
- 6.1 HTTPS

**أولوية عالية:**
- 1.4 FK policies
- 1.7 signup مغلق
- 2.5 CSP
- 6.2 Security headers
- 7.1 PII identified

**أولوية متوسطة:**
- الباقي.
