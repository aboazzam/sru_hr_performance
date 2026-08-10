// ============================================================================
// دورة اعتماد خطة التوظيف -- جدول التحويلات الصريح (transition guard)
//
// The single authority on "may this state change happen, by this caller,
// right now". Pure functions only: no Supabase client, no I/O, no React --
// so the Server Actions in `recruitment/plan/actions.ts` and
// `recruitment/requests/actions.ts` call it, and Vitest can exercise every
// branch without a database. Nothing may re-derive these rules inline; a
// transition that is not in a table below simply cannot happen.
//
// ---------------------------------------------------------------------------
// WHY PERMISSIONS ARE PROCESS AREAS, NEVER ROLE CODES
// ---------------------------------------------------------------------------
// The project owner creates this workflow's roles (finance reviewer, section
// head, department manager) from the /admin role editor at runtime, so their
// `role_code`s do not exist in any migration and are the owner's to choose.
// Gating on a role code would therefore be unimplementable today and brittle
// forever. Every rule below is expressed as a (process area, minimum VPRA
// level) pair, which /admin can reassign to any role with no code change.
//
// The four actors of the documented workflow map onto VPRA's own documented
// semantics (CLAUDE.md §4), not onto invented tiers:
//
//   recruitmentPlan   >= prepare    -- rasies/edits a request (section head,
//                                      department manager). Which UNIT they
//                                      may act on is not decided here: it is
//                                      enforced by Postgres, via the
//                                      org-scoped `check_vpra()` in
//                                      `recruitment_requests`' RLS.
//   recruitmentPlan   >= recommend  -- consolidates, prices and submits the
//                                      plan upward (HR). "recommend" is
//                                      literally VPRA's "submit/recommend
//                                      upward" level.
//   recruitmentBudget >= recommend  -- reviews the budget (finance).
//   recruitmentPlan   >= approve    -- final approval authority.
//
// This also resolves the ambiguity this codebase has been bitten by before
// (an individual role and an oversight role sharing one flat level): HR and
// a section head are distinguished by LEVEL, not by role identity, so the
// guard never has to ask "which role satisfied this check".
//
// [استنتاج] The mapping of each workflow stage onto a specific VPRA level is
// inferred from VPRA's documented meaning; the spec named human job titles,
// not levels. It is deliberately the one place to change if wrong.
//
// SEPARATION OF RECOMMENDING FROM APPROVING -- done, 2026-08-07.
// This file previously carried a `[غير مؤكد]` note that hr_admin held
// recruitmentPlan='approve' while super_admin held only 'view', so the same
// office both recommended and gave final approval. The project owner has
// since made the matrix change from /admin:
//     hr_admin    approve -> recommend
//     super_admin view    -> approve   (interim authority; the documented
//                                       intent is to move it to the CEO)
//     finance_manager      recruitmentBudget = recommend  (role created the
//                                       same day; none existed before)
// Verified live by simulating both roles: hr_admin now returns approve=false
// while keeping recommend/prepare (it still creates plans, consolidates, and
// reads salary_scale to price them), and super_admin returns approve=true.
//
// DO NOT treat the levels above as a fact about today. `role_permissions` is
// editable at runtime from /admin, and this project has twice been misled by
// a documented snapshot of it that had since drifted. Anything that depends
// on who currently holds what must re-query `role_permissions`, not read a
// comment. What IS durable is the mapping in the table above -- which LEVEL
// each stage requires -- because that lives in code, not in data.
// ============================================================================

import { hasVpraAccess, type ProcessArea, type VpraLevel } from "./vpra";

/** The caller's own levels, as returned by the `get_my_permissions()` RPC. */
export type RecruitmentPermissions = Partial<Record<ProcessArea, VpraLevel>>;

export interface RequiredAccess {
  processArea: ProcessArea;
  minLevel: VpraLevel;
}

function meets(permissions: RecruitmentPermissions, required: RequiredAccess): boolean {
  return hasVpraAccess(permissions[required.processArea] ?? "none", required.minLevel);
}

