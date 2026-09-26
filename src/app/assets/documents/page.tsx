import { requireAdmin } from "@/lib/auth-session";
import { readCache } from "@/lib/asset-cache";
import { env } from "@/lib/env";
import { AssetUploadForm } from "@/components/asset-upload-form";
import { ManagedAssetCard } from "@/components/managed-asset-card";

const FOLDER = "documents";

export default async function DocumentsPage() {
  await requireAdmin();
  let cache: Awaited<ReturnType<typeof readCache>> | undefined;
  try {
    cache = await readCache(FOLDER);
  } catch (error) {
    console.error("Failed to read documents cache", error);
  }

  if (!cache)
    return (
      <main className="p-8">
        <h1 className="text-4xl">Documents are not available</h1>
        <p className="mt-4">Asset storage is not configured yet.</p>
      </main>
    );

  return (
    <main className="min-h-screen px-6 py-8 md:px-16">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--accent)]">Assets</p>
      <h1 className="mt-3 text-5xl">Documents</h1>
      <p className="mt-6">Last refreshed {new Date(cache.generatedAt).toLocaleString()}.</p>

      <div className="mt-8">
        <AssetUploadForm folder={FOLDER} />
      </div>

      <div className="mt-8 grid gap-3 md:grid-cols-2">
        {cache.assets.map((asset) => (
          <ManagedAssetCard
            key={asset.public_id}
            asset={asset}
            folder={FOLDER}
            cloudName={env.CLOUDINARY_CLOUD_NAME}
          />
        ))}
      </div>
    </main>
  );
}
