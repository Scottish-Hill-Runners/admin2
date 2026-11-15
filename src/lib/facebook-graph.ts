import { createHmac } from "node:crypto";
import { z } from "zod";
import { env } from "@/lib/env";

const pagingSchema = z.object({
  next: z.url().optional(),
}).optional();

const attachmentSchema = z.object({
  type: z.string().optional(),
  media_type: z.string().optional(),
  description: z.string().optional(),
  media: z.object({
    image: z.object({ src: z.url() }).optional(),
  }).optional(),
  subattachments: z.object({
    data: z.array(z.unknown()),
    paging: pagingSchema,
  }).optional(),
});

const postSchema = z.object({
  id: z.string().regex(/^\d+_\d+$/),
  created_time: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  updated_time: z.string().refine((value) => !Number.isNaN(Date.parse(value))).optional(),
  message: z.string().optional(),
  is_published: z.boolean(),
  status_type: z.string(),
  from: z.object({ id: z.string() }).optional(),
  attachments: z.object({
    data: z.array(attachmentSchema),
    paging: pagingSchema,
  }).optional(),
});

type Attachment = z.infer<typeof attachmentSchema>;
type GraphPost = z.infer<typeof postSchema>;

export type SourcePost = {
  id: string;
  createdTime: string;
  updatedTime?: string;
  message: string;
  photos: { url: string; description?: string }[];
};

class GraphError extends Error {
  constructor(public readonly code: number | undefined) {
    super(`Facebook request failed${code === undefined ? "" : ` (code ${code})`}`);
  }
}

function graphCredentials() {
  const { FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN, FACEBOOK_APP_SECRET } = env;
  if (!FACEBOOK_PAGE_ID || !/^\d+$/.test(FACEBOOK_PAGE_ID) || !FACEBOOK_PAGE_ACCESS_TOKEN)
    throw new Error("Facebook Page credentials are not configured");
  return {
    pageId: FACEBOOK_PAGE_ID,
    token: FACEBOOK_PAGE_ACCESS_TOKEN,
    proof: FACEBOOK_APP_SECRET
      ? createHmac("sha256", FACEBOOK_APP_SECRET).update(FACEBOOK_PAGE_ACCESS_TOKEN).digest("hex")
      : undefined,
  };
}

async function graphRequest(url: URL): Promise<unknown> {
  const { token, proof } = graphCredentials();
  if (url.protocol !== "https:" || url.hostname !== "graph.facebook.com" || url.port)
    throw new Error("Facebook returned an invalid pagination URL");
  url.searchParams.delete("access_token");
  url.searchParams.delete("appsecret_proof");
  if (proof) url.searchParams.set("appsecret_proof", proof);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error("Facebook request could not be completed");
  }
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.object({ code: z.number().optional() }) }).safeParse(body);
    throw new GraphError(error.success ? error.data.error.code : undefined);
  }
  return body;
}

async function remainingAttachments(
  initial: { data: unknown[]; paging?: { next?: string } },
): Promise<Attachment[]> {
  const result = initial.data.map((item) => attachmentSchema.parse(item));
  let next = initial.paging?.next;
  let pages = 0;
  while (next) {
    if (++pages > 100) throw new Error("Facebook attachment pagination exceeded its limit");
    const page = z.object({ data: z.array(attachmentSchema), paging: pagingSchema })
      .parse(await graphRequest(new URL(next)));
    result.push(...page.data);
    next = page.paging?.next;
  }
  return result;
}

async function photosForPost(post: GraphPost): Promise<SourcePost | null> {
  const { pageId } = graphCredentials();
  if (!post.is_published) return null;
  if (!["added_photos", "mobile_status_update", "status_update"].includes(post.status_type))
    return null;
  if (!post.from) throw new Error("Facebook did not identify the post author");
  if (post.from.id !== pageId) return null;
  const attachments = post.attachments ? await remainingAttachments(post.attachments) : [];
  const photos: SourcePost["photos"] = [];
  for (const attachment of attachments) {
    if (attachment.type === "album" && attachment.subattachments) {
      for (const child of await remainingAttachments(attachment.subattachments)) {
        if (child.media_type !== "photo" || !child.media?.image?.src)
          throw new Error("Facebook album contains an unsupported or unavailable attachment");
        photos.push({ url: child.media.image.src, description: child.description });
      }
    } else if (attachment.media_type === "photo" && attachment.media?.image?.src) {
      photos.push({ url: attachment.media.image.src, description: attachment.description });
    } else if (attachment.media_type !== "link" || post.status_type === "added_photos") {
      return null;
    }
  }
  if (post.status_type === "added_photos" && photos.length === 0)
    throw new Error("Facebook photo post contains no accessible photographs");
  return {
    id: post.id,
    createdTime: post.created_time,
    updatedTime: post.updated_time,
    message: post.message ?? "",
    photos,
  };
}

export async function getLatestFacebookPosts(): Promise<SourcePost[]> {
  const { pageId } = graphCredentials();
  const url = new URL(`https://graph.facebook.com/v27.0/${pageId}/feed`);
  url.searchParams.set(
    "fields",
    "id,created_time,updated_time,message,is_published,status_type,from,attachments{type,media_type,description,media,subattachments{type,media_type,description,media}}",
  );
  url.searchParams.set("limit", "100");
  let next: string | undefined = url.toString();
  const posts: SourcePost[] = [];
  let pages = 0;
  while (next && posts.length < 30) {
    if (++pages > 100) throw new Error("Facebook feed pagination exceeded its limit");
    const page = z.object({ data: z.array(postSchema), paging: pagingSchema })
      .parse(await graphRequest(new URL(next)));
    for (const item of page.data) {
      const post = await photosForPost(item);
      if (post) posts.push(post);
    }
    next = page.paging?.next;
  }
  return posts.sort((a, b) => Date.parse(b.createdTime) - Date.parse(a.createdTime)).slice(0, 30);
}

export async function isFacebookPostPublished(id: string): Promise<boolean | null> {
  const url = new URL(`https://graph.facebook.com/v27.0/${id}`);
  url.searchParams.set("fields", "is_published,status_type,from");
  try {
    const post = z.object({
      is_published: z.boolean(),
      status_type: z.string(),
      from: z.object({ id: z.string() }).optional(),
    }).parse(await graphRequest(url));
    if (!post.is_published || !["added_photos", "mobile_status_update", "status_update"].includes(post.status_type))
      return false;
    if (!post.from) return null;
    return post.from.id === graphCredentials().pageId;
  } catch (error) {
    if (error instanceof GraphError && error.code === 100) return null;
    throw error;
  }
}