// ---------------------------------------------------------------------------
// Status vocabularies -- mirror the DB CHECK constraints in
// 20260807000002 exactly. Changing one without the other breaks writes.
// ---------------------------------------------------------------------------

export const requestStatuses = [
  "draft",
  "under_hr_review",
  "hr_reviewed",
  "returned_for_revision",
  "approved",
  "rejected",
  // مهجورتان (20260808000003): لا ينتجهما شيء بعد اليوم، وتبقيان في المفردات
  // لأن قيد CHECK ما زال يقبلهما ولئلا يظهر صف قديم بحالة بلا اسم.
  "submitted",
  "included_in_plan",
] as const;
export type RequestStatus = (typeof requestStatuses)[number];

export const planStatuses = [
  "draft",
  "submitted",
  "consolidated",
  "finance_review",
  "returned_for_revision",
  "approved",
  "ready_for_execution",
  "rejected",
] as const;
export type PlanStatus = (typeof planStatuses)[number];

/**
 * Fixed Arabic domain vocabulary, same convention as `evaluationStateLabels`.
 *
 * كل حالة تقول **مَن ينتظره الطلب الآن**، لا ما جرى له آخر مرة. بلاغ مباشر:
 * «مراجعة الموارد البشرية» و«تمت المراجعة» تصفان ما انتهى للتوّ، فلا يعرف
 * القارئ أعليه فعلُ شيء أم ينتظر غيره.
 *
 * والعبارة واحدة لكل من يقرأها: طُلب أن ترى الموارد البشرية «بانتظار
 * المراجعة» وحدها، لكن «بانتظار مراجعة الموارد البشرية» تقولها كاملةً لهم
 * ولغيرهم، وحالةٌ تتبدّل بحسب مَن ينظر إليها تجعل لقطتَي شاشة لصفٍّ واحد
 * متناقضتين ظاهريًا.
 */
export const requestStatusLabels: Record<RequestStatus, string> = {
  draft: "مسودة",
  under_hr_review: "بانتظار مراجعة الموارد البشرية",
  hr_reviewed: "بانتظار الاعتماد",
  returned_for_revision: "معاد للتعديل",
  approved: "معتمد",
  rejected: "مرفوض",
  // مهجورتان — تُعرضان فقط إن بقي صف قديم يحملهما.
  submitted: "مرفوع",
  included_in_plan: "بانتظار الاعتماد",
};

export const planStatusLabels: Record<PlanStatus, string> = {
  draft: "مسودة",
  submitted: "مرفوعة للمراجعة",
  consolidated: "مدموجة",
  finance_review: "قيد المراجعة المالية",
  returned_for_revision: "معادة للتعديل",
  approved: "معتمدة",
  ready_for_execution: "جاهزة للتنفيذ",
  rejected: "مرفوضة",
};

/** Renders an unknown stored value as-is rather than blanking it. */
export function requestStatusLabel(status: string): string {
  return requestStatusLabels[status as RequestStatus] ?? status;
}

export function planStatusLabel(status: string): string {
  return planStatusLabels[status as PlanStatus] ?? status;
}

/**
 * A status nobody has ruled on yet. The plan may not reach final approval
 * while any of its requests is still here — the spec's own rule
 * ("الخطة لا تُرفع للاعتماد النهائي وفيها بنود لم يُفصل فيها").
 */
// `hr_reviewed` منها: الموارد البشرية أنهت دورها لكن الأدمن لم يقرّر بعد،
// فالطلب ما زال بلا فصل. و`submitted` مهجورة وتبقى هنا للصفوف القديمة.
export const undecidedRequestStatuses: RequestStatus[] = [
  "submitted",
  "under_hr_review",
  "hr_reviewed",
];

export function isRequestDecided(status: string): boolean {
  return !undecidedRequestStatuses.includes(status as RequestStatus);
}

