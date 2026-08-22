import { env } from "@/lib/env";

const apiBase = "https://api.resend.com";
async function resendRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!env.RESEND_API_KEY) throw new Error("Email service is not configured");
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Resend request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export type ReceivedEmailSummary = {
  id: string;
  from: string;
  to: string[];
  subject: string;
  created_at: string;
};
export type ReceivedEmail = ReceivedEmailSummary & {
  text?: string;
  html?: string;
  attachments?: Array<{
    id?: string;
    filename: string;
    content?: string;
    url?: string;
    content_type?: string;
  }>;
};

export async function listReceivedEmails(): Promise<ReceivedEmailSummary[]> {
  const emails: ReceivedEmailSummary[] = [];
  let after: string | undefined;
  do {
    const query = after
      ? `?limit=100&after=${encodeURIComponent(after)}`
      : "?limit=100";
    const page = await resendRequest<{
      data: ReceivedEmailSummary[];
      has_more?: boolean;
    }>(`/emails/receiving${query}`);
    emails.push(...page.data);
    after =
      page.has_more && page.data.length ? page.data.at(-1)?.id : undefined;
  } while (after);
  return emails;
}

export function getReceivedEmail(id: string) {
  return resendRequest<ReceivedEmail>(
    `/emails/receiving/${encodeURIComponent(id)}`,
  );
}
export async function downloadAttachment(
  attachment: NonNullable<ReceivedEmail["attachments"]>[number],
) {
  if (attachment.content) return Buffer.from(attachment.content, "base64");
  if (!attachment.url)
    throw new Error("The email attachment has no download URL");
  const response = await fetch(attachment.url, { cache: "no-store" });
  if (!response.ok)
    throw new Error("The email attachment could not be downloaded");
  return Buffer.from(await response.arrayBuffer());
}
export async function addSuppression(email: string) {
  await resendRequest("/suppressions", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}
