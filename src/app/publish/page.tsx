import { requireAdmin } from "@/lib/auth-session";
import { PublishButton } from "@/components/publish-button";

export default async function PublishPage() {
  await requireAdmin();
  return (
    <main className="min-h-screen px-6 py-8 md:px-16">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
        Publish
      </p>
      <h1 className="mt-3 text-5xl">Ready to publish?</h1>
      <p className="mt-6 max-w-xl text-lg">
        Approved updates collect here before they are published to the live site.
      </p>
      <div className="mt-8">
        <PublishButton />
      </div>
    </main>);
}
