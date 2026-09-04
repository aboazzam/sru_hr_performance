import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { getThreeSixtyReport, type CompetencyReportRow } from "./reportData";
import { DEFAULT_LEVEL_COLOR_SWATCHES } from "@/lib/orgChartColors";

type Translator = (key: string, values?: Record<string, string | number>) => string;

/**
 * Grouped bar chart (competency x rater group), pure CSS -- this project has
 * no charting library installed (checked package.json before designing this),
 * and the plan explicitly rejected pulling one in for a single screen. Bar
 * colors cycle through the same fixed SRU-palette swatch list the org chart
 * already uses for its own admin-pickable colors (CLAUDE.md 7: no color
 * outside the identity kit), not a freshly invented set.
 */
function CompetencyChart({ competencies, t }: { competencies: CompetencyReportRow[]; t: Translator }) {
  const groupOrder: { code: string; nameAr: string }[] = [];
  const seen = new Set<string>();
  for (const c of competencies) {
    for (const g of c.byGroup) {
      if (!seen.has(g.relationshipCode)) {
        seen.add(g.relationshipCode);
        groupOrder.push({ code: g.relationshipCode, nameAr: g.nameAr });
      }
    }
  }
  const colorByCode = new Map(
    groupOrder.map((g, i) => [g.code, DEFAULT_LEVEL_COLOR_SWATCHES[i % DEFAULT_LEVEL_COLOR_SWATCHES.length]])
  );

  const allValues = competencies.flatMap((c) => [
    ...(c.score != null ? [c.score] : []),
    ...c.byGroup.map((g) => g.score).filter((v): v is number => v != null),
  ]);
  const domainMax = Math.max(1, ...allValues) * 1.15;

  return (
    <div className="sru-card" style={{ marginBottom: 24 }}>
      {groupOrder.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
          {groupOrder.map((g) => (
            <span key={g.code} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: colorByCode.get(g.code),
                  display: "inline-block",
                }}
              />
              {g.nameAr}
            </span>
          ))}
        </div>
      )}
      {competencies.map((c, i) => (
        <div key={c.competencyId} style={{ marginBottom: i < competencies.length - 1 ? 20 : 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            {c.nameAr}
            {c.score != null && (
              <span style={{ fontWeight: 400, color: "var(--sru-muted)" }}> — {c.score.toFixed(1)}</span>
            )}
          </p>
          {c.byGroup.length === 0 ? (
            <p style={{ fontSize: 11.5, color: "var(--sru-muted)" }}>{t("chartNoDataNote")}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {c.byGroup.map((g) => (
                <div key={g.relationshipCode} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, width: 100, flexShrink: 0, color: "var(--sru-muted)" }}>
                    {g.nameAr}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      background: "var(--sru-border)",
                      borderRadius: 4,
                      height: 14,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, ((g.score ?? 0) / domainMax) * 100)}%`,
                        height: "100%",
                        background: colorByCode.get(g.relationshipCode) ?? "var(--sru-purple)",
                        borderRadius: 4,
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 11, width: 34 }}>{g.score != null ? g.score.toFixed(1) : "—"}</span>
                </div>
              ))}
            </div>
          )}
          {c.hasFoldedGroups && (
            <p style={{ fontSize: 10.5, color: "var(--sru-muted)", marginTop: 6 }}>{t("chartFoldedNote")}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export default async function ThreeSixtyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ employeeId?: string }>;
}) {
  const { employeeId: requestedEmployeeId } = await searchParams;
  const t = await getTranslations("ThreeSixtyReportPage");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myProfile } = user
    ? await supabase.from("profiles").select("id, full_name_ar").eq("auth_user_id", user.id).maybeSingle()
    : { data: null };

  if (!myProfile) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <GroupTabs groupKey="threeSixty" current="three-sixty/report" />
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

  let targetEmployeeId = myProfile.id;
  let targetName = myProfile.full_name_ar;
  let authorized = true;

  if (requestedEmployeeId && requestedEmployeeId !== myProfile.id) {
    const { data: isSubordinate } = await supabase.rpc("is_my_subordinate", { target_employee_id: requestedEmployeeId });
    authorized = Boolean(isSubordinate);
    if (authorized) {
      targetEmployeeId = requestedEmployeeId;
      // A plain manager typically holds neither `employeeData` nor
      // `employeeDataSubordinates` -- `profiles_select`'s own RLS
      // (20260725000009) requires the LATTER specifically even though
      // `is_my_subordinate()` above already confirmed the relationship, so
      // a direct profiles read here would render blank for most managers
      // (same class of gap fixed elsewhere in this module). Reused
      // get_my_direct_reports() instead -- this page is only ever linked
      // to from the team-report list, which is itself scoped to direct
      // reports, so the name is always resolvable there; a deeper
      // subordinate (reached by some other route) degrades to a blank
      // name rather than crashing, a known, narrower limitation.
      const { data: reports } = await supabase.rpc("get_my_direct_reports");
      targetName =
        ((reports ?? []) as { id: string; full_name_ar: string }[]).find((r) => r.id === requestedEmployeeId)
          ?.full_name_ar ?? "";
    }
  }

  if (!authorized) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <GroupTabs groupKey="threeSixty" current="three-sixty/report" />
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

  const report = await getThreeSixtyReport(supabase, targetEmployeeId);

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="threeSixty" current="three-sixty/report" />
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4, marginBottom: 20 }}>{targetName}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {!report ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorNoReport")}</p>
      ) : report.insufficientData ? (
        <div className="sru-card">
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{report.cycle.nameAr}</p>
          <p style={{ fontSize: 14, fontWeight: 700, marginTop: 10, marginBottom: 6 }}>
            {t("insufficientDataHeading")}
          </p>
          <p style={{ fontSize: 13, color: "var(--sru-muted)" }}>
            {t("insufficientDataBody", { completed: report.completedRaters, min: report.minRatersRequired })}
          </p>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{report.cycle.nameAr}</p>
          {report.overallScore != null && (
            <p style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>
              {report.overallScore.toFixed(1)}
              <span style={{ fontSize: 13, fontWeight: 400, color: "var(--sru-muted)" }}> {t("overallScoreLabel")}</span>
            </p>
          )}

          {report.competencies.length > 0 && (
            <>
              <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{t("chartHeading")}</h2>
              <CompetencyChart competencies={report.competencies} t={t} />
            </>
          )}

          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{t("selfGapHeading")}</h2>
          <div className="sru-card" style={{ marginBottom: 24 }}>
            {report.selfGaps.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--sru-muted)" }}>{t("selfGapEmpty")}</p>
            ) : (
              report.selfGaps.map((g, i) => (
                <p key={g.competencyId} style={{ fontSize: 13, marginBottom: i < report.selfGaps.length - 1 ? 8 : 0 }}>
                  <span style={{ fontWeight: 600 }}>{g.nameAr}</span> —{" "}
                  {t("selfGapRow", { self: g.selfScore.toFixed(1), others: g.othersScore.toFixed(1), gap: g.gap.toFixed(1) })}
                </p>
              ))
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{t("topItemsHeading")}</h2>
              <div className="sru-card">
                {report.topItems.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: "var(--sru-muted)" }}>{t("rankedItemsEmpty")}</p>
                ) : (
                  <ol style={{ margin: 0, paddingInlineStart: 18 }}>
                    {report.topItems.map((item) => (
                      <li key={item.itemId} style={{ fontSize: 12.5, marginBottom: 6 }}>
                        {item.textAr} <span style={{ color: "var(--sru-muted)" }}>({item.score.toFixed(1)})</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{t("bottomItemsHeading")}</h2>
              <div className="sru-card">
                {report.bottomItems.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: "var(--sru-muted)" }}>{t("rankedItemsEmpty")}</p>
                ) : (
                  <ol style={{ margin: 0, paddingInlineStart: 18 }}>
                    {report.bottomItems.map((item) => (
                      <li key={item.itemId} style={{ fontSize: 12.5, marginBottom: 6 }}>
                        {item.textAr} <span style={{ color: "var(--sru-muted)" }}>({item.score.toFixed(1)})</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </div>

          {report.groupCompletion.length > 0 && (
            <>
              <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{t("groupHeading")}</h2>
              <div className="sru-card" style={{ marginBottom: 24 }}>
                <div className="table-scroll">
                  <table className="admin-matrix">
                    <thead>
                      <tr>
                        <th>{t("columnGroup")}</th>
                        <th>{t("columnSubmitted")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.groupCompletion.map((g) => (
                        <tr key={g.relationshipCode}>
                          <td>{g.nameAr}</td>
                          <td>
                            {g.submitted} / {g.total}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{t("commentsHeading")}</h2>
          <p style={{ fontSize: 11, color: "var(--sru-muted)", marginTop: 0, marginBottom: 8 }}>{t("commentsNote")}</p>
          <div className="sru-card">
            {report.openTextAnswers.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--sru-muted)" }}>{t("commentsEmpty")}</p>
            ) : (
              report.openTextAnswers.map((answer, i) => (
                <p key={i} style={{ fontSize: 13, marginBottom: i < report.openTextAnswers.length - 1 ? 14 : 0 }}>
                  {answer}
                </p>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
