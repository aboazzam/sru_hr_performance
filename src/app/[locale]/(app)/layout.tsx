import { isLocale } from "@/i18n/config";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import type { ProcessArea, VpraLevel } from "@/lib/vpra";

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
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name_ar, full_name_en")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const userName =
    (safeLocale === "ar" ? profile?.full_name_ar : profile?.full_name_en ?? profile?.full_name_ar) ??
    undefined;

  // get_my_permissions() (20260722000001) — same SECURITY DEFINER pattern as
  // get_my_role_codes(), since role_permissions/roles both require a
  // userManagement grant to read directly, which most roles (including
  // plain employee) don't hold.
  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions = Object.fromEntries(
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).map((row) => [
      row.process_area,
      row.vpra_level,
    ])
  ) as Partial<Record<ProcessArea, VpraLevel>>;

  return (
    <>
      <TopBar locale={safeLocale} userName={userName} />
      <div className="sru-app-body">
        <Sidebar permissions={permissions} />
        <main className="flex-1">{children}</main>
      </div>
    </>
  );
}
