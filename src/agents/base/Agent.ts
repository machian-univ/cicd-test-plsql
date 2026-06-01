import type { RunContext } from '../../core/RunContext.js';
import type { AgentResult } from '../../core/types.js';

export interface Agent<TOutput> {
  readonly name: string;
  run(context: RunContext): Promise<AgentResult<TOutput>>;
}

export function makeResult<T>(
  agentName: string,
  data: T,
  durationMs: number,
): AgentResult<T> {
  return { agentName, success: true, data, error: undefined, durationMs };
}

export function makeError<T>(
  agentName: string,
  error: string,
  durationMs: number,
): AgentResult<T> {
  return { agentName, success: false, data: null, error, durationMs };
}