import { behavioralLevelLabels } from "@/lib/data/competencies";
import type { CareerJobTitleInfo, CareerTreeNode } from "@/lib/careerPathTree";

export interface CareerPathTreeLabels {
  currentJobLabel: string;
  gradeLabel: (grade: number) => string;
  requirementsLabel: string;
  descriptionLabel: string;
  noDescriptionLabel: string;
  competenciesLabel: string;
  noCompetenciesLabel: string;
  /** Shown instead of real description/competencies while career_content_status is 'draft' AND real content exists to gate. */
  pendingApprovalLabel: string;
}

/**
 * Shared "your job now, and where it can lead" view — used by both
 * /profile's "career-path" tab and, for view-only (non-management) users,
 * /career-path itself (2026-07-26 fix: an `employee` holding only
 * `careerPath=view` was seeing the FULL company-wide career_path matrix on
 * /career-path, reported live by the project owner with a real "أخصائي
 * مصادر تعلم" account showing unrelated customer-service career rows — the
 * self-scoped tree already built for /profile is the correct thing to show
 * instead). Renders the current job (now including ITS OWN description/
 * competencies too, not just name+grade, per the same feedback: "الوصف
 * الوظيفي والجدارات ... الخاصة بوظيفته") followed by the forward branches
 * only (never repeating the root as if it were a future step).
 *
 * Approval gating (2026-07-27): if a job's career_content_status is
 * 'draft' AND it actually has description/competency content (i.e. someone
 * really did write a draft, it just isn't approved yet), that content is
 * replaced with `pendingApprovalLabel` — showing an unreviewed draft to an
 * employee would defeat the point of the approval step. A job with
 * career_content_status='draft' but genuinely nothing entered yet (the
 * column's own default) still shows the normal "not set" empty states —
 * there's nothing pending approval to hide.
 */
export function CareerPathForwardTree({
  currentJobTitleId,
  tree,
  jobTitleInfo,
  labels,
}: {
  currentJobTitleId: string;
  tree: CareerTreeNode;
  jobTitleInfo: Map<string, CareerJobTitleInfo>;
  labels: CareerPathTreeLabels;
}) {
  const currentInfo = jobTitleInfo.get(currentJobTitleId);

  return (
    <div>
      <div className="sru-card" style={{ marginBottom: 16, padding: 14 }}>
        <span style={{ fontSize: 12.5, color: "var(--sru-muted)" }}>{labels.currentJobLabel}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 10px" }}>
          <strong>{currentInfo?.nameAr ?? "—"}</strong>
          {currentInfo && <span className="sru-chip sru-en">{labels.gradeLabel(currentInfo.gradeLevel)}</span>}
        </div>
        {renderContentSection(currentInfo, labels)}
      </div>
      {renderNodes(tree.children, jobTitleInfo, labels, 0)}
    </div>
  );
}

function hasUnapprovedContent(info: CareerJobTitleInfo | undefined): boolean {
  return !!info && info.careerContentStatus === "draft" && (!!info.descriptionAr || info.competencies.length > 0);
}

function renderContentSection(info: CareerJobTitleInfo | undefined, labels: CareerPathTreeLabels) {
  if (hasUnapprovedContent(info)) {
    return (
      <p style={{ fontSize: 13, color: "var(--sru-muted)" }} role="status">
        {labels.pendingApprovalLabel}
      </p>
    );
  }
  return (
    <>
      <p style={{ fontSize: 13, marginBottom: 6 }}>
        <b>{labels.descriptionLabel}: </b>
        {info?.descriptionAr ?? labels.noDescriptionLabel}
      </p>
      <div style={{ fontSize: 13 }}>
        <b>{labels.competenciesLabel}: </b>
        {info && info.competencies.length > 0 ? (
          <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
            {info.competencies.map((c, i) => (
              <span key={i} className="sru-chip">
                {c.nameAr} ({behavioralLevelLabels[c.requiredLevel]})
              </span>
            ))}
          </span>
        ) : (
          labels.noCompetenciesLabel
        )}
      </div>
    </>
  );
}

function renderNodes(
  nodes: CareerTreeNode[],
  jobTitleInfo: Map<string, CareerJobTitleInfo>,
  labels: CareerPathTreeLabels,
  depth: number
) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {nodes.map((node) => {
        const info = jobTitleInfo.get(node.jobTitleId);
        return (
          <li key={node.jobTitleId} style={{ marginInlineStart: depth * 24, marginBottom: 14 }}>
            <div className="sru-card" style={{ padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <strong>{info?.nameAr ?? "—"}</strong>
                {info && <span className="sru-chip sru-en">{labels.gradeLabel(info.gradeLevel)}</span>}
              </div>
              {node.requirementsAr && (
                <p style={{ fontSize: 13, marginBottom: 6 }}>
                  <b>{labels.requirementsLabel}: </b>
                  {node.requirementsAr}
                </p>
              )}
              {renderContentSection(info, labels)}
            </div>
            {node.children.length > 0 && renderNodes(node.children, jobTitleInfo, labels, depth + 1)}
          </li>
        );
      })}
    </ul>
  );
}
