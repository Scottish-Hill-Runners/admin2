/**
 * Inverse of shr-web's `foldEmailBody()`. Rejoins physical lines that were
 * folded with a trailing `^` continuation marker (odd number of trailing
 * carets = marker; even, including zero, = genuine end of a logical line),
 * then un-escapes `^^` back to a literal `^`.
 *
 * Must run before any line-oriented parsing (e.g. `extractSections`) so
 * mail-client re-wrapping at any width can't split a CSV row or markdown
 * paragraph mid-line.
 */
export function unfoldEmailBody(text: string): string {
  const physicalLines = text.replace(/\r\n?/g, "\n").split("\n");
  const logicalLines: string[] = [];
  let current = "";
  let pendingContinuation = false;

  for (const line of physicalLines) {
    current += line;
    if (trailingCaretCount(current) % 2 === 1) {
      current = current.slice(0, -1);
      pendingContinuation = true;
    } else {
      logicalLines.push(current);
      current = "";
      pendingContinuation = false;
    }
  }
  // Only true if the input ended mid-fold (malformed/truncated input).
  if (pendingContinuation) logicalLines.push(current);

  return logicalLines.join("\n").replace(/\^\^/g, "^");
}

function trailingCaretCount(text: string): number {
  let count = 0;
  for (let i = text.length - 1; i >= 0 && text[i] === "^"; i--) count++;
  return count;
}
