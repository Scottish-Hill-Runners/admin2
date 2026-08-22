import { NextResponse } from "next/server";
import { readCache } from "@/lib/asset-cache";

export async function GET(request: Request) {
  const folder = new URL(request.url).searchParams.get("folder");
  try {
    const cache = await readCache();
    if (folder) {
      if (!cache.folders[folder])
        return NextResponse.json(
          { error: "Folder not found" },
          { status: 404 },
        );
      const response = NextResponse.json({
        folder,
        entries: cache.folders[folder],
      });
      response.headers.set("Access-Control-Allow-Origin", "*");
      response.headers.set("Cache-Control", "public, max-age=300");
      return response;
    }
    const response = NextResponse.json({ folders: Object.keys(cache.folders) });
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Cache-Control", "public, max-age=300");
    return response;
  } catch {
    return NextResponse.json(
      { error: "Asset list is unavailable" },
      { status: 503 },
    );
  }
}
