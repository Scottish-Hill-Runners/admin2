import { randomUUID } from "node:crypto";
import { BlobPreconditionFailedError, del, get, head, list, put } from "@vercel/blob";
import { z } from "zod";
import { configured } from "@/lib/cloudinary";
import { env } from "@/lib/env";
import { getLatestFacebookPosts, isFacebookPostPublished, type SourcePost } from "@/lib/facebook-graph";

const imageSchema = z.object({
  publicId: z.string().startsWith("facebook-feed/"),
  url: z.url(),
  description: z.string().optional(),
});
const postSchema = z.object({
  id: z.string().regex(/^\d+_\d+$/),
  createdTime: z.string(),
  sourceUpdatedTime: z.string().optional(),
  message: z.string(),
  images: z.array(imageSchema),
  needsReview: z.boolean().optional(),
});
const feedSchema = z.object({
  updatedAt: z.string(),
  posts: z.array(postSchema),
  suppressed: z.array(z.object({ id: z.string().regex(/^\d+_\d+$/), createdTime: z.string() })),
  pendingDeletes: z.array(z.string().startsWith("facebook-feed/")),
});

export type FeedPost = z.infer<typeof postSchema>;
type Feed = z.infer<typeof feedSchema>;
const path = "facebook-feed/feed.json";
const journalPrefix = "facebook-feed/uploads/";
const emptyFeed: Feed = { updatedAt: "", posts: [], suppressed: [], pendingDeletes: [] };

async function readFeed(): Promise<{ feed: Feed; etag?: string }> {
  const blob = await get(path, {
    access: "private",
    token: env.BLOB_READ_WRITE_TOKEN,
    useCache: false,
    headers: { "Accept-Encoding": "identity" },
  });
  if (!blob) return { feed: emptyFeed };
  if (!blob.stream) throw new Error("Facebook feed storage returned no content");
  return { feed: feedSchema.parse(await new Response(blob.stream).json()), etag: blob.blob.etag };
}

function assertWritableEtag(etag: string | undefined) {
  if (etag !== undefined && (!etag || etag.startsWith("W/")))
    throw new Error("Facebook feed storage returned a missing or weak ETag; refusing to overwrite");
}

async function writeFeed(feed: Feed, etag?: string) {
  assertWritableEtag(etag);
  try {
    return await put(path, JSON.stringify(feed), {
      access: "private",
      token: env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
      abortSignal: AbortSignal.timeout(60_000),
      ...(etag !== undefined ? { ifMatch: etag } : { allowOverwrite: false }),
    });
  } catch (error) {
    if (etag && error instanceof BlobPreconditionFailedError) {
      try {
        const current = await get(path, {
          access: "private",
          token: env.BLOB_READ_WRITE_TOKEN,
          useCache: false,
          headers: { "Accept-Encoding": "identity" },
        });
        if (current?.stream) await current.stream.cancel();
        const metadata = await head(path, { token: env.BLOB_READ_WRITE_TOKEN });
        console.error("Facebook feed Blob ETag diagnostic", {
          currentBlobFound: Boolean(current),
          writeMatchesCurrentRead: current ? etag === current.blob.etag : null,
          writeMatchesMetadata: etag === metadata.etag,
          currentReadMatchesMetadata: current ? current.blob.etag === metadata.etag : null,
          writeEtagIsWeak: etag.startsWith("W/"),
          currentReadHasEtag: Boolean(current?.blob.etag),
          contentEncoding: current?.headers.get("content-encoding") ?? null,
        });
      } catch (diagnosticError) {
        console.error("Facebook feed Blob ETag diagnostic failed", diagnosticError);
      }
    }
    throw error;
  }
}

function stripFacebookTracking(message: string) {
  return message.replace(/https?:\/\/[^\s<>"']+/gi, (url) => {
    const punctuation = url.match(/[.,;:!?)\]}]+$/)?.[0] ?? "";
    const link = url.slice(0, url.length - punctuation.length);
    const queryStart = link.indexOf("?");
    const fragmentStart = link.indexOf("#");
    if (queryStart < 0 || (fragmentStart >= 0 && fragmentStart < queryStart)) return url;

    const queryEnd = fragmentStart < 0 ? link.length : fragmentStart;
    const parameters = link.slice(queryStart + 1, queryEnd).split("&");
    const remaining = parameters.filter((parameter) =>
      new URLSearchParams(parameter).keys().next().value?.toLowerCase() !== "fbclid",
    );
    if (remaining.length === parameters.length) return url;
    const query = remaining.some(Boolean) ? `?${remaining.join("&")}` : "";
    return link.slice(0, queryStart) + query + link.slice(queryEnd) + punctuation;
  });
}

