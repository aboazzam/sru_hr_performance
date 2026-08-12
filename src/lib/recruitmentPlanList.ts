/**
 * Ordering for the recruitment-plan list.
 *
 * Kept out of the page so the rule is stated once and unit-testable, the same
 * convention as `recruitmentRequestTable.ts`.
 */

import { type PlanStatus } from "./recruitmentWorkflow";

/**
 * الخطط "المغلقة": انتهى العمل عليها فلا إجراء ينتظرها.
 *
 * **[استنتاج]** — طُلبت «الخطط المفتوحة مرتبة» دون تعريف المغلق. اعتُبرت
 * `ready_for_execution` (بلغت غايتها) و`rejected` (انتهت رفضًا) مغلقتين، وما
 * سواهما مفتوحًا — بما فيها `approved`، إذ ما تزال في طريقها إلى التنفيذ
 * ويُنتظر منها شيء. والقائمة لا تُخفي المغلقة، إنما تؤخّرها.
 */
const CLOSED_PLAN_STATUSES: PlanStatus[] = ["ready_for_execution", "rejected"];

export function isPlanOpen(status: string): boolean {
  return !CLOSED_PLAN_STATUSES.includes(status as PlanStatus);
}

export interface SortablePlan {
  plan_year: number;
  status: string;
  name_ar: string;
}

/**
 * المفتوحة أولًا، ثم الأحدث سنةً، ثم أبجديًا.
 *
 * الترتيب بالسنة وحدها — وهو ما كانت عليه القائمة — يدفع خطةً منتهيةً لسنة
 * قادمة فوق الخطة التي يعمل عليها الناس الآن. والاسم آخر معيار كي لا يتبدّل
 * ترتيب خطتين متطابقتين بين تحميل وآخر.
 *
 * لا يعدّل المصفوفة الأصلية.
 */
export function sortPlansForList<T extends SortablePlan>(plans: T[]): T[] {
  return [...plans].sort((a, b) => {
    const openness = Number(isPlanOpen(b.status)) - Number(isPlanOpen(a.status));
    if (openness !== 0) return openness;
    if (a.plan_year !== b.plan_year) return b.plan_year - a.plan_year;
    return a.name_ar.localeCompare(b.name_ar, "ar");
  });
}
