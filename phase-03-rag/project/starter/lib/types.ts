import type { UIMessage } from 'ai';
import type { AnswerCheck, Source } from './answer';

export interface MessageMetadata extends Partial<AnswerCheck> {
  modelId?: string;
  embedder?: string;
  retrievalMs?: number;
  startedAt?: number;
  finishedAt?: number;
  inputTokens?: number;
  outputTokens?: number;
}

/** The sources travel as a typed data part (`data-sources`), sent BEFORE the first answer token. */
export type ChatMessage = UIMessage<MessageMetadata, { sources: Source[] }>;
