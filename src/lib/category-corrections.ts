import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import type { Result } from "./category-report";

export type CategoryCorrection = { result: Result; category: string };

function column(headers: string[], names: string[]) {
  return headers.findIndex((value) => names.includes(value.trim().toLowerCase()));
}

function normalName(value: string) {
  return value.normalize("NFKC").replace(/[‘’`´]/g, "'").replace(/[–—]/g, "-")
    .replace(/^[\s\-?,.:;'"()]+/, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-GB");
}

export function resultPath(result: Result, year: string) {
  if (!/^\d{4}$/.test(year) || !/^[\w-]+$/.test(result.raceId) ||
      !new RegExp(`^${year}(?:-[\\w-]+)?\\*?$`).test(result.year))
    throw new Error("A result has an invalid source path.");
  return `races/${result.raceId}/${result.year}.csv`;
}

export function applyCategoryCorrections(csv: string, corrections: CategoryCorrection[]) {
  const bom = csv.startsWith("\uFEFF") ? "\uFEFF" : "";
  const source = Buffer.from(csv.slice(bom.length), "utf8");
  const offsets: number[] = [];
  const rows: string[][] = parse(source, {
    relax_column_count: true,
    on_record: (record, info) => {
      offsets.push(info.bytes);
      return record;
    },
  });
  if (rows.length < 2) throw new Error("The results file has no data rows.");
  let offset = 0;
  const rawRows = offsets.map((end) => {
    const raw = source.subarray(offset, end).toString("utf8");
    offset = end;
    return raw;
  });
  const headers = rows[0];
  const position = column(headers, ["position", "runnerposition", "finishposition", "pos"]);
  const category = column(headers, ["category", "runnercategory", "cat"]);
  const name = column(headers, ["name"]);
  const first = column(headers, ["firstname", "first name"]);
  const surname = column(headers, ["surname"]);
  if (position < 0 || category < 0 || (name < 0 && (first < 0 || surname < 0)))
    throw new Error("The results file is missing a position, name or category column.");
  const changed = new Set<number>();
  for (const correction of corrections) {
    const matches = rows.flatMap((row, index) => {
      if (!index || correction.result.position === null) return [];
      const sourceName = name >= 0 ? row[name] : `${row[first] ?? ""} ${row[surname] ?? ""}`;
      return Number.parseInt(row[position] ?? "", 10) === correction.result.position &&
        normalName(sourceName ?? "") === normalName(correction.result.name) &&
        (row[category] ?? "").trim().toUpperCase() === correction.result.category.trim().toUpperCase()
        ? [index] : [];
    });
    if (matches.length !== 1 || changed.has(matches[0]))
      throw new Error(`Could not uniquely match ${correction.result.name} in the current results. The source may have changed or the published name may have been normalised.`);
    changed.add(matches[0]);
    const raw = rawRows[matches[0]];
    let field = 0;
    let start = 0;
    let quoted = false;
    let end = raw.length;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === '"') {
        if (quoted && raw[i + 1] === '"') i++;
        else quoted = !quoted;
      } else if (!quoted && raw[i] === ",") {
        if (field === category) { end = i; break; }
        field++;
        start = i + 1;
      } else if (!quoted && (raw[i] === "\r" || raw[i] === "\n")) {
        end = i;
        break;
      }
    }
    if (field !== category) throw new Error("The category field is missing from the result row.");
    const original = raw.slice(start, end);
    const replacement = original.startsWith('"')
      ? `"${correction.category.replace(/"/g, '""')}"`
      : stringify([[correction.category]], { eof: false });
    rawRows[matches[0]] = raw.slice(0, start) + replacement + raw.slice(end);
  }
  return bom + rawRows.join("") + source.subarray(offset).toString("utf8");
}
