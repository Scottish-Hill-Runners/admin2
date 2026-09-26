import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";
import { env } from "@/lib/env";

export default async function HomePage() {
  const bypassLogin =
    process.env.NODE_ENV !== "production" ? env.DEV_BYPASS_LOGIN : undefined;
  const session = bypassLogin
    ? { user: { login: bypassLogin, name: bypassLogin } }
    : await auth();

  return (
  <main className="min-h-screen px-6 py-10 md:px-16">
    <header className="mb-16 flex items-center justify-between border-b border-[var(--line)] pb-5">
      <p className="m-0 text-sm font-bold uppercase tracking-[0.18em]">
        Scottish Hill Runners
      </p>
      <span className="text-sm">{session?.user.name ?? session?.user.login ?? "Not signed in"}</span>
    </header>
    {session?.user?.login ? (
      <section className="max-w-3xl">
        <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
          Review desk
        </p>
        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          <Link href="/inbox" className="border-2 border-[var(--ink)] p-5 font-bold">
            Inbox
          </Link>
          <Link href="/assets/documents" className="border-2 border-[var(--ink)] p-5 font-bold">
            Documents
          </Link>
          <Link href="/assets/portraits" className="border-2 border-[var(--ink)] p-5 font-bold">
            Committee portraits
          </Link>
          <Link href="/publish" className="border-2 border-[var(--ink)] bg-[var(--accent)] p-5 font-bold">
            Publish
          </Link>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button className="mt-8 border border-[var(--ink)] px-5 py-3 font-bold" type="submit">
            Sign out
          </button>
        </form>
      </section>
    ) : (
      <section className="max-w-3xl">
        <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
          Review desk
        </p>
        <h1 className="m-0 text-6xl leading-[0.95] md:text-8xl">
          Saved updates,<br />ready for a look.
        </h1>
        <p className="mt-8 max-w-xl text-xl leading-relaxed">
          Incoming emails and their proposed changes will appear here for review.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/inbox" });
          }}
        >
          <button
            className="mt-8 border-2 border-[var(--ink)] bg-[var(--accent)] px-5 py-3 font-bold"
            type="submit"
          >
            Sign in with GitHub
          </button>
        </form>
      </section>
    )}
  </main>);
}
