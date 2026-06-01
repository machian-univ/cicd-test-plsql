import chalk from 'chalk';
import type { PulsqualConfig, ProjectContext } from '../../core/types.js';
import { logger } from '../../utils/logger.js';
import {
  buildInstallCmd,
} from './packageManager.js';
import type { PackageManager } from './types.js';
import {
  getEslintCorePackages,
  getVitestPackages,
  getJestPackages,
} from './stackPackages.js';

export function printFinalMessage(project: ProjectContext, config: PulsqualConfig): void {
  logger.blank();
  logger.section('Готово. Pulsqual инициализирован.');
  logger.blank();

  console.log(chalk.bold('  Начните работу:'));
  console.log(chalk.cyan('    pulsqual quick') + chalk.gray('   — быстрая проверка staged-файлов'));
  console.log(chalk.cyan('    pulsqual check') + chalk.gray('   — полная локальная проверка'));
  console.log(chalk.gray(''));
  console.log(chalk.bold('  CI/CD:'));
  console.log(chalk.cyan('    pulsqual ci setup') + chalk.gray(' — настройка CI-режима (GitHub Actions)'));
  console.log(chalk.gray(''));
  console.log(chalk.bold('  Конфигурация:'));
  console.log(
    chalk.gray(`    Код проекта:  `) + chalk.cyan(config.paths.source) +
    chalk.gray(`   (изменить: `) + chalk.cyan('pulsqual config paths') + chalk.gray(')'),
  );
  console.log(
    chalk.gray(`    Тесты:        `) + chalk.cyan(config.paths.tests) +
    chalk.gray(`   (изменить: `) + chalk.cyan('pulsqual config paths') + chalk.gray(')'),
  );
  console.log(chalk.gray(''));
  console.log(chalk.gray('  Для просмотра всех настроек: ') + chalk.cyan('pulsqual config show'));
}

export function printInstallStatus(
  eslintOk: boolean,
  runnerOk: boolean,
  pm: PackageManager,
  project: ProjectContext,
  config: PulsqualConfig,
): void {
  if (!eslintOk) {
    logger.warn('ESLint не установлен — статический анализ не работает.');
    logger.info(
      `Для ручной установки:\n  ${buildInstallCmd(pm, getEslintCorePackages())}`,
    );
  }
  if (!runnerOk) {
    logger.warn('Тест-раннер не установлен — метрики покрытия не рассчитываются.');
    logger.info(
      `Выберите один из вариантов:\n` +
      `  ${buildInstallCmd(pm, getVitestPackages())}\n` +
      `  ${buildInstallCmd(pm, getJestPackages(project.hasTypeScript))}`,
    );
  }

  printFinalMessage(project, config);
}
