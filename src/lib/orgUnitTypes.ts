/**
 * The two classification axes of an organisational unit.
 *
 * Both used to be fixed lists in the source tree (`kind` was a Postgres ENUM
 * with nine values). They are user-owned tables now — 20260830000002, asked
 * for on 2026-08-30: "نريد التصنيف يكون ديناميك بحيث استطيع اضافة تصنيف" —
 * so nothing here enumerates the values any more. What stays is the shape the
 * screens read, and the reminder that the two axes are independent:
 *
 *   * الشكل التنظيمي (`kind`)  — WHAT this unit is: مجلس، لجنة، إدارة، قسم،
 *     مكتب، مركز، وحدة، كلية، أمانة، قيادة. Required.
 *   * نوع الإدارة (`type`)     — WHICH system it works in: حوكمة، داعمة،
 *     أكاديمي، تطوير أعمال، مساهمة وأثر. Optional, and deliberately empty on
 *     all 58 existing units: no source says which unit belongs to which, and
 *     inventing that split would be fabricating data.
 */
export interface OrgUnitClassification {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  displayOrder: number;
  /** Units currently carrying it — a classification in use cannot be deleted. */
  usageCount: number;
}
