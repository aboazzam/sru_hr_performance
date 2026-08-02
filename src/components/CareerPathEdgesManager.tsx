"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createCareerPathEdge, removeCareerPathEdge } from "@/app/[locale]/(app)/career-path/job-titles/actions";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicateEdge",
  unknown: "errorUnknown",
};

interface Edge {
  id: string;
  otherJobTitleId: string;
  otherNameAr: string;
  otherGradeLevel: number;
  requirementsAr: string | null;
  /** This job title is the "from" side of the edge (i.e. leads TO the other job). */
  isFrom: boolean;
}

interface JobTitleOption {
  id: string;
  nameAr: string;
  gradeLevel: number;
}

export function CareerPathEdgesManager({
  jobTitleId,
  edges,
  allJobTitles,
  canEdit,
}: {
  jobTitleId: string;
  edges: Edge[];
  allJobTitles: JobTitleOption[];
  canEdit: boolean;
}) {
  const t = useTranslations("CareerPathJobTitleDetailPage");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const otherOptions = allJobTitles.filter((jt) => jt.id !== jobTitleId);
  const [targetId, setTargetId] = useState(otherOptions[0]?.id ?? "");
  const [direction, setDirection] = useState<"predecessor" | "successor">("successor");
  const [requirementsAr, setRequirementsAr] = useState("");

  // "اضف خاصية البحث بحيث اضع الحروف الاولى فيعطيني الوظائف المطابقة" --
  // otherOptions can run into the hundreds (this is a company-wide job
  // title list, not scoped to one family), making the plain select below
  // impractical to scroll through. A search box narrows the SAME select's
  // own option list rather than replacing it with a custom combobox, same
  // "substring, not startsWith" convention as the Employees list's own
  // search (2026-07-24). Derived fresh on every render rather than tracked
  // in a separate effect, matching this app's established
  // derive-during-render precedent for keeping a selection valid as its
  // candidate set changes.
  const [targetSearch, setTargetSearch] = useState("");
  const trimmedSearch = targetSearch.trim();
  const filteredOptions = trimmedSearch === "" ? otherOptions : otherOptions.filter((jt) => jt.nameAr.includes(trimmedSearch));
  const effectiveTargetId = filteredOptions.some((jt) => jt.id === targetId) ? targetId : (filteredOptions[0]?.id ?? "");

  const inputClass =
    "px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

  function handleAdd() {
    if (!effectiveTargetId) return;
    setError(null);
    startTransition(async () => {
      const [fromId, toId] = direction === "successor" ? [jobTitleId, effectiveTargetId] : [effectiveTargetId, jobTitleId];
      const res = await createCareerPathEdge(fromId, toId, requirementsAr);
      if (res.status === "success") {
        setRequirementsAr("");
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  function handleRemove(edgeId: string) {
    setError(null);
    startTransition(async () => {
      const res = await removeCareerPathEdge(edgeId);
      if (res.status === "success") router.refresh();
      else setError(res.message);
    });
  }

  return (
    <div>
      {edges.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14, marginBottom: 16 }}>{t("noEdgesYet")}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px" }}>
          {edges.map((edge) => (
            <li
              key={edge.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 0",
                borderBottom: "1px solid var(--sru-border)",
              }}
            >
              <span className="sru-chip">{edge.isFrom ? t("edgeLeadsTo") : t("edgeComesFrom")}</span>
              <span style={{ flex: 1 }}>
                {edge.otherNameAr}
                <span className="sru-chip sru-en" style={{ marginInlineStart: 8 }}>
                  {t("gradeLabel", { grade: edge.otherGradeLevel })}
                </span>
              </span>
              {edge.requirementsAr && <span style={{ fontSize: 12.5, color: "var(--sru-muted)" }}>{edge.requirementsAr}</span>}
              {canEdit && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleRemove(edge.id)}
                  className="sru-icon-action danger"
                  title={t("removeEdge")}
                  aria-label={t("removeEdge")}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && otherOptions.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label className="block text-sm font-medium mb-1">{t("edgeDirectionLabel")}</label>
            <select value={direction} onChange={(e) => setDirection(e.target.value as "predecessor" | "successor")} className={inputClass}>
              <option value="successor">{t("edgeLeadsTo")}</option>
              <option value="predecessor">{t("edgeComesFrom")}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t("edgeTargetLabel")}</label>
            <input
              type="text"
              value={targetSearch}
              onChange={(e) => setTargetSearch(e.target.value)}
              placeholder={t("edgeTargetSearchPlaceholder")}
              dir="rtl"
              className={inputClass}
              style={{ display: "block", marginBottom: 6, width: "100%" }}
            />
            <select
              value={effectiveTargetId}
              onChange={(e) => setTargetId(e.target.value)}
              className={inputClass}
              disabled={filteredOptions.length === 0}
            >
              {filteredOptions.length === 0 ? (
                <option value="">{t("edgeTargetNoMatches")}</option>
              ) : (
                filteredOptions.map((jt) => (
                  <option key={jt.id} value={jt.id}>
                    {jt.nameAr} ({t("gradeLabel", { grade: jt.gradeLevel })})
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t("edgeRequirementsLabel")}</label>
            <input
              value={requirementsAr}
              onChange={(e) => setRequirementsAr(e.target.value)}
              dir="rtl"
              className={inputClass}
            />
          </div>
          <button type="button" disabled={isPending || !effectiveTargetId} onClick={handleAdd} className="sru-btn sru-btn-primary">
            {isPending ? t("adding") : t("addEdge")}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600" style={{ marginTop: 8 }}>
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      )}
    </div>
  );
}
