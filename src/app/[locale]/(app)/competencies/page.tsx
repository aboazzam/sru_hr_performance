import { getTranslations } from "next-intl/server";
import {
  pillars,
  getCompetenciesByPillar,
  behavioralLevelLabels,
  competencyTypeLabels,
  type BehavioralLevel,
} from "@/lib/data/competencies";
import { PrintButton } from "@/components/PrintButton";
import { GroupTabs } from "@/components/layout/GroupTabs";

const levelOrder: BehavioralLevel[] = [
  "basic",
  "practitioner",
  "advanced",
  "professional",
];

export default async function CompetenciesPage() {
  const t = await getTranslations("CompetenciesPage");

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="evaluationMethods" current="competencies" />
      <div
        className="no-print"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 8,
        }}
      >
        <div>
          <h1 className="sru-title" style={{ fontSize: 24 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>
            {t("subtitle")}
          </p>
        </div>
        <PrintButton />
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {pillars.map((pillar) => {
        const items = getCompetenciesByPillar(pillar);
        const domains = [...new Set(items.map((c) => c.domain))];

        return (
          <section key={pillar} style={{ marginBottom: 44 }}>
            <h2
              className="sru-title"
              style={{ fontSize: 19, marginBottom: 18 }}
            >
              {pillar}
            </h2>

            {domains.map((domain) => (
              <div key={domain} style={{ marginBottom: 22 }}>
                <h3
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--sru-blue)",
                    marginBottom: 10,
                  }}
                >
                  {domain}
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {items
                    .filter((c) => c.domain === domain)
                    .map((c) => (
                      <details key={c.id} className="sru-card competency-card">
                        <summary>
                          <span>{c.name}</span>
                          <span
                            className="sru-chip"
                            style={
                              c.type === "specialized"
                                ? {
                                    background: "var(--sru-blue-light)",
                                    color: "var(--sru-blue)",
                                  }
                                : undefined
                            }
                          >
                            {competencyTypeLabels[c.type]}
                          </span>
                        </summary>

                        <div className="competency-body">
                          <p style={{ fontSize: 13.5 }}>{c.definition}</p>
                          <p
                            style={{
                              fontSize: 12.5,
                              color: "var(--sru-muted)",
                            }}
                          >
                            <strong style={{ color: "var(--sru-ink)" }}>
                              {t("expectedImpactLabel")}{" "}
                            </strong>
                            {c.expectedImpact}
                          </p>

                          {levelOrder.map((level) => (
                            <div key={level} className="competency-level">
                              <h4>{behavioralLevelLabels[level]}</h4>
                              <ul>
                                {c.levels[level].map((bullet, i) => (
                                  <li key={i}>{bullet}</li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
