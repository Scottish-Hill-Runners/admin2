import { describe, expect, it } from "vitest";
import { classifyEmailBody, htmlToText } from "@/lib/email-parse";

describe("htmlToText", () => {
  it("turns <br> and block tags into newlines and strips markup", () => {
    const html =
      '<html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"></head><body dir="auto">To Bureau:<br><br>Line one.<br><br>!-- start<br>File: races/Glamaig/2026.csv<br>Position: 168<br>Name: David Oliver<br>Category: M60<br>Club: Deeside Runners<br>Change Category to: M65<br>!-- end<br><br><br></body></html>';
    expect(htmlToText(html)).toBe(
      "To Bureau:\n\nLine one.\n\n!-- start\nFile: races/Glamaig/2026.csv\nPosition: 168\nName: David Oliver\nCategory: M60\nClub: Deeside Runners\nChange Category to: M65\n!-- end",
    );
  });

  it("decodes HTML entities", () => {
    expect(htmlToText("Fish &amp; chips<br>&lt;tag&gt;")).toBe(
      "Fish & chips\n<tag>",
    );
  });
});

describe("classifyEmailBody", () => {
  it("uses the text body when it classifies successfully", () => {
    const updates = classifyEmailBody({
      text: "!-- start\nFile: calendar.csv\n2026-08-15,Oldhamstocks\n!-- end",
      html: "<p>irrelevant</p>",
    });
    expect(updates[0].kind).toBe("calendar");
  });

  it("falls back to html-to-text when the text body has lost its line breaks", () => {
    const html =
      '<html><body dir="auto">To Bureau of Performance Monitoring:<br><br>I believe the result below is incorrect and should be corrected as indicated.<br><br>!-- start<br>File: races/Glamaig/2026.csv<br>Position: 168<br>Name: David Oliver<br>Category: M60<br>Club: Deeside Runners<br>Change Category to: M65<br>!-- end<br><br><br></body></html>';
    // Simulates a client that strips newlines from the plain-text part.
    const brokenText = htmlToText(html).replace(/\n/g, "");
    const updates = classifyEmailBody({ text: brokenText, html });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      kind: "csv-minor-edit",
      path: "races/Glamaig/2026.csv",
      values: expect.objectContaining({
        position: "168",
        name: "David Oliver",
        "change category to": "M65",
      }),
    });
  });

  it("returns the text-based unrecognised result when html also fails", () => {
    const updates = classifyEmailBody({
      text: "no sections here",
      html: "<p>no sections here either</p>",
    });
    expect(updates).toEqual([
      { kind: "unrecognised", reason: "No recognised update section found" },
    ]);
  });

  it("returns unrecognised when there is no html to fall back to", () => {
    const updates = classifyEmailBody({ text: "no sections here" });
    expect(updates[0].kind).toBe("unrecognised");
  });
});
