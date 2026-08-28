import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";

/**
 * الرجوع إلى الصفحة السابقة: يقف وحده أعلى الصفحة، بلا خلفية، ومعه سهم.
 *
 * مكوَّن واحد لا نسخة في كل صفحة، لأن هذا المشروع تعثّر مرتين بإصلاح يهبط
 * في مكان واحد من مكانين يحتاجانه (تجميع موظفي الوحدة، 2026-07-26/27).
 * صفحاتٌ كثيرة كانت تكتب الرابط بيدها، فاختلفت: بعضها بخلفية زر وبعضها بلا
 * سهم، وبعضها بسهم لا ينعكس في الإنجليزية.
 *
 * الشكل: طريقُ عودةٍ لا ينبغي أن ينافس أزرار الصفحة نفسها، فلا خلفية له ولا
 * إطار — هو ملاحة، وهذا ما يقوله مظهره.
 *
 * السهم: `ArrowRight` حقيقي لا سهمٌ معكوس، لأن «الرجوع» في واجهة من اليمين
 * إلى اليسار يتجه يمينًا فعلًا. و`sru-back-arrow` تتكفّل بقلبه في الإنجليزية
 * (globals.css، 2026-07-29)، فيبقى الخادم بلا أي تفريع على اللغة.
 */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="sru-backlink">
      <ArrowRight size={15} aria-hidden className="sru-back-arrow" />
      {children}
    </Link>
  );
}
