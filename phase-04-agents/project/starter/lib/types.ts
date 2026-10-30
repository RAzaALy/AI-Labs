import type { InferAgentUIMessage } from 'ai';
import type { createOpsAgent } from './agent';

export interface MessageMetadata {
  modelId?: string;
  startedAt?: number;
  finishedAt?: number;
  steps?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Why the loop ended: answered, paused for approval, step cap, or token budget. */
  stoppedBy?: 'answered' | 'awaiting-approval' | 'max-steps' | 'budget';
}
export type OpsMessage = InferAgentUIMessage<ReturnType<typeof createOpsAgent>, MessageMetadata>;
