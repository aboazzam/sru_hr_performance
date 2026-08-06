"use client";

import { useTranslations } from "next-intl";
import { DateFieldDmy } from "@/components/DateFieldDmy";

/**
 * The from/to range on "أنشطة المستخدمين". That page is a Server Component
 * whose filter is a plain `method="get"` form, so the control runs
 * uncontrolled here and submits through its own hidden inputs — the server
 * keeps receiving exactly the same `from`/`to` query params as before.
 */
export function UserActivityRangeFields({
  defaultFrom,
  defaultTo,
}: {
  defaultFrom: string;
  defaultTo: string;
}) {
  const t = useTranslations("UserActivityPage");
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 4,
  };

  return (
    <>
      <div>
        <label style={labelStyle}>{t("fromLabel")}</label>
        <DateFieldDmy name="from" defaultValue={defaultFrom} ariaLabel={t("fromLabel")} />
      </div>
      <div>
        <label style={labelStyle}>{t("toLabel")}</label>
        <DateFieldDmy name="to" defaultValue={defaultTo} ariaLabel={t("toLabel")} />
      </div>
    </>
  );
}
