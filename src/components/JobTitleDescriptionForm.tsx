"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, FileText } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { updateJobTitleDescription } from "@/app/[locale]/(app)/career-path/job-titles/[id]/actions";
import { SuggestDescriptionButton } from "@/components/SuggestDescriptionButton";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

// Restyled (2026-08-03) to the same sru-formsection pattern as the rest of
// this screen — see JobTitleCoreForm's own comment.
export function JobTitleDescriptionForm({
  jobTitleId,
  descriptionAr,
  canEdit,
  nameAr,
  familyNameAr,
  gradeLevel,
  category,
  qualificationRequired,
}: {
  jobTitleId: string;
  descriptionAr: string | null;
  canEdit: boolean;
  nameAr: string;
  familyNameAr: string;
  gradeLevel: number;
  category: string;
  qualificationRequired?: string | null;
}) {
  const t = useTranslations("CareerPathJobTitleDetailPage");
  const router = useRouter();
  const [value, setValue] = useState(descriptionAr ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const isDirty = value !== (descriptionAr ?? "");

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateJobTitleDescription(jobTitleId, value);
      if (res.status === "success") {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <section className="sru-formsection">
      <div className="sru-formsection-head">
        <span className="sru-formsection-badge">
          <FileText size={17} aria-hidden />
        </span>
        <div>
          <h3>{t("descriptionHeading")}</h3>
          <span>{t("descriptionSubtitle")}</span>
        </div>
      </div>
      <div className="sru-field">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          dir="rtl"
          rows={6}
          disabled={!canEdit}
          placeholder={t("descriptionPlaceholder")}
        />
      </div>
      {canEdit && (
        <SuggestDescriptionButton
          nameAr={nameAr}
          familyNameAr={familyNameAr}
          gradeLevel={gradeLevel}
          category={category}
          qualificationRequired={qualificationRequired ?? undefined}
          onSuggested={setValue}
        />
      )}
      {error && (
        <p role="alert" className="sru-auth-alert error">
          <AlertCircle size={15} aria-hidden />
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      )}
      {saved && !isDirty && (
        <p role="status" className="sru-auth-alert success">
          <CheckCircle2 size={15} aria-hidden />
          {t("saveSuccess")}
        </p>
      )}
      {canEdit ? (
        <div className="sru-form-submitrow">
          <button
            type="button"
            disabled={isPending || !isDirty || value.trim().length === 0}
            onClick={handleSave}
            className="sru-btn sru-btn-primary"
          >
            {isPending ? t("saving") : t("save")}
          </button>
        </div>
      ) : (
        <p style={{ fontSize: 12, color: "var(--sru-muted)" }}>{t("viewOnlyNote")}</p>
      )}
    </section>
  );
}
