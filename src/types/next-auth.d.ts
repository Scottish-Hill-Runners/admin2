import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    githubAccessToken?: string;
    user: { login?: string; name?: string | null; email?: string | null };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    githubAccessToken?: string;
    githubRefreshToken?: string;
    githubAccessTokenExpiresAt?: number;
    githubError?: "RefreshAccessTokenError";
    githubLogin?: string;
    githubName?: string;
    githubEmail?: string;
  }
}
