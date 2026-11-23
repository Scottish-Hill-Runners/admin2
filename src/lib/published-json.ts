import { gunzipSync } from "node:zlib";

export async function fetchPublishedJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${url} (HTTP ${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const data = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  return JSON.parse(data.toString("utf8"));
}
