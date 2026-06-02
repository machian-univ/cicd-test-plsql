import type { LLMReviewResult } from '../../core/types.js';
import { escapeHtml, renderMarkdownInline, renderMarkdownParagraphs } from '../reportUtils.js';
export function buildLlmSection(llmReview: LLMReviewResult | null | undefined): string {
  if (!llmReview || llmReview.status === 'skipped') {
    return `
      <div class="panel-title" style="margin-top:24px">LLM-РЕЦЕНЗИРОВАНИЕ</div>
      <div class="tool-warning">
        <span class="warn-icon">ℹ</span>
        <div class="tool-warning-text">
          LLM-рецензирование отключено. Включите:
          <code>pulsqual config llm enable</code>
        </div>
      </div>`;
  }

  if (llmReview.status === 'error') {
    return `
      <div class="panel-title" style="margin-top:24px">LLM-РЕЦЕНЗИРОВАНИЕ</div>
      <div class="tool-warning">
        <span class="warn-icon">⚠</span>
        <div class="tool-warning-text">Ошибка LLM: ${escapeHtml(llmReview.errorMessage ?? 'Неизвестная ошибка')}</div>
      </div>`;
  }

  const recItems = llmReview.recommendations.length > 0
    ? `<ul class="llm-rec-list">${llmReview.recommendations.map(r =>
        `<li>${renderMarkdownInline(r)}</li>`).join('')}</ul>`
    : '<div class="muted">Рекомендации не выделены моделью.</div>';

  const reviewParagraphs = llmReview.review.trim()
    ? renderMarkdownParagraphs(llmReview.review)
    : '';
  return `
      <div class="panel-title" style="margin-top:24px">LLM-РЕЦЕНЗИРОВАНИЕ</div>
      <div class="section-subtitle">Рецензия</div>
      <div class="glass-card llm-review-card">
        ${reviewParagraphs || '<div class="muted">Пустой ответ модели.</div>'}
      </div>
      <div class="section-subtitle">Рекомендации</div>
      ${recItems}`;
}
