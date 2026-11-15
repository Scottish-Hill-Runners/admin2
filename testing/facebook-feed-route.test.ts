import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getFacebookFeed: vi.fn() }));
vi.mock("@/lib/facebook-feed", () => ({ getFacebookFeed: mocks.getFacebookFeed }));

import { GET, OPTIONS } from "@/app/api/facebook-feed/route";

const feed = {
  updatedAt: "2026-01-01T12:00:00Z",
  posts: [{ id: "1_2", createdTime: "2026-01-01T10:00:00Z", message: "A post", images: [] }],
};

function request(ifNoneMatch?: string) {
  return new Request("https://admin.example/api/facebook-feed", {
    headers: ifNoneMatch ? { "If-None-Match": ifNoneMatch } : undefined,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getFacebookFeed.mockResolvedValue(feed);
});

describe("public Facebook feed caching", () => {
  it("returns an ETag and allows browsers to store and revalidate the feed", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(feed);
    expect(response.headers.get("etag")).toMatch(/^W\/"[a-f0-9]{64}"$/);
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-expose-headers")).toBe("ETag");
  });

  it("returns an empty 304 for a matching weak, strong, list or wildcard validator", async () => {
    const initial = await GET(request());
    const etag = initial.headers.get("etag");
    expect(etag).not.toBeNull();
    for (const validator of [etag!, etag!.slice(2), `"other", ${etag}`, "*"]) {
      const response = await GET(request(validator));
      expect(response.status).toBe(304);
      expect(await response.text()).toBe("");
      expect(response.headers.get("etag")).toBe(etag);
      expect(response.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
    }
  });

  it("returns updated content after a post is removed, even if updatedAt stays the same", async () => {
    const original = await GET(request());
    const etag = original.headers.get("etag");
    expect(etag).not.toBeNull();
    mocks.getFacebookFeed.mockResolvedValue({ ...feed, posts: [] });
    const changed = await GET(request(etag!));
    expect(changed.status).toBe(200);
    expect(changed.headers.get("etag")).not.toBe(etag);
    expect(await changed.json()).toEqual({ ...feed, posts: [] });
  });

  it("does not cache storage failures, even with a matching validator", async () => {
    const original = await GET(request());
    mocks.getFacebookFeed.mockRejectedValue(new Error("storage unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await GET(request(original.headers.get("etag")!));
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.has("etag")).toBe(false);
    } finally {
      log.mockRestore();
    }
  });

  it("allows explicit cross-origin conditional requests", () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toContain("GET");
    expect(response.headers.get("access-control-allow-headers")).toContain("If-None-Match");
  });
});
