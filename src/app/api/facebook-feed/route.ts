import { getFacebookFeed } from "@/lib/facebook-feed";

export async function GET() {
  try {
    const feed = await getFacebookFeed();
    return Response.json(feed, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Facebook feed request failed", error);
    return Response.json(
      { error: "The feed is unavailable" },
      { status: 503, headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } },
    );
  }
}
