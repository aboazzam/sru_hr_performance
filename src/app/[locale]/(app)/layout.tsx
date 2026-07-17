import { isLocale } from "@/i18n/config";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { NavBar } from "@/components/layout/NavBar";

/**
 * Single, centralized auth gate for every page under (app)/ — added after
 * discovering live in production that /admin, /competencies, and
 * /org-units (built early, before real auth existed) had no login check at
 * all and were fully visible to unauthenticated visitors. Per-page checks
 * (employees, career-path, salary-scale, employees/new) are removed now
 * that this covers all of them uniformly — one place to protect a new page
 * under (app)/, not something each page has to remember to add itself.
 */
export default async function AppShellLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = isLocale(locale) ? locale : "ar";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: "/login", locale: safeLocale });
  }

  return (
    <>
      <TopBar locale={safeLocale} />
      <NavBar />
      <main className="flex-1">{children}</main>
    </>
  );
}
