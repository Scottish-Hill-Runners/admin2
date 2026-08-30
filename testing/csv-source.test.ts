import { describe, expect, it } from "vitest";
import { csvFromAttachment } from "@/lib/csv-source";

describe("CSV sources", () => {
  it("decodes base64 CSV attachments", async () => {
    const content = Buffer.from("Position,Name\n1,Runner\n").toString("base64");
    await expect(
      csvFromAttachment("email-id", { filename: "results.csv", content }),
    ).resolves.toBe("Position,Name\n1,Runner\n");
  });

  it("rejects oversized attachments", async () => {
    const content = Buffer.alloc(15 * 1024 * 1024 + 1).toString("base64");
    await expect(
      csvFromAttachment("email-id", { filename: "results.csv", content }),
    ).rejects.toThrow("15 MB");
  });
});
