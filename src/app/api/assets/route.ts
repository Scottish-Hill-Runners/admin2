import { NextResponse } from "next/server";
import { readCache, readFoldersCache } from "@/lib/asset-cache";

function errorDetails(error: unknown) {
  if (error instanceof Error)
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  return { error };
}

export async function GET(request: Request) {
  const folder = new URL(request.url).searchParams.get("folder");
  try {
    let resp;
    if (folder) {
      const cache = await readCache(folder);
      resp = { folder, entries: cache.assets };
    } else {
      const folders = await readFoldersCache();
      resp = { folders: folders.folders };
    }
    
    const response = NextResponse.json(resp);
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Cache-Control", "public, max-age=300");
    return response;
  } catch (error) {
    console.error("Asset list request failed", errorDetails(error));
    return NextResponse.json(
      { error: "Asset list is unavailable" },
      { status: 503 },
    );
  }
}
