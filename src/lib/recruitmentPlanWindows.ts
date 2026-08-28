/**
 * زمن خطة التوظيف: نافذة استقبال الطلبات، وفترة الخطة.
 *
 * زمنان مستقلان، بطلب صريح: الأول يحدّد متى يجوز للإدارات رفع طلبات
 * الاحتياج، والثاني يحدّد الفترة التي تُنفَّذ فيها الخطة. لا يشترط أن
 * يتلاصقا — نافذة الاستقبال تسبق فترة الخطة عادةً، وهذا شأن من يضبطها لا
 * قاعدة تفرضها هذه الوحدة.
 *
 * كل المقارنات نصّية على YYYY-MM-DD، كما في `evaluationCycle.ts` تمامًا،
 * ولنفس السبب: `new Date(iso)` يقرأ التاريخ منتصفَ ليلٍ عالميًا فيتراجع يومًا
 * كاملًا في التوقيتات السالبة — خطأٌ وقع فيه هذا المشروع فعلًا مرة.
 *
 * الطرفان شاملان: النافذة مفتوحة في يوم فتحها وفي يوم إغلاقها.
 */

export const intakeWindowStates = ["not_configured", "before", "open", "closed"] as const;
export type IntakeWindowState = (typeof intakeWindowStates)[number];

export const intakeWindowLabels: Record<IntakeWindowState, string> = {
  not_configured: "بلا نافذة محدّدة",
  before: "لم يبدأ الاستقبال",
  open: "الاستقبال مفتوح",
  closed: "أُغلق الاستقبال",
};

export const planPeriodStates = ["not_configured", "upcoming", "active", "ended"] as const;
export type PlanPeriodState = (typeof planPeriodStates)[number];

export const planPeriodLabels: Record<PlanPeriodState, string> = {
  not_configured: "بلا فترة محدّدة",
  upcoming: "لم تبدأ",
  active: "جارية",
  ended: "منتهية",
};

/**
 * حالة نافذة الاستقبال في يومٍ بعينه.
 *
 * نافذةٌ نصفُ مضبوطة حالٌ مشروعة أثناء الإعداد، ولها قراءة واحدة معقولة:
 * الطرف الغائب مفتوح. فبدايةٌ بلا نهاية تعني «فُتح ولم يُحدَّد إغلاقه»،
 * ونهايةٌ بلا بداية تعني «مفتوح حتى ذلك اليوم».
 */
export function intakeWindowState(
  openAt: string | null,
  closeAt: string | null,
  today: string
): IntakeWindowState {
  if (openAt == null && closeAt == null) return "not_configured";
  if (openAt != null && today < openAt) return "before";
  if (closeAt != null && today > closeAt) return "closed";
  return "open";
}

/** فترة الخطة نفسها — نفس منطق حالة دورة التقييم. */
export function planPeriodState(
  startDate: string | null,
  endDate: string | null,
  today: string
): PlanPeriodState {
  if (startDate == null && endDate == null) return "not_configured";
  if (startDate != null && today < startDate) return "upcoming";
  if (endDate != null && today > endDate) return "ended";
  return "active";
}

/**
 * الحالات التي غادرت فيها الخطة يد الإعداد نهائيًا.
 *
 * مأخوذة من دلالة `planStatuses` نفسها: خطةٌ اعتُمدت أو صارت جاهزة للتنفيذ
 * أو رُفضت لم تعد تستقبل شيئًا — والطلب الذي يأتي بعدها هو تحديدًا ما سمّاه
 * الطلب «احتياجًا بعد إقرار الخطة».
 */
export const closedPlanStatuses = ["approved", "ready_for_execution", "rejected"] as const;

export interface PlanWindow {
  id: string;
  status: string;
  requests_open_at: string | null;
  requests_close_at: string | null;
}

/**
 * هل تستقبل هذه الخطة طلبًا يُدرج فيها اليوم؟
 *
 * شرطان: ألّا تكون قد أُقرّت أو رُفضت، وأن تكون نافذتها مفتوحة (أو غير
 * مضبوطة، وهي الحال القائمة اليوم فلا ينكسر السلوك الحالي).
 */
export function planAcceptsRequests(plan: PlanWindow, today: string): boolean {
  if ((closedPlanStatuses as readonly string[]).includes(plan.status)) return false;
  const state = intakeWindowState(plan.requests_open_at, plan.requests_close_at, today);
  return state === "open" || state === "not_configured";
}

/**
 * الخطة التي يقع فيها طلبٌ يُرفع اليوم، أو `null` إن لم توجد.
 *
 * حين تصلح أكثر من خطة — وهو ممكن، إذ لا شيء يمنع تداخل نافذتين — تُفضَّل
 * الخطة ذات النافذة المضبوطة على المفتوحة بإطلاق، ثم الأحدث بدايةً. أي أن
 * خطةً فُتحت لها نافذة صريحة تسبق خطةً قديمة تُركت بلا نافذة، وهي القراءة
 * الوحيدة التي لا تجعل خطةً مهملة تبتلع طلبات خطةٍ قائمة.
 * [استنتاج]: حالة التداخل لم تُذكر في الطلب.
 */
export function findIntakePlan<T extends PlanWindow>(plans: readonly T[], today: string): T | null {
  const eligible = plans.filter((plan) => planAcceptsRequests(plan, today));
  if (eligible.length === 0) return null;
  const configured = eligible.filter((plan) => plan.requests_open_at != null || plan.requests_close_at != null);
  const pool = configured.length > 0 ? configured : eligible;
  return [...pool].sort((a, b) => (b.requests_open_at ?? "").localeCompare(a.requests_open_at ?? ""))[0];
}

/**
 * تصنيف طلبٍ يُرفع الآن: `true` يعني «خارج الخطة».
 *
 * تُستدعى في الخادم لحظة الرفع فقط، وتُخزَّن نتيجتها — لا تُعاد الحوسبة عند
 * القراءة، وإلّا لأعاد تحريرُ تواريخِ خطةٍ تصنيفَ طلباتٍ فُصل فيها أصلًا.
 */
export function isRaisedOutOfPlan(plans: readonly PlanWindow[], today: string): boolean {
  return findIntakePlan(plans, today) == null;
}

/** نصٌّ يصف مدى زمنيًّا، أو `null` إن لم يُضبط أيٌّ من طرفيه. */
export function describeDateRange(
  from: string | null,
  to: string | null,
  format: (iso: string) => string
): string | null {
  if (from == null && to == null) return null;
  if (from != null && to != null) return `${format(from)} — ${format(to)}`;
  if (from != null) return `من ${format(from)}`;
  return `حتى ${format(to as string)}`;
}
