import { requireAdmin } from "@/lib/auth-session";
import { getReceivedEmail } from "@/lib/resend";
import { getFile, ensureStagingBranch } from "@/lib/github";
import { previewEmailWithSources } from "@/lib/review-preview";
import { ReviewActions } from "@/components/review-actions";
import { LineDiff } from "@/components/line-diff";

export default async function EmailReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  let email: Awaited<ReturnType<typeof getReceivedEmail>> | undefined;
  try {
    email = await getReceivedEmail(id);
  } catch { }
  if (!email)
    return (
      <main className="p-8">
        <h1 className="text-4xl">This email could not be loaded.</h1>
        <p className="mt-4">Please return to the inbox and try again.</p>
      </main>);
  let existing: string | null = null;
  try {
    await ensureStagingBranch(admin.githubAccessToken);
    const path = (email.text ?? "").match(/^File:\s*(\S+)/m)?.[1];
    if (path) existing = (await getFile(admin.githubAccessToken, path))?.content ?? null;
  } catch (error) {
    console.error("Unable to load the current draft content", error instanceof Error ? error.message : "unknown error");
  }
  const { update, content } = await previewEmailWithSources(email, existing);
  return (
  <main className="min-h-screen px-6 py-8 md:px-16">
    <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
      Review update
    </p>
    <h1 className="mt-3 max-w-4xl text-5xl leading-none">
      {email.subject || "(no subject)"}
    </h1>
    <p className="mt-4 text-lg">
      From {email.from}
    </p>
    <section className="mt-10 border-t-2 border-[var(--ink)] pt-5">
      <p className="font-bold uppercase">
        Detected: {update.kind}
      </p>
      <p className="mt-3">
        {update.path ? `File: ${update.path}` : update.reason ?? "This update is ready to review."}
      </p>
      {update.kind === "blob-upload" ?
        <pre className="mt-8 whitespace-pre-wrap border border-[var(--line)] bg-white/50 p-5 text-sm">
          {email.text}
        </pre>
        : <LineDiff
            after={content || email.text || ""}
            before={existing ?? ""} />
      }
      <ReviewActions
        canApprove={Boolean(update.path && update.kind !== "unrecognised")}
        content={content}
        emailId={id} />
      </section>
  </main>);
}
