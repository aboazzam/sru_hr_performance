// Deliberately imports from ./navItems, NOT ./Sidebar — importing Sidebar.tsx
// here would transitively pull in `next-intl/navigation` -> `next/navigation`,
// which fails to resolve under Vitest in this Next.js version (confirmed:
// fails on a bare, non-mocked import, in both "node" and "jsdom"
// environments). See navItems.ts for the full story. Full component
// rendering (Link hrefs, active-class in the DOM) is covered by manual
// browser verification, not by this file.
import { describe, it, expect } from "vitest";
import {
  navItems,
  navGroups,
  navItemHref,
  isNavItemActive,
  isNavGroupActive,
  visibleNavItems,
  visibleNavGroups,
  sidebarGroupLabelKey,
} from "./navItems";

describe("navItems (top-level, ungrouped)", () => {
  it("has exactly 8 items with unique segments", () => {
    // 2026-07-24: promotions/rewards moved under the new "التوصيات"
    // (Recommendations) group tab per the project owner's explicit
    // "بالنسبة للترقيات والمكافآت تكون تحت التوصيات" — no longer flat
    // top-level sidebar entries. 2026-07-25: "reports" joined this list
    // ungated (see below) as a personalized dashboard reachable by everyone.
    expect(navItems).toHaveLength(8);
    expect(new Set(navItems.map((i) => i.segment)).size).toBe(8);
  });

  it("has exactly one home item (empty segment)", () => {
    expect(navItems.filter((i) => i.segment === "")).toHaveLength(1);
  });

  it("home and reports are the only ungated items; every other item declares an access requirement", () => {
    for (const item of navItems) {
      if (item.segment === "" || item.segment === "reports") {
        expect(item.access).toBeUndefined();
      } else {
        expect(item.access).toBeDefined();
      }
    }
  });
});

describe("navGroups (2026-07-24 grouped nav)", () => {
  it("has exactly 3 groups: administration, evaluationMethods, evaluationResults", () => {
    expect(navGroups.map((g) => g.groupKey)).toEqual(["administration", "evaluationMethods", "evaluationResults"]);
  });

  it("every child in every group declares an access requirement", () => {
    for (const group of navGroups) {
      for (const child of group.children) {
        expect(child.access).toBeDefined();
      }
    }
  });

  it("no segment is duplicated across navItems and all group children combined", () => {
    const allSegments = [...navItems.map((i) => i.segment), ...navGroups.flatMap((g) => g.children.map((c) => c.segment))];
    expect(new Set(allSegments).size).toBe(allSegments.length);
  });

  it("the administration group has its five children (reports moved out, user-activity added, 2026-07-25)", () => {
    const admin = navGroups.find((g) => g.groupKey === "administration")!;
    expect(admin.children.map((c) => c.segment)).toEqual([
      "admin/org-structure",
      "admin/org-structure/staffing",
      "admin",
      "admin/identity",
      "admin/user-activity",
    ]);
  });

  it("the evaluationMethods group has the four requested children", () => {
    const methods = navGroups.find((g) => g.groupKey === "evaluationMethods")!;
    expect(methods.children.map((c) => c.segment)).toEqual(["evaluations", "competencies", "bau-tasks", "feedback-360"]);
  });

  it("the evaluationResults group has just recommendations (reports never returns to this group)", () => {
    const results = navGroups.find((g) => g.groupKey === "evaluationResults")!;
    expect(results.children.map((c) => c.segment)).toEqual(["recommendations"]);
  });
});

describe("visibleNavItems", () => {
  it("always shows home, even with zero permissions", () => {
    const visible = visibleNavItems(navItems, {});
    expect(visible.map((i) => i.segment)).toContain("");
  });

  it("hides admin/reference tabs for the real employee permission set", () => {
    // The actual seeded `employee` role grants (2026-07-22): goalsLibrary=view,
    // competencyFramework=view, goalAssignment=view, bauTasks=prepare,
    // evaluation=prepare, vacancies=view, careerPath=view — everything else
    // (employeeData, calibration, promotions, userManagement, orgStructure)
    // is absent (none).
    const employeePermissions = {
      goalsLibrary: "view",
      competencyFramework: "view",
      goalAssignment: "view",
      bauTasks: "prepare",
      evaluation: "prepare",
      vacancies: "view",
      careerPath: "view",
    } as const;

    const segments = visibleNavItems(navItems, employeePermissions).map((i) => i.segment);

    // Explicitly reported as tabs that should NOT show for a plain employee.
    expect(segments).not.toContain("employees");
    expect(segments).not.toContain("salary-scale");
    expect(segments).not.toContain("goals/library");
    expect(segments).not.toContain("calibration");

    // Still meaningful for a plain employee.
    expect(segments).toContain("");
    expect(segments).toContain("career-path");
    expect(segments).toContain("vacancies");
    // Ungated (2026-07-25): reports is a personalized dashboard reachable by everyone.
    expect(segments).toContain("reports");
  });

  it("shows every tab for a full-access permission set", () => {
    const allApprove = Object.fromEntries(navItems.filter((i) => i.access).map((i) => [i.access!.processArea, "approve"]));
    const segments = visibleNavItems(navItems, allApprove).map((i) => i.segment);
    expect(segments).toHaveLength(navItems.length);
  });
});

