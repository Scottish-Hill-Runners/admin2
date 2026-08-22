import matter from "gray-matter";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

export type UpdateKind =
  | "markdown"
  | "csv-file"
  | "csv-minor-edit"
  | "calendar"
  | "blob-upload"
  | "unrecognised";
export type EmailUpdate = {
  kind: UpdateKind;
  path?: string;
  frontmatter?: Record<string, unknown>;
  body?: string;
  values?: Record<string, string>;
  lines?: string[];
  reason?: string;
};

const sectionMarker = /^\s*!--/;

export function extractSections(body: string): string[][] {
  const sections: string[][] = [];
  let current: string[] | undefined;
  for (const line of body.replace(/\r\n?/g, "\n").split("\n")) {
    if (sectionMarker.test(line)) {
      if (current) {
        sections.push(cleanSection(current));
        current = undefined;
      } else {
        current = [];
      }
    } else if (current) {
      current.push(line);
    }
  }
  if (current) sections.push(cleanSection(current));
  return sections;
}

function cleanSection(lines: string[]): string[] {
  const blanks = lines.filter((line) => line.trim() === "").length;
  return blanks >= lines.length / 2
    ? lines.filter((line) => line.trim() !== "")
    : lines;
}

export function parseKeyValues(lines: string[]): Record<string, string> {
  return Object.fromEntries(
    lines.flatMap((line) => {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      return match ? [[match[1].trim().toLowerCase(), match[2].trim()]] : [];
    }),
  );
}

export function validateContentPath(
  path: string,
): { kind: "markdown" | "csv" | "geojson" | "calendar" } | { error: string } {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("..") ||
    path.includes("\\")
  )
    return { error: "Invalid content path" };
  if (path === "calendar.csv") return { kind: "calendar" };
  let match = path.match(
    /^races\/([-\w]+)\/(index\.md|\d{4}(?:-\w+)?\*?\.csv|[-\w]+\.geojson)$/,
  );
  if (match)
    return {
      kind: match[2].endsWith(".md")
        ? "markdown"
        : match[2].endsWith(".geojson")
          ? "geojson"
          : "csv",
    };
  match = path.match(
    /^(championships|clubs|info|long-distance)\/([-\w]+\.md)$/,
  );
  if (match) return { kind: "markdown" };
  match = path.match(/^news\/\d{4}\/\d{4}-\d{2}-\d{2}(?:-\d+)?\.md$/);
  if (match) return { kind: "markdown" };
  return { error: "Path is not an allowed content file" };
}

export function mergeMarkdown(
  existing: string | null,
  sectionLines: string[],
): string {
  const fileLine = sectionLines.findIndex((line) => /^File:\s*/i.test(line));
  const payload = sectionLines.slice(fileLine + 1);
  const existingParsed = existing
    ? matter(existing)
    : { data: {}, content: "" };
  let incomingData: Record<string, unknown> = {};
  let bodyLines = payload;
  const start = payload.findIndex((line) => line.trim() === "---");
  if (start >= 0) {
    const end = payload.findIndex(
      (line, index) => index > start && line.trim() === "---",
    );
    if (end < 0) throw new Error("The saved fields block is not closed");
    incomingData = matter(
      `---\n${payload.slice(start + 1, end).join("\n")}\n---\n`,
    ).data;
    bodyLines = payload.slice(end + 1);
  }
  const hasBody = bodyLines.some((line) => line.trim() !== "");
  return matter.stringify(
    hasBody ? bodyLines.join("\n").trim() : existingParsed.content.trim(),
    { ...existingParsed.data, ...incomingData },
  );
}

const aliases = {
  position: ["position", "runnerposition", "finishposition", "pos"],
  category: ["category", "runnercategory", "cat"],
  club: ["club"],
  name: ["name"],
  first: ["firstname", "first name"],
  surname: ["surname"],
  time: ["time"],
};

function columnIndex(headers: string[], names: string[]): number {
  return headers.findIndex((header) =>
    names.includes(header.trim().toLowerCase()),
  );
}

