"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { addCompetencyDomain } from "@/app/[locale]/(app)/competencies/actions";
import { AddFormDialog } from "@/components/AddFormDialog";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalid",
  unauthenticated: "errorForbidden",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

export function AddCompetencyDomainForm({ pillarId }: { pillarId: string }) {
  const t = useTranslations("CompetenciesPage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const res = await addCompetencyDomain(pillarId, nameAr, nameEn);
      if (res.status === "success") {
        setNameAr("");
        setNameEn("");
        dialogRef.current?.close();
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <AddFormDialog
      dialogRef={dialogRef}
      triggerLabel={t("addDomainTriggerButton")}
      heading={t("addDomainHeading")}
      closeLabel={t("closeButton")}
      triggerClassName="sru-btn"
    >
      <div className="sru-formgrid">
        <div className="sru-field">
          <label>{t("domainNameArLabel")}</label>
          <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
        </div>
        <div className="sru-field">
          <label>{t("domainNameEnLabel")}</label>
          <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" style={{ textAlign: "left" }} />
        </div>
      </div>

      {error && (
        <p role="alert" className="sru-auth-alert error" style={{ marginTop: 8 }}>
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      )}

      <div className="sru-form-submitrow">
        <button type="button" disabled={isPending || !nameAr.trim()} onClick={handleAdd} className="sru-btn sru-btn-primary">
          {t("addDomainButton")}
        </button>
      </div>
    </AddFormDialog>
  );
}
