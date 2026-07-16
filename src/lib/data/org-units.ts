// Source of truth: "الهيكل التنظيمي لجامعة سليمان الراجحي.jpeg" (الإصدار 2.0، تاريخ
// 28/5/2025), المزوَّد من مالك المشروع. مُنقول عن الصورة حرفيًا، وليس تأليفًا.
//
// "category" يعكس لون الصندوق في المخطط الأصلي (أسود=حوكمة، بنفسجي=أكاديمي،
// فيروزي=تطوير أعمال، رمادي=دعم/إداري) — تصنيف بيانات داخلي فقط، لا علاقة له
// بلوحة ألوان الواجهة (بنفسجي/أزرق/رمادي وفق SRU_IDENTITY.md).
//
// "عمداء الكليات" صندوق عام في المخطط الأصلي بلا أسماء كليات — الكليات الأربع
// تحته (college-*) مصدرها رسالة مباشرة من مالك المشروع في المحادثة، وليست من
// ملف الهيكل التنظيمي نفسه. [غير مؤكد] هل هذه القائمة كاملة أم أن كليات أخرى
// ستُضاف لاحقًا — لم يُذكر صراحة.
// [غير مؤكد] "إدارة المراجعة الداخلية" لها خط منقط "وظيفياً" من "لجنة المراجعة"
// إضافة إلى تبعيتها الإدارية لمجلس الجامعة في المخطط — العلاقة الوظيفية غير
// ممثَّلة في نموذج البيانات أدناه (شجرة تبعية واحدة فقط لكل وحدة).

export type OrgUnitCategory =
  | "governance"
  | "support"
  | "academic"
  | "administrative"
  | "business_development";

export interface OrgUnit {
  id: string;
  name: string;
  parentId: string | null;
  category: OrgUnitCategory;
}

