"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-session";
import {
  applyMinorEdit,
  mergeCalendar,
  mergeMarkdown,
  classifyEmail,
} from "@/lib/email-parse";
import { getReceivedEmail } from "@/lib/resend";
import { ensureStagingBranch, getFile, commitFiles } from "@/lib/github";
import { updateStatus, type EmailStatus } from "@/lib/email-status";
import { uploadEmailAsset } from "@/lib/blob-upload";

export type ReviewActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function updateEmailStatus(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("emailId") ?? "");
  const status = String(formData.get("status") ?? "") as EmailStatus;
  if (!id)
    return { status: "error", message: "emailID is required." };
  try {
    const email = await getReceivedEmail(id);
    if (status === "junk") {
      const { addSuppression } = await import("@/lib/resend");
      await addSuppression(email.from);
    }
    await updateStatus(id, status, admin.user.name ?? admin.user.login);
  } catch (error) {
    console.error(
      "Unable to update email status",
      error instanceof Error ? error.message : "unknown error",
    );
    return {
      status: "error",
      message: "That update could not be saved. Please try again.",
    };
  }
  redirect("/inbox");
}

export async function approveEmail(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("emailId") ?? "");
  if (!id)
    return { status: "error", message: "There is no email to approve." };
  try {
    const email = await getReceivedEmail(id);
    const updates = classifyEmail(email.text ?? "");
    if (updates.some((update) => update.kind === "blob-upload")) {
      await uploadEmailAsset(email);
      await updateStatus(id, "approved", admin.user.name ?? admin.user.login);
    } else {
      const editable = updates.filter(
        (update) =>
          update.path &&
          ["markdown", "csv-minor-edit", "calendar", "csv-file"].includes(
            update.kind,
          ),
      );
      if (!editable.length)
        return {
          status: "error",
          message: "This email needs manual handling before it can be saved.",
        };
      await ensureStagingBranch(admin.githubAccessToken);
      const files = await Promise.all(
        editable.map(async (update, index) => {
          const path = update.path as string;
          const current = await getFile(admin.githubAccessToken, path);
          const fresh =
            update.kind === "markdown"
              ? mergeMarkdown(current?.content ?? null, update.lines ?? [])
              : update.kind === "csv-minor-edit"
                ? applyMinorEdit(current?.content ?? "", update.values ?? {})
                : update.kind === "calendar"
                  ? mergeCalendar(current?.content ?? "", update.lines ?? [])
                  : update.body ?? "";
          const edited = formData.get(`content-${index}`);
          const content =
            edited != null && String(edited) !== fresh ? String(edited) : fresh;
          return { path, content, sha: current?.sha };
        }),
      );
      await commitFiles(
        admin.githubAccessToken,
        files,
        `Update ${files.map((file) => file.path).join(", ")} via admin review`,
      );
      await updateStatus(id, "approved", admin.user.name ?? admin.user.login);
    }
  } catch (error) {
    console.error(
      "Unable to approve email",
      error instanceof Error ? error.message : "unknown error",
    );
    return {
      status: "error",
      message:
        "That update could not be saved. Please check the content and try again.",
    };
  }
  // redirect() must run outside try/catch — it throws internally and would
  // otherwise be swallowed by the catch block above.
  redirect("/inbox");
}

