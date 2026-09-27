"use client";

import { useMemo, useState } from "react";
import { CsvTableEditor, parseCsv } from "@/components/csv-table-editor";
import { MarkdownFileEditor } from "@/components/markdown-file-editor";
import type { UpdateKind } from "@/lib/email-parse";

const csvKinds: UpdateKind[] = ["csv-file", "csv-minor-edit", "calendar"];

export function ContentEditor({
  id,
  name,
  kind,
  defaultValue,
  label,
}: {
  id: string;
  name: string;
  kind: UpdateKind;
  defaultValue: string;
  label: string;
}) {
  const csvParses = useMemo(() => parseCsv(defaultValue) !== null, [defaultValue]);
  const isCsv = csvKinds.includes(kind) && csvParses;
  const isMarkdown = kind === "markdown";
  const structured = isCsv || isMarkdown;
  const [mode, setMode] = useState<"structured" | "text">(structured ? "structured" : "text");
  const [value, setValue] = useState(defaultValue);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <label className="font-bold" htmlFor={id}>
          {label}
        </label>
        {structured && (
          <button
            type="button"
            className="text-xs underline"
            onClick={() => setMode((current) => (current === "structured" ? "text" : "structured"))}
          >
            {mode === "structured" ? "Switch to plain text" : `Use ${isCsv ? "table" : "rich text"} editor`}
          </button>
        )}
      </div>
      {mode === "text" ? (
        <textarea
          className="mt-3 min-h-72 w-full border border-[var(--line)] bg-white p-3 font-mono text-sm"
          id={id}
          name={name}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      ) : isCsv ? (
        <CsvTableEditor id={id} name={name} defaultValue={value} onChange={setValue} />
      ) : (
        <MarkdownFileEditor id={id} name={name} defaultValue={value} onChange={setValue} />
      )}
    </div>
  );
}
