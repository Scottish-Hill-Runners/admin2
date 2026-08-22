export default function HomePage() {
  return <main className="min-h-screen px-6 py-10 md:px-16">
    <header className="mb-16 flex items-center justify-between border-b border-[var(--line)] pb-5">
      <p className="m-0 text-sm font-bold uppercase tracking-[0.18em]">Scottish Hill Runners</p>
      <span className="text-sm">Admin 2</span>
    </header>
    <section className="max-w-3xl">
      <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-[var(--accent)]">Review desk</p>
      <h1 className="m-0 text-6xl leading-[0.95] md:text-8xl">Saved updates,<br />ready for a look.</h1>
      <p className="mt-8 max-w-xl text-xl leading-relaxed">Incoming emails and their proposed changes will appear here for review.</p>
      <button className="mt-8 border-2 border-[var(--ink)] bg-[var(--accent)] px-5 py-3 font-bold">Sign in with GitHub</button>
    </section>
  </main>;
}
