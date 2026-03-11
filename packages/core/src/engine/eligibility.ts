import type { Job } from "@consensus-tools/schemas";

export interface EligibilityResult {
  ok: boolean;
  reason?: string;
}

export function checkEligibility(job: Job): EligibilityResult {
  if (job.status !== "OPEN") return { ok: false, reason: "Job not open" };
  return { ok: true };
}
