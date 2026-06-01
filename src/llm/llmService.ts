import type { LLMProvider, LLMOptions } from '../adapters/llm/LLMProvider.js';
import { LLMProviderRegistry } from '../adapters/llm/LLMProvider.js';

export interface LlmCallParams {
  providerName: string;
  prompt: string;
  options: LLMOptions;
}

export function getLlmProvider(name: string): LLMProvider | undefined {
  return LLMProviderRegistry.get(name);
}

export async function callLlmProvider(params: LlmCallParams): Promise<string> {
  const provider = getLlmProvider(params.providerName);
  if (!provider) {
    throw new Error(`LLM-провайдер "${params.providerName}" не зарегистрирован`);
  }
  return provider.complete(params.prompt, params.options);
}
