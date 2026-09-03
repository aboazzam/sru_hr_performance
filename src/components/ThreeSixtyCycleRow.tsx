"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { formatDateDmy } from "@/lib/dateParts";
import { useLocale } from "next-intl";
import { threeSixtyCycleStatusLabels, type ThreeSixtyCycleStatus } from "@/lib/threeSixty";
import { activateThreeSixtyCycle, closeThreeSixtyCycle } from "@/app/[locale]/(app)/three-sixty/actions";

export interface ThreeSixtyCycleRowData {
  id: string;
  cycleCode: string;
  nameAr: string;
  startDate: string;
  endDate: string;
  status: ThreeSixtyCycleStatus;
}

export function ThreeSixtyCycleRow({ cycle, canManage }: { cycle: ThreeSixtyCycleRowData; canManage: boolean }) {
  const t = useTranslations("ThreeSixtyCyclesPage");
  const locale = useLocale();
  const router = useRouter();
  const [activateState, activateAction, activating] = useActionState(activateThreeSixtyCycle, null);
  const [closeState, closeAction, closing] = useActionState(closeThreeSixtyCycle, null);

  useEffect(() => {
    if (activateState?.status === "success" || closeState?.status === "success") router.refresh();
  }, [activateState, closeState, router]);

  return (
    <tr>
      <td>
        <Link href={`/three-sixty/${cycle.id}`}>{cycle.nameAr}</Link>
      </td>
      <td style={{ fontSize: 11.5, color: "var(--sru-muted)" }}>{cycle.cycleCode}</td>
      <td>{formatDateDmy(cycle.startDate, locale)}</td>
      <td>{formatDateDmy(cycle.endDate, locale)}</td>
      <td>
        <span className="pill">{threeSixtyCycleStatusLabels[cycle.status]}</span>
      </td>
      <td className="no-print">
        {canManage && cycle.status === "draft" && (
          <form action={activateAction}>
            <input type="hidden" name="cycleId" value={cycle.id} />
            <button type="submit" className="sru-btn" disabled={activating}>
              {t("activateButton")}
            </button>
          </form>
        )}
        {canManage && cycle.status === "active" && (
          <form action={closeAction}>
            <input type="hidden" name="cycleId" value={cycle.id} />
            <button type="submit" className="sru-btn" disabled={closing}>
              {t("closeButton")}
            </button>
          </form>
        )}
        {(activateState?.status === "error" || closeState?.status === "error") && (
          <p role="alert" className="sru-auth-alert error" style={{ fontSize: 11, marginTop: 6 }}>
            {t("actionError")}
          </p>
        )}
      </td>
    </tr>
  );
}
