import { diffLines } from "diff";

export function LineDiff({ before, after }: { before: string; after: string }) {
  const parts = diffLines(before, after);
  return <pre className="mt-8 max-h-[32rem] overflow-auto whitespace-pre-wrap border border-[var(--line)] bg-white/50 p-5 font-mono text-sm">{parts.map((part, index) => <span className={part.added ? "bg-green-200" : part.removed ? "bg-red-200" : ""} key={`${index}-${part.value}`}>{part.value}</span>)}</pre>;
}
