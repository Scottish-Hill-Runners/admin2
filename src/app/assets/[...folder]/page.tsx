import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-session";
import { readCache } from "@/lib/asset-cache";
import { env } from "@/lib/env";
import Image from "next/image";

export default async function AssetFolderPage({
  params,
}: {
  params: Promise<{ folder: string[] }>;
}) {
  await requireAdmin();
  const { folder: segments } = await params;
  const folder = segments.join("/");

  let cache: Awaited<ReturnType<typeof readCache>> | undefined;
  try {
    cache = await readCache(folder);
  } catch (error) {
    console.error(`Failed to read asset cache for ${folder}`, error);
  }

  if (!cache) notFound();

  return (
    <main className="min-h-screen px-6 py-8 md:px-16">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
        Assets
      </p>
      <h1 className="mt-3 text-5xl">{folder}</h1>
      <p className="mt-6">
        Last refreshed {new Date(cache.generatedAt).toLocaleString()}.
      </p>
      <div className="mt-8 grid gap-3 md:grid-cols-2">
        {cache.assets.map((asset) => (
          <div className="border border-[var(--line)] p-4" key={asset.public_id}>
            {env.CLOUDINARY_CLOUD_NAME && asset?.resource_type == "image" && (
              <Image
                src={`https://res.cloudinary.com/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/image/upload/f_auto,q_auto,c_fill,g_auto,w_640/${asset.public_id}.${asset.format}`}
                alt={asset.title ?? asset.public_id}
                className="mt-2"
              />
            )}
            <p className="font-bold">{asset.public_id}</p>
            <p className="text-sm">{asset.format}</p>
            {asset.title && <p className="mt-2">{asset.title}</p>}
            {asset.description && <p className="text-sm">{asset.description}</p>}
            {asset.tags && asset.tags.length > 0 && (
              <p className="mt-2 text-xs">{asset.tags.join(", ")}</p>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
