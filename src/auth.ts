import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { adminLogins, env } from "@/lib/env";

// GitHub App user tokens expire (account.expires_at); refresh a bit early to
// avoid a request racing the expiry.
const refreshBufferMs = 5 * 60 * 1000;

async function refreshGitHubToken(refreshToken: string) {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: env.AUTH_GITHUB_ID ?? "",
      client_secret: env.AUTH_GITHUB_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const tokens = await response.json();
  if (!response.ok || tokens.error)
    throw new Error(tokens.error_description ?? "Unable to refresh GitHub token");
  return tokens as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      clientId: env.AUTH_GITHUB_ID,
      clientSecret: env.AUTH_GITHUB_SECRET,
      authorization: { params: { scope: "repo read:user user:email" } },
      userinfo: {
        url: "https://api.github.com/user",
        async request({ tokens }: { tokens: { access_token?: string } }) {
          const headers = {
            Authorization: `Bearer ${tokens.access_token}`,
            "User-Agent": "authjs",
          };
          const profile = await fetch("https://api.github.com/user", { headers }).then(
            (response) => response.json(),
          );
          if (!profile.email) {
            const response = await fetch("https://api.github.com/user/emails", { headers });
            // GitHub Apps without the "Email addresses" permission return an empty list here.
            if (response.ok) {
              const emails = await response.json();
              profile.email = Array.isArray(emails)
                ? (emails.find((email: { primary: boolean }) => email.primary) ?? emails[0])?.email
                : undefined;
            }
          }
          return profile;
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ profile }) {
      const login =
        typeof profile?.login === "string" ? profile.login.toLowerCase() : "";
      return adminLogins.has(login);
    },
    async jwt({ token, account, profile }) {
      if (account?.access_token) {
        token.githubAccessToken = account.access_token;
        token.githubRefreshToken = account.refresh_token;
        token.githubAccessTokenExpiresAt = account.expires_at;
        delete token.githubError;
      }
      if (typeof profile?.login === "string") token.githubLogin = profile.login;
      if (typeof profile?.name === "string") token.githubName = profile.name;
      if (typeof profile?.email === "string") token.githubEmail = profile.email;

      // Silently refresh the access token before it expires so admins are
      // never bounced back to the sign-in screen mid-session.
      if (
        typeof token.githubAccessTokenExpiresAt === "number" &&
        Date.now() >= token.githubAccessTokenExpiresAt * 1000 - refreshBufferMs &&
        typeof token.githubRefreshToken === "string"
      ) {
        try {
          const refreshed = await refreshGitHubToken(token.githubRefreshToken);
          token.githubAccessToken = refreshed.access_token;
          token.githubAccessTokenExpiresAt =
            Math.floor(Date.now() / 1000) + refreshed.expires_in;
          if (refreshed.refresh_token)
            token.githubRefreshToken = refreshed.refresh_token;
          delete token.githubError;
        } catch (error) {
          console.error(
            "Unable to refresh GitHub token",
            error instanceof Error ? error.message : "unknown error",
          );
          token.githubError = "RefreshAccessTokenError";
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.login =
        typeof token.githubLogin === "string" ? token.githubLogin : undefined;
      session.user.name =
        typeof token.githubName === "string"
          ? token.githubName
          : session.user.name;
      session.user.email =
        typeof token.githubEmail === "string"
          ? token.githubEmail
          : session.user.email;
      session.githubAccessToken =
        typeof token.githubAccessToken === "string" &&
        token.githubError !== "RefreshAccessTokenError"
          ? token.githubAccessToken
          : undefined;
      return session;
    },
  },
  pages: { signIn: "/sign-in", error: "/sign-in" },
});
