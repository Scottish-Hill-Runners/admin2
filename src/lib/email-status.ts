import { env } from "@/lib/env";

export type EmailStatus =
  "pending" | "approved" | "declined" | "no-action" | "junk";
export type EmailStatusRecord = {
  status: EmailStatus;
  adminLogin?: string;
  adminName?: string;
  updatedAt: string;
};

type ConfigResponse =
  | { value?: Record<string, EmailStatusRecord> }
  | Record<string, EmailStatusRecord>;
function configUrl() {
  if (!env.GLOBAL_CONFIG_API_TOKEN || !env.GLOBAL_CONFIG_ID)
    throw new Error("Status storage is not configured");
  return `https://api.vercel.com/v1/global-config/${env.GLOBAL_CONFIG_ID}`;
}
async function request<T>(init?: RequestInit): Promise<T> {
  const response = await fetch(configUrl(), {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GLOBAL_CONFIG_API_TOKEN}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Status storage request failed (${response.status})`);
  return response.json() as Promise<T>;
}
async function read(): Promise<Record<string, EmailStatusRecord>> {
  const data = await request<ConfigResponse>();
  return ("value" in data && data.value ? data.value : data) as Record<
    string,
    EmailStatusRecord
  >;
}
async function write(value: Record<string, EmailStatusRecord>) {
  await request({ method: "PUT", body: JSON.stringify({ value }) });
}
export async function getStatuses() {
  return read();
}
export async function setStatus(
  id: string,
  status: EmailStatus,
  admin?: { login: string; name?: string | null },
) {
  const statuses = await read();
  statuses[id] = {
    status,
    updatedAt: new Date().toISOString(),
    adminLogin: admin?.login,
    adminName: admin?.name ?? undefined,
  };
  await write(statuses);
}
export async function backfillAndPrune(ids: string[]) {
  const statuses = await read();
  const valid = new Set(ids);
  let changed = false;
  for (const id of ids)
    if (!statuses[id]) {
      statuses[id] = { status: "pending", updatedAt: new Date().toISOString() };
      changed = true;
    }
  for (const id of Object.keys(statuses))
    if (!valid.has(id)) {
      delete statuses[id];
      changed = true;
    }
  if (changed) await write(statuses);
  return statuses;
}
