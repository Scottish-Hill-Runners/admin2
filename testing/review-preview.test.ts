import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/github", () => ({
  getFile: vi.fn(),
}));

import { getFile } from "@/lib/github";
import { previewEmail } from "@/lib/review-preview";

describe("email review preview", () => {
  beforeEach(() => {
    vi.mocked(getFile).mockResolvedValue(null);
  });

  it("flags malformed markdown for email-text correction instead of showing a raw-content editor", async () => {
    const text = [
      "!-- START",
      "File: news/2026/2026-11-05-41284.md",
      "---",
      "title: Run Of The Mill 21/11 entries open",
      "excerpt: Entries are open for the rescheduled Run Of The Mill (21/11).^",
      "SHR",
      "awards will follow the race..",
      "date: 2026-11-05",
      "---",
      "Entries are open for the rescheduled Run Of The Mill on Saturday 21/11.",
      "!-- END",
    ].join("\n");

    const [preview] = await previewEmail("token", {
      id: "email-id",
      from: "editor@example.com",
      to: ["news@example.com"],
      subject: "News",
      created_at: "2026-11-05T00:00:00.000Z",
      text,
    });

    expect(preview.previewError).toContain("Correct the email text");
    expect(preview.content).toBe("");
  });
});
