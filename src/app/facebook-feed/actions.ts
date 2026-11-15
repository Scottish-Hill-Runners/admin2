"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-session";
import { refreshFacebookFeed, removeFacebookPost } from "@/lib/facebook-feed";

export type FeedActionState = { status: "idle" | "success" | "error"; message?: string };

export async function refreshFeed(): Promise<FeedActionState> {
  await requireAdmin();
  try {
    const result = await refreshFacebookFeed();
    revalidatePath("/facebook-feed");
    const warnings = [
      result.ambiguous ? `${result.ambiguous} post(s) could not be verified and were retained` : "",
      result.pending ? `${result.pending} photo(s) still need cleanup` : "",
    ].filter(Boolean);
    return {
      status: "success",
      message: `Refreshed ${result.count} posts.${warnings.length ? ` ${warnings.join("; ")}.` : ""}`,
    };
  } catch (error) {
    console.error("Facebook feed refresh failed", error);
    return { status: "error", message: "Refresh could not be confirmed. Check the feed and server logs." };
  }
}

export async function removePost(_state: FeedActionState, data: FormData): Promise<FeedActionState> {
  await requireAdmin();
  const id = data.get("id");
  if (typeof id !== "string") return { status: "error", message: "No post was selected." };
  try {
    const pending = await removeFacebookPost(id);
    revalidatePath("/facebook-feed");
    return {
      status: "success",
      message: pending ? `Post removed; ${pending} photo(s) still need cleanup.` : "Post removed.",
    };
  } catch (error) {
    console.error("Facebook post removal failed", error);
    return { status: "error", message: "The post could not be removed; check the server logs." };
  }
}
