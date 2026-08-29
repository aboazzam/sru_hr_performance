/**
 * Canonical field key -> the column label each importer reads it from.
 *
 * These live here, and not beside their importers, for a hard reason: an
 * import action is a `"use server"` module, and such a module may only export
 * async functions. Exporting these objects from there compiled fine and
 * type-checked fine, then failed at runtime with
 * `A "use server" file can only export async functions, found object` — found
 * by loading the page, not by any check before it.
 */

export const VACANCY_IMPORT_COLUMNS = {
  jobTitle: "المسمى الوظيفي",
  orgUnit: "الوحدة التنظيمية",
  jobFamily: "العائلة الوظيفية",
  status: "الحالة",
  requirements: "المتطلبات",
} as const;

export const JOB_TITLE_IMPORT_COLUMNS = {
  nameAr: "اسم المسمى الوظيفي",
  jobFamily: "العائلة الوظيفية",
  gradeLevel: "الدرجة",
  category: "الفئة",
  nameEn: "الاسم بالإنجليزية",
  qualification: "المؤهل المطلوب",
  description: "الوصف",
} as const;

export const CAREER_PATH_IMPORT_COLUMNS = {
  fromJobTitle: "من (المسمى الوظيفي)",
  toJobTitle: "إلى (المسمى الوظيفي)",
  requirements: "متطلبات الانتقال",
} as const;

/**
 * Spans BOTH sheets of the employees/org-structure workbook. The mapping is
 * applied to each sheet's own header row, so a label only ever matches the
 * sheet that actually has it.
 */
export const ORG_STRUCTURE_IMPORT_COLUMNS = {
  employeeNumber: "EMPLOYEE NUMBER",
  fullNameAr: "اسم الموظف",
  email: "EMAIL ID",
  fullNameEn: "Employee Name",
  gradeCode: "GRADE CODE",
  hireDate: "Hire Date",
  qualification: "Qualification",
  educationSpeciality: "Education Speciality",
  dateOfBirth: "DATE OF BIRTH (YYYY-MM-DD)",
  mobile: "Mobile",
  maritalStatus: "MARITIAL STATUS",
  gender: "GENDER",
  nationality: "NATIONALITY",
  department: "الادارة",
  positionAr: "اسم الوظيفة",
  positionEn: "POSITION",
  employeeCategory: "Category",
  insuranceCategory: "Insurance Category",
  role: "الدور في النظام",
  structLevel: "المستوى",
  structCode: "الرمز",
  structUnit: "الوحدة التنظيمية",
  structUnitEn: "Organizational Unit",
  structParentCode: "رمز التبعية",
  structHolderNumber: "الرقم الوظيفي لمن يشغل المنصب",
} as const;

export const COMPETENCY_IMPORT_COLUMNS = {
  pillar: "المحور",
  domain: "المجال",
  nameAr: "اسم الجدارة",
  classification: "التصنيف",
  jobFamily: "العائلة الوظيفية",
  definition: "التعريف",
  expectedImpact: "الأثر المرجو",
  basic: "أساسي",
  practitioner: "ممارس",
  advanced: "متقدم",
  professional: "محترف",
} as const;

/**
 * بنود خطة التوظيف. الوحدة التنظيمية وحدها إلزامية في قاعدة البيانات
 * (`org_unit_id NOT NULL`)، لكن المسمى الوظيفي يُعامَل مفتاحًا معها لأن
 * البند يُعرَّف بهما معًا — راجع مفتاح التكرار في `import-actions`.
 */
export const PLAN_ITEM_IMPORT_COLUMNS = {
  orgUnit: "الوحدة التنظيمية",
  jobTitle: "المسمى الوظيفي",
  jobFamily: "العائلة الوظيفية",
  headcount: "العدد المطلوب",
  targetQuarter: "الربع المستهدف",
  priority: "الأولوية",
  monthlyCost: "التكلفة الشهرية التقديرية",
  justification: "المبرر",
} as const;
