import { del, get, list, put } from "@vercel/blob";
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
  console.info("Refreshing asset cache", {
    hasBlobToken: Boolean(env.BLOB_READ_WRITE_TOKEN),
    hasCloudinaryCloudName: Boolean(env.CLOUDINARY_CLOUD_NAME),
    hasCloudinaryApiKey: Boolean(env.CLOUDINARY_API_KEY),
    hasCloudinaryApiSecret: Boolean(env.CLOUDINARY_API_SECRET),
  });
  const names = await listFoldersWithAssets();
  console.info("Fetched asset folders from Cloudinary", { count: names.length });
  const folders: Record<string, AssetEntry[]> = {};
  for (const name of names) folders[name] = await listAssetsInFolder(name);
  const cache = { generatedAt: new Date().toISOString(), folders };
  await put(cachePath, JSON.stringify(cache), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: env.BLOB_READ_WRITE_TOKEN,
  });
  return cache;
}

export async function readCache(): Promise<AssetCache> {
  if (!env.BLOB_READ_WRITE_TOKEN)
    throw new Error("Asset cache is not configured");
  console.info("Reading asset cache from Blob");
  const blob = await get(cachePath, {
    access: "private",
    token: env.BLOB_READ_WRITE_TOKEN,
    useCache: false,
  });
  if (!blob) {
    console.info("Asset cache was not found; refreshing it");
    return refreshCache();
  }
  if (blob.statusCode === 304 || !blob.stream)
    throw new Error("Asset cache returned no content");
  return new Response(blob.stream).json() as Promise<AssetCache>;
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
