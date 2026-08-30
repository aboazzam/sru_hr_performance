"use client";

import { useTranslations } from "next-intl";
import type { OrgUnitClassification } from "@/lib/orgUnitTypes";

export interface OrgUnitFormValue {
  nameAr: string;
  nameEn: string;
  unitCode: string;
  kindId: string;
  typeId: string;
  levelId: string;
  parentId: string;
}

/**
 * The fields of one organisational unit, shared by the "add" dialog and the
 * "edit" dialog.
 *
 * Shared rather than written twice on purpose: until 2026-08-30 editing was an
 * inline row of bare inputs while adding was a proper dialog, so the two
 * offered different fields and looked nothing alike — and a field added to one
 * was easy to forget in the other. Asked for directly: "اريد تحرير الادارة
 * يكون نافذة منبثقة كتلك التي تفتح وحدة جديدة".
 */
export function OrgUnitFormFields({
  idPrefix,
  value,
  onChange,
  kinds,
  types,
  levels,
  parentOptions,
  /** Editing a unit may clear its parent only if it is already the root. */
  allowNoParent,
}: {
  idPrefix: string;
  value: OrgUnitFormValue;
  onChange: (next: OrgUnitFormValue) => void;
  kinds: OrgUnitClassification[];
  types: OrgUnitClassification[];
  levels: Array<{ id: string; nameAr: string }>;
  parentOptions: Array<{ id: string; nameAr: string }>;
  allowNoParent: boolean;
}) {
  const t = useTranslations("OrgUnitsPage");
  const set = (patch: Partial<OrgUnitFormValue>) => onChange({ ...value, ...patch });

  return (
    <>
      <div className="sru-formgrid">
        <div className="sru-field">
          <label htmlFor={`${idPrefix}-nameAr`}>{t("fieldNameAr")}</label>
          <input
            id={`${idPrefix}-nameAr`}
            value={value.nameAr}
            required
            onChange={(e) => set({ nameAr: e.target.value })}
          />
        </div>
        <div className="sru-field">
          <label htmlFor={`${idPrefix}-nameEn`}>{t("fieldNameEn")}</label>
          <input
            id={`${idPrefix}-nameEn`}
            value={value.nameEn}
            dir="ltr"
            onChange={(e) => set({ nameEn: e.target.value })}
          />
        </div>
        <div className="sru-field">
          <label htmlFor={`${idPrefix}-code`}>{t("fieldCode")}</label>
          <input
            id={`${idPrefix}-code`}
            value={value.unitCode}
            dir="ltr"
            required
            onChange={(e) => set({ unitCode: e.target.value })}
          />
        </div>
        <div className="sru-field">
          <label htmlFor={`${idPrefix}-kind`}>{t("fieldKind")}</label>
          <select id={`${idPrefix}-kind`} value={value.kindId} onChange={(e) => set({ kindId: e.target.value })}>
            {kinds.map((kind) => (
              <option key={kind.id} value={kind.id}>
                {kind.nameAr}
              </option>
            ))}
          </select>
        </div>
        <div className="sru-field">
          <label htmlFor={`${idPrefix}-type`}>{t("fieldType")}</label>
          {/* Optional, and empty on every existing unit: no source records
              which unit belongs to which system, so the blank is honest. */}
          <select id={`${idPrefix}-type`} value={value.typeId} onChange={(e) => set({ typeId: e.target.value })}>
            <option value="">{t("typeNone")}</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.nameAr}
              </option>
            ))}
          </select>
        </div>
        <div className="sru-field">
          <label htmlFor={`${idPrefix}-level`}>{t("fieldLevel")}</label>
          {/* The same levels the org chart uses, not a second list: a unit and
              its position in the chart have to mean the same thing by
              "level". Optional, and empty on every unit today because the
              existing levels are rank tiers, not tree depth, so nothing can
              derive it. */}
          <select id={`${idPrefix}-level`} value={value.levelId} onChange={(e) => set({ levelId: e.target.value })}>
            <option value="">{t("levelNone")}</option>
            {levels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.nameAr}
              </option>
            ))}
          </select>
        </div>
        <div className="sru-field">
          <label htmlFor={`${idPrefix}-parent`}>{t("fieldParent")}</label>
          <select id={`${idPrefix}-parent`} value={value.parentId} onChange={(e) => set({ parentId: e.target.value })}>
            {/* org_units_single_root allows exactly one rootless unit and the
                university already has it, so "no parent" is offered only to
                the unit that is already the root. */}
            <option value="">{allowNoParent ? t("parentNone") : t("parentPlaceholder")}</option>
            {parentOptions.map((row) => (
              <option key={row.id} value={row.id}>
                {row.nameAr}
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}
