import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { vacancyPortalState } from "@/lib/vacancyPortal";
import { getDisplayTimezone } from "@/lib/systemSettings";
import { todayInTimezone } from "@/lib/evaluationCycle";
import type { Locale } from "@/i18n/config";

// Auth is enforced centrally by (app)/layout.tsx.
//
// "بوابة التوظيف" — the outward-facing list: the advertised vacancies whose
// time has actually come. An ad appears from its announcement start date (or,
// with none recorded, from the moment it was advertised) until its application
// deadline, and only while the vacancy is still open. Everything else stays
// visible on the management tab with an explicit reason, never silently.
//
// Filtering happens after the fetch rather than in SQL: the window depends on
// "today" in the configured display timezone plus a fallback to `announced_at`
// when no start date was recorded, which is exactly the rule
// `vacancyPortalState` encodes (and unit-tests). Advertised vacancies are a
// small set, so one query plus an in-memory filter keeps a single source of
// truth for the rule instead of duplicating it in a query.
export default async function RecruitmentPortalPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("RecruitmentPortalPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const vacanciesLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "vacancies"
    )?.vpra_level ?? "none";
  const canView = hasVpraAccess(vacanciesLevel, "view");

  const { data } = canView
    ? await supabase
        .from("vacancies")
        .select(
          "id, status, requirements_ar, announced_at, openings_count, announcement_start_date, application_deadline, job_titles(name_ar,grade_level), org_units(name_ar)"
        )
        .not("announced_at", "is", null)
        .is("deleted_at", null)
        .order("announced_at", { ascending: false })
    : { data: null };

  const announced = (data ?? []) as unknown as Array<{
    id: string;
    status: string;
    requirements_ar: string | null;
    announced_at: string;
    openings_count: number;
    announcement_start_date: string | null;
    application_deadline: string | null;
    job_titles: { name_ar: string; grade_level: number } | null;
    org_units: { name_ar: string } | null;
  }>;

  const timezone = await getDisplayTimezone(supabase);
  const today = todayInTimezone(timezone);

  const live = announced.filter(
    (job) =>
      vacancyPortalState(
        {
          status: job.status,
          announcedAt: job.announced_at,
          announcementStartDate: job.announcement_start_date,
          applicationDeadline: job.application_deadline,
        },
        today
      ) === "live"
  );

  const formatDate = (value: string) =>
    new Date(`${value}T00:00:00`).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US");

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />
      <GroupTabs groupKey="recruitment" current="recruitment/portal" />
      <div style={{ height: 20 }} />

      {!canView ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("forbidden")}</p>
      ) : live.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14, lineHeight: 1.9 }}>
          {announced.length === 0 ? t("emptyNoAds") : t("emptyNoneLive")}
        </p>
      ) : (
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {live.map((job) => (
            <div key={job.id} className="sru-card">
              <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
                {job.job_titles?.name_ar ?? t("untitledJob")}
              </h2>
              <p style={{ color: "var(--sru-muted)", fontSize: 13, marginBottom: 10 }}>
                {job.org_units?.name_ar ?? "—"}
                {job.job_titles && ` — ${t("gradeLabel", { grade: job.job_titles.grade_level })}`}
              </p>

              <dl style={{ display: "grid", gap: 6, fontSize: 13, margin: 0 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <dt style={{ color: "var(--sru-muted)", minWidth: 96 }}>{t("openingsLabel")}</dt>
                  <dd style={{ margin: 0, fontWeight: 600 }}>{job.openings_count}</dd>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <dt style={{ color: "var(--sru-muted)", minWidth: 96 }}>{t("requirementsLabel")}</dt>
                  <dd style={{ margin: 0 }}>{job.requirements_ar ?? "—"}</dd>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <dt style={{ color: "var(--sru-muted)", minWidth: 96 }}>{t("deadlineLabel")}</dt>
                  <dd style={{ margin: 0 }}>
                    {job.application_deadline ? formatDate(job.application_deadline) : t("noDeadline")}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
