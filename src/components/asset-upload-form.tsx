"use client";

import { useActionState, useEffect, useRef } from "react";
import { uploadManagedAsset, type ManagedAssetActionState } from "@/lib/managed-assets";

const initialState: ManagedAssetActionState = { status: "idle" };

export function AssetUploadForm({ folder }: { folder: string }) {
  const [state, action, pending] = useActionState(uploadManagedAsset, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="grid gap-3 border border-[var(--line)] bg-white/60 p-5 md:grid-cols-2"
    >
      <input type="hidden" name="folder" value={folder} />
      <label className="grid gap-1 md:col-span-2">
        <span className="font-bold">File</span>
        <input className="border border-[var(--line)] bg-white p-2" type="file" name="file" required />
      </label>
      <label className="grid gap-1">
        <span className="font-bold">Title</span>
        <input className="border border-[var(--line)] bg-white p-2" type="text" name="title" required />
      </label>
      <label className="grid gap-1">
        <span className="font-bold">Tags</span>
        <input
          className="border border-[var(--line)] bg-white p-2"
          type="text"
          name="tags"
          placeholder="comma, separated, tags"
        />
      </label>
      <label className="grid gap-1 md:col-span-2">
        <span className="font-bold">Description</span>
        <textarea className="border border-[var(--line)] bg-white p-2" name="description" />
      </label>
      <button
        className="justify-self-start border-2 border-[var(--ink)] bg-[var(--accent)] px-5 py-3 font-bold md:col-span-2"
        disabled={pending}
        type="submit"
      >
        {pending ? "Uploading..." : "Upload"}
      </button>
      {state.message && <p className="text-sm md:col-span-2">{state.message}</p>}
    </form>
  );
}
