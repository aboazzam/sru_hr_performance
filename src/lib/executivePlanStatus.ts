/**
 * `executive_plans.status` is plain TEXT with no CHECK enum (20260820000001,
 * the same precedent as every other status column in this schema), so these
 * are the values the UI knows about, not a constraint.
 *
 * The list screen was printing the raw stored value — an Arabic RTL table
 * with "draft" in it. Anything not listed here still renders as-is rather
 * than blanking out, exactly like `vacancyStatusLabel`: a value someone typed
 * by hand is still their value.
 */
export const executivePlanStatuses = ["draft", "active", "closed"] as const;
export type ExecutivePlanStatus = (typeof executivePlanStatuses)[number];

/** Fixed Arabic domain vocabulary, same convention as `evaluationStateLabels`. */
export const executivePlanStatusLabels: Record<ExecutivePlanStatus, string> = {
  draft: "مسودة",
  active: "سارية",
  closed: "مغلقة",
};

export function executivePlanStatusLabel(status: string): string {
  return executivePlanStatusLabels[status as ExecutivePlanStatus] ?? status;
}
