import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { adminLogins, env } from "@/lib/env";

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
      if (account?.access_token) token.githubAccessToken = account.access_token;
      if (typeof profile?.login === "string") token.githubLogin = profile.login;
      if (typeof profile?.name === "string") token.githubName = profile.name;
      if (typeof profile?.email === "string") token.githubEmail = profile.email;
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
        typeof token.githubAccessToken === "string"
          ? token.githubAccessToken
          : undefined;
      return session;
    },
  },
  pages: { signIn: "/sign-in", error: "/sign-in" },
});
