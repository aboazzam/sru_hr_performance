import { getTranslations } from "next-intl/server";
import {
  defaultRoles,
  processAreas,
  evaluationStates,
  evaluationStateLabels,
  getEvaluationStatePermission,
  vpraLevelLabels,
  hasVpraAccess,
  type VpraLevel,
  type ProcessArea,
  type EvaluationActorRole,
} from "@/lib/vpra";
import { PrintButton } from "@/components/PrintButton";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

const vpraLevelStyle: Record<VpraLevel, { background: string; color: string }> = {
  none: { background: "rgba(107, 90, 128, 0.12)", color: "var(--sru-muted)" },
  view: { background: "var(--sru-blue-light)", color: "var(--sru-blue)" },
  prepare: { background: "var(--sru-purple-light)", color: "var(--sru-purple)" },
  recommend: { background: "#e2d3f0", color: "var(--sru-purple-dark)" },
  approve: { background: "var(--sru-purple)", color: "#fff" },
};

const evaluationActorRoles: EvaluationActorRole[] = [
  "employee",
  "supervisor",
  "field_supervisor",
  "manager",
  "committee",
  "hr_admin",
];

function roleLabel(roleCode: string) {
  return defaultRoles.find((r) => r.roleCode === roleCode)?.nameAr ?? roleCode;
}

export default async function AdminPage() {
  const t = await getTranslations("AdminPage");

  // First-ever "actions" section on this page (previously read-only) — the
  // Organizational Structure builder link is only shown to callers who hold
  // at least `view` on the new `orgStructure` process area (2026-07-22),
  // same self-lookup RPC used by (app)/layout.tsx for NavBar filtering. This
  // is a display-only gate: the real authorization is each write action's
  // own RLS (`check_vpra_global('orgStructure','approve')`).
  const supabase = await createClient();
  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const orgStructureLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "orgStructure"
    )?.vpra_level ?? "none";
  const canSeeOrgStructure = hasVpraAccess(orgStructureLevel, "view");

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
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

      {canSeeOrgStructure && (
        <section className="no-print" style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
            {t("actionsHeading")}
          </h2>
          <Link href="/admin/org-structure" className="sru-card sru-admin-action">
            <strong>{t("orgStructureAction")}</strong>
            <span style={{ color: "var(--sru-muted)", fontSize: 12.5 }}>{t("orgStructureActionDesc")}</span>
          </Link>
        </section>
      )}

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
          {t("rolesHeading")}
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {defaultRoles.map((role) => (
            <span key={role.roleCode} className="sru-chip">
              {role.nameAr}
              <span className="admin-role-code sru-en">{role.roleCode}</span>
            </span>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
          {t("processAreasHeading")}
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {processAreas.map((area) => (
            <span key={area} className="sru-chip sru-en">
              {area}
            </span>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
          {t("scaleHeading")}
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(Object.keys(vpraLevelLabels) as VpraLevel[]).map((level) => (
            <span
              key={level}
              className="sru-chip"
              style={vpraLevelStyle[level]}
            >
              {vpraLevelLabels[level]}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
          {t("matrixHeading")}
        </h2>
        <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginBottom: 14 }}>
          {t("matrixCaption")}
        </p>
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("stateColumn")}</th>
                  {evaluationActorRoles.map((role) => (
                    <th key={role}>{roleLabel(role)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evaluationStates.map((state) => (
                  <tr key={state}>
                    <td className="admin-matrix-state">
                      {evaluationStateLabels[state]}
                    </td>
                    {evaluationActorRoles.map((role) => {
                      const level = getEvaluationStatePermission(state, role);
                      return (
                        <td key={role}>
                          <span
                            className="sru-chip admin-matrix-chip"
                            style={vpraLevelStyle[level]}
                          >
                            {vpraLevelLabels[level]}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
