"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-session";
import {
  uploadAsset,
  deleteAsset,
  updateAssetMetadata,
} from "@/lib/cloudinary";
import { refreshCache, refreshFolders } from "@/lib/asset-cache";

export type ManagedAssetActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const idle: ManagedAssetActionState = { status: "idle" };

function parseTags(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function revalidateFolder(folder: string) {
  revalidatePath(`/assets/${folder}`);
  revalidatePath("/assets");
}

export async function uploadManagedAsset(
  _previous: ManagedAssetActionState,
  formData: FormData,
): Promise<ManagedAssetActionState> {
  await requireAdmin();
  const folder = String(formData.get("folder") ?? "");
  const file = formData.get("file");
  const title = String(formData.get("title") ?? "").trim();
  if (!folder) return { status: "error", message: "Folder is required." };
  if (!(file instanceof File) || file.size === 0)
    return { status: "error", message: "A file is required." };
  if (!title) return { status: "error", message: "Title is required." };
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadAsset(buffer, {
      folder,
      filename: file.name,
      title,
      description: String(formData.get("description") ?? "").trim() || undefined,
      tags: parseTags(formData.get("tags")),
    });
    await Promise.all([refreshCache(folder), refreshFolders()]);
    revalidateFolder(folder);
  } catch (error) {
    console.error("Failed to upload asset", error);
    return { status: "error", message: "That upload could not be saved. Please try again." };
  }
  return { status: "success", message: "Uploaded." };
}

export async function deleteManagedAsset(
  _previous: ManagedAssetActionState,
  formData: FormData,
): Promise<ManagedAssetActionState> {
  await requireAdmin();
  const folder = String(formData.get("folder") ?? "");
  const publicId = String(formData.get("publicId") ?? "");
  const resourceType = String(formData.get("resourceType") ?? "");
  if (!folder || !publicId || !resourceType)
    return { status: "error", message: "Nothing to delete." };
  try {
    await deleteAsset(publicId, resourceType);
    await Promise.all([refreshCache(folder), refreshFolders()]);
    revalidateFolder(folder);
  } catch (error) {
    console.error("Failed to delete asset", error);
    return { status: "error", message: "That could not be deleted. Please try again." };
  }
  return { status: "success", message: "Deleted." };
}

export async function updateManagedAssetMetadata(
  _previous: ManagedAssetActionState,
  formData: FormData,
): Promise<ManagedAssetActionState> {
  await requireAdmin();
  const folder = String(formData.get("folder") ?? "");
  const publicId = String(formData.get("publicId") ?? "");
  const resourceType = String(formData.get("resourceType") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!folder || !publicId || !resourceType)
    return { status: "error", message: "Nothing to update." };
  if (!title) return { status: "error", message: "Title is required." };
  try {
    await updateAssetMetadata(publicId, resourceType, {
      title,
      description: String(formData.get("description") ?? "").trim() || undefined,
      tags: parseTags(formData.get("tags")),
    });
    await refreshCache(folder);
    revalidateFolder(folder);
  } catch (error) {
    console.error("Failed to update asset metadata", error);
    return { status: "error", message: "That could not be saved. Please try again." };
  }
  return { status: "success", message: "Saved." };
}

export { idle as idleManagedAssetActionState };
