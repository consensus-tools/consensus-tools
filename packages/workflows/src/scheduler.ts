import type { CronSchedule } from "@consensus-tools/schemas";
import type { IStorage } from "@consensus-tools/core";
import { newId } from "@consensus-tools/core";

const CHECK_INTERVAL_MS = 60_000;

type CronCallback = (workflowId: string) => void | Promise<void>;

function parseCronField(field: string, current: number): boolean {
  if (field === "*") return true;
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    return !isNaN(step) && step > 0 && current % step === 0;
  }
  const fixed = parseInt(field, 10);
  return !isNaN(fixed) && current === fixed;
}

export function shouldRunNow(cronExpression: string): boolean {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length < 5) return false;

  const now = new Date();
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  return (
    parseCronField(minute!, now.getMinutes()) &&
    parseCronField(hour!, now.getHours()) &&
    parseCronField(dayOfMonth!, now.getDate()) &&
    parseCronField(month!, now.getMonth() + 1) &&
    parseCronField(dayOfWeek!, now.getDay())
  );
}

/**
 * IStorage-backed cron scheduler. Persists schedules in state.cronSchedules.
 */
export class CronScheduler {
  private readonly storage: IStorage;
  private readonly onTrigger: CronCallback;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(storage: IStorage, onTrigger: CronCallback) {
    this.storage = storage;
    this.onTrigger = onTrigger;
  }

  async register(workflowId: string, cronExpression: string): Promise<CronSchedule> {
    return (
      await this.storage.update((state) => {
        // Remove existing schedule for this workflow
        state.cronSchedules = state.cronSchedules.filter((s) => s.workflowId !== workflowId);

        const schedule: CronSchedule = {
          id: newId("cron"),
          workflowId,
          cronExpression,
          enabled: true,
          lastRunAt: null,
        };
        state.cronSchedules.push(schedule);
        this.ensureTimerRunning();
        return schedule;
      })
    ).result;
  }

  async unregister(workflowId: string): Promise<boolean> {
    return (
      await this.storage.update((state) => {
        const before = state.cronSchedules.length;
        state.cronSchedules = state.cronSchedules.filter((s) => s.workflowId !== workflowId);
        return state.cronSchedules.length < before;
      })
    ).result;
  }

  async list(): Promise<CronSchedule[]> {
    const state = await this.storage.getState();
    return state.cronSchedules;
  }

  start(): void {
    this.ensureTimerRunning();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private ensureTimerRunning(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      this.checkSchedules().catch(() => {});
    }, CHECK_INTERVAL_MS);
  }

  private async checkSchedules(): Promise<void> {
    const state = await this.storage.getState();
    const now = new Date().toISOString();

    for (const entry of state.cronSchedules) {
      if (!entry.enabled) continue;
      if (!shouldRunNow(entry.cronExpression)) continue;

      // Prevent double-fire within the same minute
      if (entry.lastRunAt) {
        const lastMinute = entry.lastRunAt.slice(0, 16);
        const currentMinute = now.slice(0, 16);
        if (lastMinute === currentMinute) continue;
      }

      await this.storage.update((s) => {
        const schedule = s.cronSchedules.find((x) => x.id === entry.id);
        if (schedule) schedule.lastRunAt = now;
      });

      try {
        await this.onTrigger(entry.workflowId);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "unknown error";
        console.error(`[cron] Failed to trigger workflow ${entry.workflowId}:`, msg);
      }
    }

    const remaining = await this.storage.getState();
    if (remaining.cronSchedules.filter((s) => s.enabled).length === 0 && this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
