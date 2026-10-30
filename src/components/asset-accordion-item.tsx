import { ManagedAssetCard } from "@/components/managed-asset-card";
import type { AssetEntry } from "@/lib/cloudinary";

// Native <details>/<summary> gives us expand/collapse without extra client-side state.
export function AssetAccordionItem({
  asset,
  folder,
  cloudName,
}: {
  asset: AssetEntry;
  folder: string;
  cloudName?: string;
}) {
  return (
    <details className="group border border-[var(--line)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block truncate font-bold">{asset.title ?? asset.public_id}</span>
          {asset.description && (
            <span className="mt-1 block truncate text-sm">{asset.description}</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-3 text-sm">
          <span className="uppercase tracking-wide">{asset.format}</span>
          <span className="transition-transform duration-200 group-open:rotate-180" aria-hidden>
            ▾
          </span>
        </span>
      </summary>
      <div className="border-t border-[var(--line)] p-4">
        <ManagedAssetCard asset={asset} folder={folder} cloudName={cloudName} bare />
      </div>
    </details>
  );
}
