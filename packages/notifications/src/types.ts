export interface ChatTarget {
  subjectId: string;
  adapter: string;
  handle: string;
}

export interface ChatPrompt {
  boardId: string;
  runId: string;
  approverHint?: string;
  quorum: number;
  risk: number;
  threshold: number;
  promptMode?: string;
  chatTargets?: ChatTarget[];
  timeoutSec?: number;
  requiredVotes?: number;
}

export interface DeliveryResult {
  target: ChatTarget;
  delivered: boolean;
  provider: string;
  reason?: string;
  messageId?: string;
}

export interface PromptResult {
  delivered: boolean;
  provider: string;
  message: string;
  promptMode: string;
  results: DeliveryResult[];
  broadcastFallback?: boolean;
}

export interface CredentialProvider {
  get(provider: string, keyName: string): string | null;
}

export const nullCredentials: CredentialProvider = {
  get: () => null,
};
