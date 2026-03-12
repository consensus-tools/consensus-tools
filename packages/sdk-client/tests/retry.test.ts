import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConsensusToolsClient } from "../src/client.js";

function makeClient(opts?: { maxAttempts?: number; backoffMs?: number; timeout?: number }) {
  return new ConsensusToolsClient({
    baseUrl: "https://api.example.com",
    accessToken: "test-token",
    retry: { maxAttempts: opts?.maxAttempts ?? 3, backoffMs: opts?.backoffMs ?? 0 },
    timeout: opts?.timeout ?? 30_000,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(text: string, status: number): Response {
  return new Response(text, { status });
}

describe("ConsensusToolsClient retry logic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("retries on 500 response and succeeds on 2nd attempt", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockResolvedValueOnce(textResponse("Internal Server Error", 500))
      .mockResolvedValueOnce(jsonResponse({ id: "job-1", title: "Test" }));

    const client = makeClient({ backoffMs: 100 });
    const promise = client.listJobs();

    // Flush the backoff timer between attempt 1 and 2
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toEqual({ id: "job-1", title: "Test" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 400 response — throws immediately", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(textResponse("Bad Request", 400));

    const client = makeClient();
    await expect(client.listJobs()).rejects.toThrow("Client error 400");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries on network error (fetch throws TypeError)", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse([{ id: "job-2" }]));

    const client = makeClient({ backoffMs: 50 });
    const promise = client.listJobs();

    await vi.advanceTimersByTimeAsync(50);

    const result = await promise;
    expect(result).toEqual([{ id: "job-2" }]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("respects maxAttempts — gives up after configured attempts", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockImplementation(() =>
      Promise.resolve(textResponse("Service Unavailable", 503)),
    );

    const client = makeClient({ maxAttempts: 2, backoffMs: 10 });
    const promise = client.listJobs().catch((e: Error) => e);

    // Advance past all backoff delays so all attempts complete
    await vi.advanceTimersByTimeAsync(60_000);

    const error = await promise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("Server error 503");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns successful response data", async () => {
    const mockFetch = vi.mocked(fetch);
    const payload = { id: "job-99", title: "My Job", description: "A test job" };
    mockFetch.mockResolvedValueOnce(jsonResponse(payload));

    const client = makeClient();
    const result = await client.getJob("job-99");

    expect(result).toEqual(payload);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
