"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChartPie, ChartColumnBig, Table2 } from "lucide-react";
import {
  donutSlices,
  donutTotal,
  distributionShapes,
  type DistributionShape,
} from "@/lib/distributionChart";
import type { DistributionRow } from "@/lib/recruitmentPlanAnalytics";

/**
 * بطاقة توزيع واحدة: حلقة، أو أعمدة، أو الجدول الأصلي — وزرٌّ في البطاقة
 * نفسها ينتقل بينها.
 *
 * الحلقة هي الافتراضي بطلب مباشر («عدّل الشكل ليكون دائريًا»). والجدول لم
 * يُحذف بل صار أحد الأشكال: هو وحده يعرض التكلفة السنوية لكل مجموعة، وهي
 * معلومة لا تحملها حلقةٌ تقسّم الأعداد — فحذفه كان سيُفقد بيانات لا شكلًا.
 *
 * الاختيار لكل بطاقة على حدة، لا واحدًا للثلاث: «في نفس الكرت زر» — وقد
 * يريد القارئ حلقةً للوحدات التنظيمية وجدولًا للأرباع في آنٍ واحد.
 *
 * مرسومة بـ SVG يدويًا لا بمكتبة رسوم: نفس ما فعله `InitiativeProgressRing`
 * وللسبب نفسه — لا مكتبة رسوم مثبَّتة في هذا المشروع أصلًا (وثيقة المشروع
 * تذكر Recharts، لكن `package.json` لا يحوي شيئًا منها)، وجلبُ واحدة لأجل
 * قوسٍ هندسته أربعة أسطر ثمنٌ لا يقابله عائد.
 */
export function PlanDistributionCard({
  heading,
  rows,
  locale,
}: {
  heading: string;
  rows: DistributionRow[];
  /** يُمرَّر بدل دالة تنسيق: الدوال لا تعبر حدّ الخادم إلى العميل. */
  locale: string;
}) {
  const t = useTranslations("RecruitmentPlanPage");
  const [shape, setShape] = useState<DistributionShape>("donut");

  const formatNumber = (value: number) =>
    value.toLocaleString(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US");

  const slices = donutSlices(rows);
  const total = donutTotal(rows);

  const shapeIcons: Record<DistributionShape, React.ReactNode> = {
    donut: <ChartPie size={14} aria-hidden />,
    bar: <ChartColumnBig size={14} aria-hidden />,
    table: <Table2 size={14} aria-hidden />,
  };
  const shapeLabels: Record<DistributionShape, string> = {
    donut: t("shapeDonut"),
    bar: t("shapeBar"),
    table: t("shapeTable"),
  };

  // هندسة الحلقة: الشريحة قوسٌ على محيط دائرة، تُرسم بـ stroke-dasharray
  // (طول القوس ثم الباقي) مع إزاحة سالبة تضعها في موضعها. أبسط من مسارات
  // arc، ويتفادى الحالة الحدّية التي تجعل قوسًا كاملًا (١٠٠٪) يختفي.
  const size = 132;
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const maxHeadcount = Math.max(1, ...rows.map((r) => r.headcount));

  return (
    <div className="sru-card">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, flex: 1 }}>{heading}</h3>
        <div className="sru-shape-toggle" role="group" aria-label={t("changeShape")}>
          {distributionShapes.map((option) => (
            <button
              key={option}
              type="button"
              className={`sru-shape-btn${option === shape ? " is-active" : ""}`}
              aria-pressed={option === shape}
              title={shapeLabels[option]}
              aria-label={shapeLabels[option]}
              onClick={() => setShape(option)}
            >
              {shapeIcons[option]}
            </button>
          ))}
        </div>
      </div>

      {slices.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 12, margin: 0 }}>{t("distributionEmpty")}</p>
      ) : shape === "donut" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <svg
            width={size}
            height={size}
            role="img"
            aria-label={`${heading}: ${slices.map((s) => `${s.label} ${s.percent}%`).join("، ")}`}
            style={{ flexShrink: 0 }}
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--sru-border, #e5e7eb)"
              strokeWidth={strokeWidth}
            />
            {slices.map((slice) => (
              <circle
                key={slice.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${slice.fraction * circumference} ${circumference}`}
                strokeDashoffset={-slice.startFraction * circumference}
                /* تبدأ من الساعة ١٢ وتدور مع عقارب الساعة. */
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            ))}
            <text
              x="50%"
              y="46%"
              textAnchor="middle"
              dominantBaseline="central"
              style={{ fontSize: 22, fontWeight: 700, fill: "var(--sru-ink)" }}
            >
              {formatNumber(total)}
            </text>
            <text
              x="50%"
              y="62%"
              textAnchor="middle"
              dominantBaseline="central"
              style={{ fontSize: 10, fill: "var(--sru-muted)" }}
            >
              {t("distributionHeadcount")}
            </text>
          </svg>

          <ul style={{ listStyle: "none", margin: 0, padding: 0, flex: 1, minWidth: 130 }}>
            {slices.map((slice) => (
              <li
                key={slice.key}
                style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, padding: "3px 0" }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 10,
                    height: 10,
                    background: slice.color,
                    flexShrink: 0,
                    border: "1px solid rgba(0,0,0,0.06)",
                  }}
                />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {slice.label}
                </span>
                <span className="sru-en" style={{ color: "var(--sru-muted)" }}>
                  {formatNumber(slice.value)} · {slice.percent}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : shape === "bar" ? (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {slices.map((slice) => (
            <li key={slice.key} style={{ marginBottom: 9 }}>
              <div style={{ display: "flex", gap: 8, fontSize: 11.5, marginBottom: 3 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {slice.label}
                </span>
                <span className="sru-en" style={{ color: "var(--sru-muted)" }}>
                  {formatNumber(slice.value)} · {slice.percent}%
                </span>
              </div>
              {/* الطول نسبةً إلى أكبر مجموعة لا إلى المجموع: المقارنة هنا بين
                  المجموعات بعضها ببعض، والنسبة من الكل مكتوبة بجانبها. */}
              <div style={{ background: "var(--sru-border, #e5e7eb)", height: 8 }}>
                <div
                  style={{
                    width: `${(slice.value / maxHeadcount) * 100}%`,
                    height: "100%",
                    background: slice.color,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        /* الجدول أربعة أعمدة داخل بطاقة عرضها ٢٨٠ بكسل، فكان يُقتطع عند
           الحافة — وهو الاقتطاع الظاهر في الشكل الذي أُبلغ عنه. الالتفاف
           بتمرير أفقي يُبقي التكلفة السنوية قابلة للوصول بدل أن تختفي. */
        <div className="table-scroll">
          <table className="admin-matrix" style={{ fontSize: 11.5 }}>
            <thead>
              <tr>
                <th>{t("distributionGroup")}</th>
                <th>{t("distributionHeadcount")}</th>
                <th>{t("distributionShare")}</th>
                <th>{t("distributionAnnual")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td className="sru-en">{formatNumber(row.headcount)}</td>
                  <td className="sru-en">{Math.round(row.headcountPercentage)}%</td>
                  <td className="sru-en">{formatNumber(row.annualCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
