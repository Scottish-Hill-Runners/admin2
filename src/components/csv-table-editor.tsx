"use client";

import { useState } from "react";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

export function parseCsv(text: string): string[][] | null {
  try {
    const rows: string[][] = parse(text.replace(/^\uFEFF/, ""), {
      relax_column_count: true,
      skip_empty_lines: false,
    });
    return rows.length ? rows : null;
  } catch {
    return null;
  }
}

export function CsvTableEditor({
  id,
  name,
  defaultValue,
  onChange,
}: {
  id: string;
  name: string;
  defaultValue: string;
  onChange: (value: string) => void;
}) {
  // Caller must confirm parseCsv(defaultValue) succeeds before rendering this component.
  const [rows, setRows] = useState<string[][]>(() => parseCsv(defaultValue) ?? [[""]]);

  function updateCell(rowIndex: number, columnIndex: number, value: string) {
    setRows((previous) => {
      const next = previous.map((row) => row.slice());
      next[rowIndex][columnIndex] = value;
      onChange(stringify(next, { record_delimiter: "\n" }));
      return next;
    });
  }

  const csv = stringify(rows, { record_delimiter: "\n" });

  return (
    <>
      <div className="mt-3 max-h-96 overflow-auto border border-[var(--line)] bg-white">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className={rowIndex === 0 ? "bg-[var(--paper)] font-bold" : undefined}>
                {row.map((cell, columnIndex) => (
                  <td key={columnIndex} className="border border-[var(--line)] p-0">
                    <input
                      className="w-full min-w-24 border-0 bg-transparent px-2 py-1 font-mono text-sm focus:bg-yellow-50 focus:outline-none"
                      value={cell}
                      onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <input type="hidden" id={id} name={name} value={csv} />
    </>
  );
}