export async function getFacebookFeed() {
  const { feed } = await readFeed();
  return {
    updatedAt: feed.updatedAt,
    posts: feed.posts.map(({ id, createdTime, message, images }) => ({
      id, createdTime, message: stripFacebookTracking(message),
      images: images.map(({ url, description }) => ({ url, description })),
    })),
  };
}

export async function getFacebookFeedForAdmin() {
  return (await readFeed()).feed;
}

async function downloadPhoto(source: string): Promise<Buffer> {
  const url = new URL(source);
  if (
    url.protocol !== "https:" || url.port ||
    !["fbcdn.net", "fbsbx.com"].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  ) throw new Error("Facebook returned an unrecognised photo URL");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body || !response.headers.get("content-type")?.startsWith("image/"))
    throw new Error("A Facebook photo could not be downloaded");
  const maxBytes = 20 * 1024 * 1024;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error("A Facebook photo exceeds the 20 MB limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}

async function uploadPhoto(photo: SourcePost["photos"][number], publicId: string) {
  const buffer = await downloadPhoto(photo.url);
  const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const stream = configured().uploader.upload_stream(
      { public_id: publicId, asset_folder: "facebook-feed", resource_type: "image", overwrite: false },
      (error, value) => {
        if (error) reject(error);
        else if (!value) reject(new Error("Facebook photo upload returned no result"));
        else resolve(value);
      },
    );
    stream.end(buffer);
  });
  if (result.public_id !== publicId) throw new Error("Facebook photo upload returned an unexpected identifier");
  return { publicId, url: result.secure_url, description: photo.description };
}

