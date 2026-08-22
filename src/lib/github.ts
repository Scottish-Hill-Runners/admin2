import { Octokit } from "@octokit/rest";
import { env } from "@/lib/env";

export function normalizeRepoPath(path: string) {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("..") ||
    path.includes("\\")
  )
    throw new Error("Invalid content path");
  return path;
}
function repository() {
  const [owner, repo] = env.CONTENT_REPO.split("/");
  if (!owner || !repo) throw new Error("Content store is not configured");
  return { owner, repo };
}
function client(token: string) {
  return new Octokit({ auth: token });
}
export async function getFile(
  token: string,
  path: string,
  ref: string = env.CONTENT_STAGING_BRANCH,
) {
  const { owner, repo } = repository();
  try {
    const response = await client(token).repos.getContent({
      owner,
      repo,
      path: normalizeRepoPath(path),
      ref,
    });
    if (Array.isArray(response.data) || response.data.type !== "file")
      return null;
    return {
      content: Buffer.from(response.data.content, "base64").toString("utf8"),
      sha: response.data.sha,
    };
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null;
    throw error;
  }
}
export async function ensureStagingBranch(token: string) {
  const { owner, repo } = repository();
  const api = client(token);
  try {
    await api.git.getRef({
      owner,
      repo,
      ref: `heads/${env.CONTENT_STAGING_BRANCH}`,
    });
  } catch (error) {
    if ((error as { status?: number }).status !== 404) throw error;
    const main = await api.git.getRef({
      owner,
      repo,
      ref: `heads/${env.CONTENT_BRANCH}`,
    });
    await api.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${env.CONTENT_STAGING_BRANCH}`,
      sha: main.data.object.sha,
    });
  }
}
export async function commitFiles(
  token: string,
  files: Array<{ path: string; content: string; sha?: string }>,
  message: string,
) {
  const { owner, repo } = repository();
  const api = client(token);
  let result: { html_url?: string; commit?: { sha?: string } } = {};
  for (const file of files) {
    const current = file.sha ?? (await getFile(token, file.path))?.sha;
    const response = await api.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: normalizeRepoPath(file.path),
      branch: env.CONTENT_STAGING_BRANCH,
      message,
      content: Buffer.from(file.content, "utf8").toString("base64"),
      ...(current ? { sha: current } : {}),
    });
    result = {
      html_url: response.data.content?.html_url,
      commit: { sha: response.data.commit.sha },
    };
  }
  return { commitUrl: result.html_url, sha: result.commit?.sha };
}
export async function publishStagingToLive(token: string) {
  const { owner, repo } = repository();
  const api = client(token);
  try {
    const pr = await api.pulls.create({
      owner,
      repo,
      head: env.CONTENT_STAGING_BRANCH,
      base: env.CONTENT_BRANCH,
      title: "Publish saved updates",
    });
    await api.pulls.merge({
      owner,
      repo,
      pull_number: pr.data.number,
      merge_method: "merge",
    });
    return { prUrl: pr.data.html_url };
  } catch (error) {
    if ((error as { status?: number }).status === 422)
      throw new Error("There are no saved updates to publish");
    throw error;
  }
}
