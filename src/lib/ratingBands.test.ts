import { describe, it, expect } from "vitest";
import { RATING_BANDS, bandForScore } from "./ratingBands";

describe("RATING_BANDS", () => {
  it("covers the full 0-100 range with no gap or overlap", () => {
    for (let score = 0; score <= 100; score++) {
      const matches = RATING_BANDS.filter((band) => score >= band.min && score <= band.max);
      expect(matches).toHaveLength(1);
    }
  });

  it("has a non-empty Arabic label for every band", () => {
    for (const band of RATING_BANDS) expect(band.labelAr.length).toBeGreaterThan(0);
  });
});

describe("bandForScore", () => {
  it("classifies exact boundary values into the correct band", () => {
    expect(bandForScore(90)?.id).toBe("excellent");
    expect(bandForScore(89.9)?.id).toBe("veryGood");
    expect(bandForScore(80)?.id).toBe("veryGood");
    expect(bandForScore(79.9)?.id).toBe("good");
    expect(bandForScore(70)?.id).toBe("good");
    expect(bandForScore(69.9)?.id).toBe("satisfactory");
    expect(bandForScore(60)?.id).toBe("satisfactory");
    expect(bandForScore(59.9)?.id).toBe("needsImprovement");
    expect(bandForScore(0)?.id).toBe("needsImprovement");
    expect(bandForScore(100)?.id).toBe("excellent");
  });

  it("never invents a band for a score that does not exist", () => {
    expect(bandForScore(null)).toBeNull();
    expect(bandForScore(undefined)).toBeNull();
    expect(bandForScore(NaN)).toBeNull();
  });
});