export function applyMinorEdit(
  csvText: string,
  values: Record<string, string>,
): string {
  const rows: string[][] = parse(csvText.replace(/^\uFEFF/, ""), {
    relax_column_count: true,
    skip_empty_lines: false,
  });
  if (rows.length < 2) throw new Error("The results file has no data rows");
  const headers = rows[0];
  const positionIndex = columnIndex(headers, aliases.position);
  const nameIndex = columnIndex(headers, aliases.name);
  const firstIndex = columnIndex(headers, aliases.first);
  const surnameIndex = columnIndex(headers, aliases.surname);
  if (positionIndex < 0) throw new Error("No Position column found");
  if (nameIndex < 0 && (firstIndex < 0 || surnameIndex < 0))
    throw new Error("No Name column found");
  const matches = rows
    .slice(1)
    .map((row, index) => ({ row, index: index + 1 }))
    .filter(({ row }) => row[positionIndex] === values.position);
  if (!matches.length) throw new Error("No row matches that position");
  const expectedName = values.name?.trim().toLowerCase();
  const named = expectedName
    ? matches.filter(
        ({ row }) =>
          (nameIndex >= 0
            ? row[nameIndex]
            : `${row[firstIndex]} ${row[surnameIndex]}`
          )
            .trim()
            .toLowerCase() === expectedName,
      )
    : [];
  const selected =
    matches.length === 1
      ? matches[0]
      : named.length === 1
        ? named[0]
        : undefined;
  if (!selected)
    throw new Error(
      "The position matches multiple rows; provide the matching name",
    );
  const row = [...selected.row];
  if (values["change position to"] || values["change time to"])
    throw new Error("Position and Time cannot be changed");
  if (values["change name to"]) {
    if (nameIndex >= 0) row[nameIndex] = values["change name to"];
    else {
      const split = values["change name to"].trim().split(/\s+/);
      row[firstIndex] = split.shift() ?? "";
      row[surnameIndex] = split.join(" ");
    }
  }
  for (const [key, aliasesForKey] of [
    ["change club to", aliases.club],
    ["change category to", aliases.category],
  ] as const) {
    if (values[key]) {
      const index = columnIndex(headers, aliasesForKey);
      if (index < 0)
        throw new Error(
          `No ${key.replace("change ", "").replace(" to", "")} column found`,
        );
      row[index] = values[key];
    }
  }
  rows[selected.index] = row;
  const lineEnding = csvText.includes("\r\n") ? "\r\n" : "\n";
  return stringify(rows, { record_delimiter: lineEnding });
}

export function mergeCalendar(existing: string, incoming: string[]): string {
  const lines = existing
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line, index, all) => !(index === all.length - 1 && line === ""));
  const additions = incoming.filter(
    (line) => /^\d{4}-\d{2}-\d{2},[-\w]*$/.test(line) && !lines.includes(line),
  );
  return (
    [...lines, ...additions]
      .sort((a, b) => {
        const aDate = a.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "9999-99-99";
        const bDate = b.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "9999-99-99";
        return aDate.localeCompare(bDate);
      })
      .join("\n") + "\n"
  );
}

export function classifySection(lines: string[]): EmailUpdate {
  const values = parseKeyValues(lines);
  const path = values.file;
  if (values.folder) return { kind: "blob-upload", values };
  if (!path)
    return { kind: "unrecognised", reason: "No file or folder was specified" };
  const valid = validateContentPath(path);
  if ("error" in valid)
    return { kind: "unrecognised", path, reason: valid.error };
  if (path === "calendar.csv")
    return {
      kind: "calendar",
      path,
      lines: lines.filter((line) => /^\d{4}-\d{2}-\d{2},[-\w]*$/.test(line)),
    };
  if (path.endsWith(".md"))
    return { kind: "markdown", path, body: lines.slice(1).join("\n") };
  if (
    values["change name to"] ||
    values["change club to"] ||
    values["change category to"]
  )
    return { kind: "csv-minor-edit", path, values };
  return { kind: "csv-file", path, values };
}

export function classifyEmail(body: string): EmailUpdate {
  const section = extractSections(body)
    .map(classifySection)
    .find((item) => item.kind !== "unrecognised");
  return (
    section ?? {
      kind: "unrecognised",
      reason: "No recognised update section found",
    }
  );
}
