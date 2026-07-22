// Deliberately imports from ./navItems, NOT ./NavBar — importing NavBar.tsx
// here would transitively pull in `next-intl/navigation` -> `next/navigation`,
// which fails to resolve under Vitest in this Next.js version (confirmed:
// fails on a bare, non-mocked import, in both "node" and "jsdom"
// environments). See navItems.ts for the full story. Full component
// rendering (Link hrefs, active-class in the DOM) is covered by the manual
// browser verification already run against /ar and /ar/admin in this
// session, not by this file.
import { describe, it, expect } from "vitest";
import { navItems, navItemHref, isNavItemActive, visibleNavItems } from "./navItems";

describe("NavBar route table", () => {
  it("has exactly 14 items with unique segments", () => {
    expect(navItems).toHaveLength(14);
    expect(new Set(navItems.map((i) => i.segment)).size).toBe(14);
  });

  it("has exactly one home item (empty segment)", () => {
    expect(navItems.filter((i) => i.segment === "")).toHaveLength(1);
  });

  it("every item except home declares an access requirement", () => {
    for (const item of navItems) {
      if (item.segment === "") {
        expect(item.access).toBeUndefined();
      } else {
        expect(item.access).toBeDefined();
      }
    }
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
    // (employeeData, calibration, promotions, userManagement) is absent (none).
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
    expect(segments).not.toContain("promotions");
    expect(segments).not.toContain("rewards");
    expect(segments).not.toContain("admin");

    // Still meaningful for a plain employee.
    expect(segments).toContain("");
    expect(segments).toContain("career-path");
    expect(segments).toContain("bau-tasks");
    expect(segments).toContain("evaluations");
    expect(segments).toContain("feedback-360");
    expect(segments).toContain("competencies");
    expect(segments).toContain("vacancies");
  });

  it("shows every tab for a full-access permission set", () => {
    const allApprove = Object.fromEntries(
      navItems.filter((i) => i.access).map((i) => [i.access!.processArea, "approve"])
    );
    const segments = visibleNavItems(navItems, allApprove).map((i) => i.segment);
    expect(segments).toHaveLength(navItems.length);
  });
});

describe("navItemHref", () => {
  it("returns '/' for the home item", () => {
    expect(navItemHref("")).toBe("/");
  });

  it("returns '/<segment>' for every other item", () => {
    for (const { segment } of navItems) {
      if (segment === "") continue;
      expect(navItemHref(segment)).toBe(`/${segment}`);
    }
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

  it("a non-home item stays active on nested sub-paths (startsWith)", () => {
    expect(isNavItemActive("admin", "/admin/roles")).toBe(true);
    expect(isNavItemActive("evaluations", "/evaluations/123")).toBe(true);
  });

  it("a non-home item is not active on an unrelated path", () => {
    expect(isNavItemActive("competencies", "/admin")).toBe(false);
    expect(isNavItemActive("admin", "/")).toBe(false);
  });

  it("no two items are simultaneously active for any real route in the table", () => {
    for (const { segment: current } of navItems) {
      const pathname = navItemHref(current);
      const activeSegments = navItems
        .map((i) => i.segment)
        .filter((segment) => isNavItemActive(segment, pathname));
      expect(activeSegments).toEqual([current]);
    }
  });
});
