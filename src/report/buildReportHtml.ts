import type { QScoreHistoryPoint } from '../core/RunContext.js';
import type { Achievement, LintResult, CommitInfo } from '../core/types.js';
import type { ReportHtmlData } from './types.js';
import { REPORT_STYLES } from './reportStyles.js';
import {
  escapeHtml,
  shortenPath,
  labelFor,
  scoreColor,
  severityBadgeClass,
} from './reportUtils.js';
import { buildAiTab } from './sections/degradation.js';

export function buildReportHtml(data: ReportHtmlData): string {
    const {
      isCiMode,
      commitShort, commitHash, branch, mode, commitAuthor, commitDate,
      commitInfo, startedAt, finishedAt, durationSec,
      scores, threshold, thresholdComplexity, thresholdCoverage,
      breakdownLabels, breakdownValues,
      progress, qScoreHistory,
      lintResults, lintSuccess, lintError,
      totalErrors, totalWarnings, filesWithIssues, topIssueFiles,
      complexity, complexityErr, testRun, testRunErr,
      security, securityErr, degradation, diffMetrics,
      projectCtx, detectedVersions, achievements, llmReview,
    } = data;

    const qScore     = scores?.qScore ?? 0;
    const gatePassed = scores?.gatePassed ?? false;
    const qColor     = scoreColor(qScore);

    const testRunOk  = testRun?.status === 'ok' ? testRun : null;
    const coverageLines = testRunOk?.coverage?.lines ?? null;
    const coverageBranches = testRunOk?.coverage?.branches ?? null;
    const coverageFunctions = testRunOk?.coverage?.functions ?? null;

    // Предупреждение о пропуске раздела
    const sectionWarning = (errMsg?: string | null): string => {
      if (!errMsg) return '';
      return `<div class="tool-warning">
        <span class="warn-icon">⚠</span>
        Результат данного раздела может быть искажён из-за ошибки настройки окружения.
        Рекомендуется проверить конфигурацию инструментов и повторить анализ.
      </div>`;
    };

    // Breakdown rows 
    const breakdownRows = scores?.breakdown
      ? Object.entries(scores.breakdown as Record<string, number>)
          .map(([k, v]) => `
          <div class="metric-row">
            <span class="metric-name">${labelFor(k)}</span>
            <div class="metric-bar-wrap">
              <div class="metric-bar" style="width:${v}%;background:${scoreColor(v)}"></div>
            </div>
            <span class="metric-val" style="color:${scoreColor(v)}">${v}</span>
          </div>`).join('')
      : '<p class="muted">Данные недоступны</p>';

    // Прогресс 
    const progressSection = progress ? `
      <div class="progress-strip">
        <div class="progress-card">
          <div class="progress-label">Предыдущий Q-Score</div>
          <div class="progress-val">${progress.previousQScore !== null ? progress.previousQScore.toFixed(1) : '—'}</div>
        </div>
        <div class="progress-card">
          <div class="progress-label">Изменение</div>
          <div class="progress-val" style="color:${progress.delta !== null && progress.delta > 0 ? '#00ff88' : progress.delta !== null && progress.delta < 0 ? '#ff3366' : '#8899aa'}">
            ${progress.delta !== null ? (progress.delta > 0 ? '+' : '') + progress.delta.toFixed(1) : '—'}
          </div>
        </div>
        <div class="progress-card">
          <div class="progress-label">Тренд</div>
          <div class="progress-val">${progress.trend === 'up' ? '↑ Рост' : progress.trend === 'down' ? '↓ Падение' : progress.trend === 'stable' ? '→ Стабильно' : '— Нет данных'}</div>
        </div>
        <div class="progress-card">
          <div class="progress-label">Всего проверок</div>
          <div class="progress-val">${progress.checksCount}</div>
        </div>
      </div>` : '';

    const achievementsHtml = achievements.length > 0
      ? achievements.map((a: Achievement) => `
          <div class="achievement-item">
            <span class="achievement-label">${escapeHtml(a.label)}</span>
            <span class="achievement-desc">${escapeHtml(a.description)}</span>
          </div>`).join('')
      : '';

    // Tab 1: Обзор 
    const historyForChart: QScoreHistoryPoint[] = [...(qScoreHistory ?? [])].reverse();
    if (scores?.qScore != null) {
      historyForChart.push({
        qScore: scores.qScore,
        createdAt: new Date().toISOString(),
        commitHash: commitShort,
        branch: branch,
      });
    }
    const chartLabels = historyForChart.map(p =>
      p.commitHash ? p.commitHash.slice(0, 7) : p.createdAt.slice(0, 10)
    );
    const chartValues = historyForChart.map(p => p.qScore ?? null);

    const tab1 = `
      <div class="overview-grid">
        <div class="qscore-panel glass-card">
          <div class="qscore-label">Q-SCORE</div>
          <div class="qscore-value" style="color:${qColor}">${qScore}</div>
          <div class="qscore-max">из 100</div>
          <div class="gate-badge ${gatePassed ? 'gate-pass' : 'gate-fail'}">
            ${gatePassed ? '✓ QUALITY GATE ПРОЙДЕН' : '✗ QUALITY GATE НЕ ПРОЙДЕН'}
          </div>
          <div class="gate-threshold">порог: ${threshold}</div>
        </div>

        <div class="breakdown-panel glass-card">
          <div class="panel-title">КОМПОНЕНТЫ Q-SCORE</div>
          ${breakdownRows}
          <div style="height:180px;margin-top:12px;position:relative">
            <canvas id="radarChart"></canvas>
          </div>
        </div>
      </div>

      ${progressSection}

      ${historyForChart.length > 1 ? `
      <div class="glass-card" style="margin-top:16px">
        <div class="panel-title">ИСТОРИЯ Q-SCORE</div>
        <div style="height:200px;position:relative">
          <canvas id="historyChart"></canvas>
        </div>
      </div>` : ''}

      ${achievementsHtml ? `
      <div class="glass-card" style="margin-top:16px">
        <div class="panel-title">ДОСТИЖЕНИЯ</div>
        <div class="achievements-list">${achievementsHtml}</div>
      </div>` : ''}
    `;

    // 2: Статический анализ 
    const lintFileDetails = topIssueFiles.map((file: LintResult) => {
      const shortPath = shortenPath(file.filePath);
      const errMsgs = file.eslintMessages
        .filter((m: any) => m.severity === 2)
        .map((m: any) => `<div class="msg-row err-row">
            <span class="msg-line">:${m.line ?? '?'}</span>
            <span class="msg-rule">${escapeHtml(m.ruleId ?? 'unknown')}</span>
            <span class="msg-text">${escapeHtml(m.message)}</span>
            <span class="msg-src">${m.source ?? 'eslint'}</span>
          </div>`).join('');
      const warnMsgs = file.eslintMessages
        .filter((m: any) => m.severity === 1)
        .map((m: any) => `<div class="msg-row warn-row">
            <span class="msg-line">:${m.line ?? '?'}</span>
            <span class="msg-rule">${escapeHtml(m.ruleId ?? 'unknown')}</span>
            <span class="msg-text">${escapeHtml(m.message)}</span>
            <span class="msg-src">${m.source ?? 'eslint'}</span>
          </div>`).join('');
      const tscMsgs = (file.tscMessages ?? [])
        .map((m: any) => `<div class="msg-row tsc-row">
            <span class="msg-line">:${m.line ?? '?'}</span>
            <span class="msg-rule">${escapeHtml(m.ruleId ?? 'tsc')}</span>
            <span class="msg-text">${escapeHtml(m.message)}</span>
            <span class="msg-src">tsc</span>
          </div>`).join('');

      return `
        <details class="file-details">
          <summary class="file-summary">
            <span class="file-path">${escapeHtml(shortPath)}</span>
            <span class="file-badges">
              ${file.errorCount > 0 ? `<span class="badge badge-err">${file.errorCount} ош.</span>` : ''}
              ${file.warningCount > 0 ? `<span class="badge badge-warn">${file.warningCount} пред.</span>` : ''}
            </span>
          </summary>
          <div class="file-messages">
            ${errMsgs || warnMsgs || tscMsgs || '<div class="muted">Нет деталей</div>'}
          </div>
        </details>`;
    }).join('');

    const tab2 = `
      ${sectionWarning(lintError)}
      <div class="stat-cards">
        <div class="stat-card ${totalErrors > 0 ? 'stat-crit' : 'stat-ok'}">
          <div class="stat-num">${totalErrors}</div>
          <div class="stat-label">Ошибок ESLint / tsc</div>
        </div>
        <div class="stat-card ${totalWarnings > 0 ? 'stat-warn' : 'stat-ok'}">
          <div class="stat-num">${totalWarnings}</div>
          <div class="stat-label">Предупреждений</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${filesWithIssues.length}</div>
          <div class="stat-label">Файлов с проблемами</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${lintResults.length}</div>
          <div class="stat-label">Проверено файлов</div>
        </div>
      </div>
      ${topIssueFiles.length > 0
        ? `<div class="section-subtitle">Детали по файлам</div>
           <div class="file-list">${lintFileDetails}</div>`
        : lintSuccess
          ? '<div class="success-msg">✓ Ошибок и предупреждений не обнаружено.</div>'
          : '<div class="muted">Статический анализ не выполнен или данные недоступны.</div>'}
    `;

    // 3: Сложность 
    const complexityViolationRows = (complexity?.violations ?? []).map((v: any) => `
      <tr>
        <td class="mono cell-overflow">${escapeHtml(shortenPath(v.file))}</td>
        <td class="mono cell-overflow">${escapeHtml(v.function)}</td>
        <td class="${v.complexity > thresholdComplexity ? 'val-crit' : 'val-ok'}">${v.complexity}</td>
        <td>${v.line ?? '—'}</td>
      </tr>`).join('');

    const fileLocs = complexity?.fileLocs ?? [];
    const locTableRows = fileLocs.slice(0, 20).map((f: any) => `
      <tr>
        <td class="mono cell-overflow">${escapeHtml(shortenPath(f.filePath))}</td>
        <td>${f.totalLines}</td>
      </tr>`).join('');

    const tab3 = `
      ${sectionWarning(complexityErr)}
      <div class="stat-cards">
        <div class="stat-card ${(complexity?.maxComplexity ?? 0) > thresholdComplexity ? 'stat-crit' : 'stat-ok'}">
          <div class="stat-num">${complexity?.maxComplexity ?? 0}</div>
          <div class="stat-label">Макс. сложность (порог: ${thresholdComplexity})</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${complexity?.averageComplexity ?? 0}</div>
          <div class="stat-label">Средняя сложность</div>
        </div>
        <div class="stat-card ${(complexity?.violations.length ?? 0) > 0 ? 'stat-crit' : 'stat-ok'}">
          <div class="stat-num">${complexity?.violations.length ?? 0}</div>
          <div class="stat-label">Нарушений порога</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${complexity?.totalLoc ?? 0}</div>
          <div class="stat-label">Всего строк кода</div>
        </div>
      </div>
      ${complexity?.violations.length ? `
        <div class="section-subtitle">Функции с высокой сложностью</div>
        <div class="table-wrap">
        <table>
          <thead><tr><th>Файл</th><th>Функция</th><th>Сложность</th><th>Строка</th></tr></thead>
          <tbody>${complexityViolationRows}</tbody>
        </table>
        </div>` : ''}
      ${fileLocs.length > 0 ? `
        <details style="margin-top:12px">
          <summary class="details-toggle">Размер файлов (строки кода)</summary>
          <div class="table-wrap">
          <table>
            <thead><tr><th>Файл</th><th>Строк</th></tr></thead>
            <tbody>${locTableRows}</tbody>
          </table>
          </div>
          ${fileLocs.length > 20 ? `<div class="muted">... и ещё ${fileLocs.length - 20} файлов</div>` : ''}
        </details>` : ''}
    `;

    // 4: Тесты и покрытие 
    const failedTestRows = (testRunOk?.failedTests ?? []).map((t: any) => `
      <details class="file-details">
        <summary class="file-summary">
          <span class="file-path">${escapeHtml(t.testName)}</span>
          <span class="badge badge-err">не прошёл</span>
        </summary>
        <div class="file-messages">
          <div class="msg-row">
            <span class="msg-rule">Набор:</span>
            <span class="msg-text">${escapeHtml(t.suiteName)}</span>
          </div>
          ${t.errorMessage ? `<div class="msg-row err-row">
            <span class="msg-rule">Ошибка:</span>
            <span class="msg-text mono">${escapeHtml(t.errorMessage)}</span>
          </div>` : ''}
          ${t.duration !== undefined ? `<div class="msg-row">
            <span class="msg-rule">Время:</span>
            <span class="msg-text">${t.duration} мс</span>
          </div>` : ''}
        </div>
      </details>`).join('');

    const coverageItems = [
      { label: 'Строки', value: coverageLines },
      { label: 'Ветви', value: coverageBranches },
      { label: 'Функции', value: coverageFunctions },
    ].filter(x => x.value !== null)
      .map(x => `<div class="stat-card ${(x.value ?? 0) >= thresholdCoverage ? 'stat-ok' : 'stat-crit'}">
        <div class="stat-num">${x.value}%</div>
        <div class="stat-label">Покрытие: ${x.label} (мин: ${thresholdCoverage}%)</div>
      </div>`).join('');

    const tab4 = `
      ${sectionWarning(testRunErr)}
      <div class="stat-cards">
        <div class="stat-card">
          <div class="stat-num">${testRunOk?.testsRun ?? 0}</div>
          <div class="stat-label">Всего тестов</div>
        </div>
        <div class="stat-card ${(testRunOk?.passed ?? 0) > 0 ? 'stat-ok' : ''}">
          <div class="stat-num">${testRunOk?.passed ?? 0}</div>
          <div class="stat-label">Успешно</div>
        </div>
        <div class="stat-card ${(testRunOk?.failed ?? 0) > 0 ? 'stat-crit' : 'stat-ok'}">
          <div class="stat-num">${testRunOk?.failed ?? 0}</div>
          <div class="stat-label">Не прошли</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${testRunOk?.skipped ?? 0}</div>
          <div class="stat-label">Пропущено</div>
        </div>
      </div>
      ${coverageItems ? `<div class="stat-cards">${coverageItems}</div>` : ''}
      ${testRun?.status === 'skipped' ? `<div class="muted">${(testRun as any).errorMessage ?? 'Тесты пропущены'}</div>` : ''}
      ${testRun?.status === 'error' ? `<div class="tool-warning"><span class="warn-icon">⚠</span> Ошибка запуска тестов: ${escapeHtml((testRun as any).errorMessage ?? '')}</div>` : ''}
      ${failedTestRows ? `<div class="section-subtitle">Не прошедшие тесты</div><div class="file-list">${failedTestRows}</div>` : ''}
      ${(testRunOk?.failed ?? 0) === 0 && testRun?.status === 'ok' ? '<div class="success-msg">✓ Все тесты прошли успешно.</div>' : ''}
    `;

    // 5: Безопасность 
    const auditRows = (security?.auditAdvisories ?? []).map((a: any) => `
      <tr>
        <td class="mono cell-overflow">${escapeHtml(a.packageName)}</td>
        <td class="cell-overflow">${escapeHtml(a.title)}</td>
        <td><span class="sev-badge ${severityBadgeClass(a.severity)}">${a.severity}</span></td>
        <td>${a.url ? `<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener">ссылка</a>` : '—'}</td>
      </tr>`).join('');

    const gitleaksRows = (security?.gitleaksLeaks ?? []).map((l: any) => `
      <tr>
        <td class="mono cell-overflow">${escapeHtml(l.file)}</td>
        <td>${l.line ?? '—'}</td>
        <td class="cell-overflow">${escapeHtml(l.description)}</td>
        <td>${escapeHtml(l.ruleId ?? '—')}</td>
      </tr>`).join('');

    const tab5 = `
      ${sectionWarning(securityErr)}
      <div class="stat-cards">
        <div class="stat-card ${(security?.auditCritical ?? 0) > 0 ? 'stat-crit' : 'stat-ok'}">
          <div class="stat-num">${security?.auditCritical ?? 0}</div>
          <div class="stat-label">Критических</div>
        </div>
        <div class="stat-card ${(security?.auditHigh ?? 0) > 0 ? 'stat-crit' : 'stat-ok'}">
          <div class="stat-num">${security?.auditHigh ?? 0}</div>
          <div class="stat-label">Высокий риск</div>
        </div>
        <div class="stat-card ${(security?.auditModerate ?? 0) > 0 ? 'stat-warn' : 'stat-ok'}">
          <div class="stat-num">${security?.auditModerate ?? 0}</div>
          <div class="stat-label">Средний риск</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${security?.auditLow ?? 0}</div>
          <div class="stat-label">Низкий риск</div>
        </div>
        <div class="stat-card ${(security?.gitleaksFound ?? 0) > 0 ? 'stat-crit' : 'stat-ok'}">
          <div class="stat-num">${security?.gitleaksFound ?? 0}</div>
          <div class="stat-label">Утечек (gitleaks)</div>
        </div>
      </div>
      ${!security?.gitleaksAvailable
        ? `<div class="muted">gitleaks не установлен. Сканирование секретов не выполнялось.</div>`
        : ''}
      ${auditRows ? `
        <div class="section-subtitle">Уязвимости npm audit (${security?.auditVulnerabilities ?? 0})</div>
        <div class="table-wrap">
        <table>
          <thead><tr><th>Пакет</th><th>Уязвимость</th><th>Уровень</th><th>Ссылка</th></tr></thead>
          <tbody>${auditRows}</tbody>
        </table>
        </div>` : security?.status === 'ok' ? '<div class="success-msg">✓ Уязвимости npm audit не обнаружены.</div>' : ''}
      ${gitleaksRows ? `
        <div class="section-subtitle">Обнаруженные секреты (gitleaks)</div>
        <div class="table-wrap">
        <table>
          <thead><tr><th>Файл</th><th>Строка</th><th>Описание</th><th>Правило</th></tr></thead>
          <tbody>${gitleaksRows}</tbody>
        </table>
        </div>` : security?.gitleaksAvailable ? '<div class="success-msg">✓ Секреты не обнаружены.</div>' : ''}
    `;

    //6: Git & Diff
    const prCommits: CommitInfo[] = diffMetrics?.prCommits ?? [];
    const commitMessages: string[] = diffMetrics?.commitMessages ?? [];

    const prCommitsTable = prCommits.length > 0 ? `
      <div class="section-subtitle">Коммиты в этом PR (${prCommits.length})</div>
      <div class="table-wrap">
      <table>
        <thead><tr><th>Хэш</th><th>Автор</th><th>Дата</th><th>Сообщение</th></tr></thead>
        <tbody>
          ${prCommits.map(c => `
          <tr>
            <td class="mono">${escapeHtml(c.shortHash)}</td>
            <td class="cell-overflow">${escapeHtml(c.author)}</td>
            <td class="nowrap">${escapeHtml(c.date.slice(0, 10))}</td>
            <td class="cell-overflow">${escapeHtml(c.message)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      </div>` : '';

    const headCommitSection = !isCiMode && commitMessages.length > 0 ? `
      <div class="section-subtitle">Сообщение коммита</div>
      <div class="commit-msg-block">
        ${commitMessages.map(m => `<div class="commit-msg-item">${escapeHtml(m)}</div>`).join('')}
      </div>` : '';

    const changedFilesList = (diffMetrics?.changedFiles ?? []).slice(0, 50).map((f: any) =>
      `<li class="mono cell-overflow">${escapeHtml(shortenPath(f))}</li>`).join('');

    const tab6 = diffMetrics ? `
      ${isCiMode ? prCommitsTable : headCommitSection}
      <div class="stat-cards">
        <div class="stat-card">
          <div class="stat-num stat-add">+${diffMetrics.locAdded}</div>
          <div class="stat-label">Добавлено строк</div>
        </div>
        <div class="stat-card">
          <div class="stat-num stat-del">−${diffMetrics.locRemoved}</div>
          <div class="stat-label">Удалено строк</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${diffMetrics.filesChanged}</div>
          <div class="stat-label">Изменено файлов</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${diffMetrics.tsFilesChanged}</div>
          <div class="stat-label">TS файлов</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${diffMetrics.jsFilesChanged}</div>
          <div class="stat-label">JS файлов</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${diffMetrics.vueFilesChanged}</div>
          <div class="stat-label">Vue файлов</div>
        </div>
      </div>
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">Базовая ветка</span>
          <span class="info-val mono">${escapeHtml(diffMetrics.baseRef ?? 'origin/main')}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Тесты затронуты</span>
          <span class="info-val ${diffMetrics.hasTestsChanged ? 'val-ok' : 'val-warn'}">${diffMetrics.hasTestsChanged ? 'Да ✓' : 'Нет'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Конфиг затронут</span>
          <span class="info-val ${diffMetrics.hasConfigChanged ? 'val-warn' : ''}">${diffMetrics.hasConfigChanged ? 'Да ⚠' : 'Нет'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Соотношение удалений</span>
          <span class="info-val">${diffMetrics.changeRatio.toFixed(2)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Опыт автора</span>
          <span class="info-val">${diffMetrics.authorExperience} коммитов</span>
        </div>
        <div class="info-item">
          <span class="info-label">Churn файлов (90 дн.)</span>
          <span class="info-val">${diffMetrics.fileChurnAvg.toFixed(2)}</span>
        </div>
      </div>
      ${changedFilesList ? `
        <details style="margin-top:12px">
          <summary class="details-toggle">Изменённые файлы (${diffMetrics.changedFiles.length})</summary>
          <ul class="changed-files-list">${changedFilesList}</ul>
          ${diffMetrics.changedFiles.length > 50 ? `<div class="muted">... ещё ${diffMetrics.changedFiles.length - 50} файлов</div>` : ''}
        </details>` : ''}
    ` : '<div class="muted">Данные git diff недоступны.</div>';

    // 7: Окружение 
    const allVersionItems: Array<{ label: string; key: string; value: string }> = [
      { label: 'Node.js',             key: 'node',            value: detectedVersions.node?.raw ?? process.version },
      { label: 'npm',                 key: 'npm',             value: detectedVersions.npm?.raw ?? '—' },
      { label: 'Git',                 key: 'git',             value: detectedVersions.git?.raw ?? '—' },
      { label: 'TypeScript',          key: 'typescript',      value: detectedVersions.typescript?.raw ?? '—' },
      { label: 'ESLint',              key: 'eslint',          value: detectedVersions.eslint?.raw ?? '—' },
      { label: 'Vitest',              key: 'vitest',          value: detectedVersions.vitest?.raw ?? '—' },
      { label: 'Jest',                key: 'jest',            value: detectedVersions.jest?.raw ?? '—' },
      { label: 'React',               key: 'react',           value: detectedVersions.react?.raw ?? '—' },
      { label: 'Vue',                 key: 'vue',             value: detectedVersions.vue?.raw ?? '—' },
      { label: 'Next.js',             key: 'next',            value: detectedVersions.next?.raw ?? '—' },
      { label: 'Nuxt',                key: 'nuxt',            value: detectedVersions.nuxt?.raw ?? '—' },
      { label: 'NestJS',              key: 'nestjs',          value: detectedVersions.nestjs?.raw ?? '—' },
      { label: 'gitleaks',            key: 'gitleaks',        value: detectedVersions.gitleaks?.raw ?? '—' },
      { label: 'eslint-plugin-sonarjs', key: 'sonarjs',       value: detectedVersions.sonarjs?.raw ?? '—' },
      { label: '@vitest/coverage-v8', key: 'vitestCoverageV8', value: detectedVersions.vitestCoverageV8?.raw ?? '—' },
    ];

    const versionsHtml = allVersionItems
      .map(i => `
        <div class="info-item ${i.value === '—' ? 'info-item-na' : ''}">
          <span class="info-label">${i.label}</span>
          <span class="info-val mono ${i.value === '—' ? 'val-na' : ''}">${i.value}</span>
        </div>`).join('');

    const stackItems = projectCtx ? [
      { label: 'TypeScript', value: projectCtx.hasTypeScript ? '✓ Да' : '— Нет', ok: projectCtx.hasTypeScript },
      { label: 'React', value: projectCtx.hasReact ? '✓ Да' : '— Нет', ok: projectCtx.hasReact },
      { label: 'Next.js', value: projectCtx.hasNext ? '✓ Да' : '— Нет', ok: projectCtx.hasNext },
      { label: 'Vue', value: projectCtx.hasVue ? '✓ Да' : '— Нет', ok: projectCtx.hasVue },
      { label: 'Nuxt', value: projectCtx.hasNuxt ? '✓ Да' : '— Нет', ok: projectCtx.hasNuxt },
      { label: 'ESLint', value: projectCtx.hasEslint ? '✓ Да' : '— Нет', ok: projectCtx.hasEslint },
      { label: 'Тест-раннер', value: projectCtx.testRunner, ok: projectCtx.testRunner !== 'unknown' },
    ] : [];

    const stackHtml = stackItems.map(i =>
      `<div class="info-item">
        <span class="info-label">${i.label}</span>
        <span class="info-val ${i.ok ? 'val-ok' : 'val-na'}">${i.value}</span>
      </div>`).join('');

    const tab7 = `
      <div class="section-subtitle">Параметры запуска</div>
      <div class="info-grid">
        <div class="info-item"><span class="info-label">Режим</span><span class="info-val">${isCiMode ? 'CI / Pull Request' : 'Локальная проверка'}</span></div>
        <div class="info-item"><span class="info-label">Коммит</span><span class="info-val mono">${escapeHtml(commitShort)}</span></div>
        <div class="info-item"><span class="info-label">Ветка</span><span class="info-val mono">${escapeHtml(branch)}</span></div>
        <div class="info-item"><span class="info-label">Автор</span><span class="info-val">${escapeHtml(commitAuthor)}</span></div>
        <div class="info-item"><span class="info-label">Дата коммита</span><span class="info-val">${escapeHtml(commitDate.slice(0, 19))}</span></div>
        <div class="info-item"><span class="info-label">Начало</span><span class="info-val">${startedAt}</span></div>
        <div class="info-item"><span class="info-label">Окончание</span><span class="info-val">${finishedAt}</span></div>
        <div class="info-item"><span class="info-label">Длительность</span><span class="info-val">${durationSec} сек.</span></div>
        <div class="info-item"><span class="info-label">Платформа</span><span class="info-val">${process.platform} / ${process.arch}</span></div>
      </div>
      <div class="section-subtitle">Стек проекта</div>
      <div class="info-grid">${stackHtml || '<div class="muted">Нет данных</div>'}</div>
      <div class="section-subtitle">Версии инструментов</div>
      <div class="info-grid">${versionsHtml}</div>
    `;

    // 8: AI — Анализ деградации (реальные данные модели) 
    const tab8 = buildAiTab(degradation, llmReview);

    // Tab 9: Методология
    const weightsDisplay = `
      <div class="table-wrap">
      <table>
        <thead><tr><th>Компонент</th><th>Вес</th><th>Формула</th></tr></thead>
        <tbody>
          <tr>
            <td>Статический анализ</td>
            <td>30%</td>
            <td class="mono">max(0, 100 − errors × 5)</td>
          </tr>
          <tr>
            <td>Сложность кода</td>
            <td>20%</td>
            <td class="mono">max(0, 100 − (maxC − threshold) × 5)</td>
          </tr>
          <tr>
            <td>Покрытие тестами</td>
            <td>25%</td>
            <td class="mono">floor(coverageScore × passRate)</td>
          </tr>
          <tr>
            <td>Безопасность</td>
            <td>15%</td>
            <td class="mono">max(0, 100 − crit×20 − high×10 − mod×5)</td>
          </tr>
          <tr>
            <td>ML (деградация)</td>
            <td>10%</td>
            <td class="mono">max(0, 100 − degradationScore)</td>
          </tr>
        </tbody>
      </table>
      </div>
    `;

    const tab9 = `
      <div class="glass-card" style="margin-bottom:16px">
        <div class="panel-title">ФОРМУЛА Q-SCORE</div>
        <div class="formula-block">
          <div class="formula-main">Q = Σ (componentScore<sub>i</sub> × weight<sub>i</sub>) / Σ weight<sub>i</sub></div>
          <div class="formula-note">Суммирование только по компонентам, данные которых доступны (status ≠ skipped)</div>
        </div>
      </div>

      <div class="glass-card" style="margin-bottom:16px">
        <div class="panel-title">ВЕСА И ФОРМУЛЫ КОМПОНЕНТОВ</div>
        ${weightsDisplay}
      </div>

      <div class="glass-card" style="margin-bottom:16px">
        <div class="panel-title">ДЕТАЛИ РАСЧЁТОВ</div>
        <div class="calc-block">
          <div class="calc-section">
            <div class="calc-title">Статический анализ</div>
            <div class="calc-desc">
              Считаются все ошибки ESLint и TypeScript (tsc --noEmit). Каждая ошибка штрафует на 5 баллов.
              Предупреждения в счёт не входят. Начальный балл: 100.
              <br><code>score = max(0, 100 − errorCount × 5)</code>
            </div>
          </div>
          <div class="calc-section">
            <div class="calc-title">Сложность кода</div>
            <div class="calc-desc">
              Используется когнитивная (sonarjs) или цикломатическая (ESLint complexity) сложность.
              Штраф применяется только если maxComplexity превышает порог.
              <br><code>score = max(0, 100 − (maxComplexity − threshold) × 5)</code>
            </div>
          </div>
          <div class="calc-section">
            <div class="calc-title">Покрытие тестами</div>
            <div class="calc-desc">
              Базовый балл рассчитывается по покрытию строк (или statements если строки недоступны).
              Применяется дополнительный штраф за не прошедшие тесты: итоговый балл умножается на долю успешных тестов.
              <br><code>coverageScore = min(100, coverage / threshold × 100)</code>
              <br><code>passRate = passed / total</code>
              <br><code>finalScore = floor(coverageScore × passRate)</code>
            </div>
          </div>
          <div class="calc-section">
            <div class="calc-title">Безопасность</div>
            <div class="calc-desc">
              Штрафы за уязвимости npm audit и утечки gitleaks. Критические уязвимости — максимальный штраф.
              <br><code>penalty = critical×20 + high×10 + moderate×5 + total×2</code>
              <br><code>score = max(0, 100 − penalty)</code>
            </div>
          </div>
          <div class="calc-section">
            <div class="calc-title">ML-модель деградации</div>
            <div class="calc-desc">
              CatBoost-регрессор предсказывает индекс стабильности кода (0–1, выше = стабильнее).
              Значения выше 0.5 означают стабильность, ниже — деградацию.
              <br><code>индексСтабильности = model.predict(features)  // ∈ [0, 1]</code>
              <br><code>degradationScore = (1 − индексСтабильности) × 100</code>
              <br><code>componentScore = max(0, 100 − degradationScore)</code>
            </div>
          </div>
          <div class="calc-section">
            <div class="calc-title">Quality Gate</div>
            <div class="calc-desc">
              Q-Score сравнивается с настроенным порогом (по умолчанию: 70).
              Если Q-Score ≥ порог — Gate ПРОЙДЕН. В CI-режиме при Gate FAILED процесс завершается с кодом выхода 1.
              <br><code>gatePassed = (qScore ≥ threshold)</code>
            </div>
          </div>
        </div>
      </div>

      <div class="glass-card">
        <div class="panel-title">ИНТЕРПРЕТАЦИЯ ЗНАЧЕНИЙ</div>
        <div class="stat-cards">
          <div class="stat-card stat-ok">
            <div class="stat-num" style="color:#00ff88">80–100</div>
            <div class="stat-label">Отличное качество</div>
          </div>
          <div class="stat-card stat-warn">
            <div class="stat-num" style="color:#ffcc00">60–79</div>
            <div class="stat-label">Допустимое качество</div>
          </div>
          <div class="stat-card stat-crit">
            <div class="stat-num" style="color:#ff3366">0–59</div>
            <div class="stat-label">Требует улучшения</div>
          </div>
        </div>
      </div>
    `;

    // Хедер с пульсом 
    const modeLabel = isCiMode ? 'CI / PULL REQUEST' : 'ЛОКАЛЬНАЯ ПРОВЕРКА';
    const commitMsgDisplay = commitInfo?.message
      ? escapeHtml(commitInfo.message.slice(0, 80)) + (commitInfo.message.length > 80 ? '…' : '')
      : '';

    // Сборка HTML 
    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>PULSQUAL — ${commitShort} · ${escapeHtml(branch)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet"/>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
  <style>${REPORT_STYLES}</style>
</head>
<body>

<div class="header">
  <div class="header-inner">
    <div class="header-top">
      <div class="logo-block">
        <div>
          <div class="logo-text"><span class="logo-red">P</span>ULSQUAL</div>
          <div class="logo-sub">Code Quality Monitor</div>
        </div>
      </div>
      <div class="header-badges">
        <span class="hbadge"><span class="hb-label">commit</span><span class="hb-val">${escapeHtml(commitShort)}</span></span>
        <span class="hbadge"><span class="hb-label">branch</span><span class="hb-val">${escapeHtml(branch)}</span></span>
        <span class="hbadge"><span class="hb-label">mode</span><span class="hb-val">${modeLabel}</span></span>
        <span class="hbadge"><span class="hb-label">Q</span><span class="hb-val" style="color:${qColor}">${qScore}</span></span>
        <span class="hbadge ${gatePassed ? 'gate-pass' : 'gate-fail'}" style="border-radius:4px">${gatePassed ? '✓ GATE PASS' : '✗ GATE FAIL'}</span>
      </div>
    </div>
    ${commitMsgDisplay ? `<div class="header-commit-msg">${commitMsgDisplay}</div>` : ''}
  </div>

  <svg class="pulse-line" viewBox="0 0 1200 44" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="pulseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:rgba(255,51,102,0)"/>
        <stop offset="40%" style="stop-color:rgba(255,51,102,0.6)"/>
        <stop offset="60%" style="stop-color:rgba(0,255,136,0.6)"/>
        <stop offset="100%" style="stop-color:rgba(0,255,136,0)"/>
      </linearGradient>
    </defs>
    <path class="flatline" d="M0,22 L1200,22"/>
    <path class="pulse" d="M0,22 L200,22 L220,22 L230,8 L240,36 L250,4 L260,40 L268,22 L280,22 L500,22"/>
    <path class="fade-to-chart" d="M500,22 L700,22 Q850,22 1000,18 Q1100,15 1200,${22 - Math.min(15, Math.max(-15, (qScore - 50) / 5))}"/>
  </svg>
</div>

<div class="page-body">
  <div class="tabs-container">
    <div class="tabs-nav">
      <button class="tab-btn active" data-tab="tab-overview">Обзор</button>
      <button class="tab-btn" data-tab="tab-static">Анализ</button>
      <button class="tab-btn" data-tab="tab-complexity">Сложность</button>
      <button class="tab-btn" data-tab="tab-tests">Тесты</button>
      <button class="tab-btn" data-tab="tab-security">Безопасность</button>
      <button class="tab-btn" data-tab="tab-diff">${isCiMode ? 'PR / Коммиты' : 'Git'}</button>
      <button class="tab-btn" data-tab="tab-env">Окружение</button>
      <button class="tab-btn" data-tab="tab-ai">AI</button>
      <button class="tab-btn" data-tab="tab-method">Методология</button>
    </div>

    <div id="tab-overview"    class="tab-content active">${tab1}</div>
    <div id="tab-static"      class="tab-content">${tab2}</div>
    <div id="tab-complexity"  class="tab-content">${tab3}</div>
    <div id="tab-tests"       class="tab-content">${tab4}</div>
    <div id="tab-security"    class="tab-content">${tab5}</div>
    <div id="tab-diff"        class="tab-content">${tab6}</div>
    <div id="tab-env"         class="tab-content">${tab7}</div>
    <div id="tab-ai"          class="tab-content">${tab8}</div>
    <div id="tab-method"      class="tab-content">${tab9}</div>
  </div>
</div>

<div class="footer">
  PULSQUAL &mdash; Code Quality Monitor &nbsp;·&nbsp; ${finishedAt} &nbsp;·&nbsp; ${durationSec}s
</div>

<script>
(function() {
  var btns   = document.querySelectorAll('.tab-btn');
  var panels = document.querySelectorAll('.tab-content');
  btns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var target = btn.getAttribute('data-tab');
      btns.forEach(function(b)   { b.classList.remove('active'); });
      panels.forEach(function(p) { p.classList.remove('active'); });
      btn.classList.add('active');
      var panel = document.getElementById(target);
      if (panel) panel.classList.add('active');
    });
  });
})();

(function() {
  var labels = ${JSON.stringify(breakdownLabels)};
  var values = ${JSON.stringify(breakdownValues)};
  if (!labels.length) return;
  var ctx = document.getElementById('radarChart');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'radar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Q-Score',
        data: values,
        backgroundColor: 'rgba(0,255,136,.1)',
        borderColor: '#00ff88',
        borderWidth: 1.5,
        pointBackgroundColor: '#00ff88',
        pointRadius: 3,
        pointHoverRadius: 5,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { stepSize: 20, font: { size: 9, family: 'JetBrains Mono' }, color: '#607080', backdropColor: 'transparent' },
          pointLabels: { font: { size: 10, family: 'Inter' }, color: '#8899aa' },
          grid: { color: 'rgba(0,255,136,.08)' },
          angleLines: { color: 'rgba(0,255,136,.06)' },
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: 'rgba(10,11,13,.9)', borderColor: 'rgba(0,255,136,.3)', borderWidth: 1, titleColor: '#00ff88', bodyColor: '#c8d0d8', callbacks: { label: function(c) { return ' ' + c.raw + ' / 100'; } } }
      }
    }
  });
})();

