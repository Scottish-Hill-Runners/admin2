import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { refreshCache } from "@/lib/asset-cache";

export async function POST(request: Request) {
  const secret =
    new URL(request.url).searchParams.get("secret") ??
    request.headers.get("x-webhook-secret");
  if (
    !env.CLOUDINARY_WEBHOOK_SECRET ||
    secret !== env.CLOUDINARY_WEBHOOK_SECRET
  )
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const payload = (await request.json()) as { notification_type?: string, folder?: string };
  if (payload.notification_type === "upload" && payload.folder)
    await refreshCache(payload.folder);
  return NextResponse.json({ ok: true });
}
