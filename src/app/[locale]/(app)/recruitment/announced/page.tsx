import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { vacancyStatusLabel } from "@/lib/vacancyStatus";
import { getDisplayTimezone } from "@/lib/systemSettings";
import { todayInTimezone } from "@/lib/evaluationCycle";
import { vacancyPortalState, portalStateLabels } from "@/lib/vacancyPortal";
import { formatDateDmy } from "@/lib/dateParts";
import type { Locale } from "@/i18n/config";
import { RowLink } from "@/components/RowLink";

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
          "id, status, requirements_ar, announced_at, openings_count, announcement_start_date, application_deadline, job_titles(name_ar,grade_level), org_units(name_ar)"
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
    openings_count: number;
    announcement_start_date: string | null;
    application_deadline: string | null;
    job_titles: { name_ar: string; grade_level: number } | null;
    org_units: { name_ar: string } | null;
  }>;

  // Announcement dates render in the configured display timezone, like every
  // other timestamp in this app (system settings, 2026-07-26).
  const timezone = await getDisplayTimezone(supabase);
  // Dates read as day / month-name / year everywhere (03/أكتوبر/2026), so a
  // value is never ambiguous between day-month and month-day order. The
  // announcement timestamp is reduced to its calendar day in the configured
  // display timezone first, then formatted the same way as the plain `date`
  // columns.
  const announcedDay = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  const formatDate = (iso: string) => formatDateDmy(announcedDay(iso), locale);
  const today = todayInTimezone(timezone);

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
                  <th>{t("columnOpenings")}</th>
                  <th>{t("columnAnnouncedAt")}</th>
                  <th>{t("columnStartDate")}</th>
                  <th>{t("columnDeadline")}</th>
                  <th>{t("columnStatus")}</th>
                  <th>{t("portalStateLabel")}</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <RowLink key={job.id} href={`/recruitment/announced/${job.id}`}>
                    <td>
                      {/* The whole job opens its announcement form (openings,
                          publish date, application deadline). */}
                      <Link href={`/recruitment/announced/${job.id}`} className="sru-row-link-title">
                        {job.job_titles?.name_ar ?? t("untitledJob")}
                      </Link>
                      {job.job_titles && (
                        <span className="sru-chip sru-en" style={{ marginInlineStart: 8 }}>
                          {t("gradeLabel", { grade: job.job_titles.grade_level })}
                        </span>
                      )}
                    </td>
                    <td>{job.org_units?.name_ar ?? "—"}</td>
                    <td>{job.requirements_ar ?? "—"}</td>
                    <td className="sru-en">{job.openings_count}</td>
                    {/* Two different facts that read alike, and were being
                        confused: "أُعلن في" is WHEN the advertise action was
                        taken, while "بداية النشر" is what actually governs
                        whether the portal shows it. Both are now shown, and
                        the empty case says which rule applies. */}
                    <td>{formatDate(job.announced_at)}</td>
                    <td>
                      {job.announcement_start_date ? (
                        formatDateDmy(job.announcement_start_date, locale)
                      ) : (
                        <span style={{ color: "var(--sru-muted)" }}>{t("startFromAnnouncement")}</span>
                      )}
                    </td>
                    <td>
                      {job.application_deadline ? (
                        formatDateDmy(job.application_deadline, locale)
                      ) : (
                        <span style={{ color: "var(--sru-muted)" }}>{t("noDeadlineShort")}</span>
                      )}
                    </td>
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
                    <td>
                      {/* Why an ad is or isn't live on بوابة التوظيف — the
                          management view never lets one silently vanish, and
                          names the date that decides it, since "not published
                          yet" on its own reads as a malfunction. */}
                      {(() => {
                        const state = vacancyPortalState(
                          {
                            status: job.status,
                            announcedAt: job.announced_at,
                            announcementStartDate: job.announcement_start_date,
                            applicationDeadline: job.application_deadline,
                          },
                          today
                        );
                        const governingDate =
                          state === "scheduled"
                            ? job.announcement_start_date
                            : state === "expired"
                              ? job.application_deadline
                              : null;
                        return (
                          <>
                            <span className="pill">{portalStateLabels[state]}</span>
                            {governingDate && (
                              <div style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 3 }}>
                                {state === "scheduled"
                                  ? t("scheduledFrom", { date: formatDateDmy(governingDate, locale) })
                                  : t("expiredOn", { date: formatDateDmy(governingDate, locale) })}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </td>
                  </RowLink>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
