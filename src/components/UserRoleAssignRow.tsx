"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { assignUserRole } from "@/app/[locale]/(app)/admin/roles/actions";

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
 * One row of the Users tab's role-assignment table (2026-07-24, extended
 * 2026-07-25 to allow several roles at once — "قد يكون له أكثر من دور مثل
 * مدير الموارد البشرية ومدير الجدارات"). A checkbox dropdown rather than a
 * native multi-select `<select multiple>` — that control needs ctrl/cmd-click
 * to pick more than one option, which is not discoverable in a plain table
 * row. Only manages the global (`scope_type='all'`) assignments; saving
 * replaces the whole set with whatever is currently checked (including
 * clearing it entirely for "بلا دور").
 */
export function UserRoleAssignRow({
  profileId,
  authUserId,
  roles,
  initialRoleIds,
}: {
  profileId: string;
  authUserId: string | null;
  roles: RoleOption[];
  initialRoleIds: string[];
}) {
  const t = useTranslations("AdminPage");
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(initialRoleIds);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggleRole(roleId: string) {
    setSelected((prev) => (prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]));
  }

  function handleSave() {
    setError(null);
    setSaved(false);
    startSaving(async () => {
      const res = await assignUserRole(profileId, authUserId, selected);
      if (res.status === "success") {
        setSaved(true);
        setOpen(false);
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  const summary = selected.length > 0
    ? roles.filter((r) => selected.includes(r.id)).map((r) => r.name_ar).join("، ")
    : t("roleNoneOption");

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="sru-icon-action"
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, padding: "6px 10px", width: "auto" }}
      >
        {summary}
        <ChevronDown size={13} aria-hidden />
      </button>
      {open && (
        <div
          className="sru-card"
          style={{
            position: "absolute",
            top: "100%",
            insetInlineStart: 0,
            zIndex: 20,
            padding: 10,
            minWidth: 220,
            maxHeight: 260,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {roles.map((role) => (
            <label key={role.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
              <input type="checkbox" checked={selected.includes(role.id)} onChange={() => toggleRole(role.id)} />
              {role.name_ar}
            </label>
          ))}
        </div>
      )}
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
