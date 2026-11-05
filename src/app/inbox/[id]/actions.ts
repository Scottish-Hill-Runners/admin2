"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-session";
import {
  applyMinorEdit,
  mergeCalendar,
  mergeMarkdown,
  classifyEmailBody,
} from "@/lib/email-parse";
import { getReceivedEmail } from "@/lib/resend";
import { ensureStagingBranch, getFile, commitFiles } from "@/lib/github";
import { updateStatus, type EmailStatus } from "@/lib/email-status";
import { uploadEmailAsset } from "@/lib/blob-upload";
import { previewEmail, type PreviewedUpdate } from "@/lib/review-preview";

export type ReviewActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export type EmailCorrectionState = {
  status: "idle" | "success" | "error";
  emailText?: string;
  updates?: PreviewedUpdate[];
  message?: string;
};

export async function previewCorrectedEmail(
  _previous: EmailCorrectionState,
  formData: FormData,
): Promise<EmailCorrectionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("emailId") ?? "");
  const emailText = formData.get("emailText");
  if (!id || typeof emailText !== "string")
    return {
      status: "error",
      message: "The corrected email text is missing. Please try again.",
    };

  try {
    const email = await getReceivedEmail(id);
    const correctedEmail = { ...email, text: emailText };
    const updates = await previewEmail(admin.githubAccessToken, correctedEmail);
    if (
      updates.some(
        ({ update, previewError }) =>
          update.kind === "unrecognised" || Boolean(previewError),
      )
    )
      return {
        status: "error",
        emailText,
        message:
          "The corrected email still cannot be parsed and merged. Make another correction and try again.",
      };

    return { status: "success", emailText, updates };
  } catch (error) {
    console.error(
      "Unable to preview corrected email",
      error instanceof Error ? error.message : "unknown error",
    );
    return {
      status: "error",
      emailText,
      message:
        "The corrected email could not be previewed. Please check it and try again.",
    };
  }
}

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
    const correctedEmailText = formData.get("emailText");
    const updates =
      typeof correctedEmailText === "string"
        ? classifyEmailBody({ text: correctedEmailText })
        : classifyEmailBody(email);
    if (updates.some((update) => update.kind === "unrecognised"))
      return {
        status: "error",
        message: "The email text could not be parsed. Correct it and try again.",
      };
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
          const edited = formData.get(`content-${index}`);
          const content =
            typeof edited === "string"
              ? edited
              : update.kind === "markdown"
                ? mergeMarkdown(current?.content ?? null, update.lines ?? [])
                : update.kind === "csv-minor-edit"
                  ? applyMinorEdit(current?.content ?? "", update.values ?? {})
                  : update.kind === "calendar"
                    ? mergeCalendar(current?.content ?? "", update.lines ?? [])
                    : update.body ?? "";
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