(function() {
  var chartLabels = ${JSON.stringify(chartLabels)};
  var chartValues = ${JSON.stringify(chartValues)};
  var threshold   = ${threshold};
  if (chartLabels.length < 2) return;
  var ctx = document.getElementById('historyChart');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartLabels,
      datasets: [
        { label: 'Q-Score', data: chartValues, borderColor: '#00ff88', backgroundColor: 'rgba(0,255,136,.08)', borderWidth: 2, pointBackgroundColor: chartValues.map(function(v) { if (v === null) return '#607080'; return v >= 80 ? '#00ff88' : v >= 60 ? '#ffcc00' : '#ff3366'; }), pointRadius: 4, pointHoverRadius: 6, fill: true, tension: 0.35, spanGaps: true },
        { label: 'Порог', data: chartLabels.map(function() { return threshold; }), borderColor: 'rgba(255,51,102,.5)', borderWidth: 1, borderDash: [4, 4], pointRadius: 0, fill: false }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { font: { size: 9, family: 'JetBrains Mono' }, color: '#607080', maxRotation: 0 }, grid: { color: 'rgba(0,255,136,.04)' }, border: { color: 'rgba(0,255,136,.1)' } },
        y: { min: 0, max: 100, ticks: { font: { size: 9, family: 'JetBrains Mono' }, color: '#607080', stepSize: 20 }, grid: { color: 'rgba(0,255,136,.04)' }, border: { color: 'rgba(0,255,136,.1)' } }
      },
      plugins: {
        legend: { labels: { font: { size: 10, family: 'Inter' }, color: '#8899aa', boxWidth: 12 } },
        tooltip: { backgroundColor: 'rgba(10,11,13,.92)', borderColor: 'rgba(0,255,136,.3)', borderWidth: 1, titleColor: '#00ff88', bodyColor: '#c8d0d8', titleFont: { family: 'JetBrains Mono' } }
      }
    }
  });
})();
</script>
</body>
</html>`;
  }
