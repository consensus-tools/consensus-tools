import type { ConsensusToolsConfig, Job } from '../types';

export function calculateSlashAmount(job: Job, config: ConsensusToolsConfig, stakeAmount: number): number {
  if (!config.local.slashingEnabled) return 0;
  const policy = job.slashingPolicy;
  if (!policy?.enabled) return 0;
  const percent = policy.slashPercent || 0;
  const flat = policy.slashFlat || 0;
  const byPercent = stakeAmount * percent;
  return Math.max(byPercent, flat);
}
