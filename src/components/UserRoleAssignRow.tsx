"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { assignUserRole } from "@/app/[locale]/(app)/admin/roles/actions";

const selectClass =
  "px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

interface RoleOption {
  id: string;
  name_ar: string;
}

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalidRole",
  unauthenticated: "errorForbidden",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicateRole",
  has_dependents: "errorHasDependentsRole",
  unknown: "errorUnknown",
};

/**
 * One row of the Users tab's role-assignment table (2026-07-24): "المستخدم
 * موجود تلقائيًا مع الموظفين، فقط اسناد صلاحيات" — no add-user flow, just a
 * per-employee role select + save, mirroring `OrgStructurePositionRow`'s
 * established per-row save pattern. Only manages the single global
 * (`scope_type='all'`) assignment; saving replaces whatever that was with
 * the newly selected role (or clears it for "بلا دور").
 */
export function UserRoleAssignRow({
  profileId,
  authUserId,
  roles,
  initialRoleId,
}: {
  profileId: string;
  authUserId: string | null;
  roles: RoleOption[];
  initialRoleId: string | null;
}) {
  const t = useTranslations("AdminPage");
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [roleId, setRoleId] = useState(initialRoleId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setError(null);
    setSaved(false);
    startSaving(async () => {
      const res = await assignUserRole(profileId, authUserId, roleId || null);
      if (res.status === "success") {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className={selectClass}>
        <option value="">{t("roleNoneOption")}</option>
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name_ar}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={isSaving}
        onClick={handleSave}
        className="sru-icon-action primary"
        title={t("saveButton")}
        aria-label={t("saveButton")}
      >
        <Check size={15} />
      </button>
      {saved && !error && <span style={{ color: "var(--sru-success, #15803d)", fontSize: 11.5 }}>{t("success")}</span>}
      {error && (
        <span role="alert" style={{ color: "#b91c1c", fontSize: 11.5 }}>
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </span>
      )}
    </div>
  );
}
