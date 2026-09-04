import { del, get, list, put } from "@vercel/blob";
import { env } from "@/lib/env";
import {
  listAssetsInFolder,
  listFoldersWithAssets,
  type AssetEntry,
} from "@/lib/cloudinary";

type FoldersCache = {
  generatedAt: string;
  folders: string[];
};

type AssetCache = {
  generatedAt: string;
  assets: AssetEntry[];
};

export async function refreshFolders(): Promise<FoldersCache> {
  const folders = await listFoldersWithAssets().catch((error) => {
    console.error("Failed to list folders with assets:", error);
    return [];
  });

  const cache = { generatedAt: new Date().toISOString(), folders };
  await put("/", JSON.stringify(cache), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: env.BLOB_READ_WRITE_TOKEN,
  });
  return cache;
}

export async function readFoldersCache(): Promise<FoldersCache> {
  const blob = await get("/", {
    access: "private",
    token: env.BLOB_READ_WRITE_TOKEN,
    useCache: false,
  });
  if (!blob) {
    console.info(`Folders cache was not found; refreshing it`);
    return refreshFolders();
  }
  if (!blob.stream)
    throw new Error("Folders cache returned no content");
  const cache = await new Response(blob.stream).json() as FoldersCache;
  return cache;
}

export async function refreshCache(folder: string): Promise<AssetCache> {
  console.info(
    `Refreshing asset cache for ${folder}`, {
    hasBlobToken: Boolean(env.BLOB_READ_WRITE_TOKEN),
    hasCloudinaryCloudName: Boolean(env.CLOUDINARY_CLOUD_NAME),
    hasCloudinaryApiKey: Boolean(env.CLOUDINARY_API_KEY),
    hasCloudinaryApiSecret: Boolean(env.CLOUDINARY_API_SECRET),
  });
  const assets = await listAssetsInFolder(folder);
  const cache = { generatedAt: new Date().toISOString(), assets };
  await put(folder, JSON.stringify(cache), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: env.BLOB_READ_WRITE_TOKEN,
  });
  return cache;
}

export async function readCache(folder: string): Promise<AssetCache> {
  const blob = await get(folder, {
    access: "private",
    token: env.BLOB_READ_WRITE_TOKEN,
    useCache: false,
  });
  if (!blob) {
    console.info(`Asset cache for ${folder} was not found; refreshing it`);
    return refreshCache(folder);
  }
  if (!blob.stream)
    throw new Error("Asset cache returned no content");
  return new Response(blob.stream).json() as Promise<AssetCache>;
}

export async function flushCache(cachePath: string) {
  console.info(`Flushing asset cache at ${cachePath}`);
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
