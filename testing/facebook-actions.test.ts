import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), refresh: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/auth-session", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/facebook-feed", () => ({ refreshFacebookFeed: mocks.refresh, removeFacebookPost: mocks.remove }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { refreshFeed, removePost } from "@/app/facebook-feed/actions";

describe("Facebook feed actions", () => {
  it("requires authentication before refreshing or removing posts", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("not signed in"));
    await expect(refreshFeed()).rejects.toThrow("not signed in");
    const data = new FormData();
    data.set("id", "123_1");
    await expect(removePost({ status: "idle" }, data)).rejects.toThrow("not signed in");
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
