import type { CheckMode, PulsqualConfig } from '../core/types.js';

export interface ResolvedLlmConfig {
  enabled: boolean;
  provider: PulsqualConfig['llm']['provider'];
  model: string;
  endpoint: string;
  max_tokens: number;
  api_key_env?: string;
  skipReason?: string;
}

export function resolveLlmForRun(
  config: PulsqualConfig,
  mode: CheckMode,
  noLlm?: boolean,
): ResolvedLlmConfig {
  const base = { ...config.llm };

  if (noLlm || !base.enabled) {
    return { ...base, enabled: false };
  }

  if (mode === 'ci' && base.provider === 'ollama') {
    return {
      ...base,
      enabled: false,
      skipReason:
        'Ollama недоступен в CI-режиме. Для рецензии в пайплайне настройте GigaChat: pulsqual config llm enable',
    };
  }

  return { ...base, enabled: true };
}

export function getLlmApiKey(apiKeyEnv?: string): string | undefined {
  const key = apiKeyEnv ?? 'GIGACHAT_API_KEY';
  return process.env[key] || undefined;
}