async function cleanupAbandonedUploads() {
  let cursor: string | undefined;
  let failed = 0;
  do {
    const page = await list({ prefix: journalPrefix, cursor, token: env.BLOB_READ_WRITE_TOKEN });
    for (const item of page.blobs) {
      if (Date.now() - item.uploadedAt.getTime() < 24 * 60 * 60 * 1000) continue;
      const journal = await get(item.pathname, { access: "private", token: env.BLOB_READ_WRITE_TOKEN, useCache: false });
      if (!journal?.stream) throw new Error("Facebook upload journal could not be read");
      const ids = z.array(z.string().startsWith("facebook-feed/")).parse(await new Response(journal.stream).json());
      const current = (await readFeed()).feed;
      const active = new Set(current.posts.flatMap((post) => post.images.map((image) => image.publicId)));
      const unsuccessful = await deleteImages(ids.filter((id) => !active.has(id)));
      if (unsuccessful.length) failed += unsuccessful.length;
      else await del(item.pathname, { token: env.BLOB_READ_WRITE_TOKEN });
    }
    if (page.hasMore && !page.cursor) throw new Error("Facebook upload journal pagination is incomplete");
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return failed;
}

async function deleteImages(ids: string[]) {
  const failed: string[] = [];
  for (const id of [...new Set(ids)]) {
    try {
      if (!id.startsWith("facebook-feed/")) throw new Error("Invalid Facebook photo identifier");
      const result: { result: string } = await configured().uploader.destroy(id, {
        resource_type: "image",
        invalidate: true,
      });
      if (result.result !== "ok" && result.result !== "not found")
        throw new Error(`Unexpected asset deletion result: ${result.result}`);
    } catch (error) {
      console.error("Could not delete a Facebook feed photo", id, error);
      failed.push(id);
    }
  }
  return failed;
}

async function cleanup(feed: Feed, etag: string) {
  if (!feed.pendingDeletes.length) return 0;
  const failed = await deleteImages(feed.pendingDeletes);
  try {
    await writeFeed({ ...feed, pendingDeletes: failed }, etag);
  } catch (error) {
    console.error("Could not update Facebook feed cleanup state; cleanup will retry", error);
    return feed.pendingDeletes.length;
  }
  return failed.length;
}

export async function refreshFacebookFeed() {
  const deadline = Date.now() + 60 * 60 * 1000;
  const abandoned = await cleanupAbandonedUploads();
  const current = await readFeed();
  assertWritableEtag(current.etag);
  const source = await getLatestFacebookPosts();
  const sourceIds = new Set(source.map((post) => post.id));
  const oldest = source.length === 30 ? Date.parse(source[29].createdTime) : -Infinity;
  const suppressed = current.feed.suppressed.filter(
    (post) => sourceIds.has(post.id) || Date.parse(post.createdTime) >= oldest,
  );
  const retained: FeedPost[] = [];
  let ambiguous = 0;
  for (const old of current.feed.posts) {
    if (sourceIds.has(old.id) || Date.parse(old.createdTime) < oldest) continue;
    const published = await isFacebookPostPublished(old.id);
    if (published !== false) {
      retained.push({ ...old, needsReview: published === null });
      if (published === null) ambiguous++;
    }
  }
  const suppressedIds = new Set(suppressed.map((post) => post.id));
  const selected = source.filter((post) => !suppressedIds.has(post.id));
  const uploaded: FeedPost["images"] = [];
  const journal = `${journalPrefix}${randomUUID()}.json`;
  const planned: string[] = [];
  try {
    const imported: FeedPost[] = [];
    for (const post of selected) {
      if (Date.now() >= deadline) throw new Error("Facebook refresh exceeded its time limit");
      const previous = current.feed.posts.find((item) => item.id === post.id);
      if (post.updatedTime && previous?.sourceUpdatedTime === post.updatedTime) {
        imported.push({ ...previous, needsReview: false });
        continue;
      }
      const images: FeedPost["images"] = [];
      for (const photo of post.photos) {
        const publicId = `facebook-feed/${randomUUID()}`;
        planned.push(publicId);
        await put(journal, JSON.stringify(planned), {
          access: "private",
          token: env.BLOB_READ_WRITE_TOKEN,
          addRandomSuffix: false,
          allowOverwrite: true,
          abortSignal: AbortSignal.timeout(60_000),
        });
        const image = await uploadPhoto(photo, publicId);
        uploaded.push(image);
        images.push(image);
      }
      imported.push({
        id: post.id, createdTime: post.createdTime, sourceUpdatedTime: post.updatedTime,
        message: post.message, images,
      });
    }
    const posts = [...retained, ...imported]
      .sort((a, b) => Date.parse(b.createdTime) - Date.parse(a.createdTime))
      .slice(0, 30);
    const keptIds = new Set(posts.flatMap((post) => post.images.map((image) => image.publicId)));
    const pendingDeletes = [
      ...current.feed.pendingDeletes,
      ...current.feed.posts.flatMap((post) => post.images.map((image) => image.publicId)),
      ...uploaded.map((image) => image.publicId),
    ].filter((id) => !keptIds.has(id));
    const feed: Feed = {
      updatedAt: new Date().toISOString(),
      posts,
      suppressed,
      pendingDeletes: [...new Set(pendingDeletes)],
    };
    if (Date.now() >= deadline) throw new Error("Facebook refresh exceeded its time limit");
    const written = await writeFeed(feed, current.etag);
    const pending = await cleanup(feed, written.etag);
    if (planned.length) {
      try {
        await del(journal, { token: env.BLOB_READ_WRITE_TOKEN });
      } catch (error) {
        console.error("Could not remove Facebook upload journal; cleanup will retry", error);
      }
    }
    return { count: posts.length, ambiguous, pending: pending + abandoned };
  } catch (error) {
    if (planned.length) console.error("Facebook refresh left a cleanup journal for incomplete uploads");
    throw error;
  }
}

export async function removeFacebookPost(id: string) {
  if (!/^\d+_\d+$/.test(id)) throw new Error("Invalid Facebook post identifier");
  const { feed, etag } = await readFeed();
  assertWritableEtag(etag);
  const post = feed.posts.find((item) => item.id === id);
  if (!post) throw new Error("Facebook post was not found");
  const next: Feed = {
    ...feed,
    posts: feed.posts.filter((item) => item.id !== id),
    suppressed: [...feed.suppressed.filter((item) => item.id !== id), { id, createdTime: post.createdTime }],
    pendingDeletes: [...new Set([...feed.pendingDeletes, ...post.images.map((image) => image.publicId)])],
  };
  const written = await writeFeed(next, etag);
  return cleanup(next, written.etag);
}
