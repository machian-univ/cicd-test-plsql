import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { findProjectRoot, isInitialized, loadConfig } from '../utils/fs.js';
import { Orchestrator } from '../core/Orchestrator.js';
import { MODE_DESCRIPTIONS } from '../core/types.js';
import type { CheckMode, Scores } from '../core/types.js';

export interface CheckOptions {
  ci?: boolean;
  mode?: 'full' | 'ci';
  noLlm?: boolean;
}

export async function runCheck(options: CheckOptions): Promise<void> {
  const root = findProjectRoot();

  if (!isInitialized(root)) {
    logger.error('Проект не инициализирован. Запустите сначала: pulsqual init');
    logger.info('Команда init создаст .pulsqual.yml и директорию .pulsqual/');
    process.exit(1);
  }

  const config = loadConfig(root);

  const mode: CheckMode = options.ci ? 'ci' : 'full';
  const modeDesc = MODE_DESCRIPTIONS[mode];

  if (!options.ci) {
    logger.header(`${modeDesc.title} — ${modeDesc.description}`);
    logger.info(`Область анализа: ${modeDesc.scope}`);
    logger.blank();
  } else {
    // В CI-режиме выводим минимальную информацию в stdout для удобства чтения логов
    console.log(`[Pulsqual] Режим: ${modeDesc.title}`);
    console.log(`[Pulsqual] Область: ${modeDesc.scope}`);
    console.log(`[Pulsqual] Порог Q-Score: ${config.thresholds.q_score}`);
  }

  const orchestrator = new Orchestrator();
  const finalCtx = await orchestrator.run({
    projectRoot: root,
    config,
    mode,
    noLlm: options.noLlm,
  });

  const scores = finalCtx.get('scores')?.data as Scores | null;
  const reportPath = finalCtx.get('reportResult')?.data ?? null;

  if (!options.ci) {
    // Режим full: развернутый вывод
    logger.blank();
    logger.section('Результат проверки');

    if (scores) {
      const scoreColor = scores.gatePassed ? chalk.green : chalk.red;
      console.log(scoreColor(`  Q-Score: ${scores.qScore}/100`));
      console.log(
        scores.gatePassed
          ? chalk.green('  Quality Gate: ПРОЙДЕН')
          : chalk.red('  Quality Gate: НЕ ПРОЙДЕН')
      );
      logger.info(`  Порог: ${config.thresholds.q_score}`);

      if (scores.breakdown) {
        logger.blank();
        console.log(chalk.gray('  Детализация:'));
        for (const [key, val] of Object.entries(scores.breakdown)) {
          const color = val >= 80 ? chalk.green : val >= 60 ? chalk.yellow : chalk.red;
          console.log(chalk.gray(`    ${key.padEnd(20)}: `) + color(String(val)));
        }
      }
    } else {
      logger.warn('Не удалось рассчитать Q-Score.');
    }

    const achievements = finalCtx.get('achievements')?.data ?? [];
    if (achievements.length > 0) {
      logger.blank();
      logger.section('Достижения');
      for (const ach of achievements as any[]) {
        console.log(`  ${ach.label} — ${ach.description}`);
      }
    }

    if (reportPath) {
      logger.blank();
      logger.success(`Отчёт сохранён: ${reportPath}`);
      logger.info('Открыть в браузере: pulsqual report');
    }
  } else {
    // Режим CI: структурированный вывод для логов GitHub Actions
    console.log(`[Pulsqual] Q-Score: ${scores?.qScore ?? 'N/A'} / 100`);
    console.log(`[Pulsqual] Quality Gate: ${scores?.gatePassed ? 'ПРОЙДЕН' : 'НЕ ПРОЙДЕН'}`);
    if (scores?.breakdown) {
      for (const [key, val] of Object.entries(scores.breakdown)) {
        console.log(`[Pulsqual]   ${key}: ${val}`);
      }
    }
    if (reportPath) {
      console.log(`[Pulsqual] Report: ${reportPath}`);
    }
  }

  // CI-режим завершается с кодом 1 при непрохождении порога
  if (options.ci && scores && !scores.gatePassed) {
    logger.error(
      `Quality Gate не пройден: Q-Score ${scores.qScore} ниже порога ${config.thresholds.q_score}. ` +
      'Для просмотра деталей скачайте артефакт quality-report.'
    );
    process.exit(1);
  }

  // В CI-режиме с прохождением порога явно указываем успех
  if (options.ci && scores?.gatePassed) {
    console.log('[Pulsqual] Результат: Quality Gate пройден.');
  }
}