import {
  applyMinorEdit,
  classifyEmail,
  mergeCalendar,
  mergeMarkdown,
} from "@/lib/email-parse";
import type { ReceivedEmail } from "@/lib/resend";

export function previewEmail(email: ReceivedEmail, existing: string | null) {
  const update = classifyEmail(email.text ?? "");
  if (update.kind === "markdown" && update.path)
    return {
      update,
      content: mergeMarkdown(existing, update.lines ?? []),
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
  if (update.kind === "csv-file" && update.path)
    return { update, content: update.body ?? "" };
  return { update, content: existing ?? "" };
}
