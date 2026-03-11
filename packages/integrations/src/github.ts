import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

export interface PullRequest {
  number: number;
  title: string;
  author: string;
  url: string;
  diff: string;
  files: string[];
}

/**
 * Fetches PR data using the `gh` CLI.
 */
export function fetchPullRequest(repo: string, prNumber: number): PullRequest {
  const view = execFileSync("gh", ["pr", "view", String(prNumber), "--repo", repo, "--json", "number,title,author,url"], {
    encoding: "utf8",
    timeout: 30_000,
  });
  const meta = JSON.parse(view) as { number: number; title: string; author: { login: string }; url: string };

  let diff = "";
  try {
    diff = execFileSync("gh", ["pr", "diff", String(prNumber), "--repo", repo], {
      encoding: "utf8",
      timeout: 30_000,
    });
    if (diff.length > 15_000) diff = diff.slice(0, 15_000) + "\n... (truncated)";
  } catch {
    diff = "(diff unavailable)";
  }

  let files: string[] = [];
  try {
    const filesJson = execFileSync(
      "gh",
      ["pr", "view", String(prNumber), "--repo", repo, "--json", "files"],
      { encoding: "utf8", timeout: 30_000 },
    );
    const parsed = JSON.parse(filesJson) as { files: Array<{ path: string }> };
    files = parsed.files.map((f) => f.path);
  } catch {
    files = [];
  }

  return {
    number: meta.number,
    title: meta.title,
    author: meta.author.login,
    url: meta.url,
    diff,
    files,
  };
}

export function listOpenPullRequests(repo: string, limit = 10): Array<{ number: number; title: string; author: string }> {
  const output = execFileSync("gh", ["pr", "list", "--repo", repo, "--limit", String(limit), "--json", "number,title,author"], {
    encoding: "utf8",
    timeout: 30_000,
  });
  return (JSON.parse(output) as Array<{ number: number; title: string; author: { login: string } }>).map((pr) => ({
    number: pr.number,
    title: pr.title,
    author: pr.author.login,
  }));
}

/**
 * Verify a GitHub webhook signature (HMAC-SHA256).
 */
export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
