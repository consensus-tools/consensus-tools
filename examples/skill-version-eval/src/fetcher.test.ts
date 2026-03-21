import { describe, it, expect, vi } from "vitest";
import type { CommitEntry } from "./types.js";

describe("listCommits", () => {
  it("returns commits for a valid file path", async () => {
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
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
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

  it("returns empty array on 404", async () => {
    const { listCommits } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    }) as typeof fetch;

    try {
      const commits = await listCommits("owner", "repo", "nonexistent/file.md");
      expect(commits).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws on 403 rate limit", async () => {
    const { listCommits } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
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
  it("returns raw content for a valid file + ref", async () => {
    const { fetchContent } = await import("./fetcher.js");

    let capturedUrl = "";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
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

  it("returns null on 404", async () => {
    const { fetchContent } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    try {
      const content = await fetchContent("owner", "repo", "qa/SKILL.md", "deadbeef");
      expect(content).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws on 403 rate limit", async () => {
    const { fetchContent } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
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

  it("403 without X-RateLimit-Remaining header throws generic 403 error", async () => {
    const { fetchContent } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return new Response("Forbidden", { status: 403 });
    }) as typeof fetch;

    try {
      await expect(fetchContent("owner", "repo", "file.md", "abc")).rejects.toThrow("403");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fetchContent with 500 error throws", async () => {
    const { fetchContent } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return new Response("Internal Server Error", { status: 500 });
    }) as typeof fetch;

    try {
      await expect(fetchContent("owner", "repo", "file.md", "abc")).rejects.toThrow("500");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("listCommits — edge cases", () => {
  it("listCommits with API returning empty array returns []", async () => {
    const { listCommits } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify([]), { status: 200 });
    }) as typeof fetch;

    try {
      const commits = await listCommits("owner", "repo", "file.md");
      expect(commits).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("commit message with newlines only returns first line", async () => {
    const { listCommits } = await import("./fetcher.js");

    const mockResponse = [
      {
        sha: "aabbccdd11223344aabbccdd11223344aabbccdd",
        commit: {
          message: "First line\nSecond line\nThird",
          committer: { date: "2026-03-19T10:00:00Z" },
        },
      },
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify(mockResponse), { status: 200 });
    }) as typeof fetch;

    try {
      const commits = await listCommits("owner", "repo", "file.md");
      expect(commits).toHaveLength(1);
      expect(commits[0].message).toBe("First line");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("githubFetch — authentication", () => {
  it("sends Authorization header when GITHUB_TOKEN is set", async () => {
    const { listCommits } = await import("./fetcher.js");

    let capturedHeaders: Record<string, string> = {};
    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "ghp_test_token_123";

    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = Object.fromEntries(
        Object.entries((init?.headers as Record<string, string>) ?? {}),
      );
      return new Response(JSON.stringify([]), { status: 200 });
    }) as typeof fetch;

    try {
      await listCommits("owner", "repo", "file.md");
      expect(capturedHeaders["Authorization"]).toBe("Bearer ghp_test_token_123");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = originalEnv;
    }
  });

  it("does NOT send Authorization header when GITHUB_TOKEN is unset", async () => {
    const { listCommits } = await import("./fetcher.js");

    let capturedHeaders: Record<string, string> = {};
    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;

    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = Object.fromEntries(
        Object.entries((init?.headers as Record<string, string>) ?? {}),
      );
      return new Response(JSON.stringify([]), { status: 200 });
    }) as typeof fetch;

    try {
      await listCommits("owner", "repo", "file.md");
      expect(capturedHeaders["Authorization"]).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = originalEnv;
    }
  });

  it("401 with GITHUB_TOKEN set throws enriched error mentioning token", async () => {
    const { listCommits } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "ghp_bad_token";

    globalThis.fetch = vi.fn(async () => {
      return new Response("Bad credentials", { status: 401 });
    }) as typeof fetch;

    try {
      await expect(listCommits("owner", "repo", "file.md")).rejects.toThrow("GITHUB_TOKEN");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = originalEnv;
    }
  });

  it("401 without GITHUB_TOKEN throws generic 401 error", async () => {
    const { listCommits } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;

    globalThis.fetch = vi.fn(async () => {
      return new Response("Bad credentials", { status: 401 });
    }) as typeof fetch;

    try {
      await expect(listCommits("owner", "repo", "file.md")).rejects.toThrow("401");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = originalEnv;
    }
  });
});
