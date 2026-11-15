import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  list: vi.fn(),
  del: vi.fn(),
  destroy: vi.fn(),
  upload: vi.fn(),
  latest: vi.fn(),
  published: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ get: mocks.get, put: mocks.put, list: mocks.list, del: mocks.del }));
vi.mock("@/lib/env", () => ({ env: { BLOB_READ_WRITE_TOKEN: "test-token" } }));
vi.mock("@/lib/cloudinary", () => ({
  configured: () => ({ uploader: { destroy: mocks.destroy, upload_stream: mocks.upload } }),
}));
vi.mock("@/lib/facebook-graph", () => ({
  getLatestFacebookPosts: mocks.latest,
  isFacebookPostPublished: mocks.published,
}));

import { getFacebookFeed, getFacebookFeedForAdmin, refreshFacebookFeed, removeFacebookPost } from "@/lib/facebook-feed";

const old = {
  id: "123_1", createdTime: "2026-01-01T00:00:00Z", message: "Old",
  images: [{ publicId: "facebook-feed/old", url: "https://res.cloudinary.com/test/image/upload/old.jpg" }],
};

function stored(posts: Array<typeof old & { sourceUpdatedTime?: string }> = [old]) {
  return {
    stream: new Blob([JSON.stringify({ updatedAt: "2026-01-01", posts, suppressed: [], pendingDeletes: [] })]).stream(),
    blob: { etag: "old-etag" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue(stored());
  mocks.put.mockResolvedValue({ etag: "new-etag" });
  mocks.list.mockResolvedValue({ blobs: [], hasMore: false });
  mocks.del.mockResolvedValue(undefined);
  mocks.destroy.mockResolvedValue({ result: "ok" });
  mocks.latest.mockResolvedValue([]);
});

afterEach(() => vi.unstubAllGlobals());

describe("public Facebook feed", () => {
  it("removes fbclid from stored message links without changing other parameters or text", async () => {
    const message = [
      "See https://example.com/supportwall?fbclid=tracking.",
      "(https://example.com/path?first=a%20b&fbclid=one&last=2#section)",
      "https://example.com/?fbclid=one&x=1&FBCLID=two",
      "https://example.com/path?fbclid=one#section",
      "https://example.com/unchanged?ref=fbclid#part?fbclid=fragment",
      "Plain fbclid=not-a-link",
    ].join("\n");
    mocks.get.mockImplementation(async () => stored([{ ...old, message }]));

    const feed = await getFacebookFeed();
    expect(feed.posts[0].message).toBe([
      "See https://example.com/supportwall.",
      "(https://example.com/path?first=a%20b&last=2#section)",
      "https://example.com/?x=1",
      "https://example.com/path#section",
      "https://example.com/unchanged?ref=fbclid#part?fbclid=fragment",
      "Plain fbclid=not-a-link",
    ].join("\n"));
    expect((await getFacebookFeedForAdmin()).posts[0].message).toBe(message);
  });

  it("removes an encoded fbclid key while retaining the other query and fragment", async () => {
    mocks.get.mockResolvedValue(stored([{
      ...old, message: "https://example.com/?%66bclid=tracking&ref=a+b#details",
    }]));
    expect((await getFacebookFeed()).posts[0].message).toBe("https://example.com/?ref=a+b#details");
  });
});

describe("Facebook feed refresh", () => {
  it("keeps an ambiguous post and reports it without deleting its images", async () => {
    mocks.published.mockResolvedValue(null);
    const result = await refreshFacebookFeed();
    expect(result.ambiguous).toBe(1);
    const saved = JSON.parse(mocks.put.mock.calls[0][1]);
    expect(saved.posts).toEqual([{ ...old, needsReview: true }]);
    expect(mocks.destroy).not.toHaveBeenCalled();
    expect(mocks.put.mock.calls[0][2].ifMatch).toBe("old-etag");
  });

  it("removes a confirmed unpublished post and deletes its photos", async () => {
    mocks.published.mockResolvedValue(false);
    await refreshFacebookFeed();
    expect(JSON.parse(mocks.put.mock.calls[0][1]).posts).toEqual([]);
    expect(mocks.destroy).toHaveBeenCalledWith("facebook-feed/old", expect.objectContaining({ invalidate: true }));
    expect(JSON.parse(mocks.put.mock.calls[1][1]).pendingDeletes).toEqual([]);
  });

  it("keeps failed photo deletions for the next cleanup", async () => {
    mocks.published.mockResolvedValue(false);
    mocks.destroy.mockRejectedValue(new Error("storage unavailable"));
    const result = await refreshFacebookFeed();
    expect(result.pending).toBe(1);
    expect(JSON.parse(mocks.put.mock.calls[1][1]).pendingDeletes).toEqual(["facebook-feed/old"]);
  });

  it("leaves the existing feed untouched if Facebook fails", async () => {
    mocks.latest.mockRejectedValue(new Error("Facebook unavailable"));
    await expect(refreshFacebookFeed()).rejects.toThrow("Facebook unavailable");
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.destroy).not.toHaveBeenCalled();
  });

  it("suppresses manually removed posts and cleans up only their own photos", async () => {
    await removeFacebookPost("123_1");
    const saved = JSON.parse(mocks.put.mock.calls[0][1]);
    expect(saved.posts).toEqual([]);
    expect(saved.suppressed).toEqual([{ id: "123_1", createdTime: old.createdTime }]);
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
  });

  it("does not forget a manually removed post when it is temporarily absent from the source", async () => {
    mocks.get.mockResolvedValue({
      stream: new Blob([JSON.stringify({
        updatedAt: "2026-01-01", posts: [], pendingDeletes: [],
        suppressed: [{ id: "123_1", createdTime: old.createdTime }],
      })]).stream(),
      blob: { etag: "old-etag" },
    });
    await refreshFacebookFeed();
    expect(JSON.parse(mocks.put.mock.calls[0][1]).suppressed).toEqual([
      { id: "123_1", createdTime: old.createdTime },
    ]);
  });

  it("downloads a Facebook photo and saves only the Cloudinary URL in the feed", async () => {
    mocks.get.mockResolvedValue(stored([]));
    mocks.latest.mockResolvedValue([{
      id: "123_2", createdTime: "2026-01-02T00:00:00Z", message: "New",
      photos: [{ url: "https://scontent.fbcdn.net/example.jpg", description: "On the hill" }],
    }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("image", {
      headers: { "content-type": "image/jpeg" },
    })));
    mocks.upload.mockImplementation((options, callback) => ({
      end: () => callback(null, {
        public_id: options.public_id,
        secure_url: "https://res.cloudinary.com/test/image/upload/photo.jpg",
      }),
    }));
    await refreshFacebookFeed();
    const saved = JSON.parse(mocks.put.mock.calls[1][1]);
    expect(saved.posts[0].images[0]).toMatchObject({
      url: "https://res.cloudinary.com/test/image/upload/photo.jpg",
      description: "On the hill",
    });

    expect(JSON.stringify(saved)).not.toContain("fbcdn.net");
    expect(mocks.del).toHaveBeenCalled();
  });

  it("reuses photos for posts that have not changed on Facebook", async () => {
    const updatedTime = "2026-01-03T00:00:00Z";
    mocks.get.mockResolvedValue(stored([{ ...old, sourceUpdatedTime: updatedTime }]));
    mocks.latest.mockResolvedValue([{
      id: old.id, createdTime: old.createdTime, updatedTime, message: old.message,
      photos: [{ url: "https://scontent.fbcdn.net/example.jpg" }],
    }]);
    await refreshFacebookFeed();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.destroy).not.toHaveBeenCalled();
    expect(JSON.parse(mocks.put.mock.calls[0][1]).posts[0].images).toEqual(old.images);
  });

  it("keeps an upload journal if the feed write fails", async () => {
    mocks.get.mockResolvedValue(stored([]));
    mocks.latest.mockResolvedValue([{
      id: "123_2", createdTime: "2026-01-02T00:00:00Z", message: "New",
      photos: [{ url: "https://scontent.fbcdn.net/example.jpg" }],
    }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("image", {
      headers: { "content-type": "image/jpeg" },
    })));
    mocks.upload.mockImplementation((options, callback) => ({
      end: () => callback(null, {
        public_id: options.public_id,
        secure_url: "https://res.cloudinary.com/test/image/upload/photo.jpg",
      }),
    }));
    mocks.put.mockResolvedValueOnce({ etag: "journal" }).mockRejectedValueOnce(new Error("conflict"));
    await expect(refreshFacebookFeed()).rejects.toThrow("conflict");
    expect(mocks.del).not.toHaveBeenCalled();
    expect(mocks.destroy).not.toHaveBeenCalled();
  });

  it("cleans up abandoned uploads without deleting photos still in the live feed", async () => {
    const pathname = "facebook-feed/uploads/abandoned.json";
    mocks.list.mockResolvedValue({
      blobs: [{ pathname, uploadedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }],
      hasMore: false,
    });
    mocks.get.mockImplementation(async (requestedPath: string) => requestedPath === pathname
      ? { stream: new Blob([JSON.stringify(["facebook-feed/old", "facebook-feed/orphan"])]).stream() }
      : stored());
    mocks.published.mockResolvedValue(true);
    await refreshFacebookFeed();
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
    expect(mocks.destroy).toHaveBeenCalledWith("facebook-feed/orphan", expect.any(Object));
    expect(mocks.del).toHaveBeenCalledWith(pathname, expect.any(Object));
  });
});
