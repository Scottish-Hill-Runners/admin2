import Link from "next/link";
import { requireAdmin } from "@/lib/auth-session";
import { getFacebookFeedForAdmin } from "@/lib/facebook-feed";
import { RefreshFeedButton, RemoveFeedPostButton } from "@/components/facebook-feed-controls";

export const maxDuration = 300;

export default async function FacebookFeedPage() {
  await requireAdmin();
  const feed = await getFacebookFeedForAdmin();
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="underline">Review desk</Link>
      <h1 className="mt-6 text-4xl font-bold">Facebook feed</h1>
      <p className="my-4">Refresh copies SHR&apos;s published text and photographs to the website. Removed posts remain hidden while they are among the latest 30 eligible posts.</p>
      <RefreshFeedButton />
      {feed.updatedAt && <p className="mt-4 text-sm">Last refreshed: <time dateTime={feed.updatedAt}>{new Date(feed.updatedAt).toLocaleString("en-GB")}</time></p>}
      <ul className="mt-6 space-y-4">
        {feed.posts.map((post) => (
          <li key={post.id} className="border border-[var(--line)] p-4">
            <time dateTime={post.createdTime} className="text-sm">{new Date(post.createdTime).toLocaleDateString("en-GB")}</time>
            <p className="mt-2 whitespace-pre-wrap">{post.message || "Photo post"}</p>
            {post.needsReview && <p className="mt-2 font-semibold text-red-700">Could not verify this post on Facebook. Review or remove it.</p>}
            <p className="mt-2 text-sm">{post.images.length} photograph(s)</p>
            <RemoveFeedPostButton id={post.id} />
          </li>
        ))}
      </ul>
    </main>
  );
}
