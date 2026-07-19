// Source of truth: CLAUDE.md sections 4 and 4-A, transcribed verbatim.
//
// [غير مؤكد] CLAUDE.md لا ينص صراحة على أن super_admin يملك تجاوزاً ضمنياً
// (implicit bypass) لكل الحالات — لم تُفترض هنا أي صلاحية غير موثّقة. أي دور
// غير مذكور في جدول 4-A لحالة معيّنة يُعامل كـ "none" افتراضياً، بما فيه
// super_admin، حتى يُنص على خلاف ذلك صراحة.

export type VpraLevel = "none" | "view" | "prepare" | "recommend" | "approve";

const vpraLevelRank: Record<VpraLevel, number> = {
  none: 0,
  view: 1,
  prepare: 2,
  recommend: 3,
  approve: 4,
};

export const vpraLevelLabels: Record<VpraLevel, string> = {
  none: "لا صلاحية",
  view: "عرض",
  prepare: "إعداد",
  recommend: "ترشيح",
  approve: "اعتماد",
};

/** True when `actual` meets or exceeds `required` on the VPRA scale. */
export function hasVpraAccess(actual: VpraLevel, required: VpraLevel): boolean {
  return vpraLevelRank[actual] >= vpraLevelRank[required];
}

export type ProcessArea =
  | "goalsLibrary"
  | "competencyFramework"
  | "defaultTemplates"
  | "goalAssignment"
  | "bauTasks"
  | "evaluation"
  | "calibration"
  | "promotions"
  | "vacancies"
  | "careerPath"
  | "employeeData"
  | "userManagement";

export const processAreas: ProcessArea[] = [
  "goalsLibrary",
  "competencyFramework",
  "defaultTemplates",
  "goalAssignment",
  "bauTasks",
  "evaluation",
  "calibration",
  "promotions",
  "vacancies",
  "careerPath",
  "employeeData",
  "userManagement",
];

export type RoleCode =
  | "super_admin"
  | "ceo"
  | "cxo"
  | "hr_admin"
  | "strategy_admin"
  | "competencies_admin"
  | "committee"
  | "manager"
  | "supervisor"
  | "employee"
  | "field_supervisor"
  | "mentor";

export interface DefaultRole {
  roleCode: RoleCode;
  nameAr: string;
  isSystemRole: boolean;
}

/** Seeded defaults per CLAUDE.md section 4 — admin-configurable at runtime, not a fixed enum in the DB. */
export const defaultRoles: DefaultRole[] = [
  { roleCode: "super_admin", nameAr: "مدير النظام", isSystemRole: true },
  { roleCode: "ceo", nameAr: "الرئيس التنفيذي", isSystemRole: true },
  { roleCode: "cxo", nameAr: "رئيس تنفيذي", isSystemRole: true },
  { roleCode: "hr_admin", nameAr: "مدير الموارد البشرية", isSystemRole: true },
  { roleCode: "strategy_admin", nameAr: "مدير الاستراتيجية", isSystemRole: true },
  { roleCode: "competencies_admin", nameAr: "مدير الجدارات", isSystemRole: true },
  { roleCode: "committee", nameAr: "لجنة التقييم", isSystemRole: true },
  { roleCode: "manager", nameAr: "عميد / مدير", isSystemRole: true },
  { roleCode: "supervisor", nameAr: "رئيس مباشر", isSystemRole: true },
  { roleCode: "employee", nameAr: "موظف", isSystemRole: true },
  { roleCode: "field_supervisor", nameAr: "مشرف ميداني", isSystemRole: true },
  { roleCode: "mentor", nameAr: "مرشد", isSystemRole: true },
];

export type EvaluationState =
  | "draft"
  | "submitted"
  | "supervisor_reviewed"
  | "manager_recommended"
  | "committee_reviewed"
  | "approved"
  | "finalized";

export const evaluationStates: EvaluationState[] = [
  "draft",
  "submitted",
  "supervisor_reviewed",
  "manager_recommended",
  "committee_reviewed",
  "approved",
  "finalized",
];

export const evaluationStateLabels: Record<EvaluationState, string> = {
  draft: "مسودة",
  submitted: "مُرسل",
  supervisor_reviewed: "مراجعة الرئيس المباشر",
  manager_recommended: "توصية المدير",
  committee_reviewed: "مراجعة اللجنة",
  approved: "معتمد",
  finalized: "نهائي",
};

/**
 * `evaluations.eval_type` (20260718000012) — SRU_System_Design.md's own
 * sketch, resolved with the project owner: this allows MULTIPLE
 * evaluation rows per employee per cycle, one per perspective, not a
 * single-row classification (the DB's UNIQUE index is
 * (employee_id, cycle_id, eval_type), not just (employee_id, cycle_id)).
 * Domain vocabulary, not translatable UI chrome — same convention as
 * `evaluationStateLabels` (used directly regardless of locale, e.g. in
 * AdminPage/the evaluation detail page).
 */
export type EvalType = "self" | "supervisor" | "peer" | "customer";

export const evalTypes: EvalType[] = ["self", "supervisor", "peer", "customer"];

export const evalTypeLabels: Record<EvalType, string> = {
  self: "تقييم ذاتي",
  supervisor: "تقييم الرئيس المباشر",
  peer: "تقييم الزملاء",
  customer: "تقييم المستفيدين",
};

