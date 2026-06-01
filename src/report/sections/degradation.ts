import type { DegradationResult, DegradationFactor, LLMReviewResult } from '../../core/types.js';
import { escapeHtml } from '../reportUtils.js';
import { buildLlmSection } from './llm.js';
import { buildGrowthScopeNote } from './growth.js';

export function buildAiTab(
  degradation: DegradationResult | null,
  llmReview?: LLMReviewResult | null,
): string {  let mlBlock: string;

    if (!degradation || degradation.status === 'skipped') {
      const reason = degradation?.errorMessage ?? 'Модель деградации не запускалась в данном режиме.';
      mlBlock = `
        <div class="tool-warning">
          <span class="warn-icon">⚠</span>
          <div>${escapeHtml(reason)}</div>
        </div>
        <div class="stat-cards" style="margin-top:16px">
          <div class="stat-card">
            <div class="stat-num val-na">—</div>
            <div class="stat-label">Прогноз деградации</div>
          </div>
          <div class="stat-card">
            <div class="stat-num val-na">—</div>
            <div class="stat-label">Уверенность модели</div>
          </div>
          <div class="stat-card">
            <div class="stat-num val-na">—</div>
            <div class="stat-label">Индекс стабильности (0–1)</div>
          </div>
        </div>`;
    } else if (degradation.status === 'error') {
      mlBlock = `
        <div class="tool-warning">
          <span class="warn-icon">⚠</span>
          <div>Ошибка выполнения модели: ${escapeHtml(degradation.errorMessage ?? 'Неизвестная ошибка')}</div>
        </div>`;
    } else {
      // Статус ok — есть реальные данные
      const isDegrading = degradation.prediction === 'degrading';
      const isStable    = degradation.prediction === 'stable';
      const verdictClass = isStable ? 'stable' : isDegrading ? 'degrading' : 'unknown';

      const verdictIcon  = isStable ? '✓' : isDegrading ? '⚠' : '?';
      const verdictTitle = isStable
        ? 'Код стабилен'
        : isDegrading
          ? 'Обнаружены признаки деградации'
          : 'Прогноз неопределён';
      const verdictColor = isStable ? 'var(--accent)' : isDegrading ? 'var(--red)' : 'var(--text-dim)';
      const verdictSubtitle = isStable
        ? 'ML-модель не выявила значимых признаков деградации кода в текущем снимке.'
        : isDegrading
          ? 'ML-модель выявила паттерны, характерные для деградирующего кода. Рекомендуется ревью.'
          : 'Недостаточно данных для уверенного прогноза.';

      const rawScore = degradation.rawScore ?? (1 - degradation.score / 100);
      const confidencePct = Math.round(degradation.confidence * 100);
      const confidenceColor = degradation.confidence > 0.6 ? 'var(--accent)' : 'var(--yellow)';

      // Факторы влияния
      const factorsHtml = degradation.factors && degradation.factors.length > 0
        ? `
          <div class="section-subtitle">Факторы влияния на прогноз</div>
          <div class="factor-grid">
            ${degradation.factors.map((f: DegradationFactor) => {
              const impactClass = f.impact === 'positive' ? 'factor-positive' : f.impact === 'negative' ? 'factor-negative' : '';
              const impactIcon  = f.impact === 'positive' ? '↑' : f.impact === 'negative' ? '↓' : '→';
              const impactColor = f.impact === 'positive' ? 'var(--accent)' : f.impact === 'negative' ? 'var(--red)' : 'var(--text-dim)';
              return `
                <div class="factor-item ${impactClass}">
                  <div class="factor-header">
                    <span class="factor-name">${escapeHtml(f.factor)}</span>
                    <span class="factor-impact-icon" style="color:${impactColor}">${impactIcon}</span>
                    <span class="factor-value">${escapeHtml(f.value)}</span>
                  </div>
                  <div class="factor-desc">${escapeHtml(f.description)}</div>
                </div>`;
            }).join('')}
          </div>`
        : '';

      mlBlock = `
        <div class="degradation-verdict ${verdictClass}">
          <div class="verdict-icon" style="color:${verdictColor}">${verdictIcon}</div>
          <div class="verdict-text">
            <div class="verdict-title" style="color:${verdictColor}">${verdictTitle}</div>
            <div class="verdict-subtitle">${escapeHtml(verdictSubtitle)}</div>
          </div>
          <div class="verdict-score">
            <div class="verdict-score-num" style="color:${verdictColor}">${(rawScore * 100).toFixed(0)}%</div>
            <div class="verdict-score-label">стабильность</div>
          </div>
        </div>

        <div class="stat-cards">
          <div class="stat-card ${isStable ? 'stat-ok' : isDegrading ? 'stat-crit' : ''}">
            <div class="stat-num" style="color:${verdictColor}">${isStable ? 'Стабильно' : isDegrading ? 'Деградация' : 'Неизвестно'}</div>
            <div class="stat-label">Прогноз модели</div>
          </div>
          <div class="stat-card ${confidencePct >= 60 ? 'stat-ok' : 'stat-warn'}">
            <div class="stat-num">${confidencePct}%</div>
            <div class="stat-label">Уверенность</div>
          </div>
          <div class="stat-card">
            <div class="stat-num mono" style="font-size:1.2rem">${rawScore.toFixed(4)}</div>
            <div class="stat-label">Индекс стабильности</div>
          </div>
          <div class="stat-card">
            <div class="stat-num">${Math.round(degradation.score)}</div>
            <div class="stat-label">Вклад в деградацию (0–100)</div>
          </div>
        </div>

        <div class="confidence-bar-wrap">
          <div class="confidence-bar-label">
            <span>Уверенность модели</span>
            <span style="color:${confidenceColor}">${confidencePct}%</span>
          </div>
          <div class="confidence-bar-track">
            <div class="confidence-bar-fill" style="width:${confidencePct}%;background:${confidenceColor}"></div>
          </div>
        </div>

        ${factorsHtml}

        ${degradation.modelPath ? `
        <div class="model-info-block">
          <strong>Модель:</strong> CatBoostRegressor (ONNX) &nbsp;·&nbsp;
          <strong>Признаков:</strong> 25 &nbsp;·&nbsp;
          <strong>Порог стабильности:</strong> 0.5 &nbsp;·&nbsp;
          <strong>Путь:</strong> <span class="mono">${escapeHtml(degradation.modelPath)}</span>
        </div>` : ''}

        <div class="section-subtitle">Шкала стабильности</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Диапазон индекса</th><th>Интерпретация</th><th>Действие</th></tr></thead>
            <tbody>
              <tr>
                <td class="mono val-ok">0.75 – 1.00</td>
                <td>Высокая стабильность</td>
                <td>Изменения безопасны для слияния</td>
              </tr>
              <tr>
                <td class="mono" style="color:var(--yellow)">0.50 – 0.75</td>
                <td>Умеренная стабильность</td>
                <td>Рекомендуется код-ревью</td>
              </tr>
              <tr>
                <td class="mono val-warn">0.25 – 0.50</td>
                <td>Признаки деградации</td>
                <td>Требуется тщательный ревью и исправления</td>
              </tr>
              <tr>
                <td class="mono val-crit">0.00 – 0.25</td>
                <td>Высокий риск деградации</td>
                <td>Необходимо исправление перед слиянием</td>
              </tr>
            </tbody>
          </table>
        </div>`;
    }

  const llmBlock = buildLlmSection(llmReview);
  const growthBlock = buildGrowthScopeNote();

  return `
      <div class="panel-title">АНАЛИЗ ДЕГРАДАЦИИ КОДА (ML — CatBoost ONNX)</div>
      ${mlBlock}
      ${llmBlock}
      ${growthBlock}
    `;
}
