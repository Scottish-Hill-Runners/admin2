"use client";

import { useMemo } from "react";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  headingsPlugin,
  InsertTable,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  MDXEditor,
  markdownShortcutPlugin,
  quotePlugin,
  Separator,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
} from "@mdxeditor/editor";

function isSafeEditorUrl(value: string): boolean {
  const url = value.trim();
  if (!url) return false;
  // Block script-like URLs but allow standard markdown link targets.
  return !/^(javascript|vbscript|data):/i.test(url);
}

export function MdxEditorClient({
  markdown,
  onChange,
  placeholder,
}: {
  markdown: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const plugins = useMemo(
    () => [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      tablePlugin(),
      linkPlugin({ validateUrl: isSafeEditorUrl }),
      linkDialogPlugin(),
      markdownShortcutPlugin(),
      toolbarPlugin({
        toolbarContents: () => (
          <>
            <UndoRedo />
            <Separator />
            <BlockTypeSelect />
            <Separator />
            <BoldItalicUnderlineToggles />
            <Separator />
            <ListsToggle options={["bullet", "number"]} />
            <Separator />
            <InsertTable />
            <Separator />
            <CreateLink />
          </>
        ),
      }),
    ],
    [],
  );

  return (
    <MDXEditor
      markdown={markdown}
      onChange={onChange}
      placeholder={placeholder}
      className="border border-[var(--line)] bg-white"
      contentEditableClassName="min-h-72 px-3 py-2 text-sm"
      plugins={plugins}
      onError={(error) => {
        console.error("MDX Editor Error:", JSON.stringify(error));
      }}
    />
  );
}
