import { z } from "zod";

// ── Workflow ────────────────────────────────────────────────────────

export const workflowStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled", "waiting"]);
export type WorkflowStatus = z.infer<typeof workflowStatusSchema>;

export const workflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  definition: z.record(z.unknown()),
  templateId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Workflow = z.infer<typeof workflowSchema>;

export const workflowRunSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  runId: z.string(),
  status: workflowStatusSchema,
  cursor: z.record(z.unknown()).optional(),
  createdAt: z.string(),
  completedAt: z.string().optional(),
  result: z.string().optional(),
});
export type WorkflowRun = z.infer<typeof workflowRunSchema>;

// ── Cron Schedule ───────────────────────────────────────────────────

export const cronScheduleSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  cronExpression: z.string(),
  enabled: z.boolean(),
  lastRunAt: z.string().nullable(),
});
export type CronSchedule = z.infer<typeof cronScheduleSchema>;