/**
 * الحالات التي يجوز فيها ضمّ الطلب إلى خطة يدويًا من شاشة الدمج.
 *
 * الدمج لم يعد ينقل الحالة (20260808000003)، فلا يحكمه جدول التحويلات —
 * ومع ذلك تسكن القاعدة هنا لا في الشاشة ولا في الإجراء، لأن الاثنين
 * يقرآنها: لو تفرّقت لانحرف مربّع الاختيار عمّا يقبله الخادم فعلًا.
 *
 * لا يُضمّ طلب ما زال تحت المراجعة: تسعيره في ميزانية قبل أن يفحصه أحد هو
 * بالضبط ما يفترض أن تمنعه المراجعة. و`included_in_plan` مهجورة، وتُقبل
 * لئلا يعلق صفٌّ قديم خارج أي خطة.
 */
export const mergeableRequestStatuses: RequestStatus[] = [
  "hr_reviewed",
  "approved",
  "included_in_plan",
];

export function isRequestMergeable(status: string): boolean {
  return mergeableRequestStatuses.includes(status as RequestStatus);
}

// ---------------------------------------------------------------------------
// Transition tables
// ---------------------------------------------------------------------------

export interface TransitionRule<S extends string> {
  from: S;
  to: S;
  requires: RequiredAccess;
  /** A mandatory free-text reason (any return-for-revision or rejection). */
  requiresNote?: boolean;
  /**
   * Offers a note box that may be left empty — the spec's "حقل ملاحظة
   * اختيارية" on the approval screen. Purely a UI hint: unlike
   * `requiresNote` it is never enforced here, so `evaluate` ignores it.
   */
  optionalNote?: boolean;
  /** Finance may take no action without recording a note (spec §4). */
  requiresFinanceNote?: boolean;
  /** Final approval requires finance to have actually reviewed first. */
  requiresFinanceReview?: boolean;
  /** Final approval requires every linked request to be decided. */
  requiresAllRequestsDecided?: boolean;
  /**
   * Render this transition as a small icon BESIDE the status instead of a
   * text button in the actions column. Requested for "إخراج من الخطة": the
   * status now reads "بانتظار الاعتماد", and pulling the item back out of
   * the plan belongs next to that status rather than among the forward
   * actions. Kept here (data, not React) so the transition table stays the
   * single authority and no component re-derives which action goes where.
   */
  statusAdjacent?: boolean;
  /**
   * Only the request's own author may do this.
   *
   * Raising a request is the requester's act, not an approval step — but
   * `prepare` is a level EVERY higher actor also clears, so HR and the
   * approver were both offered "رفع الطلب" on someone else's draft, and read
   * it as their own next step. Reported live, twice.
   *
   * A permission level cannot express this on its own: the distinction is not
   * "how much authority" but "whose request", which is a row fact. The rule
   * therefore carries it, and `evaluate` refuses with `forbidden` when the
   * caller is not the author — the same answer as any other missing right.
   */
  ownerOnly?: boolean;
  /** Short Arabic label for the action button that performs it. */
  labelAr: string;
}

const PREPARE: RequiredAccess = { processArea: "recruitmentPlan", minLevel: "prepare" };
const RECOMMEND: RequiredAccess = { processArea: "recruitmentPlan", minLevel: "recommend" };
const APPROVE: RequiredAccess = { processArea: "recruitmentPlan", minLevel: "approve" };
const FINANCE: RequiredAccess = { processArea: "recruitmentBudget", minLevel: "recommend" };

/**
 * طلب الاحتياج: raised by a unit, decided individually by HR during
 * consolidation ("مستوى البند"), then carried to `approved` by the plan's
 * own final approval.
 */
