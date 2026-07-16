import { isLocale } from "@/i18n/config";
import { TopBar } from "@/components/layout/TopBar";
import { NavBar } from "@/components/layout/NavBar";

export default async function AppShellLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = isLocale(locale) ? locale : "ar";

  return (
    <>
      <TopBar locale={safeLocale} />
      <NavBar />
      <main className="flex-1">{children}</main>
    </>
  );
}
