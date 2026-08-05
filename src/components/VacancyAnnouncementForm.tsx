"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Megaphone } from "lucide-react";
import {
  updateVacancyAnnouncementDetails,
  type VacancyActionState,
} from "@/app/[locale]/(app)/vacancies/actions";

const errorKeys: Record<string, string> = {
  invalid_input: "formErrorInvalid",
  unauthenticated: "formErrorUnauthenticated",
  forbidden: "formErrorForbidden",
  unknown: "formErrorUnknown",
};

/**
 * The announcement details behind one advertised job: how many seats, when it
 * starts appearing on بوابة التوظيف, and the deadline after which it
 * disappears. Read-only (disabled inputs + a note) for callers who can see the
 * job but not manage it — the real gate is `vacancies_update`'s own RLS.
 */
export function VacancyAnnouncementForm({
  vacancyId,
  canManage,
  initial,
}: {
  vacancyId: string;
  canManage: boolean;
  initial: {
    openingsCount: number;
    announcementStartDate: string | null;
    applicationDeadline: string | null;
  };
}) {
  const t = useTranslations("AnnouncedJobsPage");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<VacancyActionState | null>(null);

  const [openings, setOpenings] = useState(String(initial.openingsCount));
  const [start, setStart] = useState(initial.announcementStartDate ?? "");
  const [deadline, setDeadline] = useState(initial.applicationDeadline ?? "");

  const dirty =
    openings !== String(initial.openingsCount) ||
    start !== (initial.announcementStartDate ?? "") ||
    deadline !== (initial.applicationDeadline ?? "");

  // Mirrors the DB CHECK so an impossible window is caught before submitting.
  const windowInvalid = start !== "" && deadline !== "" && deadline < start;

  function save() {
    setState(null);
    startTransition(async () => {
      const result = await updateVacancyAnnouncementDetails({
        vacancyId,
        openingsCount: Number(openings),
        announcementStartDate: start === "" ? null : start,
        applicationDeadline: deadline === "" ? null : deadline,
      });
      setState(result);
      if (result.status === "success") router.refresh();
    });
  }

  return (
    <div className="sru-formsection">
      <div className="sru-formsection-head">
        <span className="sru-formsection-badge">
          <Megaphone size={16} aria-hidden />
        </span>
        <h2>{t("formHeading")}</h2>
      </div>
      <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginBottom: 10 }}>{t("formNote")}</p>

      <div className="sru-formgrid">
        <label className="sru-field">
          <span>{t("fieldOpenings")}</span>
          <input
            type="number"
            min={1}
            dir="ltr"
            value={openings}
            disabled={!canManage || pending}
            onChange={(e) => setOpenings(e.target.value)}
          />
        </label>
        <label className="sru-field">
          <span>{t("fieldStartDate")}</span>
          <input
            type="date"
            dir="ltr"
            value={start}
            disabled={!canManage || pending}
            onChange={(e) => setStart(e.target.value)}
          />
          <small style={{ color: "var(--sru-muted)" }}>{t("fieldStartDateHint")}</small>
        </label>
        <label className="sru-field">
          <span>{t("fieldDeadline")}</span>
          <input
            type="date"
            dir="ltr"
            value={deadline}
            disabled={!canManage || pending}
            onChange={(e) => setDeadline(e.target.value)}
          />
          <small style={{ color: "var(--sru-muted)" }}>{t("fieldDeadlineHint")}</small>
        </label>
      </div>

      {canManage ? (
        <div className="sru-form-submitrow">
          <button
            type="button"
            className="sru-btn sru-btn-primary"
            disabled={pending || !dirty || windowInvalid || openings.trim() === ""}
            onClick={save}
          >
            {pending ? t("saving") : t("saveButton")}
          </button>
          {windowInvalid && (
            <span role="alert" className="text-sm text-red-600">
              {t("windowInvalid")}
            </span>
          )}
          {state?.status === "error" && (
            <span role="alert" className="text-sm text-red-600">
              {t(errorKeys[state.message] ?? "formErrorUnknown")}
            </span>
          )}
          {state?.status === "success" && (
            <span role="status" style={{ color: "var(--sru-success, #15803d)", fontSize: 13 }}>
              {t("saved")}
            </span>
          )}
        </div>
      ) : (
        <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginTop: 8 }}>{t("readOnlyNote")}</p>
      )}
    </div>
  );
}
