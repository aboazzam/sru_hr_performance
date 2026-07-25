"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateRole } from "@/app/[locale]/(app)/admin/roles/actions";
import { RolePermissionMatrixFields } from "./RolePermissionMatrixFields";
import { processAreas, type ProcessArea, type VpraLevel } from "@/lib/vpra";

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

function permissionsEqual(a: Partial<Record<ProcessArea, VpraLevel>>, b: Partial<Record<ProcessArea, VpraLevel>>): boolean {
  return processAreas.every((area) => (a[area] ?? "none") === (b[area] ?? "none"));
}

export function EditRoleForm({
  roleId,
  initialNameAr,
  initialNameEn,
  initialPermissions,
}: {
  roleId: string;
  initialNameAr: string;
  initialNameEn: string | null;
  initialPermissions: Partial<Record<ProcessArea, VpraLevel>>;
}) {
  const t = useTranslations("AdminPage");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [nameAr, setNameAr] = useState(initialNameAr);
  const [nameEn, setNameEn] = useState(initialNameEn ?? "");
  const [permissions, setPermissions] = useState<Partial<Record<ProcessArea, VpraLevel>>>(initialPermissions);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // The last-SAVED baseline (starts at the initially loaded values) — the
  // Save button is disabled until the current form state actually diverges
  // from this, and Reset reverts back to it, per the project owner's
  // explicit request that Save stay inactive until a real change is made.
  const [savedNameAr, setSavedNameAr] = useState(initialNameAr);
  const [savedNameEn, setSavedNameEn] = useState(initialNameEn ?? "");
  const [savedPermissions, setSavedPermissions] = useState(initialPermissions);

  const isDirty = nameAr !== savedNameAr || nameEn !== savedNameEn || !permissionsEqual(permissions, savedPermissions);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const res = await updateRole(roleId, nameAr, nameEn, permissions);
      if (res.status === "success") {
        setSuccess(true);
        setSavedNameAr(nameAr);
        setSavedNameEn(nameEn);
        setSavedPermissions(permissions);
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  function handleReset() {
    setNameAr(savedNameAr);
    setNameEn(savedNameEn);
    setPermissions(savedPermissions);
    setError(null);
    setSuccess(false);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="sru-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 480 }}>
        <div>
          <label htmlFor="edit-role-name-ar" className="block text-sm font-medium mb-1">
            {t("roleNameArLabel")}
          </label>
          <input id="edit-role-name-ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} required className={inputClass} />
        </div>
        <div>
          <label htmlFor="edit-role-name-en" className="block text-sm font-medium mb-1">
            {t("roleNameEnLabel")}
          </label>
          <input id="edit-role-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" className={inputClass} />
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
      {success && <p style={{ color: "var(--sru-success, #15803d)", fontSize: 13 }}>{t("success")}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={isPending || !isDirty} className="sru-btn sru-btn-primary">
          {isPending ? t("savingRole") : t("saveButton")}
        </button>
        <button type="button" onClick={handleReset} disabled={isPending || !isDirty} className="sru-btn">
          {t("resetButton")}
        </button>
      </div>
    </form>
  );
}
