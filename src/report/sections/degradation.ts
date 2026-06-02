import type { DegradationResult, DegradationFactor, LLMReviewResult } from '../../core/types.js';

import { escapeHtml } from '../reportUtils.js';

import { stabilityIndexColor, formatPercent } from '../../utils/reportPath.js';

import { buildLlmSection } from './llm.js';

import { buildGrowthScopeNote } from './growth.js';



export function buildDegradationOverviewCard(degradation: DegradationResult | null): string {

  if (!degradation || degradation.status === 'skipped' || degradation.status === 'error') {

    return '';

  }



  const rawScore = degradation.rawScore ?? (1 - degradation.score / 100);

  const stabilityPct = formatPercent(rawScore, 0);

  const color = stabilityIndexColor(rawScore);

  const isDegrading = degradation.prediction === 'degrading';

  const title = isDegrading ? 'Обнаружены признаки деградации' : 'Код стабилен';



  return `

    <div class="glass-card degradation-overview-card" style="margin-top:16px;border-color:${color}33">

      <div class="panel-title">ML — СТАБИЛЬНОСТЬ КОДА</div>

      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">

        <div style="color:${color};font-weight:600">${escapeHtml(title)}</div>

        <div style="font-size:1.6rem;font-weight:700;color:${color}">${stabilityPct}</div>

      </div>

    </div>`;

}



export function buildAiTab(

  degradation: DegradationResult | null,

  llmReview?: LLMReviewResult | null,

): string {

  let mlBlock: string;



  if (!degradation || degradation.status === 'skipped') {

    const reason = degradation?.errorMessage ?? 'Модель деградации не запускалась в данном режиме.';

    mlBlock = `

        <div class="tool-warning">

          <span class="warn-icon">⚠</span>

          <div class="tool-warning-text">${escapeHtml(reason)}</div>

        </div>

        <div class="stat-cards" style="margin-top:16px">

          <div class="stat-card">

            <div class="stat-num val-na">—</div>

            <div class="stat-label">Прогноз деградации</div>

          </div>

          <div class="stat-card">

            <div class="stat-num val-na">—</div>

            <div class="stat-label">Уверенность</div>

          </div>

          <div class="stat-card">

            <div class="stat-num val-na">—</div>

            <div class="stat-label">Индекс стабильности</div>

          </div>

        </div>`;

  } else if (degradation.status === 'error') {

    mlBlock = `

        <div class="tool-warning">

          <span class="warn-icon">⚠</span>

          <div class="tool-warning-text">Ошибка выполнения модели: ${escapeHtml(degradation.errorMessage ?? 'Неизвестная ошибка')}</div>

        </div>`;

  } else {

    const isDegrading = degradation.prediction === 'degrading';

    const isStable    = degradation.prediction === 'stable';

    const verdictClass = isStable ? 'stable' : isDegrading ? 'degrading' : 'unknown';



    const verdictIcon  = isStable ? '✓' : isDegrading ? '⚠' : '?';

    const verdictTitle = isStable

      ? 'Код стабилен'

      : isDegrading

        ? 'Обнаружены признаки деградации'

        : 'Прогноз неопределён';



    const rawScore = degradation.rawScore ?? (1 - degradation.score / 100);

    const stabilityColor = stabilityIndexColor(rawScore);

    const stabilityPct = formatPercent(rawScore, 0);

    const confidencePct = Math.round(degradation.confidence * 100);

    const confidenceCardClass = degradation.confidence > 0.5 ? 'stat-ok' : 'stat-warn';

    const confidenceBarColor = degradation.confidence > 0.5 ? 'var(--accent)' : 'var(--yellow)';

    const degradationContributionPct = formatPercent(degradation.score, 0);



    const verdictSubtitle = isStable

      ? 'ML-модель не выявила значимых признаков деградации кода в текущем снимке.'

      : isDegrading

        ? 'ML-модель выявила паттерны, характерные для деградирующего кода. Рекомендуется ревью.'

        : 'Недостаточно данных для уверенного прогноза.';



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

          <div class="verdict-icon" style="color:${stabilityColor}">${verdictIcon}</div>

          <div class="verdict-text">

            <div class="verdict-title" style="color:${stabilityColor}">${verdictTitle}</div>

            <div class="verdict-subtitle">${escapeHtml(verdictSubtitle)}</div>

          </div>

          <div class="verdict-score">

            <div class="verdict-score-num" style="color:${stabilityColor}">${stabilityPct}</div>

            <div class="verdict-score-label">стабильность</div>

          </div>

        </div>



        <div class="stat-cards">

          <div class="stat-card ${isStable ? 'stat-ok' : isDegrading ? 'stat-crit' : ''}">

            <div class="stat-num" style="color:${stabilityColor}">${isStable ? 'Стабильно' : isDegrading ? 'Деградация' : 'Неизвестно'}</div>

            <div class="stat-label">Прогноз модели</div>

          </div>

          <div class="stat-card ${confidenceCardClass}">

            <div class="stat-num">${confidencePct}%</div>

            <div class="stat-label">Уверенность</div>

          </div>

          <div class="stat-card">

            <div class="stat-num mono" style="font-size:1.2rem;color:${stabilityColor}">${stabilityPct}</div>

            <div class="stat-label">Индекс стабильности</div>

          </div>

          <div class="stat-card">

            <div class="stat-num">${degradationContributionPct}</div>

            <div class="stat-label">Вклад в деградацию</div>

          </div>

        </div>



        <div class="confidence-bar-wrap">

          <div class="confidence-bar-label">

            <span>Уверенность модели</span>

            <span style="color:${confidenceBarColor}">${confidencePct}%</span>

          </div>

          <div class="confidence-bar-track">

            <div class="confidence-bar-fill" style="width:${confidencePct}%;background:${confidenceBarColor}"></div>

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

                <td class="mono val-ok">0.75 – 1.00 (75% – 100%)</td>

                <td>Высокая стабильность</td>

                <td>Изменения безопасны для слияния</td>

              </tr>

              <tr>

                <td class="mono" style="color:var(--yellow)">0.25 – 0.75 (25% – 75%)</td>

                <td>Умеренная стабильность / признаки деградации</td>

                <td>Рекомендуется код-ревью</td>

              </tr>

              <tr>

                <td class="mono val-crit">0.00 – 0.25 (0% – 25%)</td>

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


