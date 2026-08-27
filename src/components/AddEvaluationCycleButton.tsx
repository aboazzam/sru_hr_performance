"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { AddFormDialog } from "@/components/AddFormDialog";
import { NewEvaluationCycleForm } from "@/components/NewEvaluationCycleForm";
import type { Locale } from "@/i18n/config";

/**
 * "Add evaluation cycle", in the same shape as "add initiative" (2026-08-25
 * request: "اجعل التنسيق كما في المبادرة تماما").
 *
 * That means a trigger in the screen's own action row opening the form in a
 * modal — not a link to a separate page. The list stays on screen behind it,
 * so adding a cycle no longer costs a navigation away from the thing you were
 * reading.
 *
 * The route it used to link to still exists and still works; this only changes
 * how the list screen reaches the form.
 */
export function AddEvaluationCycleButton({ locale }: { locale: Locale }) {
  const t = useTranslations("EvaluationCyclesPage");
  const tForm = useTranslations("NewEvaluationCyclePage");
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <AddFormDialog
      dialogRef={dialogRef}
      triggerLabel={t("addCycle")}
      heading={tForm("title")}
      subtitle={tForm("subtitle")}
      closeLabel={t("closeButton")}
    >
      <NewEvaluationCycleForm locale={locale} />
    </AddFormDialog>
  );
}
