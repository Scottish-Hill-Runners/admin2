import type { AssetEntry } from "@/lib/cloudinary";

// Pure URL builder — kept out of cloudinary.ts (which pulls in the Node-only
// Cloudinary SDK) so it can be safely imported from both server and client
// components.
// Cloudinary renders a PDF's first page as a JPG via the pg_1 transform; other images use their own format.
export function thumbnailUrl(cloudName: string, asset: AssetEntry) {
  if (asset.resource_type !== "image") return undefined;
  if (asset.format === "pdf")
    return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/image/upload/pg_1,f_auto,q_auto,c_fill,g_auto,w_640/${asset.public_id}.jpg`;
  return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/image/upload/f_auto,q_auto,c_fill,g_auto,w_640/${asset.public_id}.${asset.format}`;
}
