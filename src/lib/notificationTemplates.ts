/**
 * قوالب نصوص الإشعارات -- every notification string this module can send,
 * in one file, as the spec asks ("اجعل قائمة قوالب النصوص في ملف واحد").
 *
 * Pure and unit-tested: the wording a department head reads when their
 * request is returned is part of the product, not an incidental string
 * buried in an action.
 *
 * Arabic only for now. `notifications.message_en` exists and is nullable
 * precisely so an English pass can be added later without a migration —
 * these messages are generated at WRITE time, so nothing translates them
 * afterwards, and inventing half-English text now would be worse than
 * honestly leaving it null.
 */

import { requestStatusLabel, planStatusLabel } from "./recruitmentWorkflow";

export interface NotificationContent {
  type: string;
  messageAr: string;
  linkPath: string | null;
}

/** Trims a reason to keep a notification readable at a glance. */
function withReason(base: string, reason?: string | null): string {
  const trimmed = reason?.trim();
  if (!trimmed) return `${base}.`;
  const short = trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
  return `${base} — السبب: ${short}`;
}

/**
 * A request changed state. `jobTitle` is whatever the request is FOR (a
 * catalogue title or the free-text one), so the reader recognises which of
 * their requests this is without opening it.
 */
export function requestTransitionNotification(input: {
  toStatus: string;
  jobTitle: string;
  reason?: string | null;
}): NotificationContent {
  const { toStatus, jobTitle, reason } = input;
  const subject = `طلب الاحتياج «${jobTitle}»`;
  const linkPath = "/recruitment/requests";

  switch (toStatus) {
    case "submitted":
      return { type: "recruitment_request_submitted", messageAr: `تم رفع ${subject} إلى الموارد البشرية.`, linkPath };
    case "under_hr_review":
      return { type: "recruitment_request_under_review", messageAr: `بدأت الموارد البشرية مراجعة ${subject}.`, linkPath };
    case "included_in_plan":
      return { type: "recruitment_request_included", messageAr: `تم إدراج ${subject} في خطة التوظيف.`, linkPath };
    case "returned_for_revision":
      return {
        type: "recruitment_request_returned",
        messageAr: withReason(`أُعيد ${subject} للتعديل`, reason),
        linkPath,
      };
    case "rejected":
      return { type: "recruitment_request_rejected", messageAr: withReason(`رُفض ${subject}`, reason), linkPath };
    case "approved":
      return { type: "recruitment_request_approved", messageAr: `تم اعتماد ${subject} ضمن خطة التوظيف.`, linkPath };
    default:
      // Never silently drop an unknown state: fall back to the shared status
      // vocabulary so a rule added later still produces a readable message.
      return {
        type: "recruitment_request_updated",
        messageAr: `تغيّرت حالة ${subject} إلى «${requestStatusLabel(toStatus)}».`,
        linkPath,
      };
  }
}

/** A plan changed state. `planName`/`planYear` identify it the way HR refers to it. */
export function planTransitionNotification(input: {
  toStatus: string;
  planName: string;
  planYear: number;
  planId: string;
  reason?: string | null;
}): NotificationContent {
  const { toStatus, planName, planYear, planId, reason } = input;
  const subject = `خطة التوظيف ${planYear} («${planName}»)`;
  const linkPath = `/recruitment/plan/${planId}`;

  switch (toStatus) {
    case "consolidated":
      return { type: "recruitment_plan_consolidated", messageAr: `تم دمج ${subject} وأصبحت جاهزة للرفع.`, linkPath };
    case "submitted":
      return {
        type: "recruitment_plan_submitted",
        messageAr: `رُفعت ${subject} للمراجعة المالية.`,
        linkPath,
      };
    case "finance_review":
      return { type: "recruitment_plan_finance_review", messageAr: `بدأت المراجعة المالية لـ${subject}.`, linkPath };
    case "returned_for_revision":
      return {
        type: "recruitment_plan_returned",
        // The spec's own worked example.
        messageAr: withReason(`أُعيدت ${subject} للتعديل`, reason),
        linkPath,
      };
    case "approved":
      return { type: "recruitment_plan_approved", messageAr: `تم اعتماد ${subject}.`, linkPath };
    case "rejected":
      return { type: "recruitment_plan_rejected", messageAr: withReason(`رُفضت ${subject}`, reason), linkPath };
    case "ready_for_execution":
      return {
        type: "recruitment_plan_ready",
        messageAr: `أصبحت ${subject} جاهزة للتنفيذ ويمكن نشر شواغرها.`,
        linkPath,
      };
    default:
      return {
        type: "recruitment_plan_updated",
        messageAr: `تغيّرت حالة ${subject} إلى «${planStatusLabel(toStatus)}».`,
        linkPath,
      };
  }
}

/** Finance recorded its review — HR and the approval authority both care. */
export function financeReviewNotification(input: {
  planName: string;
  planYear: number;
  planId: string;
  overBudget: boolean;
}): NotificationContent {
  const { planName, planYear, planId, overBudget } = input;
  return {
    type: "recruitment_plan_finance_reviewed",
    messageAr: overBudget
      ? `سجّلت الشؤون المالية مراجعتها لخطة التوظيف ${planYear} («${planName}») — الخطة تتجاوز الميزانية المعتمدة.`
      : `سجّلت الشؤون المالية مراجعتها لخطة التوظيف ${planYear} («${planName}»).`,
    linkPath: `/recruitment/plan/${planId}`,
  };
}
