import type { Agent } from '../base/Agent.js';
import { makeResult } from '../base/Agent.js';
import type { RunContext } from '../../core/RunContext.js';
import type { LLMReviewResult, AgentResult } from '../../core/types.js';
import { logger } from '../../utils/logger.js';
import { buildReviewPrompt } from '../../llm/buildReviewPrompt.js';
import { parseReviewResponse } from '../../llm/parseReviewResponse.js';
import { callLlmProvider } from '../../llm/llmService.js';
import { getLlmApiKey } from '../../llm/resolveLlmConfig.js';

export class LLMReviewerAgent implements Agent<LLMReviewResult> {
  readonly name = 'LLMReviewerAgent';

  async run(context: RunContext): Promise<AgentResult<LLMReviewResult>> {
    const start = Date.now();
    const config = context.get('config');

    if (!config.llm.enabled) {
      return makeResult(
        this.name,
        { review: '', recommendations: [], status: 'skipped' },
        Date.now() - start,
      );
    }

    try {
      const prompt = buildReviewPrompt(context);
      const raw = await callLlmProvider({
        providerName: config.llm.provider,
        prompt,
        options: {
          maxTokens: config.llm.max_tokens,
          model: config.llm.model,
          endpoint: config.llm.endpoint,
          apiKey: getLlmApiKey(config.llm.api_key_env),
        },
      });

      const { review, recommendations } = parseReviewResponse(raw);

      return makeResult(
        this.name,
        { review, recommendations, status: 'ok' },
        Date.now() - start,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`LLM-рецензирование: ${msg}`);
      return makeResult(
        this.name,
        { review: '', recommendations: [], status: 'error', errorMessage: msg },
        Date.now() - start,
      );
    }
  }
}
