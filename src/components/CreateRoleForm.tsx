"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createRole } from "@/app/[locale]/(app)/admin/roles/actions";
import { RolePermissionMatrixFields } from "./RolePermissionMatrixFields";
import type { ProcessArea, VpraLevel } from "@/lib/vpra";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalidRole",
  unauthenticated: "errorForbidden",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicateRole",
  has_dependents: "errorHasDependentsRole",
  unknown: "errorUnknown",
};

export function CreateRoleForm() {
  const t = useTranslations("AdminPage");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [roleCode, setRoleCode] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [permissions, setPermissions] = useState<Partial<Record<ProcessArea, VpraLevel>>>({});
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createRole(roleCode, nameAr, nameEn, permissions);
      if (res.status === "success") {
        router.push("/admin");
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }}>
      <div className="sru-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <label htmlFor="role-code" className="block text-sm font-medium mb-1">
            {t("roleCodeLabel")}
          </label>
          <input
            id="role-code"
            value={roleCode}
            onChange={(e) => setRoleCode(e.target.value)}
            dir="ltr"
            pattern="^[a-z][a-z0-9_]*$"
            placeholder="finance_reviewer"
            required
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="role-name-ar" className="block text-sm font-medium mb-1">
            {t("roleNameArLabel")}
          </label>
          <input id="role-name-ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} required className={inputClass} />
        </div>
        <div>
          <label htmlFor="role-name-en" className="block text-sm font-medium mb-1">
            {t("roleNameEnLabel")}
          </label>
          <input id="role-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" className={inputClass} />
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{t("permissionsHeading")}</h3>
        <RolePermissionMatrixFields
          value={permissions}
          onChange={(area, level) => setPermissions((prev) => ({ ...prev, [area]: level }))}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      )}
      <button type="submit" disabled={isPending} className="sru-btn sru-btn-primary" style={{ alignSelf: "flex-start" }}>
        {isPending ? t("savingRole") : t("createRoleButton")}
      </button>
    </form>
  );
}
