/**
 * GitHub API client for skill-version-eval.
 *
 * Data flow:
 *   listCommits(owner, repo, path)
 *     → GET api.github.com/repos/{owner}/{repo}/commits?path={path}&per_page=30
 *     → CommitEntry[]
 *
 *   fetchContent(owner, repo, path, ref)
 *     → GET api.github.com/repos/{owner}/{repo}/contents/{path}?ref={ref}
 *       (Accept: application/vnd.github.raw+json)
 *     → raw text string | null
 *
 * Error handling:
 *   404 → empty array (commits) or null (content)
 *   403 → throw with "rate limit" message
 *   Other → throw with status + message
 */

import type { CommitEntry } from "./types.js";

const GITHUB_API = "https://api.github.com";
const TIMEOUT_MS = 15_000;

async function githubFetch(path: string, accept?: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      Accept: accept || "application/vnd.github+json",
    };

    const res = await fetch(`${GITHUB_API}${path}`, {
      headers,
      signal: controller.signal,
    });

    if (res.status === 403) {
      const remaining = res.headers.get("X-RateLimit-Remaining");
      if (remaining === "0") {
        throw new Error("GitHub API rate limit exceeded — try again later");
      }
      throw new Error(`GitHub API forbidden (403): ${await res.text().catch(() => "unknown")}`);
    }

    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function listCommits(
  owner: string,
  repo: string,
  path: string,
): Promise<CommitEntry[]> {
  const encodedPath = encodeURIComponent(path);
  const res = await githubFetch(
    `/repos/${owner}/${repo}/commits?path=${encodedPath}&per_page=30`,
  );

  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${await res.text().catch(() => "unknown")}`);
  }

  const data = await res.json() as Array<{
    sha: string;
    commit: {
      message: string;
      committer: { date: string };
    };
  }>;

  return data.map((c) => ({
    sha: c.sha,
    shortSha: c.sha.slice(0, 7),
    message: c.commit.message.split("\n")[0],
    date: c.commit.committer.date,
  }));
}

export async function fetchContent(
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string | null> {
  // Encode each path segment individually — do NOT encodeURIComponent the whole path,
  // because that would encode "/" as "%2F" and GitHub API would return 404.
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const encodedRef = encodeURIComponent(ref);
  const res = await githubFetch(
    `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodedRef}`,
    "application/vnd.github.raw+json",
  );

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${await res.text().catch(() => "unknown")}`);
  }

  return res.text();
}