/**
 * The roles that participate directly in the evaluation lifecycle table
 * (section 4-A). CLAUDE.md 4-A itself only names five (employee, supervisor,
 * manager, committee, hr_admin) — `field_supervisor` was added here
 * 2026-07-16 as a deliberate, explicit decision (not a CLAUDE.md
 * transcription) to mirror `supervisor` at every state exactly, since
 * `field_supervisor` is CLAUDE.md §4's parallel role for field/operational
 * staff and there is no documented reason for it to be gated differently.
 */
export type EvaluationActorRole =
  | "employee"
  | "supervisor"
  | "manager"
  | "committee"
  | "hr_admin"
  | "field_supervisor";

/**
 * Evaluation-lifecycle VPRA table. The five columns named in CLAUDE.md
 * section 4-A are transcribed cell-for-cell; `field_supervisor` is a sixth,
 * added column that duplicates `supervisor`'s values at every state (see
 * `EvaluationActorRole`'s comment for why). "Rule: VPRA checks must consider
 * BOTH permission level AND current state." — this table IS that joint
 * check for the `evaluation` process area specifically; other process areas
 * don't have a per-state table and use role_permissions directly instead.
 */
const evaluationStatePermissions: Record<
  EvaluationState,
  Record<EvaluationActorRole, VpraLevel>
> = {
  draft: { employee: "prepare", supervisor: "view", manager: "none", committee: "none", hr_admin: "view", field_supervisor: "view" },
  submitted: { employee: "view", supervisor: "prepare", manager: "view", committee: "none", hr_admin: "view", field_supervisor: "prepare" },
  supervisor_reviewed: { employee: "view", supervisor: "view", manager: "recommend", committee: "none", hr_admin: "view", field_supervisor: "view" },
  manager_recommended: { employee: "view", supervisor: "view", manager: "view", committee: "recommend", hr_admin: "view", field_supervisor: "view" },
  committee_reviewed: { employee: "view", supervisor: "view", manager: "view", committee: "view", hr_admin: "approve", field_supervisor: "view" },
  approved: { employee: "view", supervisor: "view", manager: "view", committee: "view", hr_admin: "view", field_supervisor: "view" },
  finalized: { employee: "view", supervisor: "view", manager: "view", committee: "view", hr_admin: "view", field_supervisor: "view" },
};

/**
 * Returns the actor's VPRA level for the `evaluation` process area at a
 * given lifecycle state. Roles outside the six modeled here (e.g. ceo,
 * competencies_admin, mentor) are not covered by this table and resolve to
 * "none" here — they may still hold access via a general `evaluation`
 * role_permissions grant, which this function does not model.
 */
export function getEvaluationStatePermission(
  state: EvaluationState,
  actorRole: RoleCode
): VpraLevel {
  const row = evaluationStatePermissions[state];
  return actorRole in row ? row[actorRole as EvaluationActorRole] : "none";
}

/** True if the given state is reachable next from `from` in the linear lifecycle (no skipping). */
export function isNextEvaluationState(from: EvaluationState, to: EvaluationState): boolean {
  const fromIndex = evaluationStates.indexOf(from);
  const toIndex = evaluationStates.indexOf(to);
  return toIndex === fromIndex + 1;
}

/**
 * [استنتاج] "approved" is the one advanceable state with no role holding
 * more than "view" in the table above — CLAUDE.md doesn't name an actor for
 * approved → finalized, so it's modeled here as system-triggered
 * (e.g. a scheduled job or the write that sets "approved" also finalizing
 * immediately), not something any role can call `transitionEvaluationState`
 * for. Confirm this with the project owner before relying on it.
 */
const SYSTEM_TRIGGERED_STATES: ReadonlySet<EvaluationState> = new Set(["approved"]);

/**
 * True if `actorRole` currently holds an actionable (prepare/recommend/
 * approve — i.e. more than view) level at `state`, meaning they are the
 * one who can move the evaluation out of this state.
 */
export function canAdvanceEvaluationState(
  state: EvaluationState,
  actorRole: RoleCode
): boolean {
  if (SYSTEM_TRIGGERED_STATES.has(state)) return false;
  const level = getEvaluationStatePermission(state, actorRole);
  return level !== "none" && level !== "view";
}

/** The state that directly follows `state` in the linear lifecycle, or null if `state` is terminal. */
export function nextEvaluationState(state: EvaluationState): EvaluationState | null {
  const index = evaluationStates.indexOf(state);
  if (index === -1 || index === evaluationStates.length - 1) return null;
  return evaluationStates[index + 1];
}

/**
 * The single function meant to back a server-side transition action per
 * CLAUDE.md's rule "state transitions are server-side only — never trust
 * client-sent state." Throws rather than silently no-op-ing so a caller
 * can't mistake a rejected transition for a successful one.
 */
export function transitionEvaluationState(
  state: EvaluationState,
  actorRole: RoleCode
): EvaluationState {
  if (!canAdvanceEvaluationState(state, actorRole)) {
    throw new Error(
      `Role "${actorRole}" does not hold an actionable VPRA level at evaluation state "${state}".`
    );
  }
  const next = nextEvaluationState(state);
  if (!next) {
    throw new Error(`Evaluation state "${state}" has no next state.`);
  }
  return next;
}
