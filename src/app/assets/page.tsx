import { requireAdmin } from "@/lib/auth-session";
import { readFoldersCache } from "@/lib/asset-cache";

export default async function AssetsPage() {
  await requireAdmin();
  let cache: Awaited<ReturnType<typeof readFoldersCache>> | undefined;
  try {
    cache = await readFoldersCache();
  } catch (error) {
    console.error("Failed to read folders cache", error);
  }

  if (!cache)
    return (
      <main className="p-8">
        <h1 className="text-4xl">Assets are not available</h1>
        <p className="mt-4">Asset storage is not configured yet.</p>
      </main>);
  return (
      <main className="min-h-screen px-6 py-8 md:px-16">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--accent)]">Assets</p>
        <h1 className="mt-3 text-5xl">Asset list</h1>
        <p className="mt-6">Last refreshed {new Date(cache.generatedAt).toLocaleString()}.</p>
        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {cache.folders.map((folder) => (
            <div className="border border-[var(--line)] p-4" key={folder}>
              <p className="font-bold">{folder}</p>
            </div>
          ))}
        </div>
      </main>
    );
}
