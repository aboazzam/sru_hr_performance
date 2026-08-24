import { describe, expect, it } from "vitest";
import { applyMapping, parseImportOptions, updatesExisting, writesField } from "./excelImportOptions";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe("parseImportOptions", () => {
  it("defaults to add-only, the safer of the two", () => {
    const options = parseImportOptions(new FormData());
    expect(options.mode).toBe("insert_only");
    expect(updatesExisting(options)).toBe(false);
  });

  it("keeps every field writable when the caller said nothing", () => {
    const options = parseImportOptions(new FormData());
    expect(options.fields).toBeNull();
    expect(writesField(options, "anything")).toBe(true);
  });

  it("reads the chosen mode and field list", () => {
    const options = parseImportOptions(form({ importMode: "upsert", importFields: '["status","mobile"]' }));
    expect(updatesExisting(options)).toBe(true);
    expect(writesField(options, "status")).toBe(true);
    expect(writesField(options, "email")).toBe(false);
  });

  it("falls back to add-only on an unknown mode rather than guessing", () => {
    expect(parseImportOptions(form({ importMode: "delete_everything" })).mode).toBe("insert_only");
  });

  it("treats a malformed mapping as no mapping instead of failing the import", () => {
    const options = parseImportOptions(form({ importMapping: "{not json" }));
    expect(options.mapping.size).toBe(0);
  });

  it("drops columns the caller left on ignore", () => {
    const options = parseImportOptions(form({ importMapping: '{"العمود أ":"status","العمود ب":""}' }));
    expect(options.mapping.get("العمود أ")).toBe("status");
    expect(options.mapping.has("العمود ب")).toBe(false);
  });
});

describe("applyMapping", () => {
  const labels = { status: "الحالة", mobile: "الجوال" };

  it("leaves the file untouched when nothing was remapped", () => {
    const headers = new Map([["الحالة", 1]]);
    const result = applyMapping(headers, parseImportOptions(new FormData()), labels);
    expect([...result]).toEqual([["الحالة", 1]]);
  });

  it("renames a mapped column to the label the importer expects", () => {
    const headers = new Map([["Status", 3]]);
    const options = parseImportOptions(form({ importMapping: '{"Status":"status"}' }));
    expect([...applyMapping(headers, options, labels)]).toEqual([["الحالة", 3]]);
  });

  it("drops a column mapped to ignore", () => {
    const headers = new Map([
      ["Status", 1],
      ["Junk", 2],
    ]);
    const options = parseImportOptions(form({ importMapping: '{"Status":"status","Junk":""}' }));
    const result = applyMapping(headers, options, labels);
    expect(result.has("الحالة")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("keeps a column the dialog never mentioned, so a correct file needs no mapping", () => {
    const headers = new Map([
      ["Status", 1],
      ["الجوال", 2],
    ]);
    const options = parseImportOptions(form({ importMapping: '{"Status":"status"}' }));
    const result = applyMapping(headers, options, labels);
    expect(result.get("الحالة")).toBe(1);
    expect(result.get("الجوال")).toBe(2);
  });

  it("lets the first of two columns aimed at one field win, silently replacing nothing", () => {
    const headers = new Map([
      ["A", 1],
      ["B", 2],
    ]);
    const options = parseImportOptions(form({ importMapping: '{"A":"status","B":"status"}' }));
    expect([...applyMapping(headers, options, labels)]).toEqual([["الحالة", 1]]);
  });

  it("ignores a mapping that names a field the importer does not have", () => {
    const headers = new Map([["A", 1]]);
    const options = parseImportOptions(form({ importMapping: '{"A":"not_a_field"}' }));
    expect(applyMapping(headers, options, labels).size).toBe(0);
  });
});
