import { RecruitmentPortalView } from "@/components/RecruitmentPortalView";
import type { Locale } from "@/i18n/config";

// بوابة التوظيف الخارجي — الإعلانات الموجّهة للمتقدّمين من خارج الجامعة.
//
// ملاحظة صريحة: هذه الصفحة تعيش تحت (app) فهي خلف بوابة المصادقة كبقية
// التطبيق — أي أنها اليوم "قائمة الإعلانات المخصّصة للنشر الخارجي" لا موقعًا
// عامًّا يفتحه المتقدّم بلا حساب. نشرها للعموم يحتاج مسارًا خارج (app) بلا
// مصادقة وسياسة قراءة لـ`anon`، وهو قرار أكبر لم يُطلب هنا.
export default async function ExternalRecruitmentPortalPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  return <RecruitmentPortalView locale={locale} scope="external" />;
}
