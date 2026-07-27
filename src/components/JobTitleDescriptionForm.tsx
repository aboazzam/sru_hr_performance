"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateJobTitleDescription } from "@/app/[locale]/(app)/career-path/job-titles/[id]/actions";
import { SuggestDescriptionButton } from "@/components/SuggestDescriptionButton";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

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

  const inputClass =
    "w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

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
    <div className="space-y-3" style={{ maxWidth: 640 }}>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        dir="rtl"
        rows={6}
        disabled={!canEdit}
        placeholder={t("descriptionPlaceholder")}
        className={inputClass}
      />
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
        <p role="alert" className="text-sm text-red-600">
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      )}
      {saved && !isDirty && (
        <p role="status" className="text-sm text-green-700">
          {t("saveSuccess")}
        </p>
      )}
      {canEdit ? (
        <button
          type="button"
          disabled={isPending || !isDirty || value.trim().length === 0}
          onClick={handleSave}
          className="sru-btn sru-btn-primary"
        >
          {isPending ? t("saving") : t("save")}
        </button>
      ) : (
        <p style={{ fontSize: 13, color: "var(--sru-muted)" }}>{t("viewOnlyNote")}</p>
      )}
    </div>
  );
}
