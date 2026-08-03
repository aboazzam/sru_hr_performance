"use client";

import { useMemo, useState } from "react";
import { Search, ArrowRight, ChevronLeft, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { buildForwardCareerTree, type CareerPathEdge, type CareerTreeNode } from "@/lib/careerPathTree";
import type { CareerPathTrackRoot } from "@/lib/careerPathTracks";
import { includesIgnoringHamza } from "@/lib/arabicSearch";

interface JobTitleBasicInfo {
  nameAr: string;
  gradeLevel: number;
}

function collectTreeNames(node: CareerTreeNode, jobTitleInfo: Record<string, JobTitleBasicInfo>, acc: string[]) {
  const name = jobTitleInfo[node.jobTitleId]?.nameAr;
  if (name) acc.push(name);
  for (const child of node.children) collectTreeNames(child, jobTitleInfo, acc);
}

/**
 * Replaces the previous flat "from -> to -> requirements" table (the
 * project owner rejected it live: "لا اريد الصفحة تظهر بهذا الشكل") with
 * named tracks -- click a track to see its forward timeline, click a job
 * in that timeline to reveal its own requirements. Track roots come from
 * `findCareerPathTrackRoots` (career_path.ts); the timeline itself reuses
 * `buildForwardCareerTree`, the same graph-walk already built for the
 * self-scoped employee view, so branching (a real job fanning out to
 * several next steps) renders correctly instead of forcing a single
 * straight line.
 *
 * Search is hamza-insensitive (arabicSearch.ts, per the project owner's
 * explicit follow-up) and matches a track's own name OR any job title
 * reachable within it -- searching a mid-ladder title like "مدير مركز
 * الاتصال" still finds the track it belongs to, not just its exact root.
 */
export function CareerPathTracksExplorer({
  roots,
  edges,
  jobTitleInfo,
}: {
  roots: CareerPathTrackRoot[];
  edges: CareerPathEdge[];
  jobTitleInfo: Record<string, JobTitleBasicInfo>;
}) {
  const t = useTranslations("CareerPathPage");
  const [search, setSearch] = useState("");
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);

  const treesByRootId = useMemo(() => {
    const map = new Map<string, CareerTreeNode>();
    for (const root of roots) map.set(root.jobTitleId, buildForwardCareerTree(edges, root.jobTitleId));
    return map;
  }, [roots, edges]);

  const filteredRoots = useMemo(() => {
    const query = search.trim();
    if (!query) return roots;
    return roots.filter((root) => {
      const tree = treesByRootId.get(root.jobTitleId);
      if (!tree) return includesIgnoringHamza(root.nameAr, query);
      const names: string[] = [];
      collectTreeNames(tree, jobTitleInfo, names);
      return names.some((name) => includesIgnoringHamza(name, query));
    });
  }, [roots, search, treesByRootId, jobTitleInfo]);

  const selectedRoot = selectedRootId ? roots.find((r) => r.jobTitleId === selectedRootId) : null;
  const selectedTree = selectedRootId ? treesByRootId.get(selectedRootId) : null;

  if (selectedRoot && selectedTree) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setSelectedRootId(null)}
          className="sru-btn no-print"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16 }}
        >
          <ArrowRight size={15} aria-hidden />
          {t("backToTracks")}
        </button>

        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{selectedRoot.nameAr}</h2>
        <p style={{ color: "var(--sru-muted)", fontSize: 13, marginBottom: 20 }}>{t("timelineSubtitle")}</p>

        <TimelineAccordionNode node={selectedTree} jobTitleInfo={jobTitleInfo} t={t} isRoot />
      </div>
    );
  }

  return (
    <div>
      <div style={{ position: "relative", maxWidth: 360, marginBottom: 20 }} className="no-print">
        <Search
          size={15}
          style={{
            position: "absolute",
            insetInlineStart: 10,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--sru-muted)",
          }}
          aria-hidden
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("trackSearchPlaceholder")}
          style={{
            width: "100%",
            padding: "8px 34px 8px 10px",
            borderRadius: "var(--sru-radius)",
            border: "1px solid var(--sru-border)",
            background: "var(--background)",
            fontSize: 13,
          }}
        />
      </div>

      {filteredRoots.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("noTracksFound")}</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {filteredRoots.map((root) => (
            <button
              key={root.jobTitleId}
              type="button"
              onClick={() => setSelectedRootId(root.jobTitleId)}
              className="sru-card"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 16,
                textAlign: "start",
                cursor: "pointer",
                width: "100%",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <strong>{root.nameAr}</strong>
                <span className="sru-chip sru-en">{t("gradeLabel", { grade: root.gradeLevel })}</span>
              </div>
              <ChevronLeft size={16} style={{ color: "var(--sru-muted)" }} aria-hidden />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Fixes a real, explicitly-reported problem with the previous always-fully-
 * expanded horizontal-thread design: a job title fanning out to more than
 * one next step — e.g. "محلل أعمال مساعد" leading to both "محلل بيانات"
 * and "محلل أعمال" — read as confusing/duplicated once several branch
 * points were visible on screen at once ("محلل أعمال مساعد ذكرت مرتين").
 * Rebuilt as a plain click-to-expand accordion: every node (the root
 * included) starts collapsed as ONE card; clicking it reveals its own
 * requirements (skipped for the root, which shows a "start of track" note
 * instead) and, if it has any, its next-step options — stacked directly
 * below it, one per row ("فوق بعضهم", not side-by-side), each itself a
 * collapsed card the caller can drill into the same way. A single-path
 * (non-branching) job just reveals one card below it; a real fan-out
 * reveals several — the same recursion handles both without special-casing
 * either, and nothing is ever rendered twice.
 */
function TimelineAccordionNode({
  node,
  jobTitleInfo,
  t,
  isRoot = false,
}: {
  node: CareerTreeNode;
  jobTitleInfo: Record<string, JobTitleBasicInfo>;
  t: ReturnType<typeof useTranslations>;
  isRoot?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const info = jobTitleInfo[node.jobTitleId];

  return (
    <div style={{ marginBottom: 10 }}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="sru-card"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: 14,
          textAlign: "start",
          cursor: "pointer",
          width: "100%",
        }}
        aria-expanded={expanded}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <strong>{info?.nameAr ?? "—"}</strong>
          {info && <span className="sru-chip sru-en">{t("gradeLabel", { grade: info.gradeLevel })}</span>}
        </div>
        <ChevronDown
          size={15}
          style={{
            color: "var(--sru-muted)",
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
            flexShrink: 0,
          }}
          aria-hidden
        />
      </button>

      {expanded && (
        <div style={{ marginInlineStart: 24, marginTop: 8 }}>
          {isRoot ? (
            <p style={{ fontSize: 12.5, color: "var(--sru-muted)", marginBottom: node.children.length > 0 ? 10 : 0 }}>
              {t("trackStartLabel")}
            </p>
          ) : (
            <p style={{ fontSize: 13, color: "var(--sru-muted)", marginBottom: node.children.length > 0 ? 10 : 0 }}>
              <b style={{ color: "var(--foreground)" }}>{t("columnRequirements")}: </b>
              {node.requirementsAr ?? t("noRequirements")}
            </p>
          )}

          {node.children.map((child) => (
            <TimelineAccordionNode key={child.jobTitleId} node={child} jobTitleInfo={jobTitleInfo} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}
