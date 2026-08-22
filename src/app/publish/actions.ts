"use server";

import { requireAdmin } from "@/lib/auth-session";
import { publishStagingToLive } from "@/lib/github";

export async function publishUpdates() {
  const admin = await requireAdmin();
  try {
    const result = await publishStagingToLive(admin.githubAccessToken);
    return {
      status: "success" as const,
      message: "Updates are now live.",
      url: result.prUrl,
    };
  } catch (error) {
    console.error(
      "Unable to publish updates",
      error instanceof Error ? error.message : "unknown error",
    );
    return {
      status: "error" as const,
      message:
        error instanceof Error && error.message.includes("no saved")
          ? error.message
          : "Updates could not be published. Please try again.",
    };
  }
}
