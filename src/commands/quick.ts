import chalk from 'chalk';
import path from 'path';
import { logger } from '../utils/logger.js';
import { findProjectRoot, isInitialized, loadConfig } from '../utils/fs.js';
import { Orchestrator } from '../core/Orchestrator.js';
import { git } from '../utils/git.js';
import type {
  LintResult, ComplexityResult, SecurityResult,
  DiffMetrics, TestRunResult,
} from '../core/types.js';

export async function runQuick(): Promise<void> {
  const root = findProjectRoot();

  if (!isInitialized(root)) {
    logger.error('Проект не инициализирован. Запустите: pulsqual init');
    process.exit(1);
  }

  const config = loadConfig(root);

  logger.header('Quick Check — быстрая проверка staged-файлов');

  // Получаем staged-файлы для вывода
  const stagedFiles = git.getStagedFiles(root);

  if (stagedFiles.length === 0) {
    logger.warn(
      'Нет staged-файлов для анализа.\n' +
      '  Добавьте файлы в staging area: git add <файлы>  или  git add .'
    );
    process.exit(0);
  }

  logger.section('Staged-файлы для анализа:');
  for (const f of stagedFiles) {
    logger.info('  ' + path.relative(root, f));
  }
  logger.blank();

  // Запускаем оркестратор в quick-режиме
  const orchestrator = new Orchestrator();
  const ctx = await orchestrator.run({
    projectRoot: root,
    config,
    mode: 'quick',
    noLlm: true, // quick не использует LLM
  });

  logger.blank();

  // Вывод результатов по слоям 

  logger.section('Результаты проверки:');

  // Слой 1: StaticAnalysisAgent (ESLint)
  console.log(chalk.bold('\n  [1] Статический анализ (ESLint)'));
  const lintData = (ctx.get('lintResults')?.data ?? []) as LintResult[];
  const lintSuccess = ctx.get('lintResults')?.success;

  if (!lintSuccess || lintData.length === 0) {
    const err = ctx.get('lintResults')?.error;
    console.log(chalk.gray('      Пропущен: ' + (err ?? 'ESLint не найден или staged-файлы не содержат JS/TS')));
  } else {
    const totalErrors   = lintData.reduce((s, r) => s + r.errorCount, 0);
    const totalWarnings = lintData.reduce((s, r) => s + r.warningCount, 0);

    if (totalErrors === 0 && totalWarnings === 0) {
      console.log(chalk.green('      OK — ошибок нет'));
    } else {
      console.log(
        chalk.yellow('      Ошибок: ') + chalk.red(totalErrors) +
        chalk.yellow('  Предупреждений: ') + chalk.yellow(totalWarnings)
      );
    }

    // Детали по файлам
    for (const file of lintData) {
      if (file.errorCount === 0 && file.warningCount === 0) continue;
      console.log(chalk.gray(`\n      Файл: ${path.relative(root, file.filePath)}`));

      const eslintErrs = file.eslintMessages.filter(m => m.severity === 2);
      
      for (const m of eslintErrs) {
        console.log(chalk.red(`        L${m.line}: [${m.ruleId ?? 'unknown'}] ${m.message}`));
      }
    }
  }

  // Слой 2: ComplexityAgent
  console.log(chalk.bold('\n  [2] Сложность кода (ComplexityAgent)'));
  const complexity = ctx.get('complexityResult')?.data as ComplexityResult | null;

  if (!complexity || complexity.status === 'skipped') {
    const msg = complexity?.errorMessage ?? 'Нет данных';
    console.log(chalk.gray(`      Пропущен: ${msg}`));
  } else if (complexity.status === 'error') {
    console.log(chalk.red(`      Ошибка: ${complexity.errorMessage}`));
  } else {
    console.log(
      chalk.cyan(`      Макс. сложность: ${complexity.maxComplexity}`) +
      chalk.gray(` (порог: ${config.thresholds.max_complexity})`)
    );
    console.log(chalk.cyan(`      Средняя сложность: ${complexity.averageComplexity}`));

    if (complexity.violations.length > 0) {
      console.log(chalk.yellow(`      Нарушений порога: ${complexity.violations.length}`));
      for (const v of complexity.violations.slice(0, 3)) {
        console.log(chalk.yellow(`        - ${v.function} (${path.relative(root, v.file)}): ${v.complexity}`));
      }
    } else {
      console.log(chalk.green('      OK — нарушений порога нет'));
    }
  }

  // Слой 3: SecurityScanAgent (gitleaks)
  console.log(chalk.bold('\n  [3] Безопасность (gitleaks для staged-diff)'));
  const security = ctx.get('securityResult')?.data as SecurityResult | null;

  if (!security || security.status === 'skipped') {
    console.log(chalk.gray('      Пропущен'));
  } else if (security.status === 'error') {
    console.log(chalk.red(`      Ошибка: ${security.errorMessage}`));
  } else {
    if (!security.gitleaksAvailable) {
      const reason = security.gitleaksUnavailableReason === 'not_installed'
        ? 'gitleaks не установлен'
        : `gitleaks недоступен (${security.gitleaksUnavailableReason ?? 'неизвестно'})`;
      console.log(chalk.gray(`      ${reason}`));
    } else if (security.gitleaksFound === 0) {
      console.log(chalk.green('      OK — секреты не найдены'));
    } else {
      console.log(chalk.red(`      Найдено утечек: ${security.gitleaksFound}`));
      for (const leak of (security.gitleaksLeaks ?? []).slice(0, 3)) {
        console.log(chalk.red(`        - ${leak.file}: ${leak.description}`));
      }
    }
  }

  // Git-метрики 
  logger.blank();
  logger.section('Git-метрики:');

  const diffData = ctx.get('diffResult')?.data as DiffMetrics | null;

  if (diffData && diffData.status === 'ok') {
    console.log(chalk.cyan(`  Добавлено строк:    ${diffData.locAdded}`));
    console.log(chalk.cyan(`  Удалено строк:      ${diffData.locRemoved}`));
    console.log(chalk.cyan(`  Чистое изменение:   ${diffData.locNet}`));
    console.log(chalk.cyan(`  Изменено файлов:    ${diffData.filesChanged}`));

    if (diffData.tsFilesChanged + diffData.jsFilesChanged + diffData.vueFilesChanged > 0) {
      console.log(chalk.gray(
        `  По типам:  TS: ${diffData.tsFilesChanged}  ` +
        `JS: ${diffData.jsFilesChanged}  ` +
        `Vue: ${diffData.vueFilesChanged}`
      ));
    }

    // changeRatio = locRemoved / (locAdded + locRemoved + 1)
    // > 0.7: удалено значительно больше чем добавлено — рефакторинг или удаление кода
    // < 0.1: добавлено значительно больше чем удалено — чистое добавление
    const ratioDesc = diffData.changeRatio > 0.7
      ? 'похоже на рефакторинг или удаление кода'
      : diffData.changeRatio < 0.1
        ? 'чистое добавление кода'
        : 'смешанные изменения';
    console.log(chalk.gray(
      `  Соотношение (rem/(add+rem+1)): ${diffData.changeRatio.toFixed(2)} — ${ratioDesc}`
    ));

    if (diffData.hasTestsChanged) {
      console.log(chalk.green('  Тесты: затронуты в этом изменении'));
    } else {
      console.log(chalk.yellow('  Тесты: НЕ затронуты в этом изменении'));
    }

    if (diffData.hasConfigChanged) {
      console.log(chalk.yellow('  Конфигурация: затронута в этом изменении'));
    }

    if (diffData.authorExperience > 0) {
      console.log(chalk.gray(`  Опыт автора: ${diffData.authorExperience} коммитов`));
    }

    if (diffData.fileChurnAvg > 0) {
      console.log(chalk.gray(`  Среднее churn файлов (90 дней): ${diffData.fileChurnAvg}`));
    }
  } else {
    const msg = diffData?.errorMessage ?? 'Нет данных git diff';
    console.log(chalk.gray(`  ${msg}`));
  }

  logger.blank();
  logger.warn('Режим quick имеет ограничения:');
  logger.warn('  - Деградация кода не анализируется');
  logger.warn('  - Тесты не запускаются');
  logger.warn('  - Показатели рассчитаны только для staged-файлов');
  logger.warn('  - Результат не сохраняется в базу данных');
  logger.info('Для полной проверки используйте: pulsqual check');
}