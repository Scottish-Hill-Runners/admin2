import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import {
  applyMinorEdit,
  classifyEmail,
  extractSections,
  mergeCalendar,
  mergeMarkdown,
  validateContentPath,
} from "@/lib/email-parse";

describe("email parsing", () => {
  it("extracts sections and removes alternating blank lines", () => {
    expect(
      extractSections("intro\n!-- start\nFile: x\n\nValue: y\n\n!-- end"),
    ).toEqual([["File: x", "Value: y"]]);
  });

  it("validates allowed paths", () => {
    expect(validateContentPath("races/BenLomond/1996.csv")).toEqual({
      kind: "csv",
    });
    expect(validateContentPath("news/2026/2026-08-22-1.md")).toEqual({
      kind: "markdown",
    });
    expect(validateContentPath("clubs/a.csv")).toHaveProperty("error");
    expect(validateContentPath("../calendar.csv")).toHaveProperty("error");
  });

  it("merges markdown fields and replaces body when supplied", () => {
    const result = mergeMarkdown("---\ntitle: Old\nkeep: yes\n---\nOld body", [
      "File: info/Test.md",
      "---",
      "title: New",
      "---",
      "New body",
    ]);
    expect(matter(result).data).toMatchObject({ title: "New", keep: "yes" });
    expect(matter(result).content).toContain("New body");
    expect(matter(result).content).not.toContain("Old body");
  });

  it("patches a split-name row without changing other columns", () => {
    const csv =
      "Pos,Firstname,Surname,Cat,Time,Leg\n26,Nialcoim,Finbow,MV,1:00,1\n";
    const result = applyMinorEdit(csv, {
      position: "26",
      name: "Nialcoim Finbow",
      "change name to": "Malcolm Finbow",
    });
    expect(result).toContain("26,Malcolm,Finbow,MV,1:00,1");
  });

  it("deduplicates and sorts calendar entries", () => {
    expect(
      mergeCalendar("2026-08-20,Later\n", [
        "2026-08-20,Later",
        "2026-08-15,Earlier",
      ]),
    ).toBe("2026-08-15,Earlier\n2026-08-20,Later\n");
  });

  it("classifies update sections", () => {
    expect(
      classifyEmail(
        "!-- start\nFile: calendar.csv\n2026-08-15,Oldhamstocks\n!-- end",
      )[0].kind,
    ).toBe("calendar");
    expect(
      classifyEmail(
        "!-- start\nFolder: races/BenLomond\nTitle: Summit\n!-- end",
      )[0].kind,
    ).toBe("blob-upload");
  });

  it("captures inline CSV results embedded in the body as a csv-file update", () => {
    const [update] = classifyEmail(
      "!-- start\nFile: races/BenLomond/2026.csv\n\nPosition,Name,Club,Category,Time\n1,Runner,Club,M40,0:45:00\n!-- end",
    );
    expect(update.kind).toBe("csv-file");
    expect(update.body).toBe(
      "Position,Name,Club,Category,Time\n1,Runner,Club,M40,0:45:00",
    );
  });

  it("returns every recognised section, e.g. a results file paired with a news post", () => {
    const updates = classifyEmail(
      "!-- start\nFile: races/BenLomond/2026.csv\n\nPosition,Name,Club,Category,Time\n1,Runner,Club,M40,0:45:00\n!-- end\n\n!-- start\nFile: news/2026/2026-08-22-1.md\n---\ntitle: Ben Lomond Race 2026 results\n---\nGreat racing.\n!-- end",
    );
    expect(updates).toHaveLength(2);
    expect(updates.map((update) => update.kind)).toEqual([
      "csv-file",
      "markdown",
    ]);
    expect(updates.map((update) => update.path)).toEqual([
      "races/BenLomond/2026.csv",
      "news/2026/2026-08-22-1.md",
    ]);
  });
});
