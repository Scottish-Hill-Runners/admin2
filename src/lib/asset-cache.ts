import { del, list, put } from "@vercel/blob";
import { env } from "@/lib/env";
import {
  listAssetsInFolder,
  listFoldersWithAssets,
  type AssetEntry,
} from "@/lib/cloudinary";

type AssetCache = {
  generatedAt: string;
  folders: Record<string, AssetEntry[]>;
};
const cachePath = "asset-cache.json";
export async function refreshCache(): Promise<AssetCache> {
  const names = await listFoldersWithAssets();
  const folders: Record<string, AssetEntry[]> = {};
  for (const name of names) folders[name] = await listAssetsInFolder(name);
  const cache = { generatedAt: new Date().toISOString(), folders };
  await put(cachePath, JSON.stringify(cache), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: env.BLOB_READ_WRITE_TOKEN,
  });
  return cache;
}
export async function readCache(): Promise<AssetCache> {
  if (!env.BLOB_READ_WRITE_TOKEN)
    throw new Error("Asset cache is not configured");
  const blobs = await list({
    prefix: cachePath,
    token: env.BLOB_READ_WRITE_TOKEN,
  });
  const blob = blobs.blobs[0];
  if (!blob) return refreshCache();
  const response = await fetch(blob.url, { cache: "no-store" });
  if (!response.ok) return refreshCache();
  return response.json() as Promise<AssetCache>;
}
export async function flushCache() {
  const blobs = await list({
    prefix: cachePath,
    token: env.BLOB_READ_WRITE_TOKEN,
  });
  await Promise.all(
    blobs.blobs.map((blob) =>
      del(blob.url, { token: env.BLOB_READ_WRITE_TOKEN }),
    ),
  );
}
