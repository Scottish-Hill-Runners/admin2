import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { env } from "@/lib/env";

export async function requireAdmin() {
  // Local-only shortcut so the UI can be exercised without a GitHub OAuth round trip.
  if (process.env.NODE_ENV !== "production" && env.DEV_BYPASS_LOGIN)
    return {
      user: { login: env.DEV_BYPASS_LOGIN, name: env.DEV_BYPASS_LOGIN, email: undefined },
      githubAccessToken: env.DEV_BYPASS_GITHUB_TOKEN ?? "",
    };

  const session = await auth();
  if (!session?.user?.login || !session.githubAccessToken) redirect("/sign-in");
  return session as typeof session & {
    user: { login: string; name?: string | null; email?: string | null };
    githubAccessToken: string;
  };
}
