import { RecruitmentPortalView } from "@/components/RecruitmentPortalView";
import type { Locale } from "@/i18n/config";

// بوابة التوظيف الداخلي — الإعلانات الموجّهة لمنسوبي الجامعة.
// كل المنطق في المكوّن المشترك، فالبوابتان لا تنحرفان عن بعضهما.
export default async function InternalRecruitmentPortalPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  return <RecruitmentPortalView locale={locale} scope="internal" />;
}
