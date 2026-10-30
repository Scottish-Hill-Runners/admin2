// Folding section showing the email's raw plain-text/HTML bodies — useful as
// a fallback when the structured parser above can't make sense of an email.
export function RawEmailView({ text, html }: { text?: string; html?: string }) {
  if (!text && !html) return null;
  return (
    <details className="group mt-8 border border-[var(--line)]">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 font-bold uppercase tracking-[0.16em] marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-block transition-transform duration-200 group-open:rotate-90" aria-hidden>
          ▸
        </span>
        View raw email
      </summary>
      <div className="grid gap-6 border-t border-[var(--line)] p-4">
        {text && (
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em]">Plain text</p>
            <pre className="mt-2 max-h-[32rem] overflow-auto whitespace-pre-wrap border border-[var(--line)] bg-white/50 p-4 font-mono text-sm">
              {text}
            </pre>
          </div>
        )}
        {html && (
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em]">HTML source</p>
            <pre className="mt-2 max-h-[32rem] overflow-auto whitespace-pre-wrap border border-[var(--line)] bg-white/50 p-4 font-mono text-sm">
              {html}
            </pre>
          </div>
        )}
      </div>
    </details>
  );
}
