"use client";

import { useActionState } from "react";
import { approveEmail, updateEmailStatus, type ReviewActionState } from "@/app/emails/[id]/actions";

const initialState: ReviewActionState = { status: "idle" };

export function ReviewActions({ emailId, content, canApprove }: {
   emailId: string; content: string; canApprove: boolean
  }) {
  const [approval, approve, approving] = useActionState(approveEmail, initialState);
  const [status, updateStatus, updating] = useActionState(updateEmailStatus, initialState);
  const message = approval.message ?? status.message;
  return (
  <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
    {canApprove &&
      <form action={approve} className="border border-[var(--line)] bg-white/60 p-5">
        <label className="font-bold" htmlFor="content">
          Saved content
        </label>
        <textarea
          className="mt-3 min-h-72 w-full border border-[var(--line)] bg-white p-3 font-mono text-sm"
          id="content"
          name="content"
          defaultValue={content} />
        <input type="hidden" name="emailId" value={emailId} />
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
      {message && <p className="mt-5 text-sm">{message}</p>}
      </form>
  </div>);
}