export const requestTransitions: TransitionRule<RequestStatus>[] = [
  // ١) المنسّق: حالتان لا أكثر — مسودة يعمل عليها، ثم يرفعها فتصير مسؤولية
  //    الموارد البشرية مباشرةً. لا حالة وسيطة "مرفوع" بينهما: كانت تعني أن
  //    المنسّق يرى "مسودة" بينما يرى الأدمن "رفع الطلب" لنفس الصف، وأن
  //    الأدمن يؤدي خطوة الموارد البشرية بنفسه.
  { from: "draft", to: "under_hr_review", requires: PREPARE, ownerOnly: true, labelAr: "رفع الطلب" },
  {
    from: "returned_for_revision",
    to: "under_hr_review",
    requires: PREPARE,
    ownerOnly: true,
    labelAr: "إعادة الرفع",
  },

  // ٢) الموارد البشرية: تنتهي مراجعتها، أو ترفض، أو تعيد للتعديل.
  { from: "under_hr_review", to: "hr_reviewed", requires: RECOMMEND, labelAr: "تمت المراجعة" },
  { from: "under_hr_review", to: "rejected", requires: RECOMMEND, requiresNote: true, labelAr: "رفض الطلب" },
  { from: "under_hr_review", to: "returned_for_revision", requires: RECOMMEND, requiresNote: true, labelAr: "إعادة للتعديل" },

  // التراجع عن المراجعة — بجوار الحالة لا في عمود الإجراءات، حفاظًا على نمط
  // "التصحيح أيقونة لا زر" الذي أُقرّ سابقًا.
  { from: "hr_reviewed", to: "under_hr_review", requires: RECOMMEND, statusAdjacent: true, labelAr: "التراجع عن المراجعة" },

  // ٣) الأدمن: اعتماد — ومعه الإدراج التلقائي في الخطة — أو رفض أو إعادة.
  { from: "hr_reviewed", to: "approved", requires: APPROVE, labelAr: "اعتماد" },
  { from: "hr_reviewed", to: "rejected", requires: APPROVE, requiresNote: true, labelAr: "رفض" },
  { from: "hr_reviewed", to: "returned_for_revision", requires: APPROVE, requiresNote: true, labelAr: "إعادة للتعديل" },
];

/**
 * الخطة: HR builds and consolidates, submits with a recommendation, finance
 * reviews the budget, the approval authority approves, then it becomes
 * ready for execution (its items published as real vacancies).
 *
 * [استنتاج] Finance "passing" the plan is recorded by `finance_reviewed_at`
 * + `finance_note` rather than by its own status: the documented vocabulary
 * has no "awaiting final approval" value, and inventing one would put the
 * code and the DB CHECK out of step. `requiresFinanceReview` on the approval
 * transition is what makes the finance stage genuinely unskippable.
 */
export const planTransitions: TransitionRule<PlanStatus>[] = [
  { from: "draft", to: "consolidated", requires: RECOMMEND, labelAr: "إنهاء الدمج" },
  { from: "consolidated", to: "draft", requires: RECOMMEND, labelAr: "إعادة فتح للتعديل" },
  { from: "consolidated", to: "submitted", requires: RECOMMEND, labelAr: "رفع الخطة" },

  { from: "submitted", to: "finance_review", requires: FINANCE, labelAr: "بدء المراجعة المالية" },
  { from: "submitted", to: "returned_for_revision", requires: FINANCE, requiresNote: true, requiresFinanceNote: true, labelAr: "إعادة للتعديل" },

  { from: "finance_review", to: "returned_for_revision", requires: FINANCE, requiresNote: true, requiresFinanceNote: true, labelAr: "إعادة للتعديل" },

  {
    from: "finance_review",
    to: "approved",
    requires: APPROVE,
    requiresFinanceReview: true,
    requiresAllRequestsDecided: true,
    optionalNote: true,
    labelAr: "اعتماد الخطة",
  },
  { from: "finance_review", to: "rejected", requires: APPROVE, requiresNote: true, labelAr: "رفض الخطة" },

  { from: "returned_for_revision", to: "draft", requires: RECOMMEND, labelAr: "استئناف التعديل" },

  { from: "approved", to: "ready_for_execution", requires: APPROVE, labelAr: "إطلاق التنفيذ" },
];

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export type TransitionRefusal =
  | "unknown_transition"
  | "forbidden"
  | "note_required"
  | "finance_note_required"
  | "finance_review_required"
  | "undecided_requests";

export type TransitionVerdict =
  | { allowed: true; rule: TransitionRule<string> }
  | { allowed: false; refusal: TransitionRefusal };

