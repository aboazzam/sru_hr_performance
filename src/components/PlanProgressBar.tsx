import { planStatusLabel, planFinanceReviewedLabel, type PlanStatus } from "@/lib/recruitmentWorkflow";
import { planListStatusLabel, type IntakeWindowState } from "@/lib/recruitmentPlanWindows";

/**
 * شريط تقدّم دورة الخطة. Shows the happy path only — the six states a plan
 * passes through when nothing goes back. `returned_for_revision` and
 * `rejected` are deliberately NOT steps: they are exits from the path, not
 * positions along it, so drawing them as stages would misrepresent a
 * returned plan as further along than a draft. They render as a badge
 * instead, with the step bar dimmed.
 *
 * Server component: it derives everything from the status string and holds
 * no state.
 */
const HAPPY_PATH: PlanStatus[] = [
  "draft",
  "consolidated",
  "submitted",
  "finance_review",
  "approved",
  "ready_for_execution",
];

export function PlanProgressBar({
  status,
  financeReviewed = false,
  intakeState,
}: {
  status: string;
  /** `finance_reviewed_at` is set — finance is done with this plan. */
  financeReviewed?: boolean;
  /**
   * حالة نافذة الاستقبال اليوم. تُسمّى بها الخطوةُ الحالية وحدها، فتقرأ
   * الترويسةُ والشريطُ والقائمةُ الشيءَ نفسه.
   */
  intakeState: IntakeWindowState;
}) {
  const offPath = status === "returned_for_revision" || status === "rejected";
  const currentIndex = HAPPY_PATH.indexOf(status as PlanStatus);

  /**
   * The finance step reads as DONE once finance has stamped it, and also
   * whenever the plan has moved past it — a plan sitting at `approved` was
   * obviously reviewed, so labelling that step «قيد المراجعة المالية» would
   * be describing a stage that ended.
   *
   * A step still ahead keeps the pending wording: it names what that stage
   * will be, which is what an unreached step should say.
   */
  function stepLabel(step: PlanStatus, index: number): string {
    const isCurrent = !offPath && index === currentIndex;

    if (step === "finance_review") {
      const past = !offPath && index < currentIndex;
      const doneNow = isCurrent && financeReviewed;
      if (past || doneNow) return planFinanceReviewedLabel;
    }

    // الخطوة الحالية وحدها تحمل التسمية الموحّدة، فلا تقول الترويسة
    // «استقبال الطلبات» بينما يقول الشريط تحتها «مسودة» عن الحال نفسه.
    // وما عداها يبقى باسمه: الشريط مسارٌ ثابت يقارن به المرء خطتين، ولو
    // تغيّرت أسماء خطواته كلها بحسب نافذة كل خطة لما صلح للمقارنة.
    if (isCurrent) return planListStatusLabel(status, intakeState, planStatusLabel(step));
    return planStatusLabel(step);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        {HAPPY_PATH.map((step, index) => {
          const done = !offPath && index < currentIndex;
          const current = !offPath && index === currentIndex;
          return (
            <div key={step} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span
                className="pill"
                style={{
                  background: current
                    ? "var(--sru-purple)"
                    : done
                      ? "var(--sru-purple-light)"
                      : "transparent",
                  color: current ? "#fff" : done ? "var(--sru-purple-dark)" : "var(--sru-muted)",
                  border: current || done ? "none" : "1px solid var(--sru-border)",
                  opacity: offPath ? 0.45 : 1,
                  fontWeight: current ? 700 : 400,
                }}
              >
                {stepLabel(step, index)}
              </span>
              {index < HAPPY_PATH.length - 1 && (
                <span aria-hidden style={{ color: "var(--sru-muted)", opacity: offPath ? 0.45 : 1 }}>
                  ←
                </span>
              )}
            </div>
          );
        })}
      </div>

      {offPath && (
        <span
          className="pill"
          style={{
            alignSelf: "flex-start",
            background: status === "rejected" ? "#b91c1c" : "#b45309",
            color: "#fff",
          }}
        >
          {planStatusLabel(status)}
        </span>
      )}
    </div>
  );
}