describe("visibleNavGroups", () => {
  it("hides a whole group when none of its children are visible", () => {
    const groups = visibleNavGroups(navGroups, {});
    expect(groups).toHaveLength(0);
  });

  it("hides only the ungranted children within an otherwise-visible group (employee perms)", () => {
    const employeePermissions = {
      bauTasks: "prepare",
      evaluation: "prepare",
      competencyFramework: "view",
    } as const;
    const groups = visibleNavGroups(navGroups, employeePermissions);
    const methods = groups.find((g) => g.groupKey === "evaluationMethods");
    expect(methods).toBeDefined();
    const segments = methods!.children.map((c) => c.segment);
    // evaluation=prepare clears both "evaluations" (view) and "feedback-360" (prepare).
    expect(segments).toContain("evaluations");
    expect(segments).toContain("feedback-360");
    expect(segments).toContain("bau-tasks");
    expect(segments).toContain("competencies");

    // administration group: no orgStructure/userManagement grant at all -> fully hidden.
    expect(groups.find((g) => g.groupKey === "administration")).toBeUndefined();
  });

  it("shows every group and every child for a full-access permission set", () => {
    const allApprove = Object.fromEntries(
      navGroups.flatMap((g) => g.children).map((c) => [c.access!.processArea, "approve"])
    );
    const groups = visibleNavGroups(navGroups, allApprove);
    expect(groups).toHaveLength(navGroups.length);
    const totalChildren = groups.reduce((sum, g) => sum + g.children.length, 0);
    const expectedTotal = navGroups.reduce((sum, g) => sum + g.children.length, 0);
    expect(totalChildren).toBe(expectedTotal);
  });
});

describe("sidebarGroupLabelKey", () => {
  it("uses the child's own label when exactly one child is visible (e.g. orgStructure=view only)", () => {
    // Real feedback (2026-07-25): a caller with only orgStructure=view sees
    // just الهيكل التنظيمي's chart-only view (staffing/identity/admin are
    // now separate process areas) -- the sidebar's "الإدارة" group label
    // should read as "الهيكل التنظيمي" specifically in that case, not the
    // generic group name, since that's the only thing actually behind it.
    const groups = visibleNavGroups(navGroups, { orgStructure: "view" });
    const administration = groups.find((g) => g.groupKey === "administration")!;
    expect(administration.children).toHaveLength(1);
    expect(administration.children[0].segment).toBe("admin/org-structure");
    expect(sidebarGroupLabelKey(administration)).toBe("orgStructure");
  });

  it("uses the generic group label when more than one child is visible", () => {
    const groups = visibleNavGroups(navGroups, { orgStructure: "recommend", staffing: "view" });
    const administration = groups.find((g) => g.groupKey === "administration")!;
    expect(administration.children.length).toBeGreaterThan(1);
    expect(sidebarGroupLabelKey(administration)).toBe("administration");
  });
});

describe("navItemHref", () => {
  it("returns '/' for the home item", () => {
    expect(navItemHref("")).toBe("/");
  });

  it("returns '/<segment>' for every other item, including multi-segment ones", () => {
    expect(navItemHref("employees")).toBe("/employees");
    expect(navItemHref("admin/org-structure")).toBe("/admin/org-structure");
  });
});

describe("isNavItemActive", () => {
  it("home is active only on the exact root, never on a sub-path", () => {
    expect(isNavItemActive("", "/")).toBe(true);
    expect(isNavItemActive("", "/competencies")).toBe(false);
    expect(isNavItemActive("", "/admin")).toBe(false);
  });

  it("a non-home item is active on its own exact path", () => {
    expect(isNavItemActive("competencies", "/competencies")).toBe(true);
    expect(isNavItemActive("admin", "/admin")).toBe(true);
  });

  it("a leaf item with no more-specific sibling stays active on nested sub-paths", () => {
    expect(isNavItemActive("evaluations", "/evaluations/123")).toBe(true);
  });

  it("a non-home item is not active on an unrelated path", () => {
    expect(isNavItemActive("competencies", "/admin")).toBe(false);
    expect(isNavItemActive("admin", "/")).toBe(false);
  });

  // The real bug this fix targets: "admin" and "admin/org-structure" share a
  // URL prefix but are now separate sibling nav entries (الصلاحيات vs
  // الهيكل التنظيمي), not a page-and-sub-route pair.
  it("longest-prefix-wins disambiguates sibling entries sharing a URL prefix", () => {
    expect(isNavItemActive("admin", "/admin/org-structure")).toBe(false);
    expect(isNavItemActive("admin/org-structure", "/admin/org-structure")).toBe(true);

    expect(isNavItemActive("admin/org-structure", "/admin/org-structure/staffing")).toBe(false);
    expect(isNavItemActive("admin/org-structure/staffing", "/admin/org-structure/staffing")).toBe(true);

    expect(isNavItemActive("admin", "/admin/identity")).toBe(false);
    expect(isNavItemActive("admin/identity", "/admin/identity")).toBe(true);

    // The exact base page is still correctly active for itself.
    expect(isNavItemActive("admin", "/admin")).toBe(true);
  });

  it("no two known segments are simultaneously active for any real route in the table", () => {
    const allSegments = [...navItems.map((i) => i.segment), ...navGroups.flatMap((g) => g.children.map((c) => c.segment))];
    for (const current of allSegments) {
      const pathname = navItemHref(current);
      const activeSegments = allSegments.filter((segment) => isNavItemActive(segment, pathname));
      expect(activeSegments).toEqual([current]);
    }
  });
});

describe("isNavGroupActive", () => {
  it("a group is active when the pathname matches any of its children", () => {
    const admin = navGroups.find((g) => g.groupKey === "administration")!;
    expect(isNavGroupActive(admin, "/admin/org-structure")).toBe(true);
    expect(isNavGroupActive(admin, "/admin/identity")).toBe(true);
    expect(isNavGroupActive(admin, "/employees")).toBe(false);
  });
});
