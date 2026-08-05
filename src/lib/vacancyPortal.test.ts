import { describe, it, expect } from "vitest";
import {
  vacancyPortalState,
  portalStateLabels,
  portalStates,
  isoDatePart,
  type VacancyAnnouncementWindow,
} from "./vacancyPortal";

const base: VacancyAnnouncementWindow = {
  status: "open",
  announcedAt: "2026-08-01T10:00:00+00:00",
  announcementStartDate: "2026-09-01",
  applicationDeadline: "2026-09-30",
};

describe("vacancyPortalState", () => {
  it("is scheduled before the start date", () => {
    expect(vacancyPortalState(base, "2026-08-31")).toBe("scheduled");
  });

  it("is live inside the window, including both end days", () => {
    expect(vacancyPortalState(base, "2026-09-01")).toBe("live");
    expect(vacancyPortalState(base, "2026-09-15")).toBe("live");
    expect(vacancyPortalState(base, "2026-09-30")).toBe("live");
  });

  it("is expired the day after the deadline", () => {
    expect(vacancyPortalState(base, "2026-10-01")).toBe("expired");
  });

  it("falls back to the announcement date when no start date is set", () => {
    // The one real vacancy advertised before these columns existed has no
    // start date — it must stay live, not disappear.
    const noStart = { ...base, announcementStartDate: null, applicationDeadline: null };
    expect(vacancyPortalState(noStart, "2026-08-01")).toBe("live");
    expect(vacancyPortalState(noStart, "2027-01-01")).toBe("live");
    expect(vacancyPortalState(noStart, "2026-07-31")).toBe("scheduled");
  });

  it("stays open-ended when only the deadline is missing", () => {
    const noDeadline = { ...base, applicationDeadline: null };
    expect(vacancyPortalState(noDeadline, "2030-01-01")).toBe("live");
  });

  it("never shows a vacancy that is no longer open, even inside its window", () => {
    expect(vacancyPortalState({ ...base, status: "closed" }, "2026-09-15")).toBe("not_open");
    expect(vacancyPortalState({ ...base, status: "filled" }, "2026-09-15")).toBe("not_open");
  });

  it("compares dates as strings, so month and year boundaries hold", () => {
    const acrossYear = { ...base, announcementStartDate: "2026-12-15", applicationDeadline: "2027-01-15" };
    expect(vacancyPortalState(acrossYear, "2026-12-31")).toBe("live");
    expect(vacancyPortalState(acrossYear, "2027-01-16")).toBe("expired");
  });

  it("has an Arabic label for every state", () => {
    for (const state of portalStates) expect(portalStateLabels[state].length).toBeGreaterThan(0);
  });
});

describe("isoDatePart", () => {
  it("takes the calendar day out of an ISO timestamp without a Date round-trip", () => {
    expect(isoDatePart("2026-08-04T21:30:00+00:00")).toBe("2026-08-04");
  });

  it("returns null for a missing timestamp", () => {
    expect(isoDatePart(null)).toBeNull();
  });
});
