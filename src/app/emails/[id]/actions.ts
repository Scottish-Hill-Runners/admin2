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
import { csvFromEmail } from "@/lib/csv-source";
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
  const editedContent = String(formData.get("content") ?? "");
  if (!id)
    return { status: "error", message: "There is no email to approve." };
  try {
    const email = await getReceivedEmail(id);
    const update = classifyEmail(email.text ?? "");
    if (update.kind === "blob-upload") {
      await uploadEmailAsset(email);
      await updateStatus(id, "approved", admin.user.name ?? admin.user.login);
      return { status: "success", message: "Asset saved." };
    }
    if (
      !update.path ||
      !["markdown", "csv-minor-edit", "calendar", "csv-file"].includes(
        update.kind,
      )
    )
      return {
        status: "error",
        message: "This email needs manual handling before it can be saved.",
      };
    await ensureStagingBranch(admin.githubAccessToken);
    const current = await getFile(admin.githubAccessToken, update.path);
    const fresh =
      update.kind === "markdown"
        ? mergeMarkdown(
            current?.content ?? null,
            (email.text ?? "").split(/\r?\n/).slice(1),
          )
        : update.kind === "csv-minor-edit"
          ? applyMinorEdit(current?.content ?? "", update.values ?? {})
          : update.kind === "calendar"
            ? mergeCalendar(current?.content ?? "", update.lines ?? [])
            : await csvFromEmail(email, update.path);
    const content = editedContent === fresh ? fresh : editedContent;
    await commitFiles(
      admin.githubAccessToken,
      [{ path: update.path, content, sha: current?.sha }],
      `Update ${update.path} via admin review`,
    );
    await updateStatus(id, "approved", admin.user.name ?? admin.user.login);
    redirect("/inbox");
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
}
