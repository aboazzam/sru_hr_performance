import { describe, it, expect } from "vitest";
import { findCareerPathTrackRoots } from "./careerPathTracks";

describe("findCareerPathTrackRoots", () => {
  const info = new Map([
    ["a", { nameAr: "مدرب مركز اتصال", gradeLevel: 9 }],
    ["b", { nameAr: "قائد فريق خدمة العملاء", gradeLevel: 10 }],
    ["c", { nameAr: "مدير مركز الاتصال", gradeLevel: 11 }],
    ["x", { nameAr: "محلل أعمال", gradeLevel: 9 }],
    ["y", { nameAr: "محلل أعمال أول", gradeLevel: 10 }],
  ]);

  it("finds the single entry point of a linear chain", () => {
    const edges = [
      { id: "e1", requirementsAr: null, fromJobTitleId: "a", toJobTitleId: "b" },
      { id: "e2", requirementsAr: null, fromJobTitleId: "b", toJobTitleId: "c" },
    ];
    const roots = findCareerPathTrackRoots(edges, info);
    expect(roots).toEqual([{ jobTitleId: "a", nameAr: "مدرب مركز اتصال", gradeLevel: 9 }]);
  });

  it("treats two disconnected chains as two separate tracks", () => {
    const edges = [
      { id: "e1", requirementsAr: null, fromJobTitleId: "a", toJobTitleId: "b" },
      { id: "e2", requirementsAr: null, fromJobTitleId: "x", toJobTitleId: "y" },
    ];
    const roots = findCareerPathTrackRoots(edges, info);
    expect(roots.map((r) => r.jobTitleId).sort()).toEqual(["a", "x"]);
  });

  it("a job title with any incoming edge is never a root, even with fan-in", () => {
    const edges = [
      { id: "e1", requirementsAr: null, fromJobTitleId: "a", toJobTitleId: "c" },
      { id: "e2", requirementsAr: null, fromJobTitleId: "b", toJobTitleId: "c" },
    ];
    const roots = findCareerPathTrackRoots(edges, info);
    expect(roots.map((r) => r.jobTitleId).sort()).toEqual(["a", "b"]);
  });

  it("returns an empty array for no edges", () => {
    expect(findCareerPathTrackRoots([], info)).toEqual([]);
  });

  it("skips a root id with no matching job title info", () => {
    const edges = [{ id: "e1", requirementsAr: null, fromJobTitleId: "missing", toJobTitleId: "b" }];
    const roots = findCareerPathTrackRoots(edges, info);
    expect(roots).toEqual([]);
  });

  it("sorts results alphabetically (ar locale)", () => {
    const edges = [
      { id: "e1", requirementsAr: null, fromJobTitleId: "a", toJobTitleId: "b" },
      { id: "e2", requirementsAr: null, fromJobTitleId: "x", toJobTitleId: "y" },
    ];
    const roots = findCareerPathTrackRoots(edges, info);
    const sortedByHand = [...roots].sort((p, q) => p.nameAr.localeCompare(q.nameAr, "ar"));
    expect(roots).toEqual(sortedByHand);
  });
});
