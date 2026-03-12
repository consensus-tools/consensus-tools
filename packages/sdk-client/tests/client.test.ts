import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConsensusToolsClient } from "../src/client.js";

function mockFetch(body: unknown, status = 200, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: "OK",
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe("ConsensusToolsClient", () => {
  const BASE_URL = "https://api.example.com";
  const TOKEN = "test-token-123";
  let client: ConsensusToolsClient;

  beforeEach(() => {
    client = new ConsensusToolsClient({ baseUrl: BASE_URL, accessToken: TOKEN });
    vi.restoreAllMocks();
  });

  describe("postJob", () => {
    it("makes POST to /jobs with correct body and returns parsed JSON", async () => {
      const job = { id: "job_1", title: "Test Job", status: "open" };
      const fetch = mockFetch(job);
      vi.stubGlobal("fetch", fetch);

      const result = await client.postJob("agent-1", {
        title: "Test Job",
        description: "A test job",
        reward: 10,
      });

      expect(fetch).toHaveBeenCalledOnce();
      const [url, opts] = fetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/jobs`);
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.agentId).toBe("agent-1");
      expect(body.title).toBe("Test Job");
      expect(body.description).toBe("A test job");
      expect(body.reward).toBe(10);
      expect(result).toEqual(job);
    });
  });

  describe("listJobs", () => {
    it("makes GET to /jobs with query params", async () => {
      const jobs = [{ id: "job_1" }, { id: "job_2" }];
      const fetch = mockFetch(jobs);
      vi.stubGlobal("fetch", fetch);

      const result = await client.listJobs({ status: "open", tag: "urgent" });

      const [url, opts] = fetch.mock.calls[0];
      expect(url).toContain("/jobs?");
      expect(url).toContain("status=open");
      expect(url).toContain("tag=urgent");
      expect(opts.method).toBe("GET");
      expect(result).toEqual(jobs);
    });

    it("makes GET to /jobs without query params when empty", async () => {
      const fetch = mockFetch([]);
      vi.stubGlobal("fetch", fetch);

      await client.listJobs();

      const [url] = fetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/jobs`);
    });

    it("omits undefined query param values", async () => {
      const fetch = mockFetch([]);
      vi.stubGlobal("fetch", fetch);

      await client.listJobs({ status: "open", tag: undefined });

      const [url] = fetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/jobs?status=open`);
    });
  });

  describe("getJob", () => {
    it("makes GET to /jobs/:id", async () => {
      const job = { id: "job_42", title: "Some Job" };
      const fetch = mockFetch(job);
      vi.stubGlobal("fetch", fetch);

      const result = await client.getJob("job_42");

      const [url, opts] = fetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/jobs/job_42`);
      expect(opts.method).toBe("GET");
      expect(result).toEqual(job);
    });
  });

  describe("claimJob", () => {
    it("makes POST to /jobs/:id/claim", async () => {
      const assignment = { jobId: "job_1", agentId: "agent-1" };
      const fetch = mockFetch(assignment);
      vi.stubGlobal("fetch", fetch);

      const result = await client.claimJob("agent-1", "job_1", { bid: 5, stake: 2 });

      const [url, opts] = fetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/jobs/job_1/claim`);
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.agentId).toBe("agent-1");
      expect(body.bid).toBe(5);
      expect(body.stake).toBe(2);
      expect(result).toEqual(assignment);
    });
  });

  describe("submitJob", () => {
    it("makes POST to /jobs/:id/submit", async () => {
      const submission = { id: "sub_1", jobId: "job_1" };
      const fetch = mockFetch(submission);
      vi.stubGlobal("fetch", fetch);

      const result = await client.submitJob("agent-1", "job_1", {
        artifacts: { code: "hello" },
        confidence: 0.9,
      });

      const [url, opts] = fetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/jobs/job_1/submit`);
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.agentId).toBe("agent-1");
      expect(body.artifacts).toEqual({ code: "hello" });
      expect(body.confidence).toBe(0.9);
      expect(result).toEqual(submission);
    });
  });

  describe("vote", () => {
    it("makes POST to /jobs/:id/vote", async () => {
      const vote = { id: "vote_1", jobId: "job_1" };
      const fetch = mockFetch(vote);
      vi.stubGlobal("fetch", fetch);

      const result = await client.vote("agent-1", "job_1", {
        submissionId: "sub_1",
        score: 0.8,
        weight: 1.0,
        rationale: "Good work",
      });

      const [url, opts] = fetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/jobs/job_1/vote`);
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.agentId).toBe("agent-1");
      expect(body.submissionId).toBe("sub_1");
      expect(body.score).toBe(0.8);
      expect(body.weight).toBe(1.0);
      expect(body.rationale).toBe("Good work");
      expect(result).toEqual(vote);
    });
  });

  describe("resolveJob", () => {
    it("makes POST to /jobs/:id/resolve", async () => {
      const resolution = { id: "res_1", jobId: "job_1" };
      const fetch = mockFetch(resolution);
      vi.stubGlobal("fetch", fetch);

      const result = await client.resolveJob("agent-1", "job_1", {
        manualWinnerAgentIds: ["agent-2"],
        manualSubmissionId: "sub_1",
      });

      const [url, opts] = fetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/jobs/job_1/resolve`);
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.agentId).toBe("agent-1");
      expect(body.manualWinnerAgentIds).toEqual(["agent-2"]);
      expect(body.manualSubmissionId).toBe("sub_1");
      expect(result).toEqual(resolution);
    });
  });

  describe("getLedger", () => {
    it("makes GET to /ledger/:agentId", async () => {
      const ledger = { agentId: "agent-1", balance: 42 };
      const fetch = mockFetch(ledger);
      vi.stubGlobal("fetch", fetch);

      const result = await client.getLedger("agent-1");

      const [url, opts] = fetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/ledger/agent-1`);
      expect(opts.method).toBe("GET");
      expect(result).toEqual(ledger);
    });
  });

  describe("error handling", () => {
    it("throws on non-OK response", async () => {
      const fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: () => Promise.resolve("job not found"),
      });
      vi.stubGlobal("fetch", fetch);

      await expect(client.getJob("missing")).rejects.toThrow("Client error 404: job not found");
    });

    it("includes statusText when body is empty", async () => {
      const fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.resolve(""),
      });
      vi.stubGlobal("fetch", fetch);

      await expect(client.listJobs()).rejects.toThrow("Server error 500: Internal Server Error");
    });
  });

  describe("auth", () => {
    it("includes Bearer token header when configured", async () => {
      const fetch = mockFetch({});
      vi.stubGlobal("fetch", fetch);

      await client.getJob("job_1");

      const [, opts] = fetch.mock.calls[0];
      expect(opts.headers.authorization).toBe(`Bearer ${TOKEN}`);
    });

    it("omits authorization header when token is empty", async () => {
      const noAuthClient = new ConsensusToolsClient({ baseUrl: BASE_URL, accessToken: "" });
      const fetch = mockFetch({});
      vi.stubGlobal("fetch", fetch);

      await noAuthClient.getJob("job_1");

      const [, opts] = fetch.mock.calls[0];
      expect(opts.headers.authorization).toBeUndefined();
    });
  });
});
