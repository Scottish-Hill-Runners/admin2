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
  // Resend only returns attachment metadata here; use downloadAttachment()
  // (which calls the separate Attachments API) to get the actual bytes.
  attachments?: Array<{
    id?: string;
    filename: string;
    content?: string;
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

export async function getAttachmentDownloadUrl(
  emailId: string,
  attachmentId: string,
) {
  const attachment = await resendRequest<{ download_url: string }>(
    `/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
  return attachment.download_url;
}

export async function downloadAttachment(
  emailId: string,
  attachment: NonNullable<ReceivedEmail["attachments"]>[number],
) {
  if (attachment.content) return Buffer.from(attachment.content, "base64");
  if (!attachment.id)
    throw new Error("The email attachment has no downloadable content");
  const url = await getAttachmentDownloadUrl(emailId, attachment.id);
  const response = await fetch(url, { cache: "no-store" });
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
