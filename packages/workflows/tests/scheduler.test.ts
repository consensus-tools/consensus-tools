import { describe, it, expect, vi, afterEach } from "vitest";
import { shouldRunNow, CronScheduler } from "../src/scheduler.js";
import { createTempStorage } from "./helpers.js";

describe("shouldRunNow (cron expression matching)", () => {
  it("matches wildcard-only expression at any time", () => {
    expect(shouldRunNow("* * * * *")).toBe(true);
  });

  it("matches */N minute expressions", () => {
    // */1 should always match
    expect(shouldRunNow("*/1 * * * *")).toBe(true);

    const minute = new Date().getMinutes();
    if (minute % 5 === 0) {
      expect(shouldRunNow("*/5 * * * *")).toBe(true);
    } else {
      expect(shouldRunNow("*/5 * * * *")).toBe(false);
    }
  });

  it("matches fixed minute values", () => {
    const minute = new Date().getMinutes();
    expect(shouldRunNow(`${minute} * * * *`)).toBe(true);
    expect(shouldRunNow(`${(minute + 1) % 60} * * * *`)).toBe(false);
  });

  it("matches fixed hour values", () => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    expect(shouldRunNow(`${minute} ${hour} * * *`)).toBe(true);
    expect(shouldRunNow(`${minute} ${(hour + 1) % 24} * * *`)).toBe(false);
  });

  it("matches day of week", () => {
    const now = new Date();
    const minute = now.getMinutes();
    const hour = now.getHours();
    const dow = now.getDay();
    expect(shouldRunNow(`${minute} ${hour} * * ${dow}`)).toBe(true);
    expect(shouldRunNow(`${minute} ${hour} * * ${(dow + 1) % 7}`)).toBe(false);
  });

  it("rejects malformed expressions", () => {
    expect(shouldRunNow("")).toBe(false);
    expect(shouldRunNow("* *")).toBe(false);
    expect(shouldRunNow("invalid")).toBe(false);
  });
});

describe("CronScheduler class", () => {
  let scheduler: CronScheduler;

  afterEach(() => {
    scheduler?.stop();
  });

  it("register persists schedule to storage", async () => {
    const { storage } = await createTempStorage();
    const onTrigger = vi.fn();
    scheduler = new CronScheduler(storage, onTrigger);

    const entry = await scheduler.register("wf-1", "*/15 * * * *");
    expect(entry.workflowId).toBe("wf-1");
    expect(entry.cronExpression).toBe("*/15 * * * *");
    expect(entry.enabled).toBe(true);
    expect(entry.lastRunAt).toBeNull();

    const all = await scheduler.list();
    expect(all).toHaveLength(1);
  });

  it("register replaces existing for same workflowId", async () => {
    const { storage } = await createTempStorage();
    scheduler = new CronScheduler(storage, vi.fn());

    await scheduler.register("wf-1", "*/15 * * * *");
    await scheduler.register("wf-1", "*/30 * * * *");

    const all = await scheduler.list();
    expect(all).toHaveLength(1);
    expect(all[0].cronExpression).toBe("*/30 * * * *");
  });

  it("unregister removes and returns true", async () => {
    const { storage } = await createTempStorage();
    scheduler = new CronScheduler(storage, vi.fn());

    await scheduler.register("wf-1", "*/5 * * * *");
    const removed = await scheduler.unregister("wf-1");
    expect(removed).toBe(true);
    expect(await scheduler.list()).toHaveLength(0);
  });

  it("unregister returns false for unknown", async () => {
    const { storage } = await createTempStorage();
    scheduler = new CronScheduler(storage, vi.fn());

    const removed = await scheduler.unregister("nonexistent");
    expect(removed).toBe(false);
  });

  it("list returns all schedules", async () => {
    const { storage } = await createTempStorage();
    scheduler = new CronScheduler(storage, vi.fn());

    await scheduler.register("wf-1", "*/5 * * * *");
    await scheduler.register("wf-2", "*/10 * * * *");
    await scheduler.register("wf-3", "0 * * * *");
    expect(await scheduler.list()).toHaveLength(3);
  });

  it("stop clears interval", async () => {
    const { storage } = await createTempStorage();
    scheduler = new CronScheduler(storage, vi.fn());

    await scheduler.register("wf-1", "*/5 * * * *");
    scheduler.stop();
    scheduler.stop(); // idempotent
  });
});
