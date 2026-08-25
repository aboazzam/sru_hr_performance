import { getTranslations } from "next-intl/server";
import { ProfileTabs, type ProfileTab } from "@/components/ProfileTabs";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { buildEmployeeSelfTabs } from "@/app/[locale]/(app)/employee-self-sections";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
//
// Since 2026-08-25 this page is who you are and nothing else: your own
// details, and changing your password. Everything about your WORK — targets,
// competencies, tasks, performance level, career path — moved to the home
// page, which is where a person actually starts their day. Asking for
// "my details" and "my targets" in the same place put a reference screen and
// a working screen behind the same tab bar.
export default async function MyProfilePage() {
  const t = await getTranslations("MyProfilePage");
  const tPassword = await getTranslations("ChangePasswordPage");

  // "data" builds the details tab only — and gates the queries with it, so
  // this page never pays for the target/competency/career fetches it does
  // not render.
  const dataTabs = await buildEmployeeSelfTabs("data");

  const tabs: ProfileTab[] = [
    ...dataTabs,
    ...(dataTabs.length === 0
      ? []
      : [
          {
            id: "change-password",
            label: tPassword("voluntaryTitle"),
            content: (
              <div style={{ maxWidth: 420 }}>
                <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 14 }}>
                  {tPassword("voluntarySubtitle")}
                </p>
                <ChangePasswordForm />
              </div>
            ),
          },
        ]),
  ];

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4, marginBottom: 20 }}>
        {t("subtitle")}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {tabs.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("noProfile")}</p>
      ) : (
        <ProfileTabs tabs={tabs} />
      )}
    </div>
  );
}
