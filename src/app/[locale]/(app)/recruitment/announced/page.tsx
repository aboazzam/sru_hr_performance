import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { vacancyStatusLabel } from "@/lib/vacancyStatus";
import { getDisplayTimezone } from "@/lib/systemSettings";
import type { Locale } from "@/i18n/config";

// Auth is enforced centrally by (app)/layout.tsx.
//
// "الوظائف المعلن عنها" — the vacancies whose `announced_at` is set
// (20260804000003), advertised from the الشواغر tab's megaphone icon. Read
// through the caller's own client: `vacancies_select` already lets every
// role holding `vacancies>=view` (including plain `employee`, by design —
// internal postings are meant to be visible to all staff) see these rows,
// so this tab needs no new permission of its own.
export default async function AnnouncedJobsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("AnnouncedJobsPage");
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
          "id, status, requirements_ar, announced_at, job_titles(name_ar,grade_level), org_units(name_ar)"
        )
        .not("announced_at", "is", null)
        .is("deleted_at", null)
        .order("announced_at", { ascending: false })
    : { data: null };

  const jobs = (data ?? []) as unknown as Array<{
    id: string;
    status: string;
    requirements_ar: string | null;
    announced_at: string;
    job_titles: { name_ar: string; grade_level: number } | null;
    org_units: { name_ar: string } | null;
  }>;

  // Announcement dates render in the configured display timezone, like every
  // other timestamp in this app (system settings, 2026-07-26).
  const timezone = await getDisplayTimezone(supabase);
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", { timeZone: timezone });

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />
      <GroupTabs groupKey="recruitment" current="recruitment/announced" />
      <div style={{ height: 20 }} />

      {!canView ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("forbidden")}</p>
      ) : jobs.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14, lineHeight: 1.9 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnJobTitle")}</th>
                  <th>{t("columnOrgUnit")}</th>
                  <th>{t("columnRequirements")}</th>
                  <th>{t("columnAnnouncedAt")}</th>
                  <th>{t("columnStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      {job.job_titles?.name_ar ?? "—"}
                      {job.job_titles && (
                        <span className="sru-chip sru-en" style={{ marginInlineStart: 8 }}>
                          {t("gradeLabel", { grade: job.job_titles.grade_level })}
                        </span>
                      )}
                    </td>
                    <td>{job.org_units?.name_ar ?? "—"}</td>
                    <td>{job.requirements_ar ?? "—"}</td>
                    <td>{formatDate(job.announced_at)}</td>
                    <td>
                      <span className="pill">{vacancyStatusLabel(job.status)}</span>
                      {/* Advertising is independent of status (20260804000003):
                          closing a posting doesn't withdraw its ad, so say so
                          rather than quietly showing a closed job as if open. */}
                      {job.status !== "open" && (
                        <div style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 3 }}>
                          {t("notOpenNote")}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
