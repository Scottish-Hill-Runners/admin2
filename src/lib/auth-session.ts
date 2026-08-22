import { redirect } from "next/navigation";
import { auth } from "@/auth";

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.login || !session.githubAccessToken) redirect("/sign-in");
  return session as typeof session & {
    user: { login: string; name?: string | null; email?: string | null };
    githubAccessToken: string;
  };
}
