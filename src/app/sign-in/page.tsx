import { signIn } from "@/auth";

export default function SignInPage() {
  return (
  <main className="min-h-screen px-6 py-10 md:px-16">
    <div className="max-w-xl border-t-4 border-[var(--accent)] pt-6">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
        Review desk
      </p>
      <h1 className="mt-4 text-5xl leading-none">
        Sign in to review updates.
      </h1>
      <p className="mt-6 text-lg">
        Use your authorised GitHub account to continue.
      </p>
      <form
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: "/inbox" });
        }}
      >
        <button
          className="mt-8 inline-block border-2 border-[var(--ink)] bg-[var(--accent)] px-5 py-3 font-bold"
          type="submit"
        >
          Sign in with GitHub
        </button>
      </form>
    </div>
  </main>);
}
