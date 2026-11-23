"use client";

import { useActionState, useState } from "react";
import { saveCategoryCorrections, type CategoryActionState } from "@/app/category-check/actions";
import type { ReportRow, ReportRunner } from "@/lib/category-report";

const initialState: CategoryActionState = { status: "idle" };

function CategoryChoice({ row, raceLabel, disabled }: { row: ReportRow; raceLabel: string; disabled: boolean }) {
  const [choice, setChoice] = useState<"keep" | "suggestion" | "other">("keep");
  const [other, setOther] = useState("");
  const newCategory = other.trim().toUpperCase();
  const nonStandard = choice === "other" && Boolean(newCategory) &&
    !/^(?:M|F|A|NB)(?:\d{2})?$/.test(newCategory);
  const newToRace = choice === "other" && Boolean(newCategory) &&
    !row.raceCategories.includes(newCategory);
  const description = [
    nonStandard && `other-format-${row.index}`,
    newToRace && `other-new-${row.index}`,
  ].filter(Boolean).join(" ") || undefined;
  return (
    <fieldset disabled={disabled} className="min-w-0 text-sm">
      <legend className="font-bold">Decision for {raceLabel}</legend>
      <div className="mt-2 space-y-2">
        <label className="flex items-start gap-2">
          <input type="radio" name={`change-${row.index}`} value="keep" checked={choice === "keep"}
            onChange={() => setChoice("keep")} className="mt-1" />
          <span>Keep <strong>{row.result.category}</strong></span>
        </label>
        {row.suggestion ? (
          <label className="flex items-start gap-2">
            <input type="radio" name={`change-${row.index}`} value="suggestion" checked={choice === "suggestion"}
              onChange={() => setChoice("suggestion")} className="mt-1" />
            <span>Change to <strong>{row.suggestion}</strong> <span className="text-[var(--accent)]">(suggested)</span></span>
          </label>
        ) : (
          <p className="text-stone-600">No confident suggestion for this race.</p>
        )}
        <label className="flex items-start gap-2">
          <input type="radio" name={`change-${row.index}`} value="other" checked={choice === "other"}
            onChange={() => setChoice("other")} className="mt-1" />
          <span>Change to another category</span>
        </label>
        <div className="pl-5">
          <label htmlFor={`other-${row.index}`} className="block font-bold">Other category</label>
          <input id={`other-${row.index}`} name={`other-${row.index}`} value={other}
            onChange={(event) => setOther(event.target.value)} required={choice === "other"}
            disabled={choice !== "other"} aria-describedby={description}
            className="mt-1 block w-full border border-[var(--ink)] bg-white p-2 font-normal disabled:bg-stone-100 disabled:text-stone-500" />
          {nonStandard && (
            <p id={`other-format-${row.index}`} className="mt-1 font-bold text-amber-800">
              This is not a standard category. Usually M, F, A or NB, optionally followed by two digits.
              You can still save it.
            </p>
          )}
          {newToRace && (
            <p id={`other-new-${row.index}`} className="mt-1 font-bold text-amber-800">
              (Note: This category is not currently used in this race).
            </p>
          )}
        </div>
      </div>
    </fieldset>
  );
}

export function CategoryReportForm({ year, fingerprint, runners }: {
  year: string;
  fingerprint: string;
  runners: ReportRunner[];
}) {
  const [state, action, pending] = useActionState(saveCategoryCorrections, initialState);
  return (
    <form action={action} className="mt-8" onInvalid={(event) => {
      if (event.target instanceof HTMLElement &&
          event.target === event.currentTarget.querySelector("input:invalid, select:invalid, textarea:invalid")) {
        event.target.closest("details")?.setAttribute("open", "");
      }
    }}>
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="fingerprint" value={fingerprint} />
      <div className="flex flex-wrap items-end justify-between gap-4 border-y-2 border-[var(--ink)] py-4">
        <p><strong>{runners.length}</strong> {runners.length === 1 ? "name needs" : "names need"} review</p>
        <button type="submit" disabled={pending || state.status === "success" || runners.length === 0}
          className="border-2 border-[var(--ink)] bg-[var(--accent)] px-5 py-3 font-bold disabled:opacity-50">
          {pending ? "Saving..." : "Save selected changes"}
        </button>
      </div>
      <p role="status" aria-live="polite" className="mt-3 font-bold">{state.message}</p>
      <div className="space-y-3">
        {runners.map((runner) => (
          <details key={runner.name} name="category-runners" className="border border-[var(--line)] bg-white/40 p-5 md:p-6">
            <summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ink)]">
              <h2 className="inline text-2xl font-bold">{runner.name}</h2>
            </summary>
            <div className="mt-4 divide-y divide-[var(--line)]">
              {runner.rows.map((row) => {
                const observed = row.alternatives.filter((category) => category && category !== row.result.category);
                const event = row.result.year.slice(4).replace(/^-/, "");
                const raceLabel = `${row.raceName}${event ? ` (${event})` : ""}`;
                return (
                  <div key={row.index} className="grid gap-4 py-4 md:grid-cols-[minmax(0,1fr)_17rem]">
                    <div>
                      <p className="font-bold">
                        {raceLabel}{row.date && <>, <time dateTime={row.date}>{new Date(`${row.date}T00:00:00Z`).toLocaleDateString("en-GB", {
                          day: "numeric", month: "long", timeZone: "UTC",
                        })}</time></>}
                      </p>
                      <p className="mt-1">Current category: <strong>{row.result.category}</strong></p>
                      <p className="mt-1 text-sm">
                        <b>{row.result.club || "Club not recorded"}</b> · Position {row.result.position ?? "unknown"}
                        {" · Time "}{row.result.time?.trim() || "unavailable"}
                        {" · "}<abbr title="Percentage of the overall winner's time">PWT</abbr>{" "}
                        {row.pwt !== undefined ? `${Math.round(row.pwt)}%` : "unavailable"}
                      </p>
                      {observed.length > 0 && <p className="mt-2 text-sm">Other categories for this name: {observed.join(", ")}</p>}
                      {row.reasons.length > 0 ? (
                        <ul className="mt-2 text-sm text-red-800">
                          {row.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-stone-600">Shown for context; no inconsistency detected for this result.</p>
                      )}
                    </div>
                    <CategoryChoice row={row} raceLabel={raceLabel} disabled={state.status === "success" || pending} />
                  </div>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </form>
  );
}
