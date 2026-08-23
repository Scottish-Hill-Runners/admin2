import { env } from "@/lib/env";
import { createClient } from "@vercel/global-config";

export type EmailStatus =
  "pending" | "approved" | "declined" | "no-action" | "junk";

export type EmailStatusRecord = {
  status: EmailStatus;
  updatedAt: string;
  admin?: string;
};

function client() {
  if (!env.GLOBAL_CONFIG_ID || !env.GLOBAL_CONFIG_API_TOKEN)
    throw new Error("Status storage is not configured");
  return createClient(
    `edge-config:id=${env.GLOBAL_CONFIG_ID}&token=${env.GLOBAL_CONFIG_API_TOKEN}`,
  );
}

export async function getEmailStatuses() {
  const items = await client().getAll();
  return items as Record<string, EmailStatusRecord>;
}

export async function updateStatus(
  id: string,
  status: EmailStatus,
  admin: string) {
    await bulkUpdateStatuses([
      {
        operation: 'upsert',
        key: id,
        value: {
          status,
          updatedAt: new Date().toISOString(),
          admin,
        },
      },
    ]);
  }

async function bulkUpdateStatuses(items: { key: string; operation: string; value?: EmailStatusRecord }[]) {
  if (!env.GLOBAL_CONFIG_ID || !env.VERCEL_ACCESS_TOKEN)
    throw new Error("Status storage is not configured");
  const result = await fetch(
    `https://api.vercel.com/v1/global-config/${env.GLOBAL_CONFIG_ID}/items`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${env.VERCEL_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: items,
      }),
    },
  );
  if (!result.ok)
    throw new Error(`Failed to update status: ${result.statusText}`);
}

export async function backfillAndPrune(ids: string[]) {
  const updates: { key: string; operation: string; value?: EmailStatusRecord }[] = [];
  const statuses = await getEmailStatuses();
  const now = new Date().toISOString();
  for (const id of ids)
    if (!statuses[id]) {
      statuses[id] = { status: "pending", updatedAt: now };
      updates.push({
        operation: 'upsert',
        key: id,
        value: statuses[id],
      });
    }

  const valid = new Set(ids);
  for (const id of Object.keys(statuses))
    if (!valid.has(id)) {
      delete statuses[id];
      updates.push({ operation: 'delete', key: id });
    }

  if (updates.length > 0)
    await bulkUpdateStatuses(updates);
  return statuses;
}

