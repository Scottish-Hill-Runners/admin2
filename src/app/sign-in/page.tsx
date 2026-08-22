import Link from "next/link";

export default function SignInPage() {
  return <main className="min-h-screen px-6 py-10 md:px-16"><div className="max-w-xl border-t-4 border-[var(--accent)] pt-6"><p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--accent)]">Review desk</p><h1 className="mt-4 text-5xl leading-none">Sign in to review updates.</h1><p className="mt-6 text-lg">Use your authorised GitHub account to continue.</p><Link className="mt-8 inline-block border-2 border-[var(--ink)] bg-[var(--accent)] px-5 py-3 font-bold" href="/api/auth/signin/github">Sign in with GitHub</Link></div></main>;
}
