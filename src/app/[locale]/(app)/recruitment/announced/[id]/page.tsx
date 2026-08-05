import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { VacancyAnnouncementForm } from "@/components/VacancyAnnouncementForm";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { vacancyStatusLabel } from "@/lib/vacancyStatus";
import { vacancyPortalState, portalStateLabels } from "@/lib/vacancyPortal";
import { getDisplayTimezone } from "@/lib/systemSettings";
import { todayInTimezone } from "@/lib/evaluationCycle";
import type { Locale } from "@/i18n/config";

// Auth is enforced centrally by (app)/layout.tsx. Reading is gated by
// `vacancies_select`'s own RLS (`vacancies>=view`, held by every staff role by
// design); editing needs `vacancies_update`'s `recommend`, mirrored here only
// to render the form read-only rather than to replace the real gate.
export default async function AnnouncedJobDetailPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("AnnouncedJobsPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const vacanciesLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "vacancies"
    )?.vpra_level ?? "none";
  const canView = hasVpraAccess(vacanciesLevel, "view");
  const canManage = hasVpraAccess(vacanciesLevel, "recommend");

  if (!canView) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <h1 className="sru-title" style={{ fontSize: 24 }}>
          {t("title")}
        </h1>
        <div className="sru-diag" style={{ margin: "8px 0 20px" }} />
        <GroupTabs groupKey="recruitment" current="recruitment/announced" />
        <p style={{ color: "var(--sru-muted)", fontSize: 14, marginTop: 24 }}>{t("forbidden")}</p>
      </div>
    );
  }

  const { data } = await supabase
    .from("vacancies")
    .select(
      "id, status, requirements_ar, announced_at, openings_count, announcement_start_date, application_deadline, job_titles(name_ar,grade_level), org_units(name_ar)"
    )
    .eq("id", id)
    .not("announced_at", "is", null)
    .is("deleted_at", null)
    .maybeSingle();

  const job = data as unknown as {
    id: string;
    status: string;
    requirements_ar: string | null;
    announced_at: string;
    openings_count: number;
    announcement_start_date: string | null;
    application_deadline: string | null;
    job_titles: { name_ar: string; grade_level: number } | null;
    org_units: { name_ar: string } | null;
  } | null;

  if (!job) notFound();

  const timezone = await getDisplayTimezone(supabase);
  const today = todayInTimezone(timezone);
  const state = vacancyPortalState(
    {
      status: job.status,
      announcedAt: job.announced_at,
      announcementStartDate: job.announcement_start_date,
      applicationDeadline: job.application_deadline,
    },
    today
  );

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 className="sru-title" style={{ fontSize: 24 }}>
            {job.job_titles?.name_ar ?? t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>
            {job.org_units?.name_ar ?? "—"}
            {job.job_titles && ` — ${t("gradeLabel", { grade: job.job_titles.grade_level })}`}
          </p>
        </div>
        <Link href="/recruitment/announced" className="sru-btn">
          {t("backToList")}
        </Link>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />
      <GroupTabs groupKey="recruitment" current="recruitment/announced" />

      <div className="sru-card" style={{ marginTop: 20 }}>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("columnStatus")}</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{vacancyStatusLabel(job.status)}</div>
          </div>
          <div>
            <div style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("portalStateLabel")}</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{portalStateLabels[state]}</div>
          </div>
          <div>
            <div style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("columnRequirements")}</div>
            <div style={{ fontSize: 15 }}>{job.requirements_ar ?? "—"}</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <VacancyAnnouncementForm
          vacancyId={job.id}
          canManage={canManage}
          initial={{
            openingsCount: job.openings_count,
            announcementStartDate: job.announcement_start_date,
            applicationDeadline: job.application_deadline,
          }}
        />
      </div>
    </div>
  );
}
