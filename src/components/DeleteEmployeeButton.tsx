"use client";

import { useActionState, useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
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
      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
    >
      <input type="hidden" name="profileId" value={profileId} />
      <button type="submit" disabled={pending} className="sru-icon-action danger" title={t("actionDelete")} aria-label={t("actionDelete")}>
        <Trash2 size={15} />
      </button>
      {state?.status === "error" && (
        <span role="alert" style={{ color: "#b91c1c", fontSize: 10.5 }}>
          {t("actionDeleteError")}
        </span>
      )}
    </form>
  );
}
