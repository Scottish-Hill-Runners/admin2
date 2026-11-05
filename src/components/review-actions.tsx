"use client";

import { useActionState } from "react";
import {
  approveEmail,
  previewCorrectedEmail,
  updateEmailStatus,
  type EmailCorrectionState,
  type ReviewActionState,
} from "@/app/inbox/[id]/actions";
import { ContentEditor } from "@/components/content-editor";
import { LineDiff } from "@/components/line-diff";
import type { PreviewedUpdate } from "@/lib/review-preview";

const initialState: ReviewActionState = { status: "idle" };
const initialCorrectionState: EmailCorrectionState = { status: "idle" };

export function ReviewActions({ emailId, emailText, updates }: {
   emailId: string; emailText: string; updates: PreviewedUpdate[]
  }) {
  const [correction, parseCorrection, parsing] = useActionState(
    previewCorrectedEmail,
    initialCorrectionState,
  );
  const [approval, approve, approving] = useActionState(approveEmail, initialState);
  const [status, updateStatus, updating] = useActionState(updateEmailStatus, initialState);
  const reviewedUpdates = correction.updates ?? updates;
  const editable = reviewedUpdates.filter(({ update }) => update.path && update.kind !== "unrecognised");
  const needsEmailCorrection = updates.some(({ previewError }) => previewError);
  const correctingEmail = needsEmailCorrection && correction.status !== "success";
  const canApprove = editable.length > 0 || reviewedUpdates.some(({ update }) => update.kind === "blob-upload");
  return (
  <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
    {correctingEmail ? (
      <form action={parseCorrection} className="grid gap-6 border border-[var(--line)] bg-white/60 p-5">
        <div>
          <p className="font-bold uppercase">Step 1: Correct the email</p>
          <p className="mt-2 text-sm">
            Fix the email text, then parse it to review the proposed content changes.
          </p>
        </div>
        <label className="grid gap-2 font-bold" htmlFor="emailText">
          Email text
          <textarea
            className="min-h-96 w-full border border-[var(--line)] bg-white p-3 font-mono text-sm font-normal"
            id="emailText"
            name="emailText"
            defaultValue={correction.emailText ?? emailText}
          />
        </label>
        <input type="hidden" name="emailId" value={emailId} />
        {correction.message && <p className="text-sm" role="alert">{correction.message}</p>}
        <button
          className="w-fit border-2 border-[var(--ink)] bg-white px-5 py-3 font-bold"
          disabled={parsing}
          type="submit">
          {parsing ? "Parsing..." : "Parse corrected email"}
        </button>
      </form>
    ) : canApprove &&
      <form action={approve} className="grid gap-6 border border-[var(--line)] bg-white/60 p-5">
        <div>
          <p className="font-bold uppercase">
            {needsEmailCorrection ? "Step 2: Review the proposed changes" : "Review proposed changes"}
          </p>
          <p className="mt-2 text-sm">Check the content below before saving it.</p>
        </div>
        {editable.map(({ update, content, existing }, index) => (
          <div>
            <p className="mb-3 font-bold">{update.path}</p>
            <LineDiff after={content} before={existing ?? ""} />
            <div key={update.path}>
              <ContentEditor
                id={`content-${index}`}
                name={`content-${index}`}
                kind={update.kind}
                defaultValue={content}
                label={`Saved content — ${update.path}`}
              />
              <input type="hidden" name={`path-${index}`} value={update.path} />
            </div>
          </div>
        ))}
        <input type="hidden" name="emailId" value={emailId} />
        {correction.status === "success" && (
          <input type="hidden" name="emailText" value={correction.emailText ?? ""} />
        )}
        {approval.message && <p className="text-sm">{approval.message}</p>}
        <button
          className="mt-4 border-2 border-[var(--ink)] bg-[var(--accent)] px-5 py-3 font-bold"
          disabled={approving}
          type="submit">
          {approving ? "Saving..." : "Approve and save"}
        </button>
      </form>
    }
    <form action={updateStatus} className="border border-[var(--line)] p-5">
      <input type="hidden" name="emailId" value={emailId} />
      <p className="font-bold">Other actions</p>
      <div className="mt-4 grid gap-3">
        <button
          className="border border-[var(--ink)] px-4 py-2 text-left"
          name="status"
          value="declined"
          disabled={updating}
          type="submit">Decline</button>
        <button
          className="border border-[var(--ink)] px-4 py-2 text-left"
          name="status"
          value="no-action"
          disabled={updating}
          type="submit">No action needed</button>
        <button
          className="border border-[var(--ink)] px-4 py-2 text-left"
          name="status"
          value="junk"
          disabled={updating}
          type="submit">Junk</button>
      </div>
      {status.message && <p className="mt-5 text-sm">{status.message}</p>}
      </form>
  </div>);
}
