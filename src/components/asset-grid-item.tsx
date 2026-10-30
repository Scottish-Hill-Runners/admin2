import Image from "next/image";
import { ManagedAssetCard } from "@/components/managed-asset-card";
import { thumbnailUrl } from "@/lib/asset-thumbnail";
import type { AssetEntry } from "@/lib/cloudinary";

// A compact thumbnail tile that expands into the full ManagedAssetCard when clicked.
// Uses a native <details> so no client-side state is needed; `open:col-span-full`
// makes the expanded card break out of the grid to full width.
export function AssetGridItem({
  asset,
  folder,
  cloudName,
}: {
  asset: AssetEntry;
  folder: string;
  cloudName?: string;
}) {
  const thumbnail = cloudName ? thumbnailUrl(cloudName, asset) : undefined;
  return (
    <details className="group border border-[var(--line)] open:col-span-full">
      <summary className="cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="relative aspect-square w-full overflow-hidden bg-[var(--line)]/20">
          {thumbnail ? (
            <Image
              src={thumbnail}
              alt={asset.title ?? asset.public_id}
              fill
              sizes="(min-width: 768px) 20vw, 33vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm uppercase">
              {asset.format}
            </div>
          )}
          <span
            className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-[var(--ink)] text-sm font-bold text-white transition-transform duration-200 group-open:rotate-45"
            aria-hidden
          >
            +
          </span>
        </div>
        <p className="truncate border-t border-[var(--line)] p-2 text-sm font-bold">
          {asset.title ?? asset.public_id}
        </p>
      </summary>
      <div className="border-t border-[var(--line)] p-4">
        <ManagedAssetCard asset={asset} folder={folder} cloudName={cloudName} bare />
      </div>
    </details>
  );
}
