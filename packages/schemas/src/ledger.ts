import { z } from "zod";

// ── Ledger ──────────────────────────────────────────────────────────

export const ledgerEntryTypeSchema = z.enum([
  "FAUCET",
  "STAKE",
  "UNSTAKE",
  "PAYOUT",
  "SLASH",
  "ADJUST",
  "ESCROW_MINT",
  "WORKFLOW_FEE",
]);
export type LedgerEntryType = z.infer<typeof ledgerEntryTypeSchema>;

export const ledgerEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  type: ledgerEntryTypeSchema,
  agentId: z.string(),
  amount: z.number(),
  jobId: z.string().optional(),
  reason: z.string().optional(),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
