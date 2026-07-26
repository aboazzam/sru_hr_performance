import { describe, it, expect } from "vitest";
import { buildForwardCareerTree, collectCareerTreeJobTitleIds, type CareerPathEdge } from "./careerPathTree";

describe("buildForwardCareerTree", () => {
  it("returns just the root with no children when no outgoing edges exist", () => {
    const tree = buildForwardCareerTree([], "A");
    expect(tree).toEqual({ jobTitleId: "A", requirementsAr: null, children: [] });
  });

  it("builds a linear chain A -> B -> C", () => {
    const edges: CareerPathEdge[] = [
      { id: "e1", requirementsAr: "req-ab", fromJobTitleId: "A", toJobTitleId: "B" },
      { id: "e2", requirementsAr: "req-bc", fromJobTitleId: "B", toJobTitleId: "C" },
    ];
    const tree = buildForwardCareerTree(edges, "A");
    expect(tree.jobTitleId).toBe("A");
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]).toMatchObject({ jobTitleId: "B", requirementsAr: "req-ab" });
    expect(tree.children[0].children[0]).toMatchObject({ jobTitleId: "C", requirementsAr: "req-bc" });
  });

  it("branches when one job leads to multiple next steps", () => {
    const edges: CareerPathEdge[] = [
      { id: "e1", requirementsAr: null, fromJobTitleId: "A", toJobTitleId: "B" },
      { id: "e2", requirementsAr: null, fromJobTitleId: "A", toJobTitleId: "C" },
    ];
    const tree = buildForwardCareerTree(edges, "A");
    expect(tree.children.map((c) => c.jobTitleId).sort()).toEqual(["B", "C"]);
  });

  it("ignores edges unrelated to the reachable subgraph", () => {
    const edges: CareerPathEdge[] = [
      { id: "e1", requirementsAr: null, fromJobTitleId: "A", toJobTitleId: "B" },
      { id: "e2", requirementsAr: null, fromJobTitleId: "X", toJobTitleId: "Y" },
    ];
    const tree = buildForwardCareerTree(edges, "A");
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].jobTitleId).toBe("B");
  });

  it("does not infinitely recurse on a cycle", () => {
    const edges: CareerPathEdge[] = [
      { id: "e1", requirementsAr: null, fromJobTitleId: "A", toJobTitleId: "B" },
      { id: "e2", requirementsAr: null, fromJobTitleId: "B", toJobTitleId: "A" },
    ];
    const tree = buildForwardCareerTree(edges, "A");
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].jobTitleId).toBe("B");
    expect(tree.children[0].children).toHaveLength(0);
  });
});

describe("collectCareerTreeJobTitleIds", () => {
  it("collects the root and every descendant id", () => {
    const edges: CareerPathEdge[] = [
      { id: "e1", requirementsAr: null, fromJobTitleId: "A", toJobTitleId: "B" },
      { id: "e2", requirementsAr: null, fromJobTitleId: "A", toJobTitleId: "C" },
      { id: "e3", requirementsAr: null, fromJobTitleId: "B", toJobTitleId: "D" },
    ];
    const tree = buildForwardCareerTree(edges, "A");
    const ids = collectCareerTreeJobTitleIds(tree);
    expect([...ids].sort()).toEqual(["A", "B", "C", "D"]);
  });
});
