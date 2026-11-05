import { beforeEach, describe, expect, it, vi } from "vitest";
import matter from "gray-matter";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirected");
  }),
}));
vi.mock("@/lib/auth-session", () => ({
  requireAdmin: vi.fn(),
}));
vi.mock("@/lib/resend", () => ({
  getReceivedEmail: vi.fn(),
}));
vi.mock("@/lib/github", () => ({
  ensureStagingBranch: vi.fn(),
  getFile: vi.fn(),
  commitFiles: vi.fn(),
}));
vi.mock("@/lib/email-status", () => ({
  updateStatus: vi.fn(),
}));
vi.mock("@/lib/blob-upload", () => ({
  uploadEmailAsset: vi.fn(),
}));

import {
  approveEmail,
  previewCorrectedEmail,
} from "@/app/inbox/[id]/actions";
import { requireAdmin } from "@/lib/auth-session";
import { commitFiles, ensureStagingBranch, getFile } from "@/lib/github";
import { updateStatus } from "@/lib/email-status";
import { getReceivedEmail } from "@/lib/resend";

describe("email approval", () => {
  beforeEach(() => {
    vi.mocked(requireAdmin).mockResolvedValue({
      githubAccessToken: "token",
      user: { name: "Admin", login: "admin" },
    } as Awaited<ReturnType<typeof requireAdmin>>);
    vi.mocked(getReceivedEmail).mockResolvedValue({
      id: "email-id",
      from: "editor@example.com",
      to: ["news@example.com"],
      subject: "News",
      created_at: "2026-11-05T00:00:00.000Z",
      text: [
        "!-- START",
        "File: news/2026/2026-11-05-41284.md",
        "---",
        "title: News",
        "excerpt: This excerpt has a^",
        "broken continuation",
        "date: 2026-11-05",
        "---",
        "Body",
        "!-- END",
      ].join("\n"),
    });
    vi.mocked(getFile).mockResolvedValue(null);
    vi.mocked(ensureStagingBranch).mockResolvedValue(undefined);
    vi.mocked(commitFiles).mockResolvedValue({ commitUrl: "", sha: "" });
    vi.mocked(updateStatus).mockResolvedValue(undefined);
  });

  it("previews corrected email without committing, then approves the reviewed content once", async () => {
    vi.mocked(getFile).mockResolvedValue({
      content: "---\ntitle: Existing\nkeep: yes\n---\nOld body\n",
      sha: "current-sha",
    });
    const correctedEmailText = [
      "!-- START",
      "File: news/2026/2026-11-05-41284.md",
      "---",
      "title: News",
      "excerpt: This excerpt has a^",
      "corrected continuation",
      "date: 2026-11-05",
      "---",
      "Body",
      "!-- END",
    ].join("\n");
    const correctionForm = new FormData();
    correctionForm.set("emailId", "email-id");
    correctionForm.set("emailText", correctedEmailText);
    const preview = await previewCorrectedEmail(
      { status: "idle" },
      correctionForm,
    );

    expect(preview.status).toBe("success");
    expect(commitFiles).not.toHaveBeenCalled();

    const approvalForm = new FormData();
    approvalForm.set("emailId", "email-id");
    approvalForm.set("emailText", correctedEmailText);
    approvalForm.set(
      "content-0",
      "---\ntitle: News\nkeep: yes\nexcerpt: Reviewed by admin\n---\n\nBody\n",
    );

    await expect(
      approveEmail({ status: "idle" }, approvalForm),
    ).rejects.toThrow("redirected");

    expect(commitFiles).toHaveBeenCalledTimes(1);
    expect(commitFiles).toHaveBeenCalledWith(
      "token",
      expect.any(Array),
      "Update news/2026/2026-11-05-41284.md via admin review",
    );
    const [file] = vi.mocked(commitFiles).mock.calls[0][1];
    expect(file).toMatchObject({
      path: "news/2026/2026-11-05-41284.md",
      sha: "current-sha",
    });
    expect(matter(file.content).data).toMatchObject({
      title: "News",
      keep: "yes",
      excerpt: "Reviewed by admin",
    });
    expect(matter(file.content).content).toContain("Body");
    expect(updateStatus).toHaveBeenCalledWith("email-id", "approved", "Admin");
  });
});
