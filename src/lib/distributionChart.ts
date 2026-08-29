/**
 * هندسة الحلقة (donut) لبطاقات التوزيع في خطة التوظيف.
 *
 * منفصلة عن الرسم لأنها الجزء الذي يَصدق أو يَكذب: الحصص يجب أن تُغلق
 * الدائرة تمامًا، وشريحةٌ ضائعة أو زاوية زائدة لا يظهران في مراجعة الكود
 * بقدر ما يظهران في اختبار.
 *
 * الكسور تُحسب من العدد الخام لا من النسبة المعروضة: النسب تُقرَّب للعرض
 * (٣٣٪ + ٣٣٪ + ٣٣٪ = ٩٩٪)، فلو رُسمت الحلقة منها لبقيت فجوة لا سبب لها.
 */

export interface DistributionDatum {
  key: string;
  label: string;
  headcount: number;
}

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  /** حصة الشريحة من الدائرة، 0..1 — غير مقرَّبة. */
  fraction: number;
  /** بداية الشريحة على محيط الدائرة، 0..1. */
  startFraction: number;
  /** النسبة المئوية للعرض، مقرَّبة. */
  percent: number;
  color: string;
}

/**
 * ألوان الحلقة من متغيّرات الهوية نفسها لا من لوحة مستقلة، فتتبع ألوانَ
 * المنظمة المضبوطة في صفحة الهوية تلقائيًا (تُحقن على `<html>`) — نفس ما
 * يفعله مخطط الهيكل التنظيمي. ولا لون خارج اللوحة (CLAUDE.md §7).
 */
export const DONUT_COLORS: readonly string[] = [
  "var(--sru-purple)",
  "var(--sru-blue)",
  "var(--sru-purple-dark)",
  "var(--sru-purple-light)",
  "var(--sru-blue-light)",
];

/**
 * يوزّع الألوان دوريًا مع ضمانٍ واحد: ألّا يتجاور لونان متطابقان.
 *
 * والحلقة تجعل الأخيرة مجاورةً للأولى، فالتجاور يُفحص دائريًا لا خطيًا —
 * وهو ما لا يخطر عند كتابة `colors[i % colors.length]` وحدها. عند التساوي
 * تُزاح الشريحة لونًا واحدًا للأمام، فلا تذوب حدودها في جارتها.
 */
export function assignSliceColors(count: number, colors: readonly string[] = DONUT_COLORS): string[] {
  if (count <= 0) return [];
  if (colors.length === 0) return Array.from({ length: count }, () => "var(--sru-purple)");

  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    let color = colors[i % colors.length];
    if (i > 0 && color === out[i - 1]) color = colors[(i + 1) % colors.length];
    out.push(color);
  }
  // الأولى والأخيرة متجاورتان على الحلقة.
  if (count > 2 && out[count - 1] === out[0]) {
    const alternative = colors.find((c) => c !== out[0] && c !== out[count - 2]);
    if (alternative) out[count - 1] = alternative;
  }
  return out;
}

/**
 * يحوّل صفوف التوزيع إلى شرائح حلقة.
 *
 * الصفوف الصفرية تُحذف: شريحة بزاوية صفر لا تُرى، ولونها في وسيلة الإيضاح
 * يوهم بوجود حصة. والمجموع صفرًا يعيد قائمة فارغة بدل قسمةٍ على صفر.
 */
export function donutSlices(
  rows: readonly DistributionDatum[],
  colors: readonly string[] = DONUT_COLORS
): DonutSlice[] {
  const positive = rows.filter((row) => row.headcount > 0);
  const total = positive.reduce((sum, row) => sum + row.headcount, 0);
  if (total <= 0) return [];

  const palette = assignSliceColors(positive.length, colors);
  let cursor = 0;
  return positive.map((row, index) => {
    const fraction = row.headcount / total;
    const slice: DonutSlice = {
      key: row.key,
      label: row.label,
      value: row.headcount,
      fraction,
      startFraction: cursor,
      percent: Math.round(fraction * 100),
      color: palette[index],
    };
    cursor += fraction;
    return slice;
  });
}

/** مجموع الأعداد — يُعرض في قلب الحلقة. */
export function donutTotal(rows: readonly DistributionDatum[]): number {
  return rows.reduce((sum, row) => sum + row.headcount, 0);
}

export const distributionShapes = ["donut", "bar", "table"] as const;
export type DistributionShape = (typeof distributionShapes)[number];

/** الشكل التالي في الدورة، لزرٍّ واحد يتنقّل بينها. */
export function nextShape(current: DistributionShape): DistributionShape {
  const index = distributionShapes.indexOf(current);
  return distributionShapes[(index + 1) % distributionShapes.length];
}
