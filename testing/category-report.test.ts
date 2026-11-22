import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { loadCategoryReport, makeCategoryReport, type Result } from "@/lib/category-report";
import { applyCategoryCorrections, resultPath } from "@/lib/category-corrections";
import { CategoryReportForm } from "@/components/category-report-form";
import { parse } from "csv-parse/sync";

vi.mock("@/app/category-check/actions", () => ({ saveCategoryCorrections: vi.fn() }));

function result(raceId: string, category: string, extra: Partial<Result> = {}): Result {
  return { raceId, year: "2025", position: 1, name: "Alex Runner", club: "Hill Club", category, time: "1:00", ...extra };
}

describe("category report", () => {
  it("finds sex mismatches, including uncertain matches across clubs", () => {
    const report = makeCategoryReport([result("A", "M40"), result("B", "F40", { club: "Other" })], [], "2025");
    expect(report).toHaveLength(1);
    expect(report[0].rows[0].reasons).toContain("Different sex categories (different or missing clubs: possible name clash)");
  });

  it("does not compare same-name results in the same race file, even for the same club", () => {
    const calendar = [{ raceId: "A", Date: "2025-03-01" }];
    expect(makeCategoryReport([result("A", "M40"), result("A", "F40")], calendar, "2025")).toEqual([]);
    expect(makeCategoryReport([
      result("A", "M40"), result("A", "M60"), result("A", "M50", { name: "Other Runner" }),
    ], calendar, "2025")).toEqual([]);
    expect(makeCategoryReport([
      result("A", "M40"), result("A", "F40", { year: "2025-s" }),
    ], calendar, "2025")).toHaveLength(1);
  });

  it("still compares other races without using a same-race namesake as suggestion evidence", () => {
    const rows = [result("A", "F40"), result("A", "M40"), result("B", "M40")];
    const report = makeCategoryReport(rows, [], "2025")[0].rows;
    expect(report.map((row) => row.index)).toEqual([0, 1, 2]);
    expect(report[1].reasons).toEqual([]);
    expect(report[0].suggestion).toBeUndefined();
    expect(report[0].alternatives).toEqual(["F40", "M40"]);
    const distinctCategories = makeCategoryReport([
      result("A", "F40"), result("A", "M60"), result("B", "M40"),
    ], [], "2025")[0].rows;
    expect(distinctCategories.find((row) => row.index === 0)?.alternatives).toEqual(["F40", "M40"]);
  });

  it("does not count two namesakes in one race as two corroborating results", () => {
    const report = makeCategoryReport([
      result("A", "F40"), result("A", "M40", { name: "Other Runner" }),
      result("B", "M40"), result("B", "M40", { position: 2 }),
    ], [], "2025")[0].rows;
    expect(report.find((row) => row.index === 0)?.suggestion).toBeUndefined();
  });

  it("accepts a plausible birthday transition but reports reversed dates", () => {
    const calendar = [{ raceId: "A", Date: "2025-03-01" }, { raceId: "B", Date: "2025-08-01" }];
    const other = result("A", "M50", { name: "Another Runner" });
    expect(makeCategoryReport([result("A", "M40"), other, result("B", "M50")], calendar, "2025")).toEqual([]);
    const reversed = makeCategoryReport([result("A", "M50"), result("B", "M40"), result("B", "M50", { name: "Another Runner" })], calendar, "2025");
    expect(reversed[0].rows[0].reasons.some((reason) => reason.includes("backwards"))).toBe(true);
  });

  it("flags a large age gap when the lower race has a narrower band", () => {
    const report = makeCategoryReport([
      result("A", "M40"), result("A", "M50", { name: "Another Runner" }), result("B", "M60"),
    ], [], "2025");
    expect(report[0].rows[0].reasons[0]).toContain("more than one year apart");
  });

  it("accepts a lower category when the race does not have the runner's higher category", () => {
    const rows = [
      result("Older", "M65"),
      result("Broad", "M60"),
      result("Broad", "M70", { name: "Another Runner" }),
    ];
    const calendar = [{ raceId: "Older", Date: "2025-02-01" }, { raceId: "Broad", Date: "2025-09-01" }];
    expect(makeCategoryReport(rows, calendar, "2025")).toEqual([]);
    expect(makeCategoryReport(rows, [], "2025")).toEqual([]);
    expect(makeCategoryReport([result("A", "M40"), result("B", "M60")], [], "2025")).toEqual([]);
  });

  it("accepts a possible birthday when dates are unknown, but flags backwards dates", () => {
    const rows = [
      result("Older", "M65"),
      result("Narrow", "M60"),
      result("Narrow", "M65", { name: "Another Runner" }),
    ];
    expect(makeCategoryReport(rows, [], "2025")).toEqual([]);
    expect(makeCategoryReport(rows, [{ raceId: "Older", Date: "2025-02-01" }], "2025")).toEqual([]);
    const backwards = [{ raceId: "Older", Date: "2025-02-01" }, { raceId: "Narrow", Date: "2025-09-01" }];
    expect(makeCategoryReport(rows, backwards, "2025")[0].rows[0].reasons[0]).toContain("backwards");
    const birthday = [{ raceId: "Narrow", Date: "2025-02-01" }, { raceId: "Older", Date: "2025-09-01" }];
    expect(makeCategoryReport(rows, birthday, "2025")).toEqual([]);
  });

  it("uses observed race bands, not a five-year assumption", () => {
    const rows = [
      result("A", "F50"),
      result("A", "F60", { name: "Other Runner" }),
      result("B", "F55"),
    ];
    expect(makeCategoryReport(rows, [], "2025")).toEqual([]);
  });

  it("does not invent dates for races with several dates or result files", () => {
    const rows = [result("A", "M50"), result("B", "M40"), result("B", "M50", { name: "Other Runner" })];
    const calendar = [{ raceId: "A", Date: "2025-01-01" }, { raceId: "A", Date: "2025-02-01" }, { raceId: "B", Date: "2025-04-01" }];
    expect(makeCategoryReport(rows, calendar, "2025")).toEqual([]);
    const clearDates = [{ raceId: "A", Date: "2025-01-01" }, { raceId: "B", Date: "2025-04-01" }];
    expect(makeCategoryReport(rows, clearDates, "2025")[0].rows[0].reasons[0]).toContain("backwards");
    expect(makeCategoryReport([...rows, result("A", "M50", { year: "2025-s", name: "Third Runner" })],
      clearDates, "2025")).toEqual([]);
  });

  it("shows all results, including context, for an impossible undated age range", () => {
    const rows = [
      result("A", "M50"), result("A", "M60", { name: "Other Runner" }),
      result("B", "M70"), result("C", "M"), result("D", "M50"),
    ];
    const runner = makeCategoryReport(rows, [], "2025")[0];
    expect(runner.rows.map((row) => row.result.raceId)).toEqual(["A", "B", "C", "D"]);
    expect(runner.rows[0].reasons[0]).toContain("more than one year apart");
    expect(runner.rows[1].reasons[0]).toContain("more than one year apart");
    expect(runner.rows[2].reasons).toEqual([]);
    expect(runner.rows[3].reasons).toEqual([]);
    const html = renderToStaticMarkup(createElement(CategoryReportForm, {
      year: "2025", fingerprint: "test", runners: [runner],
    }));
    expect(html).toContain("Shown for context; no inconsistency detected for this result.");
    expect(html).toContain("Decision for C");
  });

  it("does not flag an undated M50 to M60 transition even when M60 is used in each race", () => {
    const rows = [
      result("A", "M50"), result("A", "M60", { name: "Other Runner" }),
      result("B", "M50"), result("B", "M60", { name: "Other Runner" }),
      result("C", "M60"),
    ];
    expect(makeCategoryReport(rows, [], "2025")).toEqual([]);
  });

  it("orders each runner's dated results chronologically, followed by undated results", () => {
    const rows = [
      result("Unknown1", "F40"),
      result("Late", "M40"),
      result("EarlyB", "M40"),
      result("EarlyA", "M40"),
      result("Ambiguous", "M40"),
      result("Unknown2", "M40"),
    ];
    const calendar = [
      { raceId: "Late", Date: "2025-09-01" },
      { raceId: "EarlyB", Date: "2025-02-01" },
      { raceId: "EarlyA", Date: "2025-02-01" },
      { raceId: "Ambiguous", Date: "2025-03-01" },
      { raceId: "Ambiguous", Date: "2025-04-01" },
    ];
    expect(makeCategoryReport(rows, calendar, "2025")[0].rows.map((row) => row.index))
      .toEqual([2, 3, 1, 0, 4, 5]);
  });

  it("uses unambiguous calendar names, then race metadata, then the race ID", () => {
    const rows = [
      result("NormansLaw", "M40"), result("BenNevis", "F40"),
      result("UnknownRace", "F40"), result("Ambiguous", "F40"),
    ];
    const calendar = [
      { raceId: "NormansLaw", raceName: "Normans Law", Date: "2025-03-28" },
      { raceId: "BenNevis", raceName: "Last year's name", Date: "2024-03-28" },
      { raceId: "Ambiguous", raceName: "First event", Date: "2025-04-01" },
      { raceId: "Ambiguous", raceName: "Second event", Date: "2025-05-01" },
    ];
    const names = new Map([
      ["NormansLaw", "Alternative Name"], ["BenNevis", "Ben Nevis Race"], ["Ambiguous", "Race Series"],
    ]);
    const report = makeCategoryReport(rows, calendar, "2025", names)[0].rows;
    expect(report.map((row) => [row.result.raceId, row.raceName])).toEqual([
      ["NormansLaw", "Normans Law"], ["BenNevis", "Ben Nevis Race"],
      ["UnknownRace", "UnknownRace"], ["Ambiguous", "Race Series"],
    ]);
  });

  it("loads race names from published metadata and warns if it is unavailable", async () => {
    const rows = [result("A", "M40"), result("B", "F40")];
    const mockedFetch = vi.fn(async (url: string) => {
      if (url.endsWith("/2025.json.gz")) return new Response(JSON.stringify(rows));
      if (url.endsWith("/calendar.json.gz")) return new Response(JSON.stringify([]));
      return new Response(JSON.stringify({ A: { title: "Race A" }, B: { title: "Race B" } }));
    });
    vi.stubGlobal("fetch", mockedFetch);
    try {
      const report = await loadCategoryReport("2025");
      expect(report.runners[0].rows.map((row) => row.raceName)).toEqual(["Race A", "Race B"]);
      mockedFetch.mockImplementation(async (url: string) => {
        if (url.endsWith("/2025.json.gz")) return new Response(JSON.stringify(rows));
        if (url.endsWith("/calendar.json.gz")) return new Response(JSON.stringify([]));
        return new Response("", { status: 503 });
      });
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const fallback = await loadCategoryReport("2025");
        expect(fallback.raceNamesWarning).toContain("Race names could not be loaded");
        expect(fallback.runners[0].rows.map((row) => row.raceName)).toEqual(["A", "B"]);
      } finally {
        log.mockRestore();
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("calculates PWT from the overall winner of each individual race file", () => {
    const rows = [
      result("A", "M40", { position: 2, time: "00:30:00" }),
      result("A", "F40", { position: 1, name: "Winner A", time: "00:20:00" }),
      result("A", "F40", { year: "2025-s", position: 3, time: "00:15:00" }),
      result("A", "M40", { year: "2025-s", position: 1, name: "Winner B", time: "00:12:00" }),
    ];
    const report = makeCategoryReport(rows, [], "2025");
    const alex = report.find((runner) => runner.name === "Alex Runner");
    expect(alex?.rows.map((row) => row.pwt)).toEqual([150, 125]);
  });

  it("displays race names and dates on the title line, race time and rounded PWT", () => {
    const runners = [{
      name: "Alex Runner",
      rows: [178.49, 178.5].map((pwt, index) => ({
        index, pwt, raceName: index === 0 ? "Normans Law" : "Ben Nevis Race",
        date: index === 0 ? "2025-03-28" : undefined,
        result: result(`Race${index}`, "M40", { time: index === 0 ? "01:23:45" : null, year: index === 0 ? "2025" : "2025-s" }), reasons: [],
        alternatives: ["M40"], raceCategories: ["M40"],
      })),
    }];
    const html = renderToStaticMarkup(createElement(CategoryReportForm, {
      year: "2025", fingerprint: "test", runners,
    }));
    expect(html).toContain("178%");
    expect(html).toContain("179%");
    const text = html.replace(/<[^>]*>/g, "");
    expect(text).toContain("Time 01:23:45");
    expect(text).toContain("Time unavailable");
    expect(text).toContain("Normans Law, 28 March");
    expect(text).toContain("Ben Nevis Race (s)");
    expect(text).not.toContain("Race0 2025");
    expect(text).toContain("Decision for Normans Law");
    expect(text).not.toContain("Usually M, F, A or NB");
    expect(html).toMatch(/<details name="category-runners"[^>]*><summary[^>]*><h2[^>]*>Alex Runner<\/h2><\/summary>/);
    expect(html).toMatch(/<time datetime="2025-03-28">28 March<\/time>/i);
  });

  it("handles winners, tied winners, missing times and ambiguous winner times", () => {
    const rows = [
      result("Winner", "M40", { position: 1, time: "01:00:00" }),
      result("Tied", "F40", { position: 2, time: "00:30:00" }),
      result("Tied", "M40", { position: 1, name: "Tied Winner 1", time: "00:20:00" }),
      result("Tied", "M40", { position: 1, name: "Tied Winner 2", time: "00:20:00" }),
      result("Missing", "F40", { position: 2, time: "00:30:00" }),
      result("Invalid", "F40", { position: 2, time: "n/a" }),
      result("Invalid", "M40", { position: 1, name: "Valid Winner", time: "00:20:00" }),
      result("Zero", "F40", { position: 2, time: "00:30:00" }),
      result("Zero", "M40", { position: 1, name: "Zero Winner", time: "00:00:00" }),
      result("Ambiguous", "F40", { position: 2, time: "00:30:00" }),
      result("Ambiguous", "M40", { position: 1, name: "Ambiguous Winner 1", time: "00:20:00" }),
      result("Ambiguous", "M40", { position: 1, name: "Ambiguous Winner 2", time: "00:21:00" }),
    ];
    const report = makeCategoryReport(rows, [], "2025");
    const alex = report.find((runner) => runner.name === "Alex Runner");
    expect(alex?.rows.map((row) => [row.result.raceId, row.pwt])).toEqual([
      ["Winner", 100], ["Tied", 150], ["Missing", undefined], ["Invalid", undefined],
      ["Zero", undefined], ["Ambiguous", undefined],
    ]);
  });

  it("reports impossible junior-to-veteran transitions and ignores open categories", () => {
    expect(makeCategoryReport([result("A", "FU20"), result("B", "F40")], [], "2025")).toHaveLength(1);
    expect(makeCategoryReport([result("A", "M"), result("B", "M60")], [], "2025")).toEqual([]);
  });

  it("recognises sex and numeric ages in legacy labels without guessing ages for unnumbered veterans", () => {
    expect(makeCategoryReport([result("A", "MV40"), result("B", "FV40")], [], "2025")).toHaveLength(1);
    expect(makeCategoryReport([result("A", "MV"), result("B", "M60")], [], "2025")).toEqual([]);
    expect(makeCategoryReport([result("A", "W40"), result("B", "M40")], [], "2025")).toHaveLength(1);
  });

  it("flags incompatible age bands on the same day", () => {
    const calendar = [{ raceId: "A", Date: "2025-03-01" }, { raceId: "B", Date: "2025-03-01" }];
    const rows = [result("A", "M40"), result("A", "M50", { name: "Other" }), result("B", "M50")];
    expect(makeCategoryReport(rows, calendar, "2025")[0].rows[0].reasons[0]).toContain("same day");
  });

  it("suggests the clear same-club consensus only when that category exists in the race", () => {
    const rows = [
      result("A", "F40"),
      result("A", "M40", { name: "Another Runner" }),
      result("B", "M40"),
      result("C", "M40"),
    ];
    const report = makeCategoryReport(rows, [], "2025");
    expect(report[0].rows.find((row) => row.result.raceId === "A")?.suggestion).toBe("M40");
    expect(report[0].rows.find((row) => row.result.raceId === "B")?.suggestion).toBeUndefined();
    expect(makeCategoryReport(rows.filter((row) => row.name !== "Another Runner"), [], "2025")[0].rows[0].suggestion).toBeUndefined();
    expect(makeCategoryReport(rows.map((row) => row.raceId === "C" ? { ...row, club: "Other" } : row), [], "2025")[0].rows[0].suggestion).toBeUndefined();
    expect(makeCategoryReport(rows.map((row) => ({ ...row, club: "" })), [], "2025")[0].rows[0].suggestion).toBeUndefined();
  });

  it("does not suggest a category when the same-club results are tied", () => {
    const rows = [
      result("A", "F40"), result("A", "M40", { name: "Another Runner" }),
      result("B", "F40"), result("C", "M40"), result("D", "M40"),
    ];
    expect(makeCategoryReport(rows, [], "2025")[0].rows.every((row) => !row.suggestion)).toBe(true);
  });

  it("does not count broad lower-band results as evidence against a higher category", () => {
    const rows = [
      result("Broad1", "M60"),
      result("Broad2", "M60"),
      result("Broad3", "M60"),
      result("Older1", "M65"),
      result("Older2", "M65"),
      result("Narrow", "M60"),
      result("Narrow", "M65", { name: "Another Runner" }),
    ];
    expect(makeCategoryReport(rows, [], "2025")).toEqual([]);
    const dated = makeCategoryReport(rows, [
      { raceId: "Older1", Date: "2025-01-01" },
      { raceId: "Older2", Date: "2025-02-01" },
      { raceId: "Narrow", Date: "2025-09-01" },
    ], "2025");
    expect(dated[0].rows.find((row) => row.result.raceId === "Older1")?.suggestion).toBeUndefined();
    expect(dated[0].rows.find((row) => row.result.raceId === "Narrow")?.suggestion).toBe("M65");
    expect(dated[0].rows.find((row) => row.result.raceId === "Broad1")?.reasons).toEqual([]);
    expect(dated[0].rows.find((row) => row.result.raceId === "Broad1")?.suggestion).toBeUndefined();
  });
});

describe("category corrections", () => {
  const csv = 'Pos,Firstname,Surname,Club,Cat,Time,Extra\r\n1,Alex,Runner,"Hill, Club",M40,1:00,keep\r\n';
  it("updates only the selected category and preserves CSV data", () => {
    const updated = applyCategoryCorrections(csv, [{ result: result("A", "M40"), category: "M50" }]);
    expect(parse(updated)).toEqual(parse(csv).map((row: string[], index: number) =>
      index ? row.map((field, col) => col === 4 ? "M50" : field) : row));
    expect(updated).toContain("\r\n");
    expect(updated).toBe(csv.replace(",M40,", ",M50,"));
  });

  it("preserves quoting, multiline fields, Unicode, blank lines and the final newline", () => {
    const source = '\uFEFFPos,Name,Cat,Note\n\n1,Alex Runner,"M40","café\nsecond line"\n';
    const updated = applyCategoryCorrections(source, [{ result: result("A", "M40"), category: "M50" }]);
    expect(updated).toBe(source.replace('"M40"', '"M50"'));
  });

  it("refuses changed or ambiguous source rows", () => {
    expect(() => applyCategoryCorrections(csv, [{ result: result("A", "M50"), category: "M40" }])).toThrow("Could not uniquely match");
    expect(() => applyCategoryCorrections(csv + '1,Alex,Runner,Other,M40,1:01,keep\r\n',
      [{ result: result("A", "M40"), category: "M50" }])).toThrow("Could not uniquely match");
  });

  it("validates source paths and supports suffixed results", () => {
    expect(resultPath(result("Ben-Ledi", "M", { year: "2025-s*" }), "2025")).toBe("races/Ben-Ledi/2025-s*.csv");
    expect(() => resultPath(result("../A", "M"), "2025")).toThrow("invalid source path");
    expect(() => resultPath(result("A", "M", { year: "2024" }), "2025")).toThrow("invalid source path");
  });
});
