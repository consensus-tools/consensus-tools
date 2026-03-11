import { z } from "zod";

// ── Participant ─────────────────────────────────────────────────────

export const participantSubjectTypeSchema = z.enum(["agent", "human"]);
export type ParticipantSubjectType = z.infer<typeof participantSubjectTypeSchema>;

export const participantStatusSchema = z.enum(["active", "suspended"]);
export type ParticipantStatus = z.infer<typeof participantStatusSchema>;

export const participantSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  subjectType: participantSubjectTypeSchema,
  subjectId: z.string(),
  role: z.string().default("voter"),
  weight: z.number().default(1),
  reputation: z.number().default(100),
  status: participantStatusSchema,
  metadata: z.record(z.unknown()),
  createdAt: z.string(),
});
export type Participant = z.infer<typeof participantSchema>;
