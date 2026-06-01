export const LLM_LIMITS = {
  MAX_PROMPT_CHARS: 7500,
  MAX_LINT_FILES: 5,
  MAX_ERRORS_PER_FILE: 3,
  MAX_WARNINGS_PER_FILE: 2,
  MAX_SECURITY_ITEMS: 5,
  MAX_FAILED_TESTS: 5,
  MAX_DEGRADATION_FACTORS: 6,
} as const;

export const LLM_LIMITS_INFO = [
  'Промпт формируется из агрегированных метрик (без исходного кода), до ~7500 символов.',
  'Ответ ограничен max_tokens в конфиге (по умолчанию 1024).',
  'В CI доступен только GigaChat; локально — Ollama или GigaChat.',
  'По умолчанию рецензирование отключено: pulsqual config llm enable',
].join('\n  · ');
