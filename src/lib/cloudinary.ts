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
  secure_url: string;
  resource_type: string;
  title?: string;
  description?: string;
  tags: string[];
  etag: string;
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

export async function listFoldersWithAssets() {
  const result = await configured().api.root_folders();
  return result.folders
    .filter((folder: { name: string }) => folder.name)
    .map((folder: { name: string }) => folder.name);
}

export async function listAssetsInFolder(
  folder: string,
): Promise<AssetEntry[]> {
  const result = await configured().api.resources({
    type: "upload",
    prefix: `${folder}/`,
    max_results: 500,
    context: true,
    tags: true,
  });
  return result.resources.map(
    (asset: {
      secure_url: string;
      resource_type: string;
      context?: { custom?: Record<string, string> };
      tags?: string[];
      etag: string;
    }) => ({
      secure_url: asset.secure_url,
      resource_type: asset.resource_type,
      title: asset.context?.custom?.title,
      description: asset.context?.custom?.description,
      tags: asset.tags ?? [],
      etag: asset.etag,
    }),
  );
}