/** Arabic messages for every refusal, so callers never invent their own. */
export const transitionRefusalMessages: Record<TransitionRefusal, string> = {
  unknown_transition: "هذا الانتقال غير معرَّف في دورة العمل.",
  forbidden: "لا تملك صلاحية تنفيذ هذا الإجراء.",
  note_required: "يجب كتابة سبب واضح لهذا الإجراء.",
  finance_note_required: "ملاحظة الشؤون المالية إلزامية.",
  finance_review_required: "لا يمكن الاعتماد قبل إتمام المراجعة المالية.",
  undecided_requests: "لا يمكن الاعتماد والخطة تحتوي طلبات لم يُفصل فيها بعد.",
};

export interface TransitionContext {
  permissions: RecruitmentPermissions;
  /** Reason / decision note supplied by the caller. */
  note?: string | null;
  /** Finance's own note; separate field, separate mandatory rule. */
  financeNote?: string | null;
  /** Whether finance has already reviewed (`finance_reviewed_at` is set). */
  financeReviewed?: boolean;
  /** How many of the plan's requests are still `submitted`/`under_hr_review`. */
  undecidedRequestCount?: number;
  /**
   * Is the caller the request's own author (`requested_by` = their profile)?
   *
   * Defaults to FALSE when omitted, so an `ownerOnly` rule is refused unless
   * ownership is positively established — the safe direction, and the same
   * posture `undecidedRequestCount` takes for the plan.
   */
  isOwnRequest?: boolean;
}

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

function evaluate<S extends string>(
  table: TransitionRule<S>[],
  from: string,
  to: string,
  context: TransitionContext
): TransitionVerdict {
  const rule = table.find((candidate) => candidate.from === from && candidate.to === to);
  if (!rule) return { allowed: false, refusal: "unknown_transition" };

  if (!meets(context.permissions, rule.requires)) {
    return { allowed: false, refusal: "forbidden" };
  }
  if (rule.ownerOnly && !context.isOwnRequest) {
    return { allowed: false, refusal: "forbidden" };
  }
  if (rule.requiresNote && isBlank(context.note)) {
    return { allowed: false, refusal: "note_required" };
  }
  if (rule.requiresFinanceNote && isBlank(context.financeNote)) {
    return { allowed: false, refusal: "finance_note_required" };
  }
  if (rule.requiresFinanceReview && !context.financeReviewed) {
    return { allowed: false, refusal: "finance_review_required" };
  }
  if (rule.requiresAllRequestsDecided && (context.undecidedRequestCount ?? 0) > 0) {
    return { allowed: false, refusal: "undecided_requests" };
  }
  return { allowed: true, rule: rule as TransitionRule<string> };
}

export function evaluateRequestTransition(
  from: string,
  to: string,
  context: TransitionContext
): TransitionVerdict {
  return evaluate(requestTransitions, from, to, context);
}

export function evaluatePlanTransition(
  from: string,
  to: string,
  context: TransitionContext
): TransitionVerdict {
  return evaluate(planTransitions, from, to, context);
}

/**
 * Every transition the caller could perform from `from` right now, for
 * rendering action buttons. Deliberately filters on PERMISSION only, not on
 * the note/finance/undecided preconditions: those are things the caller can
 * still satisfy by filling the form, so hiding the button would leave no way
 * to discover what is missing. Buttons the caller may never press are hidden
 * outright (the project's established "no disabled button for a permission
 * you don't hold" rule).
 */
/**
 * `isOwnRequest` defaults to false, so a caller who is merely permitted is
 * never offered an owner-only action on someone else's request — which is
 * exactly how "رفع الطلب" ended up rendered for HR and the approver.
 */
export function availableRequestTransitions(
  from: string,
  permissions: RecruitmentPermissions,
  isOwnRequest = false
): TransitionRule<RequestStatus>[] {
  return requestTransitions.filter(
    (rule) =>
      rule.from === from &&
      meets(permissions, rule.requires) &&
      (!rule.ownerOnly || isOwnRequest)
  );
}

export function availablePlanTransitions(
  from: string,
  permissions: RecruitmentPermissions
): TransitionRule<PlanStatus>[] {
  return planTransitions.filter((rule) => rule.from === from && meets(permissions, rule.requires));
}
