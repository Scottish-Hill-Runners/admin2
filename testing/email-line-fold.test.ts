import { describe, expect, it } from "vitest";
import { unfoldEmailBody } from "@/lib/email-line-fold";

// Mirrors shr-web's src/lib/email-line-fold.ts foldEmailBody(); duplicated
// here since the two apps don't share a package.
function foldEmailBody(body: string, maxLineLength = 70): string {
  const escaped = body.replace(/\r\n?/g, "\n").replace(/\^/g, "^^");
  return escaped
    .split("\n")
    .map((line) => foldLine(line, maxLineLength))
    .join("\n");
}

function foldLine(line: string, maxLineLength: number): string {
  const chars = Array.from(line);
  if (chars.length <= maxLineLength) return line;

  const physicalLines: string[] = [];
  let rest = chars;
  while (rest.length > maxLineLength) {
    let cut = maxLineLength;
    if (trailingCaretCount(rest, cut) % 2 !== 0) cut -= 1;
    physicalLines.push(rest.slice(0, cut).join("") + "^");
    rest = rest.slice(cut);
  }
  physicalLines.push(rest.join(""));
  return physicalLines.join("\n");
}

function trailingCaretCount(chars: string[], upTo: number): number {
  let count = 0;
  for (let i = upTo - 1; i >= 0 && chars[i] === "^"; i--) count++;
  return count;
}

function randomString(length: number): string {
  const alphabet = "abcdefgh ^^^,.-\n😀é";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

describe("email line fold/unfold round-trip", () => {
  it("passes short lines through unchanged", () => {
    const body = "Position,Name,Club,Category,Time\n1,A,B,M,10:00";
    expect(foldEmailBody(body)).toBe(body);
    expect(unfoldEmailBody(foldEmailBody(body))).toBe(body);
  });

  it("folds a single long line and reconstructs it", () => {
    const longLine = "1," + "x".repeat(100) + ",Club,M,10:00";
    const folded = foldEmailBody(longLine, 20);
    expect(folded).not.toBe(longLine);
    expect(folded.split("\n").every((line) => Array.from(line).length <= 21)).toBe(true);
    expect(unfoldEmailBody(folded)).toBe(longLine);
  });

  it("folds a line requiring multiple continuations", () => {
    const longLine = "y".repeat(500);
    const folded = foldEmailBody(longLine, 30);
    expect(folded.split("\n").length).toBeGreaterThan(10);
    expect(unfoldEmailBody(folded)).toBe(longLine);
  });

  it("preserves a literal caret in the middle of a line", () => {
    const line = "before^after";
    expect(unfoldEmailBody(foldEmailBody(line))).toBe(line);
  });

  it("preserves a literal caret exactly at a natural fold boundary", () => {
    const line = "12345678901234567890^" + "b".repeat(30);
    const folded = foldEmailBody(line, 21);
    expect(unfoldEmailBody(folded)).toBe(line);
  });

  it("preserves a literal caret at the very end of a short line", () => {
    const line = "trailing caret^";
    expect(unfoldEmailBody(foldEmailBody(line))).toBe(line);
  });

  it("preserves multiple logical lines with mixed lengths", () => {
    const body = [
      "short line",
      "x".repeat(90),
      "another short line ^ with a caret",
      "y".repeat(150) + "^^ two literal carets",
    ].join("\n");
    expect(unfoldEmailBody(foldEmailBody(body, 40))).toBe(body);
  });

  it("normalizes CRLF line endings", () => {
    const body = "line one\r\nline two";
    expect(unfoldEmailBody(foldEmailBody(body))).toBe("line one\nline two");
  });

  it("never splits a multi-byte character mid-codepoint", () => {
    const line = "😀".repeat(50) + "é".repeat(50);
    const folded = foldEmailBody(line, 30);
    expect(unfoldEmailBody(folded)).toBe(line);
  });

  it("round-trips random fuzz input", () => {
    for (let i = 0; i < 200; i++) {
      const original = randomString(Math.floor(Math.random() * 300));
      const folded = foldEmailBody(original, 25);
      expect(unfoldEmailBody(folded)).toBe(original.replace(/\r\n?/g, "\n"));
    }
  });
});
