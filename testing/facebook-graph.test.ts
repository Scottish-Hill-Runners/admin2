import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { FACEBOOK_PAGE_ID: "123", FACEBOOK_PAGE_ACCESS_TOKEN: "test-token", FACEBOOK_APP_SECRET: "test-secret" },
}));

import { getLatestFacebookPosts, isFacebookPostPublished } from "@/lib/facebook-graph";

const base = {
  created_time: "2026-01-01T10:00:00+0000",
  is_published: true,
  from: { id: "123" },
};

afterEach(() => vi.unstubAllGlobals());

describe("Facebook Graph feed", () => {
  it("imports Page text and all album photos, excluding shared, video and other authors", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        data: [
          { ...base, id: "123_1", status_type: "mobile_status_update", message: "Hello" },
          { ...base, id: "123_2", status_type: "shared_story" },
          { ...base, id: "123_3", status_type: "added_video" },
          { ...base, id: "123_4", status_type: "mobile_status_update", from: { id: "456" } },
          {
            ...base, id: "123_5", status_type: "added_photos",
            attachments: { data: [{
              type: "album", media_type: "album",
              subattachments: {
                data: [{ type: "photo", media_type: "photo", media: { image: { src: "https://a.fbcdn.net/one.jpg" } } }],
                paging: { next: "https://graph.facebook.com/v27.0/next?access_token=do-not-forward" },
              },
            }] },
          },
        ],
      }))
      .mockResolvedValueOnce(Response.json({
        data: [{ type: "photo", media_type: "photo", media: { image: { src: "https://a.fbcdn.net/two.jpg" } } }],
      }));
    vi.stubGlobal("fetch", fetchMock);
    const posts = await getLatestFacebookPosts();
    expect(posts.map((post) => post.id)).toEqual(["123_1", "123_5"]);
    expect(posts[1].photos.map((photo) => photo.url)).toEqual([
      "https://a.fbcdn.net/one.jpg", "https://a.fbcdn.net/two.jpg",
    ]);
    const [url, options] = fetchMock.mock.calls[1];
    expect(String(url)).not.toContain("do-not-forward");
    expect(options.headers.Authorization).toBe("Bearer test-token");
    expect(new URL(String(url)).searchParams.has("appsecret_proof")).toBe(true);
  });

  it("treats ambiguous post access as unknown but surfaces token failures", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ error: { code: 100 } }, { status: 400 }))
      .mockResolvedValueOnce(Response.json({ error: { code: 190 } }, { status: 400 })));
    await expect(isFacebookPostPublished("123_1")).resolves.toBeNull();
    await expect(isFacebookPostPublished("123_1")).rejects.toThrow("code 190");
  });

  it("does not follow pagination URLs outside Meta", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      data: [], paging: { next: "https://example.com/steal" },
    })));
    await expect(getLatestFacebookPosts()).rejects.toThrow("invalid pagination URL");
  });

  it("returns no more than the 30 newest eligible posts", async () => {
    const data = Array.from({ length: 40 }, (_, index) => ({
      ...base,
      id: `123_${index + 1}`,
      status_type: "mobile_status_update",
      created_time: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data })));
    const posts = await getLatestFacebookPosts();
    expect(posts).toHaveLength(30);
    expect(posts[0].id).toBe("123_40");
    expect(posts[29].id).toBe("123_11");
  });
});
