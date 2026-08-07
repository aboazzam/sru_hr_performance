import { transitionRefusalMessages } from "./recruitmentWorkflow";

/**
 * Turns any failure of a request/plan transition into text the reader can act
 * on, in one place shared by every screen that performs one.
 *
 * The workflow's own refusals already carry precise Arabic ("لا تملك صلاحية
 * تنفيذ هذا الإجراء", "يجب كتابة سبب واضح"). Everything else — a row deleted
 * or advanced by someone else, an expired session, a malformed payload —
 * used to collapse into a single "تعذر إتمام العملية.", which is exactly
 * what the project owner was left staring at with nothing to act on. Each
 * cause now says what actually happened.
 *
 * `t` is passed in rather than imported so this stays a pure function: it is
 * called from client components that already hold their own translator.
 */
export function recruitmentRequestErrorText(message: string, t: (key: string) => string): string {
  const refusal = transitionRefusalMessages[message as keyof typeof transitionRefusalMessages];
  if (refusal) return refusal;

  const keyByMessage: Record<string, string> = {
    not_found: "errorNotFound",
    no_profile: "errorNoProfile",
    invalid_input: "errorInvalidInput",
    duplicate: "errorDuplicate",
    unauthenticated: "errorUnauthenticated",
  };
  return t(keyByMessage[message] ?? "errorUnknown");
}
