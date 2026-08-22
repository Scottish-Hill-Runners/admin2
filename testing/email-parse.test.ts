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
      ).kind,
    ).toBe("calendar");
    expect(
      classifyEmail(
        "!-- start\nFolder: races/BenLomond\nTitle: Summit\n!-- end",
      ).kind,
    ).toBe("blob-upload");
  });
});
