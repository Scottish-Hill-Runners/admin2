"use client";

import { useActionState } from "react";
import { refreshFeed, removePost, type FeedActionState } from "@/app/facebook-feed/actions";

const initialState: FeedActionState = { status: "idle" };

export function RefreshFeedButton() {
  const [state, action, pending] = useActionState(refreshFeed, initialState);
  return (
    <form action={action}>
      <button type="submit" disabled={pending} className="border-2 border-[var(--ink)] bg-[var(--accent)] px-5 py-3 font-bold disabled:opacity-50">
        {pending ? "Refreshing..." : "Refresh feed"}
      </button>
      <p role="status" className="mt-3 text-sm">{state.message}</p>
    </form>
  );
}

export function RemoveFeedPostButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(removePost, initialState);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="mt-3 border border-[var(--ink)] px-3 py-2 text-sm disabled:opacity-50">
        {pending ? "Removing..." : "Remove from feed"}
      </button>
      <p role="status" className="mt-2 text-sm">{state.message}</p>
    </form>
  );
}
