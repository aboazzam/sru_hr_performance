import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { vacancyPortalState } from "@/lib/vacancyPortal";
import { formatDateDmy } from "@/lib/dateParts";
import { getDisplayTimezone } from "@/lib/systemSettings";
import { todayInTimezone } from "@/lib/evaluationCycle";
import type { Locale } from "@/i18n/config";

export type PortalScope = "internal" | "external";

/**
 * البوابة الواحدة بنطاقين: داخلية وخارجية.
 *
 * الإعلانات تُصفّى بـ`posting_scope` (20260807000010): إعلان بنطاق "both"
 * يظهر في البوابتين، و"internal"/"external" في واحدة فقط. أما قاعدة النافذة
 * الزمنية (`vacancyPortalState`) فتبقى كما هي لكلتيهما — النطاق يقرّر أين
 * يُعرض الإعلان لا متى.
 *
 * مكوّن خادم مشترك بدل صفحتين متطابقتين: أي تعديل على شكل البطاقة أو على
 * قاعدة الظهور يسري على البوابتين معًا فلا تنحرف إحداهما عن الأخرى.
 *
 * البوابة لها الآن مجالها `recruitmentPortal` بدل `vacancies` (طلب مباشر:
 * إضافتها صفًّا مستقلًا في مصفوفة الصلاحيات)، فيمكن منح موظف تصفّح البوابة
 * دون صلاحية على إدارة الشواغر نفسها.
 */
export async function RecruitmentPortalView({
  locale,
  scope,
}: {
  locale: Locale;
  scope: PortalScope;
}) {
  const t = await getTranslations("RecruitmentPortalPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const portalLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "recruitmentPortal"
    )?.vpra_level ?? "none";
  const canView = hasVpraAccess(portalLevel, "view");

  const { data } = canView
    ? await supabase
        .from("vacancies")
        .select(
          "id, status, requirements_ar, announced_at, openings_count, announcement_start_date, application_deadline, posting_scope, job_titles(name_ar,grade_level), org_units(name_ar)"
        )
        .not("announced_at", "is", null)
        .in("posting_scope", [scope, "both"])
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
    posting_scope: string;
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

  const formatDate = (value: string) => formatDateDmy(value, locale);
  const current = scope === "internal" ? "recruitment/portal" : "recruitment/portal/external";

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {scope === "internal" ? t("titleInternal") : t("titleExternal")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>
        {scope === "internal" ? t("subtitleInternal") : t("subtitleExternal")}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />
      <GroupTabs groupKey="recruitment" current={current} />
      <div style={{ height: 20 }} />

      {!canView ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("forbidden")}</p>
      ) : live.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14, lineHeight: 1.9 }}>
          {announced.length === 0 ? t("emptyNoAds") : t("emptyNoneLive")}
        </p>
      ) : (
        <div
          style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}
        >
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
                {/* إعلان منشور على البوابتين — يُذكر صراحةً فلا يبدو مكرَّرًا. */}
                {job.posting_scope === "both" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <dt style={{ color: "var(--sru-muted)", minWidth: 96 }}>{t("scopeLabel")}</dt>
                    <dd style={{ margin: 0 }}>{t("scopeBoth")}</dd>
                  </div>
                )}
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
