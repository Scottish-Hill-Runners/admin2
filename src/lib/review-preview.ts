import {
  applyMinorEdit,
  classifyEmailBody,
  mergeCalendar,
  mergeMarkdown,
} from "@/lib/email-parse";
import type { EmailUpdate } from "@/lib/email-parse";
import type { ReceivedEmail } from "@/lib/resend";
import { getFile } from "@/lib/github";

export type PreviewedUpdate = {
  update: EmailUpdate;
  content: string;
  existing: string | null;
  previewError?: string;
};

export async function previewEmail(
  token: string,
  email: ReceivedEmail,
): Promise<PreviewedUpdate[]> {
  const updates = classifyEmailBody(email);
  return Promise.all(
    updates.map(async (update) => {
      const existing = update.path
        ? ((await getFile(token, update.path))?.content ?? null)
        : null;
      if (update.kind === "markdown" && update.path) {
        try {
          return {
            update,
            content: mergeMarkdown(existing, update.lines ?? []),
            existing,
          };
        } catch (error) {
          console.error(
            "Unable to merge markdown update for review",
            error instanceof Error ? error.message : "unknown error",
          );
          return {
            update,
            content: "",
            existing,
            previewError:
              "Automatic merge failed. Correct the email text below, then approve to parse and merge it.",
          };
        }
      }
      if (update.kind === "csv-minor-edit" && update.path)
        return { update, content: applyMinorEdit(existing ?? "", update.values ?? {}), existing };
      if (update.kind === "calendar" && update.path)
        return { update, content: mergeCalendar(existing ?? "", update.lines ?? []), existing };
      if (update.kind === "csv-file" && update.path)
        return { update, content: update.body ?? "", existing };
      return { update, content: existing ?? "", existing };
    }),
  );
}
