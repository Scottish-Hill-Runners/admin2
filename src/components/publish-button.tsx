"use client";

import { useState, useTransition } from "react";
import { publishUpdates } from "@/app/publish/actions";

export function PublishButton() {
  const [message, setMessage] = useState(" ");
  const [pending, startTransition] = useTransition();
  return <div><button className="border-2 border-[var(--ink)] bg-[var(--accent)] px-5 py-3 font-bold disabled:opacity-60" disabled={pending} onClick={() => startTransition(async () => setMessage((await publishUpdates()).message))}>{pending ? "Publishing..." : "Publish updates"}</button><p className="mt-4 text-sm">{message}</p></div>;
}
