"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { deleteRole } from "@/app/[locale]/(app)/admin/roles/actions";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalidRole",
  unauthenticated: "errorForbidden",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicateRole",
  has_dependents: "errorHasDependentsRole",
  unknown: "errorUnknown",
};

export function DeleteRoleButton({ roleId, disabled }: { roleId: string; disabled?: boolean }) {
  const t = useTranslations("AdminPage");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!window.confirm(t("deleteRoleConfirm"))) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteRole(roleId);
      if (res.status === "success") {
        router.push("/admin");
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        disabled={isPending || disabled}
        onClick={handleDelete}
        className="sru-btn"
        style={{ padding: "4px 10px", fontSize: 12 }}
      >
        {isPending ? t("deletingRole") : t("deleteButton")}
      </button>
      {error && (
        <span role="alert" style={{ color: "#b91c1c", fontSize: 11 }}>
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </span>
      )}
    </span>
  );
}
