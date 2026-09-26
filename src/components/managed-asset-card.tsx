"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import {
  deleteManagedAsset,
  updateManagedAssetMetadata,
  type ManagedAssetActionState,
} from "@/lib/managed-assets";
import type { AssetEntry } from "@/lib/cloudinary";

const initialState: ManagedAssetActionState = { status: "idle" };

export function ManagedAssetCard({
  asset,
  folder,
  cloudName,
}: {
  asset: AssetEntry;
  folder: string;
  cloudName?: string;
}) {
  const [editState, editAction, editing] = useActionState(
    updateManagedAssetMetadata,
    initialState,
  );
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteManagedAsset,
    initialState,
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="border border-[var(--line)] p-4">
      {cloudName && asset.resource_type === "image" && (
        <Image
          src={`https://res.cloudinary.com/${encodeURIComponent(cloudName)}/image/upload/f_auto,q_auto,c_fill,g_auto,w_640/${asset.public_id}.${asset.format}`}
          alt={asset.title ?? asset.public_id}
          width={640}
          height={480}
          className="mt-2"
        />
      )}
      <p className="mt-2 font-bold">{asset.public_id}</p>
      <p className="text-sm">{asset.format}</p>

      <form action={editAction} className="mt-3 grid gap-2">
        <input type="hidden" name="folder" value={folder} />
        <input type="hidden" name="publicId" value={asset.public_id} />
        <input type="hidden" name="resourceType" value={asset.resource_type} />
        <label className="grid gap-1">
          <span className="text-sm font-bold">Title</span>
          <input
            className="border border-[var(--line)] bg-white p-2"
            type="text"
            name="title"
            defaultValue={asset.title}
            required
          />
        </label>
        <label className="grid gap-1">
          <span className="text-sm font-bold">Description</span>
          <textarea
            className="border border-[var(--line)] bg-white p-2"
            name="description"
            defaultValue={asset.description}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-sm font-bold">Tags</span>
          <input
            className="border border-[var(--line)] bg-white p-2"
            type="text"
            name="tags"
            defaultValue={asset.tags?.join(", ")}
          />
        </label>
        <button
          className="justify-self-start border border-[var(--ink)] px-4 py-2 font-bold"
          disabled={editing}
          type="submit"
        >
          {editing ? "Saving..." : "Save changes"}
        </button>
        {editState.message && <p className="text-sm">{editState.message}</p>}
      </form>

      <form action={deleteAction} className="mt-3">
        <input type="hidden" name="folder" value={folder} />
        <input type="hidden" name="publicId" value={asset.public_id} />
        <input type="hidden" name="resourceType" value={asset.resource_type} />
        {confirmingDelete ? (
          <div className="flex gap-2">
            <button
              className="border-2 border-[var(--ink)] bg-[var(--accent)] px-4 py-2 font-bold"
              disabled={deleting}
              type="submit"
            >
              {deleting ? "Deleting..." : "Confirm delete"}
            </button>
            <button
              className="border border-[var(--ink)] px-4 py-2"
              type="button"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="border border-[var(--ink)] px-4 py-2"
            type="button"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete
          </button>
        )}
        {deleteState.message && <p className="mt-2 text-sm">{deleteState.message}</p>}
      </form>
    </div>
  );
}
