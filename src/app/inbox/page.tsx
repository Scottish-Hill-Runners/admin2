import Link from "next/link";
import { requireAdmin } from "@/lib/auth-session";
import { listReceivedEmails } from "@/lib/resend";
import { backfillAndPrune } from "@/lib/email-status";

// Serverless cold starts occasionally drop the first outbound call; one retry
// mirrors what a manual page refresh already does.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return fn();
  }
}

export default async function InboxPage() {
  const admin = await requireAdmin();
  let emails: Awaited<ReturnType<typeof listReceivedEmails>> = [];
  let statuses: Awaited<ReturnType<typeof backfillAndPrune>> = {};
  let unavailable = false;
  try {
    emails = await withRetry(() => listReceivedEmails());
  } catch (error) {
    console.error("Unable to list received emails", error instanceof Error ? error.message : "unknown error");
    unavailable = true;
  }
  if (!unavailable)
    try {
      statuses = await withRetry(() => backfillAndPrune(emails.map((email) => email.id)));
    } catch (error) {
      console.error("Unable to backfill email statuses", error instanceof Error ? error.message : "unknown error");
    }
  if (unavailable)
    return (
      <main className="p-8">
        <h1 className="text-4xl">Saved updates</h1>
        <p className="mt-4">
          Email review is not available right now. Please try again later.
        </p>
    </main>);
  return (
    <main className="min-h-screen px-6 py-8 md:px-16">
      <header className="mb-10 flex items-center justify-between border-b border-[var(--line)] pb-5">
        <div>
          <p className="m-0 text-sm font-bold uppercase tracking-[0.18em]">Review desk</p>
          <h1 className="mt-2 text-4xl">Saved updates</h1>
        </div>
        <p className="text-sm">{admin.user.name ?? admin.user.login}</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[650px] border-collapse text-left">
          <thead>
            <tr className="border-b-2 border-[var(--ink)] text-sm uppercase">
              <th className="p-3">Received</th>
              <th className="p-3">From</th>
              <th className="p-3">Subject</th>
              <th className="p-3">Status</th>
              </tr>
          </thead>
          <tbody>
            {emails.map((email) =>
              <tr className="border-b border-[var(--line)]" key={email.id}>
                <td className="p-3">{new Date(email.created_at).toLocaleDateString()}</td>
                <td className="p-3">{email.from}</td>
                <td className="p-3">
                  <Link className="font-bold underline" href={`/emails/${email.id}`}>
                    {email.subject || "(no subject)"}
                  </Link>
                  </td>
                  <td className="p-3 uppercase">{statuses[email.id]?.status}</td>
                </tr>)
              }
          </tbody>
        </table>
          {emails.length === 0 &&
            <p className="py-8 text-lg">No emails are waiting for review.</p>
          }
      </div>
    </main>);
}
