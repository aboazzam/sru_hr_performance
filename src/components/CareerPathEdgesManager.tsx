"use client";

import { useState, useTransition, useRef } from "react";
import { Trash2, Route } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AddFormDialog } from "@/components/AddFormDialog";
import { createCareerPathEdge, removeCareerPathEdge } from "@/app/[locale]/(app)/career-path/job-titles/actions";
import { includesIgnoringHamza } from "@/lib/arabicSearch";

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

// Restyled (2026-08-03) to the same sru-formsection pattern as the rest of
// this screen — see JobTitleCoreForm's own comment. The job-title search box
// itself (2026-08-01) is unchanged, just re-laid-out inside sru-field.
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const otherOptions = allJobTitles.filter((jt) => jt.id !== jobTitleId);
  const [targetId, setTargetId] = useState(otherOptions[0]?.id ?? "");
  const [direction, setDirection] = useState<"predecessor" | "successor">("successor");
  const [requirementsAr, setRequirementsAr] = useState("");

  const [targetSearch, setTargetSearch] = useState("");
  const trimmedSearch = targetSearch.trim();
  const filteredOptions =
    trimmedSearch === "" ? otherOptions : otherOptions.filter((jt) => includesIgnoringHamza(jt.nameAr, trimmedSearch));
  const effectiveTargetId = filteredOptions.some((jt) => jt.id === targetId) ? targetId : (filteredOptions[0]?.id ?? "");

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

  const addEdgeForm = (
    <div>
          <div className="sru-formgrid">
            <div className="sru-field">
              <label>{t("edgeDirectionLabel")}</label>
              <select value={direction} onChange={(e) => setDirection(e.target.value as "predecessor" | "successor")}>
                <option value="successor">{t("edgeLeadsTo")}</option>
                <option value="predecessor">{t("edgeComesFrom")}</option>
              </select>
            </div>
            <div className="sru-field">
              <label>{t("edgeTargetLabel")}</label>
              <input
                type="text"
                value={targetSearch}
                onChange={(e) => setTargetSearch(e.target.value)}
                placeholder={t("edgeTargetSearchPlaceholder")}
                dir="rtl"
                style={{ marginBottom: 6 }}
              />
              <select value={effectiveTargetId} onChange={(e) => setTargetId(e.target.value)} disabled={filteredOptions.length === 0}>
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
            <div className="sru-field">
              <label>{t("edgeRequirementsLabel")}</label>
              <input value={requirementsAr} onChange={(e) => setRequirementsAr(e.target.value)} dir="rtl" />
            </div>
          </div>
          <div className="sru-form-submitrow">
            <button type="button" disabled={isPending || !effectiveTargetId} onClick={handleAdd} className="sru-btn sru-btn-primary">
              {isPending ? t("adding") : t("addEdge")}
            </button>
          </div>
    </div>
  );

  return (
    <section className="sru-formsection">
      <div className="sru-formsection-head">
        <span className="sru-formsection-badge">
          <Route size={17} aria-hidden />
        </span>
        <div style={{ flex: 1 }}>
          <h3>{t("edgesHeading")}</h3>
          <span>{t("edgesSubtitle")}</span>
        </div>
        {canEdit && otherOptions.length > 0 && (
          <AddFormDialog dialogRef={dialogRef} triggerLabel={t("addEdge")} heading={t("edgesHeading")} closeLabel={t("closeButton")}>
            {addEdgeForm}
          </AddFormDialog>
        )}
      </div>

      {edges.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13, marginBottom: 16 }}>{t("noEdgesYet")}</p>
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
              {edge.requirementsAr && <span style={{ fontSize: 11.5, color: "var(--sru-muted)" }}>{edge.requirementsAr}</span>}
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


      {error && (
        <p role="alert" className="sru-auth-alert error" style={{ marginTop: 8 }}>
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      )}

    </section>
  );
}
