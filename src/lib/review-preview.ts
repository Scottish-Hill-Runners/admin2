import {
  applyMinorEdit,
  classifyEmail,
  mergeCalendar,
  mergeMarkdown,
} from "@/lib/email-parse";
import type { ReceivedEmail } from "@/lib/resend";
import { csvFromEmail } from "@/lib/csv-source";

export function previewEmail(email: ReceivedEmail, existing: string | null) {
  const update = classifyEmail(email.text ?? "");
  if (update.kind === "markdown" && update.path)
    return {
      update,
      content: mergeMarkdown(
        existing,
        (email.text ?? "").split(/\r?\n/).slice(1),
      ),
    };
  if (update.kind === "csv-minor-edit" && update.path)
    return {
      update,
      content: applyMinorEdit(existing ?? "", update.values ?? {}),
    };
  if (update.kind === "calendar" && update.path)
    return {
      update,
      content: mergeCalendar(existing ?? "", update.lines ?? []),
    };
  return { update, content: existing ?? "" };
}

export async function previewEmailWithSources(
  email: ReceivedEmail,
  existing: string | null,
) {
  const update = classifyEmail(email.text ?? "");
  if (update.kind === "csv-file" && update.path)
    return { update, content: await csvFromEmail(email, update.path) };
  return previewEmail(email, existing);
}
