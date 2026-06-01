import type { RunContext } from '../core/RunContext.js';
import type {
  LintResult, ComplexityResult, TestRunResult, SecurityResult,
  DegradationResult, DiffMetrics, Scores,
} from '../core/types.js';
import { LLM_LIMITS } from './llmLimits.js';

function trunc(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function shortenPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^.*\/(src|tests|test|lib|app)\//, '$1/');
}

export function buildReviewPrompt(context: RunContext): string {
  const config = context.get('config');
  const mode = context.get('mode');
  const scores = context.get('scores')?.data as Scores | null;
  const lintResults = (context.get('lintResults')?.data ?? []) as LintResult[];
  const complexity = context.get('complexityResult')?.data as ComplexityResult | null;
  const testRun = context.get('testRunResult')?.data as TestRunResult | null;
  const security = context.get('securityResult')?.data as SecurityResult | null;
  const degradation = context.get('degradationResult')?.data as DegradationResult | null;
  const diff = context.get('diffResult')?.data as DiffMetrics | null;

  const lines: string[] = [
    'Ты — опытный ревьюер качества кода. Проанализируй результаты автоматической проверки PulsQual.',
    'Пиши на русском, сбалансированно: отмечай сильные стороны и конкретные улучшения без излишнего пессимизма.',
    '',
    '=== КОНТЕКСТ ===',
    `Режим: ${mode === 'ci' ? 'CI / Pull Request' : mode === 'quick' ? 'Quick' : 'Full'}`,
    `Ветка: ${context.get('branch') || 'unknown'}`,
    `Коммит: ${(context.get('commitHash') || 'unknown').slice(0, 7)}`,
    `Автор: ${context.get('commitAuthor') || 'unknown'}`,
  ];

  if (scores) {
    lines.push(
      '',
      '=== Q-SCORE ===',
      `Q-Score: ${scores.qScore}/100, Quality Gate: ${scores.gatePassed ? 'ПРОЙДЕН' : 'НЕ ПРОЙДЕН'}`,
      `Порог: ${config.thresholds.q_score}`,
    );
    if (scores.breakdown && Object.keys(scores.breakdown).length > 0) {
      lines.push('Компоненты: ' + Object.entries(scores.breakdown).map(([k, v]) => `${k}=${v}`).join(', '));
    }
  }

  const totalErrors = lintResults.reduce((s, r) => s + r.errorCount, 0);
  const totalWarnings = lintResults.reduce((s, r) => s + r.warningCount, 0);
  lines.push(
    '',
    '=== СТАТИЧЕСКИЙ АНАЛИЗ ===',
    `Файлов проверено: ${lintResults.length}, ошибок: ${totalErrors}, предупреждений: ${totalWarnings}`,
  );

  const topLint = [...lintResults]
    .sort((a, b) => (b.errorCount + b.warningCount) - (a.errorCount + a.warningCount))
    .filter(r => r.errorCount + r.warningCount > 0)
    .slice(0, LLM_LIMITS.MAX_LINT_FILES);

  for (const file of topLint) {
    const path = shortenPath(file.filePath);
    const errs = file.eslintMessages.filter(m => m.severity === 2).slice(0, LLM_LIMITS.MAX_ERRORS_PER_FILE);
    const warns = file.eslintMessages.filter(m => m.severity === 1).slice(0, LLM_LIMITS.MAX_WARNINGS_PER_FILE);
    if (errs.length === 0 && warns.length === 0 && file.tscMessages?.length) {
      for (const m of file.tscMessages.slice(0, LLM_LIMITS.MAX_ERRORS_PER_FILE)) {
        lines.push(`  ${path}: [tsc] ${trunc(m.message, 120)}`);
      }
    } else {
      for (const m of errs) {
        lines.push(`  ${path}: [err] ${trunc(m.message, 120)}`);
      }
      for (const m of warns) {
        lines.push(`  ${path}: [warn] ${trunc(m.message, 120)}`);
      }
    }
  }
  if (totalErrors + totalWarnings > 0 && topLint.length < lintResults.filter(r => r.errorCount + r.warningCount > 0).length) {
    lines.push(`  … и ещё файлы с замечаниями (сокращено для лимита промпта)`);
  }

  if (complexity?.status === 'ok') {
    lines.push(
      '',
      '=== СЛОЖНОСТЬ ===',
      `Макс: ${complexity.maxComplexity} (порог ${config.thresholds.max_complexity}), средняя: ${complexity.averageComplexity}`,
      `Нарушений порога: ${complexity.violations.length}, LOC: ${complexity.totalLoc}`,
    );
    for (const v of complexity.violations.slice(0, 5)) {
      lines.push(`  ${shortenPath(v.file)} :: ${v.function} = ${v.complexity}`);
    }
  }

  if (testRun?.status === 'ok') {
    const cov = testRun.coverage;
    lines.push(
      '',
      '=== ТЕСТЫ ===',
      `Запущено: ${testRun.testsRun}, прошло: ${testRun.passed}, упало: ${testRun.failed}`,
      cov ? `Покрытие: строки ${cov.lines ?? '—'}%, ветви ${cov.branches ?? '—'}%` : 'Покрытие: нет данных',
    );
    for (const t of (testRun.failedTests ?? []).slice(0, LLM_LIMITS.MAX_FAILED_TESTS)) {
      lines.push(`  FAIL: ${trunc(t.testName, 80)}`);
    }
  } else if (testRun) {
    lines.push('', '=== ТЕСТЫ ===', `Статус: ${testRun.status}${'errorMessage' in testRun ? ` (${testRun.errorMessage})` : ''}`);
  }

  if (security?.status === 'ok') {
    lines.push(
      '',
      '=== БЕЗОПАСНОСТЬ ===',
      `npm audit: critical=${security.auditCritical}, high=${security.auditHigh}, moderate=${security.auditModerate}`,
      `gitleaks: ${security.gitleaksFound} утечек`,
    );
    for (const a of (security.auditAdvisories ?? []).slice(0, LLM_LIMITS.MAX_SECURITY_ITEMS)) {
      lines.push(`  [${a.severity}] ${a.packageName}: ${trunc(a.title, 100)}`);
    }
  }

  if (degradation?.status === 'ok') {
    const raw = degradation.rawScore ?? (1 - degradation.score / 100);
    const predictionLabel = degradation.prediction === 'degrading'
      ? 'деградация'
      : degradation.prediction === 'stable'
        ? 'стабильность'
        : degradation.prediction;
    lines.push(
      '',
      '=== ПРОГНОЗ ДЕГРАДАЦИИ КОДА ===',
      `Прогноз: ${predictionLabel}, индекс стабильности=${raw.toFixed(4)} (0–1, выше = стабильнее), уверенность=${(degradation.confidence * 100).toFixed(0)}%`,
      'Оцени, насколько прогноз согласуется с метриками lint, тестов и безопасности выше. Не комментируй ML-модель, её обучение или технологию — только интерпретацию прогноза для кода.',
    );
    for (const f of (degradation.factors ?? []).slice(0, LLM_LIMITS.MAX_DEGRADATION_FACTORS)) {
      lines.push(`  [${f.impact}] ${f.factor}: ${f.value}`);
    }
  } else if (degradation) {
    lines.push('', '=== ПРОГНОЗ ДЕГРАДАЦИИ КОДА ===', `Статус: ${degradation.status}`);
  }

  if (diff?.status === 'ok') {
    lines.push(
      '',
      '=== ИЗМЕНЕНИЯ (GIT) ===',
      `+${diff.locAdded}/-${diff.locRemoved} строк, файлов: ${diff.filesChanged}`,
      `Тесты затронуты: ${diff.hasTestsChanged ? 'да' : 'нет'}`,
      `Опыт автора в репозитории: ${diff.authorExperience} коммитов (0 = недостаточно данных git log, не оценивай автора негативно)`,
    );
  }

  lines.push(
    '',
    '=== ЗАДАНИЕ ===',
    '1. Секция «Рецензия:» — 2–4 связных абзаца без подзаголовков markdown.',
    '2. Если прогноз указывает на деградацию — оцени обоснованность по метрикам (не преувеличивай риск). Не комментируй ML-модель, CatBoost, ONNX или переобучение.',
    '3. Не используй заголовки #### и не повторяй формулировки из блока «ЗАДАНИЕ». Опирайся только на метрики из промпта.',
    '4. Секция «Рекомендации:» — ровно 3–7 пунктов, каждый с новой строки и префиксом «- ». Без примеров кода и JSDoc.',
    '5. Допускается markdown inline: **выделение** и `код` только внутри предложений.',
    'Не выдумывай метрики — опирайся только на данные выше.',
  );

  let prompt = lines.join('\n');
  if (prompt.length > LLM_LIMITS.MAX_PROMPT_CHARS) {
    prompt = prompt.slice(0, LLM_LIMITS.MAX_PROMPT_CHARS - 80) +
      '\n\n[…данные сокращены до лимита промпта MVP (~7500 символов)]';
  }
  return prompt;
}
