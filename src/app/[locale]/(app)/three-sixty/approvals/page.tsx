import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { ThreeSixtyApprovalCard } from "@/components/ThreeSixtyApprovalCard";
import { threeSixtyNominationStatusLabels, type ThreeSixtyNominationStatus } from "@/lib/threeSixty";

export default async function ThreeSixtyApprovalsPage() {
  const t = await getTranslations("ThreeSixtyApprovalsPage");
  const supabase = await createClient();

  const { data: cycle } = await supabase
    .from("three_sixty_cycles")
    .select("id, name_ar")
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  const { data: reports } = await supabase.rpc("get_my_direct_reports");
  const reportList = (reports ?? []) as { id: string; employee_number: string; full_name_ar: string }[];

  type Subject = {
    subjectId: string;
    subjectName: string;
    rows: {
      id: string;
      relationshipCode: string;
      raterEmployeeId: string | null;
      externalRaterName: string | null;
      externalRaterEmail: string | null;
      status: ThreeSixtyNominationStatus;
      reviewNotes: string | null;
    }[];
    raterNames: Map<string, string>;
  };
  const subjects: Subject[] = [];

  if (cycle && reportList.length > 0) {
    const { data: nominationRows } = await supabase
      .from("three_sixty_nominations")
      .select(
        "id, subject_employee_id, relationship_code, rater_employee_id, external_rater_name, external_rater_email, status, review_notes"
      )
      .eq("cycle_id", cycle.id)
      .in(
        "subject_employee_id",
        reportList.map((r) => r.id)
      )
      .is("deleted_at", null);

    const bySubject = new Map<string, typeof nominationRows>();
    for (const row of nominationRows ?? []) {
      const list = bySubject.get(row.subject_employee_id) ?? [];
      list.push(row);
      bySubject.set(row.subject_employee_id, list);
    }

    for (const report of reportList) {
      const rows = bySubject.get(report.id);
      if (!rows || rows.length === 0) continue;
      const { data: candidateRows } = await supabase.rpc("get_three_sixty_nomination_candidates", {
        p_cycle_id: cycle.id,
        p_subject_employee_id: report.id,
      });
      const raterNames = new Map(
        ((candidateRows ?? []) as { rater_employee_id: string; full_name_ar: string }[]).map((c) => [
          c.rater_employee_id,
          c.full_name_ar,
        ])
      );
      subjects.push({
        subjectId: report.id,
        subjectName: report.full_name_ar,
        rows: rows.map((r) => ({
          id: r.id,
          relationshipCode: r.relationship_code,
          raterEmployeeId: r.rater_employee_id,
          externalRaterName: r.external_rater_name,
          externalRaterEmail: r.external_rater_email,
          status: r.status as ThreeSixtyNominationStatus,
          reviewNotes: r.review_notes,
        })),
        raterNames,
      });
    }
  }

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="threeSixty" current="three-sixty/approvals" />
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4, marginBottom: 20 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {!cycle ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorNoActiveCycle")}</p>
      ) : reportList.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorNoReports")}</p>
      ) : subjects.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("empty")}</p>
      ) : (
        subjects.map((subject) => (
          <ThreeSixtyApprovalCard
            key={subject.subjectId}
            cycleId={cycle.id}
            subjectId={subject.subjectId}
            subjectName={subject.subjectName}
            rows={subject.rows.map((r) => ({
              ...r,
              raterName: r.raterEmployeeId
                ? (subject.raterNames.get(r.raterEmployeeId) ?? r.raterEmployeeId)
                : t("externalRaterLabel", { name: r.externalRaterName ?? "", email: r.externalRaterEmail ?? "" }),
              statusLabel: threeSixtyNominationStatusLabels[r.status],
              status: r.status,
            }))}
          />
        ))
      )}
    </div>
  );
}
