"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { deleteEmployee, type DeleteEmployeeState } from "@/app/[locale]/(app)/employees/actions";

export function DeleteEmployeeButton({ profileId }: { profileId: string }) {
  const t = useTranslations("EmployeesPage");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<DeleteEmployeeState, FormData>(deleteEmployee, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.status === "success") router.refresh();
  }, [state, router]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(t("deleteConfirm"))) e.preventDefault();
      }}
      style={{ display: "inline" }}
    >
      <input type="hidden" name="profileId" value={profileId} />
      <button type="submit" disabled={pending} className="sru-btn" style={{ padding: "4px 10px", fontSize: 12 }}>
        {pending ? t("deleting") : t("actionDelete")}
      </button>
      {state?.status === "error" && (
        <span role="alert" style={{ color: "#b91c1c", fontSize: 11, marginInlineStart: 6 }}>
          {t("actionDeleteError")}
        </span>
      )}
    </form>
  );
}
