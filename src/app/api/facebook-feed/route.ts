import { createHash } from "node:crypto";
import { getFacebookFeed } from "@/lib/facebook-feed";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "ETag",
};

function matchesEtag(ifNoneMatch: string | null, etag: string) {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === "*") return true;
  const opaqueTag = etag.slice(2);
  return ifNoneMatch.split(",").some((value) =>
    value.trim().replace(/^W\//, "") === opaqueTag,
  );
}

export async function GET(request: Request) {
  try {
    const feed = await getFacebookFeed();
    const body = JSON.stringify(feed);
    const etag = `W/"${createHash("sha256").update(body).digest("hex")}"`;
    const headers = {
      ...corsHeaders,
      "Cache-Control": "public, max-age=0, must-revalidate",
      ETag: etag,
    };
    if (matchesEtag(request.headers.get("If-None-Match"), etag))
      return new Response(null, { status: 304, headers });
    return new Response(body, {
      headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (error) {
    console.error("Facebook feed request failed", error);
    return Response.json(
      { error: "The feed is unavailable" },
      { status: 503, headers: { ...corsHeaders, "Cache-Control": "no-store" } },
    );
  }
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "If-None-Match",
    },
  });
}
