import { describe, expect, it } from "vitest";
import {
  assignSliceColors,
  donutSlices,
  donutTotal,
  nextShape,
  DONUT_COLORS,
  distributionShapes,
  type DistributionShape,
} from "./distributionChart";

const row = (key: string, headcount: number) => ({ key, label: key, headcount });

describe("donutSlices", () => {
  it("returns nothing when the total is zero, rather than dividing by it", () => {
    expect(donutSlices([])).toEqual([]);
    expect(donutSlices([row("a", 0), row("b", 0)])).toEqual([]);
  });

  it("closes the circle exactly — the fractions sum to 1", () => {
    // ثلاثة أثلاث: النسب المعروضة ٣٣٪ ثلاثًا (٩٩٪)، لكن الحلقة يجب أن تُغلق.
    const slices = donutSlices([row("a", 1), row("b", 1), row("c", 1)]);
    const sum = slices.reduce((s, x) => s + x.fraction, 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(slices.map((s) => s.percent)).toEqual([33, 33, 33]);
  });

  it("lays slices end to end with no gap and no overlap", () => {
    const slices = donutSlices([row("a", 5), row("b", 3), row("c", 2)]);
    expect(slices[0].startFraction).toBe(0);
    for (let i = 1; i < slices.length; i += 1) {
      expect(slices[i].startFraction).toBeCloseTo(slices[i - 1].startFraction + slices[i - 1].fraction, 10);
    }
    const last = slices[slices.length - 1];
    expect(last.startFraction + last.fraction).toBeCloseTo(1, 10);
  });

  it("drops zero rows instead of drawing invisible slices with a legend colour", () => {
    const slices = donutSlices([row("a", 4), row("zero", 0), row("b", 4)]);
    expect(slices.map((s) => s.key)).toEqual(["a", "b"]);
    expect(slices.every((s) => s.fraction > 0)).toBe(true);
  });

  it("computes shares from raw counts, not from rounded percentages", () => {
    const slices = donutSlices([row("a", 1), row("b", 2)]);
    expect(slices[0].fraction).toBeCloseTo(1 / 3, 10);
    expect(slices[1].fraction).toBeCloseTo(2 / 3, 10);
  });

  it("keeps a single group as one full ring", () => {
    const slices = donutSlices([row("only", 7)]);
    expect(slices).toHaveLength(1);
    expect(slices[0].fraction).toBe(1);
    expect(slices[0].percent).toBe(100);
  });
});

describe("assignSliceColors", () => {
  it("gives each slice a colour and never repeats one next to itself", () => {
    for (let n = 1; n <= 20; n += 1) {
      const colors = assignSliceColors(n);
      expect(colors).toHaveLength(n);
      for (let i = 1; i < n; i += 1) expect(colors[i]).not.toBe(colors[i - 1]);
    }
  });

  it("treats the last and first as neighbours, because a ring closes", () => {
    // العدد المساوي لطول اللوحة هو الحالة التي يلتقي فيها الطرفان بنفس اللون.
    for (let n = 3; n <= 20; n += 1) {
      const colors = assignSliceColors(n);
      expect(colors[n - 1]).not.toBe(colors[0]);
    }
  });

  it("uses only identity palette variables, never a raw colour", () => {
    for (const color of assignSliceColors(12)) {
      expect(DONUT_COLORS).toContain(color);
      expect(color.startsWith("var(--sru-")).toBe(true);
    }
  });

  it("returns nothing for a non-positive count", () => {
    expect(assignSliceColors(0)).toEqual([]);
    expect(assignSliceColors(-3)).toEqual([]);
  });

  it("degrades to one palette colour rather than crashing on an empty palette", () => {
    expect(assignSliceColors(3, [])).toEqual([
      "var(--sru-purple)",
      "var(--sru-purple)",
      "var(--sru-purple)",
    ]);
  });
});

describe("donutTotal", () => {
  it("sums every row, including zero ones", () => {
    expect(donutTotal([row("a", 3), row("b", 0), row("c", 4)])).toBe(7);
    expect(donutTotal([])).toBe(0);
  });
});

describe("nextShape", () => {
  it("cycles through every shape and returns to the start", () => {
    let shape: DistributionShape = distributionShapes[0];
    const seen: DistributionShape[] = [shape];
    for (let i = 0; i < distributionShapes.length - 1; i += 1) {
      shape = nextShape(shape);
      seen.push(shape);
    }
    expect(new Set(seen).size).toBe(distributionShapes.length);
    expect(nextShape(shape)).toBe(distributionShapes[0]);
  });
});
