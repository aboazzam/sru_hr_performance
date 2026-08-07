import { planStatusLabel, type PlanStatus } from "@/lib/recruitmentWorkflow";

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

export function PlanProgressBar({ status }: { status: string }) {
  const offPath = status === "returned_for_revision" || status === "rejected";
  const currentIndex = HAPPY_PATH.indexOf(status as PlanStatus);

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
                {planStatusLabel(step)}
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
