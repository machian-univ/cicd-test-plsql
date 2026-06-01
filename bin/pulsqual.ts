#!/usr/bin/env node

// bin/pulsqual.ts

import { Command } from 'commander';
import pkg from '../package.json';
import { logger } from '../src/utils/logger.js';

// Регистрируем адаптеры при старте
import '../src/adapters/stack/ESLintAdapter.js';
import '../src/adapters/llm/OllamaProvider.js';
import '../src/adapters/llm/GigaChatProvider.js';
import '../src/adapters/ci/GitHubActionsGenerator.js';

import { runInit } from '../src/commands/init.js';
import { runCheck } from '../src/commands/check.js';
import { runQuick } from '../src/commands/quick.js';
import { runReport } from '../src/commands/report.js';
import { runHistory } from '../src/commands/history.js';
import { runCiSetup, runCiBadge } from '../src/commands/ci.js';
import {
  runConfigShow, runConfigReset, runConfigThreshold,
  runConfigPaths, runConfigLlmEnable, runConfigLlmDisable, runConfigLlmTest,
} from '../src/commands/config.js';

const program = new Command();

program
  .name('pulsqual')
  .description('Мультиагентная QAOps-система для тестирования и анализа деградации кода')
  .version(pkg.version, '-v, --version')
  .option('--verbose', 'Подробный вывод для отладки')
  .hook('preAction', (thisCommand) => {
    if (thisCommand.opts().verbose) logger.setVerbose(true);
  });

// ── pulsqual init ─────────────────────────────────────────
program
  .command('init')
  .description('Инициализация Pulsqual в проекте')
  .option('--skip-deps', 'Пропустить установку зависимостей, создать только .pulsqual.yml')
  .option('--yes', 'Принять все предложения без вопросов')
  .action(async (opts) => {
    await handleErrors(() => runInit({ skipDeps: opts.skipDeps, yes: opts.yes }));
  });

// ── pulsqual quick ────────────────────────────────────────
program
  .command('quick')
  .description(
    'Быстрая проверка staged-файлов (git add). Результат в терминал, без сохранения в БД. ' +
    'Не анализирует деградацию кода и не охватывает весь проект.'
  )
  .action(async () => {
    await handleErrors(() => runQuick());
  });

// ── pulsqual check ────────────────────────────────────────
program
  .command('check')
  .description('Полная проверка качества кода (full-режим) или CI-проверка (--ci)')
  .option('--ci', 'CI-режим: без вопросов, exit code 1 при провале, только при PR-коммите')
  .option('--no-llm', 'Отключить LLM для этой проверки')
  .action(async (opts) => {
    // req. 1: quick-режим недоступен через check
    await handleErrors(() => runCheck({
      ci: opts.ci,
      // Допускаем только full и ci
      mode: opts.ci ? 'ci' : 'full',
      noLlm: opts.noLlm,
    }));
  });

// ── pulsqual report ───────────────────────────────────────
program
  .command('report')
  .description('Открыть последний HTML-отчёт в браузере')
  .option('--last <n>', 'Открыть отчёт номер N из истории')
  .option('--output <path>', 'Путь для сохранения копии HTML-файла')
  .action(async (opts) => {
    await handleErrors(() => runReport({ last: opts.last, output: opts.output }));
  });

// ── pulsqual history ──────────────────────────────────────
program
  .command('history')
  .description('Показать историю проверок')
  .option('--limit <n>', 'Показать последние N записей (по умолч. 10)')
  .option('--json', 'Вывод в JSON (для скриптов)')
  .action(async (opts) => {
    await handleErrors(() => runHistory({ limit: opts.limit, json: opts.json }));
  });

// ── pulsqual config <subcommand> ──────────────────────────
const config = program.command('config').description('Управление конфигурацией');

config.command('show')
  .description('Показать текущие настройки')
  .action(() => handleErrors(runConfigShow));

config.command('reset')
  .description('Сбросить к значениям по умолчанию')
  .action(() => handleErrors(runConfigReset));

config.command('threshold <type> <value>')
  .description('Установить порог (qscore | coverage | complexity)')
  .action((type, value) => handleErrors(() => runConfigThreshold(type, value)));

config.command('paths')
  .description('Настроить пути к src и tests')
  .action(() => handleErrors(runConfigPaths));

const llm = config.command('llm').description('Управление LLM');
llm.command('enable').description('Включить и настроить LLM').action(() => handleErrors(runConfigLlmEnable));
llm.command('disable').description('Отключить LLM').action(() => handleErrors(runConfigLlmDisable));
llm.command('test').description('Проверить подключение к LLM').action(() => handleErrors(runConfigLlmTest));

// ── pulsqual ci <subcommand> ──────────────────────────────
const ci = program.command('ci').description('Управление CI/CD интеграцией');
ci.command('setup').description('Создать workflow-файл').action(() => handleErrors(runCiSetup));
ci.command('badge').description('Сгенерировать badge для README').action(() => handleErrors(runCiBadge));

// ── Глобальная обработка ошибок ───────────────────────────
async function handleErrors(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    logger.error(`Неожиданная ошибка: ${String(err)}`);
    logger.verbose(err instanceof Error ? (err.stack ?? '') : '');
    process.exit(1);
  }
}

program.parse(process.argv);