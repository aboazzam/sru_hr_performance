// Deliberately imports from ./navItems, NOT ./NavBar — importing NavBar.tsx
// here would transitively pull in `next-intl/navigation` -> `next/navigation`,
// which fails to resolve under Vitest in this Next.js version (confirmed:
// fails on a bare, non-mocked import, in both "node" and "jsdom"
// environments). See navItems.ts for the full story. Full component
// rendering (Link hrefs, active-class in the DOM) is covered by the manual
// browser verification already run against /ar and /ar/admin in this
// session, not by this file.
import { describe, it, expect } from "vitest";
import { navItems, navItemHref, isNavItemActive } from "./navItems";

describe("NavBar route table", () => {
  it("has exactly 10 items with unique segments", () => {
    expect(navItems).toHaveLength(10);
    expect(new Set(navItems.map((i) => i.segment)).size).toBe(10);
  });

  it("has exactly one home item (empty segment)", () => {
    expect(navItems.filter((i) => i.segment === "")).toHaveLength(1);
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
