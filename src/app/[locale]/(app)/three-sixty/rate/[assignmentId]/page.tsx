import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { ThreeSixtyQuestionnaireForm } from "@/components/ThreeSixtyQuestionnaireForm";
import type { BehavioralLevel } from "@/lib/threeSixty";
import { resolveApplicableThreeSixtyItems } from "@/lib/threeSixtyAssignmentItems";

export default async function ThreeSixtyQuestionnairePage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  const t = await getTranslations("ThreeSixtyQuestionnairePage");
  const supabase = await createClient();

  // three_sixty_assignments_select's self-row branch (rater_employee_id =
  // caller) is the real gate -- a non-rater simply gets 0 rows here. The
  // subject's NAME needs get_my_three_sixty_rating_subjects() instead of a
  // profiles embed -- an ordinary rater has no profiles_select branch for
  // reading a colleague's name (same gap fixed on the rate-list page).
  const [{ data: assignment }, { data: subjectRows }] = await Promise.all([
    supabase
      .from("three_sixty_assignments")
      .select("id, relationship_code, status, subject_employee_id, three_sixty_cycles(name_ar, scale_code)")
      .eq("id", assignmentId)
      .maybeSingle(),
    supabase.rpc("get_my_three_sixty_rating_subjects"),
  ]);

  if (!assignment) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <GroupTabs groupKey="threeSixty" current="three-sixty/rate" />
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

  const subjectName = ((subjectRows ?? []) as { assignment_id: string; subject_name: string }[]).find(
    (r) => r.assignment_id === assignment.id
  )?.subject_name;
  const cycle = assignment.three_sixty_cycles as unknown as { name_ar: string; scale_code: string } | null;

  const [{ data: itemTextRows }, { data: scaleOptionRows }, { data: responseRows }, { data: levelRows }] = await Promise.all([
    supabase.from("three_sixty_items").select("id, text_ar, scale_code").is("deleted_at", null),
    supabase
      .from("three_sixty_rating_scale_options")
      .select("id, scale_code, option_code, label_ar, numeric_value")
      .is("deleted_at", null)
      .order("numeric_value"),
    supabase.from("three_sixty_responses").select("item_id, option_id, numeric_value, text_value").eq("assignment_id", assignmentId),
    // SECURITY DEFINER -- an ordinary rater has no RLS branch letting them
    // read the subject's job_title_id or job_title_competencies directly
    // (see migration 20260904000003's header).
    supabase.rpc("get_three_sixty_subject_levels", { p_subject_employee_id: assignment.subject_employee_id }),
  ]);

  const applicableItems = await resolveApplicableThreeSixtyItems(
    supabase,
    assignment.relationship_code,
    ((levelRows ?? []) as { competency_id: string; required_level: BehavioralLevel }[]).map((r) => ({
      competencyId: r.competency_id,
      requiredLevel: r.required_level,
    }))
  );
  const textAndScaleByItemId = new Map((itemTextRows ?? []).map((i) => [i.id, { textAr: i.text_ar, scaleCode: i.scale_code }]));

  const optionsByScale = new Map<string, { id: string; optionCode: string; labelAr: string; numericValue: number }[]>();
  for (const o of scaleOptionRows ?? []) {
    const list = optionsByScale.get(o.scale_code) ?? [];
    list.push({ id: o.id, optionCode: o.option_code, labelAr: o.label_ar, numericValue: o.numeric_value });
    optionsByScale.set(o.scale_code, list);
  }

  const existingByItem = new Map(
    (responseRows ?? []).map((r) => [r.item_id, { optionId: r.option_id, numericValue: r.numeric_value, textValue: r.text_value }])
  );

  const readOnly = assignment.status !== "pending";

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px", maxWidth: 820 }}>
      <GroupTabs groupKey="threeSixty" current="three-sixty/rate" />
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>
        {cycle?.name_ar} — {subjectName ?? "—"}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {applicableItems.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorNoItems")}</p>
      ) : (
        <ThreeSixtyQuestionnaireForm
          assignmentId={assignment.id}
          readOnly={readOnly}
          items={applicableItems.map((item) => {
            const extra = textAndScaleByItemId.get(item.id);
            return {
              id: item.id,
              itemCode: item.itemCode,
              itemType: item.itemType,
              textAr: extra?.textAr ?? "",
              required: item.required,
              options: extra?.scaleCode ? optionsByScale.get(extra.scaleCode) ?? [] : [],
            };
          })}
          existing={Object.fromEntries(existingByItem)}
        />
      )}
    </div>
  );
}
