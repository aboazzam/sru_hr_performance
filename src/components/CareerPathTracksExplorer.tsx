"use client";

import { useMemo, useState } from "react";
import { Search, ArrowRight, ArrowLeft, ChevronLeft } from "lucide-react";
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
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);

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
          onClick={() => {
            setSelectedRootId(null);
            setExpandedNodeId(null);
          }}
          className="sru-btn no-print"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16 }}
        >
          <ArrowRight size={15} aria-hidden />
          {t("backToTracks")}
        </button>

        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{selectedRoot.nameAr}</h2>
        <p style={{ color: "var(--sru-muted)", fontSize: 13, marginBottom: 20 }}>{t("timelineSubtitle")}</p>

        <CareerPathTimelineBranch
          node={selectedTree}
          jobTitleInfo={jobTitleInfo}
          t={t}
          expandedNodeId={expandedNodeId}
          setExpandedNodeId={setExpandedNodeId}
          isRoot
        />
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
 * Fixes a real, explicitly-reported layout problem with the old flat table
 * (still visible before this component existed): a job title fanning out
 * to more than one next step — e.g. "محلل أعمال مساعد" leading to both
 * "محلل بيانات" and "محلل أعمال" — showed up as TWO separate rows, each
 * repeating the same "from" job title. The fix threads an ordinary
 * (single-child) chain as one continuous horizontal row — walking forward
 * without ever branching — and only at a REAL fan-out point does the
 * parent's row also carry all of its children beside each other in that
 * same row (never one row per child). Only children that themselves branch
 * further start a new, indented row below (recursing this same logic from
 * that child) — a plain single-path continuation never repeats a node or
 * starts a nested row, so a normal (non-branching) ladder still renders as
 * one clean vertical sequence of horizontal rows, exactly like before.
 */
function CareerPathTimelineBranch({
  node,
  jobTitleInfo,
  t,
  expandedNodeId,
  setExpandedNodeId,
  isRoot = false,
}: {
  node: CareerTreeNode;
  jobTitleInfo: Record<string, JobTitleBasicInfo>;
  t: ReturnType<typeof useTranslations>;
  expandedNodeId: string | null;
  setExpandedNodeId: (id: string | null) => void;
  isRoot?: boolean;
}) {
  // Follow single-child links to build the flat, non-branching part of this
  // segment (`node` itself always included) before hitting a leaf or a real
  // fan-out point.
  const chain: CareerTreeNode[] = [node];
  let tail = node;
  while (tail.children.length === 1) {
    tail = tail.children[0];
    chain.push(tail);
  }
  const branches = tail.children.length > 1 ? tail.children : [];

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        {chain.map((n, i) => (
          <div key={n.jobTitleId} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            {i > 0 && <ArrowLeft size={16} style={{ color: "var(--sru-muted)", marginTop: 14, flexShrink: 0 }} aria-hidden />}
            <TimelineNodeChip
              node={n}
              info={jobTitleInfo[n.jobTitleId]}
              t={t}
              expandedNodeId={expandedNodeId}
              setExpandedNodeId={setExpandedNodeId}
              isRoot={isRoot && n === node}
            />
          </div>
        ))}
        {branches.length > 0 && (
          <>
            <ArrowLeft size={16} style={{ color: "var(--sru-muted)", marginTop: 14, flexShrink: 0 }} aria-hidden />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {branches.map((child) => (
                <TimelineNodeChip
                  key={child.jobTitleId}
                  node={child}
                  info={jobTitleInfo[child.jobTitleId]}
                  t={t}
                  expandedNodeId={expandedNodeId}
                  setExpandedNodeId={setExpandedNodeId}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {branches
        .filter((child) => child.children.length > 0)
        .map((child) => (
          <div key={child.jobTitleId} style={{ marginInlineStart: 28, marginTop: 10 }}>
            <CareerPathTimelineBranch
              node={child}
              jobTitleInfo={jobTitleInfo}
              t={t}
              expandedNodeId={expandedNodeId}
              setExpandedNodeId={setExpandedNodeId}
            />
          </div>
        ))}
    </div>
  );
}

function TimelineNodeChip({
  node,
  info,
  t,
  expandedNodeId,
  setExpandedNodeId,
  isRoot = false,
}: {
  node: CareerTreeNode;
  info: JobTitleBasicInfo | undefined;
  t: ReturnType<typeof useTranslations>;
  expandedNodeId: string | null;
  setExpandedNodeId: (id: string | null) => void;
  isRoot?: boolean;
}) {
  const isExpanded = expandedNodeId === node.jobTitleId;

  return (
    <div style={{ minWidth: 200 }}>
      <button
        type="button"
        onClick={() => !isRoot && setExpandedNodeId(isExpanded ? null : node.jobTitleId)}
        className="sru-card"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: 14,
          textAlign: "start",
          cursor: isRoot ? "default" : "pointer",
          width: "100%",
        }}
        aria-expanded={isRoot ? undefined : isExpanded}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <strong>{info?.nameAr ?? "—"}</strong>
          {info && <span className="sru-chip sru-en">{t("gradeLabel", { grade: info.gradeLevel })}</span>}
        </div>
        {!isRoot && (
          <ChevronLeft
            size={15}
            style={{
              color: "var(--sru-muted)",
              transform: isExpanded ? "rotate(-90deg)" : "none",
              transition: "transform 0.15s",
              flexShrink: 0,
            }}
            aria-hidden
          />
        )}
      </button>
      {isRoot ? (
        <p style={{ fontSize: 12.5, color: "var(--sru-muted)", marginTop: 6 }}>{t("trackStartLabel")}</p>
      ) : (
        isExpanded && (
          <p style={{ fontSize: 13, padding: "8px 4px", color: "var(--sru-muted)" }}>
            <b style={{ color: "var(--foreground)" }}>{t("columnRequirements")}: </b>
            {node.requirementsAr ?? t("noRequirements")}
          </p>
        )
      )}
    </div>
  );
}
