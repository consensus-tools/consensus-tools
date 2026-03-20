import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { CommitEntry } from "./types.js";

describe("listCommits", () => {
  test("returns commits for a valid file path", async () => {
    const { listCommits } = await import("./fetcher.js");

    const mockResponse = [
      {
        sha: "abc1234567890def1234567890abcdef12345678",
        commit: {
          message: "Fix browse timeout handling\n\nLonger description",
          committer: { date: "2026-03-18T20:00:00Z" },
        },
      },
      {
        sha: "def5678901234abc5678901234defabc56789012",
        commit: {
          message: "Add retry logic",
          committer: { date: "2026-03-17T15:00:00Z" },
        },
      },
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/commits")) {
        return new Response(JSON.stringify(mockResponse), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    try {
      const commits = await listCommits("garrytan", "gstack", "qa/SKILL.md");
      expect(commits).toHaveLength(2);
      expect(commits[0].sha).toBe("abc1234567890def1234567890abcdef12345678");
      expect(commits[0].shortSha).toBe("abc1234");
      expect(commits[0].message).toBe("Fix browse timeout handling");
      expect(commits[0].date).toBe("2026-03-18T20:00:00Z");
      expect(commits[1].message).toBe("Add retry logic");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("returns empty array on 404", async () => {
    const { listCommits } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    }) as typeof fetch;

    try {
      const commits = await listCommits("owner", "repo", "nonexistent/file.md");
      expect(commits).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("throws on 403 rate limit", async () => {
    const { listCommits } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
        status: 403,
        headers: { "X-RateLimit-Remaining": "0" },
      });
    }) as typeof fetch;

    try {
      await expect(listCommits("owner", "repo", "file.md")).rejects.toThrow("rate limit");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("fetchContent", () => {
  test("returns raw content for a valid file + ref", async () => {
    const { fetchContent } = await import("./fetcher.js");

    let capturedUrl = "";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      capturedUrl = url.toString();
      return new Response("# Skill Title\n\nContent here", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }) as typeof fetch;

    try {
      const content = await fetchContent("owner", "repo", "qa/SKILL.md", "abc1234");
      expect(content).toBe("# Skill Title\n\nContent here");
      // Verify path segments are NOT double-encoded (slashes must be literal, not %2F)
      expect(capturedUrl).toContain("/contents/qa/SKILL.md");
      expect(capturedUrl).not.toContain("%2F");
      expect(capturedUrl).toContain("ref=abc1234");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("returns null on 404", async () => {
    const { fetchContent } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    try {
      const content = await fetchContent("owner", "repo", "qa/SKILL.md", "deadbeef");
      expect(content).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("throws on 403 rate limit", async () => {
    const { fetchContent } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
        status: 403,
        headers: { "X-RateLimit-Remaining": "0" },
      });
    }) as typeof fetch;

    try {
      await expect(fetchContent("owner", "repo", "file.md", "abc")).rejects.toThrow("rate limit");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
