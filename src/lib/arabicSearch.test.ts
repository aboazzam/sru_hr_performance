import { describe, it, expect } from "vitest";
import { foldArabicHamza, includesIgnoringHamza } from "./arabicSearch";

describe("foldArabicHamza", () => {
  it("folds all alef-with-hamza variants to bare alef", () => {
    expect(foldArabicHamza("أحمد")).toBe("احمد");
    expect(foldArabicHamza("إحسان")).toBe("احسان");
    expect(foldArabicHamza("آمنة")).toBe("امنة");
  });

  it("folds waw-with-hamza and yeh-with-hamza", () => {
    expect(foldArabicHamza("مسؤولية")).toBe("مسوولية");
    expect(foldArabicHamza("مسئولية")).toBe("مسيولية");
  });

  it("removes a standalone hamza", () => {
    expect(foldArabicHamza("قرأ")).toBe("قرا");
  });

  it("leaves text with no hamza untouched", () => {
    expect(foldArabicHamza("محلل بيانات")).toBe("محلل بيانات");
  });
});

describe("includesIgnoringHamza", () => {
  it("matches regardless of which side used the hamza", () => {
    expect(includesIgnoringHamza("أستاذ مساعد", "استاذ")).toBe(true);
    expect(includesIgnoringHamza("استاذ مساعد", "أستاذ")).toBe(true);
  });

  it("still respects a genuinely non-matching substring", () => {
    expect(includesIgnoringHamza("أستاذ مساعد", "عميد")).toBe(false);
  });
});
