import type { Metadata } from "next";
import { Cairo, Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { getDir, isLocale } from "@/i18n/config";
import { AppThemeProvider } from "@/components/theme-provider";
import { RecoveryHashRedirect } from "@/components/RecoveryHashRedirect";
import { createClient } from "@/lib/supabase/server";
import { darken, lighten } from "@/lib/color";
import "../globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ar",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-en",
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dir = getDir(locale);
  const messages = await getMessages();

  // Real feedback (2026-07-25): org_identity's primary/secondary colors were
  // stored but never consumed anywhere -- changing them had no visible
  // effect. Applied here as inline CSS custom properties on <html>, which
  // override sru-ui.css's own `:root` defaults for the same variables
  // without ever editing that file (an inline style always wins over any
  // stylesheet rule targeting the same element). org_identity_select's RLS
  // returns nothing for an unauthenticated visitor (anon has no grant), so
  // the login page simply keeps the default palette until sign-in.
  const supabase = await createClient();
  const { data: identity } = await supabase
    .from("org_identity")
    .select("primary_color, secondary_color")
    .maybeSingle();
  const identityStyle: Record<string, string> = {};
  if (identity?.primary_color) {
    identityStyle["--sru-purple"] = identity.primary_color;
    identityStyle["--sru-purple-dark"] = darken(identity.primary_color, 0.3) ?? identity.primary_color;
    identityStyle["--sru-purple-light"] = lighten(identity.primary_color, 0.88) ?? identity.primary_color;
  }
  if (identity?.secondary_color) {
    identityStyle["--sru-blue"] = identity.secondary_color;
    identityStyle["--sru-blue-light"] = lighten(identity.secondary_color, 0.9) ?? identity.secondary_color;
  }

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${cairo.variable} ${inter.variable} h-full antialiased`}
      style={identityStyle as React.CSSProperties}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
          <RecoveryHashRedirect locale={locale} />
          <AppThemeProvider>{children}</AppThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
