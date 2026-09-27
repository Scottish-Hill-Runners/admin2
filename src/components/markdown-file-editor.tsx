"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const MdxEditorClient = dynamic(
  () => import("@/components/mdx-editor-client").then((mod) => mod.MdxEditorClient),
  {
    ssr: false,
    loading: () => (
      <div className="mt-3 flex min-h-72 items-center justify-center border border-[var(--line)] bg-white text-sm">
        Loading editor...
      </div>
    ),
  },
);

function splitFrontmatter(text: string): { frontmatter: string; body: string } {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { frontmatter: "", body: text };
  return { frontmatter: match[1], body: text.slice(match[0].length) };
}

export function MarkdownFileEditor({
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
  const [{ frontmatter, body }, setParts] = useState(() => splitFrontmatter(defaultValue));

  function update(next: { frontmatter: string; body: string }) {
    setParts(next);
    onChange(
      next.frontmatter
        ? `---\n${next.frontmatter.trim()}\n---\n\n${next.body.trim()}\n`
        : `${next.body.trim()}\n`,
    );
  }

  return (
    <>
      {frontmatter && (
        <div className="mt-3">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--ink)]/70">
            Saved fields
          </p>
          <textarea
            className="mt-1 min-h-20 w-full border border-[var(--line)] bg-white p-2 font-mono text-xs"
            value={frontmatter}
            onChange={(event) => update({ frontmatter: event.target.value, body })}
          />
        </div>
      )}
      <div className="mt-3">
        <MdxEditorClient
          markdown={body}
          onChange={(value) => update({ frontmatter, body: value })}
        />
      </div>
      <input type="hidden" id={id} name={name} value={
        frontmatter ? `---\n${frontmatter.trim()}\n---\n\n${body.trim()}\n` : `${body.trim()}\n`
      } />
    </>
  );
}
