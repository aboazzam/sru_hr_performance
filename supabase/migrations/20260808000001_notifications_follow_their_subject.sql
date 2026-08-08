-- ============================================================================
-- الإشعار يموت بموت موضوعه
--
-- بلاغ مباشر: "في الإشعارات هناك طلب احتياج وفي تاب طلبات الاحتياج لا يوجد
-- طلبات". والتبويب كان محقًّا -- الجدول فارغ فعلًا -- لكن ستة إشعارات كانت
-- ما تزال في صناديق حسابات حقيقية تشير إلى طلب `a1fcebe0…` محذوف، فقرأها
-- صاحب الحساب على أنها عمل ينتظره.
--
-- السبب أن `notifications.entity_id` مرجع متعدد الأنواع (polymorphic): لا
-- يمكن جعله مفتاحًا أجنبيًا لأنه يشير مرة إلى `recruitment_requests` ومرة
-- إلى `recruitment_plans`. فلا شيء كان يضمن اختفاء الإشعار باختفاء موضوعه.
--
-- ---------------------------------------------------------------------------
-- لماذا مشغّل قاعدة بيانات لا ترشيح عند القراءة
-- ---------------------------------------------------------------------------
-- كان أسهل أن يُخفي الجرسُ الإشعارَ الذي لا يجد موضوعه. لكن ذلك خطأ هنا:
-- RLS تعني أن "لا أرى الطلب" ≠ "الطلب غير موجود" -- فدور مقيَّد بوحدة قد
-- يستلم إشعارًا عن طلب لا تسمح له سياسته بقراءته، وكان الترشيح سيُخفي عنه
-- إشعارًا مشروعًا تمامًا.
--
-- والمشغّل يغطي أيضًا الحذف المباشر من قاعدة البيانات -- وهو بالضبط ما أنتج
-- هذه الأيتام (سكربتات تنظيف اختبارات) -- بينما إصلاح داخل الإجراءات وحده
-- ما كان ليمنعها.
--
-- يشمل الحذف الفعلي والحذف الناعم معًا: هذا المخطط يستعمل `deleted_at` في
-- كل مكان تقريبًا (CLAUDE.md §5-A قاعدة ٧)، فحذف ناعم لا يزيل الإشعار كان
-- سيترك نفس المشكلة بشكل آخر.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION delete_notifications_for_deleted_entity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- TG_ARGV[0] هو اسم النوع كما يُكتب في notifications.entity_type، فتصلح
  -- الدالة لأي جدول يُشعَر عنه مستقبلًا بلا نسخها.
  DELETE FROM notifications
  WHERE entity_type = TG_ARGV[0]
    AND entity_id = OLD.id;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION delete_notifications_for_deleted_entity() IS
  'يحذف إشعارات كيان زال — لأن entity_id مرجع متعدد الأنواع فلا يمكن ضمانه بمفتاح أجنبي.';

-- الحذف الفعلي
CREATE TRIGGER recruitment_requests_notifications_cleanup
  AFTER DELETE ON recruitment_requests
  FOR EACH ROW
  EXECUTE FUNCTION delete_notifications_for_deleted_entity('recruitment_requests');

CREATE TRIGGER recruitment_plans_notifications_cleanup
  AFTER DELETE ON recruitment_plans
  FOR EACH ROW
  EXECUTE FUNCTION delete_notifications_for_deleted_entity('recruitment_plans');

-- الحذف الناعم: يُطلق فقط عند الانتقال من "غير محذوف" إلى "محذوف"، فلا
-- يُعاد تنفيذه مع كل تعديل لاحق على صف محذوف أصلًا.
CREATE TRIGGER recruitment_requests_notifications_cleanup_soft
  AFTER UPDATE OF deleted_at ON recruitment_requests
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION delete_notifications_for_deleted_entity('recruitment_requests');

CREATE TRIGGER recruitment_plans_notifications_cleanup_soft
  AFTER UPDATE OF deleted_at ON recruitment_plans
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION delete_notifications_for_deleted_entity('recruitment_plans');

-- ---------------------------------------------------------------------------
-- تنظيف الأيتام القائمة
-- ---------------------------------------------------------------------------
-- آمن لأنها مُثبتة اليُتم: كيانها غير موجود لا مخفيًّا بـRLS (هذه الهجرة
-- تعمل بصلاحية المالك فترى كل الصفوف). ومقصور على نوعَي التوظيف فلا يمس
-- أي نوع إشعارات آخر.
DELETE FROM notifications n
WHERE n.entity_type = 'recruitment_requests'
  AND NOT EXISTS (SELECT 1 FROM recruitment_requests r WHERE r.id = n.entity_id);

DELETE FROM notifications n
WHERE n.entity_type = 'recruitment_plans'
  AND NOT EXISTS (SELECT 1 FROM recruitment_plans p WHERE p.id = n.entity_id);

COMMIT;

-- ============================================================================
-- التحقق — بعد التطبيق.
-- ============================================================================
-- لا أيتام:
--   SELECT count(*) FROM notifications n WHERE n.entity_type='recruitment_requests'
--     AND NOT EXISTS (SELECT 1 FROM recruitment_requests r WHERE r.id=n.entity_id);
-- والمشغّل يعمل: أنشئ طلبًا وإشعارًا له، ثم احذف الطلب (فعليًا أو ناعمًا)،
-- ويجب أن يختفي الإشعار من تلقائه.
