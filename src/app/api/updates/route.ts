import { NextResponse } from "next/server";
import { listReceivedEmails, getReceivedEmail } from "@/lib/resend";
import { getEmailStatuses } from "@/lib/email-status";
import { classifyEmailBody } from "@/lib/email-parse";

// Recent-changes feed for the public shr-web site: only approved updates,
// newest first, capped so we don't fetch every email body ever received.
const maxResults = 50;

function errorDetails(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { error };
}

export async function GET() {
  try {
    const [emails, statuses] = await Promise.all([
      listReceivedEmails(),
      getEmailStatuses(),
    ]);

    const approved = emails
      .filter((email) => statuses[email.id]?.status !== "junk")
      .sort((a, b) =>
        (statuses[b.id]?.updatedAt ?? "").localeCompare(statuses[a.id]?.updatedAt ?? ""),
      )
      .slice(0, maxResults);

    const updates = await Promise.all(
      approved.map(async (email) => {
        const record = statuses[email.id];
        let kind: string | undefined;
        let path: string | undefined;
        try {
          const full = await getReceivedEmail(email.id);
          const parsed = classifyEmailBody(full).find((update) => update.kind !== "unrecognised");
          kind = parsed?.kind;
          path = parsed?.path;
        } catch (error) {
          console.error("Unable to classify email", email.id, errorDetails(error));
        }
        return {
          subject: email.subject,
          created_at: email.created_at,
          status: record?.status,
          updatedAt: record?.updatedAt,
          kind,
          path,
        };
      }),
    );

    const response = NextResponse.json(updates);
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Cache-Control", "public, max-age=7200");
    return response;
  } catch (error) {
    console.error("Recent updates request failed", errorDetails(error));
    return NextResponse.json({ error: "Recent updates are unavailable" }, { status: 503 });
  }
}
