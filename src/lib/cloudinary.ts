import { v2 as cloudinary } from "cloudinary";
import { env } from "@/lib/env";

function configured() {
  if (
    !env.CLOUDINARY_CLOUD_NAME ||
    !env.CLOUDINARY_API_KEY ||
    !env.CLOUDINARY_API_SECRET
  )
    throw new Error("Asset storage is not configured");
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  return cloudinary;
}

export type AssetEntry = {
  public_id: string;
  resource_type: string;
  format: string;
  title?: string;
  description?: string;
  tags?: string[];
  etag?: string;
};

export type FolderEntry = {
  path: string;
  count: number;
};

export function uploadAsset(
  buffer: Buffer,
  options: {
    folder: string;
    filename: string;
    title?: string;
    description?: string;
    tags?: string[];
    license?: string;
    individualPermission?: string;
  },
) {
  return new Promise<{ secure_url: string }>((resolve, reject) => {
    const context = Object.entries({
      title: options.title,
      description: options.description,
      license: options.license,
      individual_permission: options.individualPermission,
    })
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${value}`)
      .join("|");
    const stream = configured().uploader.upload_stream(
      {
        folder: options.folder,
        public_id: options.filename,
        tags: options.tags,
        use_filename: true,
        unique_filename: true,
        context,
      },
      (error, result) =>
        error
          ? reject(error)
          : result
            ? resolve({ secure_url: result.secure_url })
            : reject(new Error("Asset upload returned no result")),
    );
    stream.end(buffer);
  });
}

async function countAssetsInFolder(folder: string): Promise<number> {
  const result = await configured()
    .search
    .expression(`asset_folder="${folder}"`)
    .max_results(1)
    .execute();
  return result.total_count;
}

export async function listFoldersWithAssets(): Promise<FolderEntry[]> {
  const cld = configured();
  const folders: FolderEntry[] = [];
  // Cloudinary auto-deletes empty folders, so any folder returned here contains at least one asset (directly or in a subfolder)
  async function walk(parentPath?: string) {
    const result = parentPath
      ? await cld.api.sub_folders(parentPath)
      : await cld.api.root_folders();
    for (const folder of result.folders as { name: string; path?: string }[]) {
      if (!folder.name) continue;
      const path = folder.path ?? folder.name;
      folders.push({ path, count: await countAssetsInFolder(path) });
      await walk(path);
    }
  }

  await walk();
  return folders;
}

export async function listAssetsInFolder(
  folder: string,
): Promise<AssetEntry[]> {
  // asset_folder is metadata, not a public_id prefix, so resources() with `prefix` misses assets in dynamic folder mode
  const result = await configured().api.resources_by_asset_folder(folder, {
    max_results: 500,
    context: true,
    tags: true,
  });
  return result.resources.map(
    (asset: {
      public_id: string;
      resource_type: string;
      format: string;
      context?: { custom?: Record<string, string> };
      tags?: string[];
      etag?: string;
    }) => ({
      public_id: asset.public_id,
      resource_type: asset.resource_type,
      format: asset.format,
      title: asset.context?.custom?.title,
      description: asset.context?.custom?.description,
      tags: asset.tags && asset.tags.length > 0 ? asset.tags : undefined,
      etag: asset.etag,
    }),
  );
}