export const orgUnits: OrgUnit[] = [
  // ===== الحوكمة =====
  { id: "board-of-trustees", name: "مجلس الأمناء", parentId: null, category: "governance" },
  { id: "advisory-council", name: "المجلس الاستشاري", parentId: "board-of-trustees", category: "governance" },
  { id: "bot-secretariat", name: "أمانة مجلس الأمناء", parentId: "board-of-trustees", category: "governance" },
  { id: "audit-committee", name: "لجنة المراجعة", parentId: "board-of-trustees", category: "governance" },

  { id: "university-council", name: "مجلس الجامعة", parentId: "board-of-trustees", category: "governance" },
  { id: "university-council-secretariat", name: "أمانة مجلس الجامعة", parentId: "university-council", category: "governance" },
  { id: "grc-office", name: "مكتب الحوكمة وإدارة المخاطر والالتزام", parentId: "university-council", category: "support" },
  { id: "legal-affairs", name: "إدارة الشؤون القانونية", parentId: "university-council", category: "support" },
  { id: "internal-audit", name: "إدارة المراجعة الداخلية", parentId: "university-council", category: "support" },

  { id: "president", name: "رئيس الجامعة", parentId: "university-council", category: "governance" },
  { id: "strategy-office", name: "مكتب إدارة الاستراتيجية", parentId: "president", category: "support" },
  { id: "institutional-excellence", name: "إدارة التميز المؤسسي", parentId: "president", category: "support" },
  { id: "institutional-communication", name: "إدارة الاتصال المؤسسي", parentId: "president", category: "support" },
  { id: "community-responsibility", name: "إدارة المسؤولية المجتمعية", parentId: "president", category: "support" },
  { id: "president-office", name: "مكتب الرئيس", parentId: "president", category: "support" },
  { id: "ethics-conduct-unit", name: "وحدة التوعية والسلوك المهني", parentId: "president", category: "support" },

  // ===== الأكاديمي =====
  { id: "deans-of-colleges", name: "عمداء الكليات", parentId: "president", category: "academic" },
  { id: "college-medicine", name: "كلية الطب", parentId: "deans-of-colleges", category: "academic" },
  { id: "college-nursing", name: "كلية التمريض", parentId: "deans-of-colleges", category: "academic" },
  { id: "college-health-sciences", name: "كلية العلوم الصحية", parentId: "deans-of-colleges", category: "academic" },
  { id: "college-business", name: "كلية الأعمال", parentId: "deans-of-colleges", category: "academic" },
  { id: "scientific-council", name: "المجلس العلمي", parentId: "president", category: "academic" },
  { id: "vp-academic-affairs", name: "نائب الرئيس للشؤون الأكاديمية", parentId: "president", category: "academic" },

  { id: "avp-student-experience", name: "النائب المساعد لتجربة الطالب", parentId: "vp-academic-affairs", category: "academic" },
  { id: "admissions-office", name: "مكتب القبول", parentId: "avp-student-experience", category: "academic" },
  { id: "scholarships-financial-solutions", name: "مكتب المنح والحلول المالية", parentId: "avp-student-experience", category: "academic" },
  { id: "registration-advising", name: "مكتب التسجيل والإرشاد الأكاديمي", parentId: "avp-student-experience", category: "academic" },
  { id: "university-life", name: "إدارة الحياة الجامعية", parentId: "avp-student-experience", category: "academic" },
  { id: "alumni-care", name: "مكتب رعاية الخريجين", parentId: "avp-student-experience", category: "academic" },

  { id: "avp-academic-excellence", name: "النائب المساعد للتميز الأكاديمي", parentId: "vp-academic-affairs", category: "academic" },
  { id: "teaching-learning-center", name: "مركز التعليم والتعلم", parentId: "avp-academic-excellence", category: "academic" },
  { id: "assessment-measurement-center", name: "مركز التقييم والقياس", parentId: "avp-academic-excellence", category: "academic" },
  { id: "educational-equipment", name: "إدارة التجهيزات التعليمية", parentId: "avp-academic-excellence", category: "academic" },
  { id: "academic-accreditation-office", name: "مكتب الاعتماد الأكاديمي", parentId: "avp-academic-excellence", category: "academic" },

  { id: "avp-graduate-research", name: "النائب المساعد للدراسات العليا والبحث العلمي", parentId: "vp-academic-affairs", category: "academic" },
  { id: "graduate-studies-office", name: "مكتب الدراسات العليا", parentId: "avp-graduate-research", category: "academic" },
  { id: "scientific-research-office", name: "مكتب البحث العلمي", parentId: "avp-graduate-research", category: "academic" },

  // ===== إداري =====
  { id: "women-section-supervisor", name: "المشرفة على القسم النسائي", parentId: "president", category: "administrative" },

  { id: "exec-it-communications", name: "الإدارة التنفيذية للاتصالات وتقنية المعلومات", parentId: "president", category: "administrative" },
  { id: "cybersecurity", name: "إدارة الأمن السيبراني", parentId: "exec-it-communications", category: "administrative" },
  { id: "digital-transformation", name: "إدارة التحول الرقمي", parentId: "exec-it-communications", category: "administrative" },
  { id: "it-department", name: "إدارة تقنية المعلومات", parentId: "exec-it-communications", category: "administrative" },
  { id: "data-management-office", name: "مكتب إدارة البيانات", parentId: "exec-it-communications", category: "administrative" },

  { id: "exec-shared-services", name: "الإدارة التنفيذية للخدمات المشتركة", parentId: "president", category: "administrative" },
  { id: "financial-affairs", name: "إدارة الشؤون المالية", parentId: "exec-shared-services", category: "administrative" },
  { id: "human-capital", name: "إدارة رأس المال البشري", parentId: "exec-shared-services", category: "administrative" },
  { id: "facilities", name: "إدارة المرافق", parentId: "exec-shared-services", category: "administrative" },
  { id: "engineering-dept", name: "الإدارة الهندسية", parentId: "exec-shared-services", category: "administrative" },
  { id: "procurement", name: "إدارة المشتريات", parentId: "exec-shared-services", category: "administrative" },
  { id: "warehouses", name: "إدارة المستودعات", parentId: "exec-shared-services", category: "administrative" },

  // ===== تطوير الأعمال =====
  { id: "exec-business-development", name: "الإدارة التنفيذية لتطوير الأعمال", parentId: "president", category: "business_development" },
  { id: "training-consulting", name: "إدارة التدريب والاستشارات", parentId: "exec-business-development", category: "business_development" },
  { id: "training-dept", name: "إدارة التدريب", parentId: "training-consulting", category: "business_development" },
  { id: "consulting-center", name: "مركز الاستشارات", parentId: "training-consulting", category: "business_development" },
  { id: "partnerships", name: "إدارة الشراكات", parentId: "exec-business-development", category: "business_development" },
  { id: "products-services-development", name: "إدارة تطوير المنتجات والخدمات", parentId: "exec-business-development", category: "business_development" },
  { id: "innovation-entrepreneurship-center", name: "مركز الابتكار وريادة الأعمال", parentId: "products-services-development", category: "business_development" },
  { id: "content-management-center", name: "مركز إدارة المحتوى", parentId: "products-services-development", category: "business_development" },
];

export interface OrgUnitNode extends OrgUnit {
  children: OrgUnitNode[];
}

export function buildOrgTree(): OrgUnitNode[] {
  const nodes = new Map<string, OrgUnitNode>(
    orgUnits.map((u) => [u.id, { ...u, children: [] }])
  );
  const roots: OrgUnitNode[] = [];

  for (const unit of orgUnits) {
    const node = nodes.get(unit.id)!;
    if (unit.parentId) {
      nodes.get(unit.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export function getOrgUnitById(id: string): OrgUnit | undefined {
  return orgUnits.find((u) => u.id === id);
}

export function getOrgUnitChildren(id: string): OrgUnit[] {
  return orgUnits.filter((u) => u.parentId === id);
}
