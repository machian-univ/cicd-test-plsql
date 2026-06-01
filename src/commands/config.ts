import chalk from 'chalk';
import inquirer from 'inquirer';
import path from 'path';
import { logger } from '../utils/logger.js';
import { findProjectRoot, isInitialized, loadConfig, saveConfig } from '../utils/fs.js';
import { LLMProviderRegistry } from '../adapters/llm/LLMProvider.js';
import { LLM_LIMITS_INFO } from '../llm/llmLimits.js';
import { getLlmApiKey } from '../llm/resolveLlmConfig.js';

import '../adapters/llm/OllamaProvider.js';
import '../adapters/llm/GigaChatProvider.js';

function requireInit(root: string): void {
  if (!isInitialized(root)) {
    logger.error('Проект не инициализирован. Запустите сначала: pulsqual init');
    process.exit(1);
  }
}

export async function runConfigShow(): Promise<void> {
  const root = findProjectRoot();
  requireInit(root);
  const config = loadConfig(root);

  logger.header('Текущая конфигурация Pulsqual');

  logger.section('Пути');
  console.log(`  Исходный код:    ${chalk.cyan(config.paths.source)}`);
  console.log(`  Тесты:           ${chalk.cyan(config.paths.tests)}`);
  console.log(`  Выходная папка:  ${chalk.cyan(config.paths.output)}`);

  logger.blank();
  logger.section('Пороговые значения');
  console.log(`  Минимальный Q-Score:      ${chalk.cyan(config.thresholds.q_score)}`);
  console.log(`  Максимальная сложность:   ${chalk.cyan(config.thresholds.max_complexity)}`);
  console.log(`  Минимальное покрытие (%): ${chalk.cyan(config.thresholds.min_coverage)}`);

  logger.blank();
  logger.section('Веса компонентов');
  for (const [key, val] of Object.entries(config.weights)) {
    console.log(`  ${key.padEnd(20)}: ${chalk.cyan((val * 100).toFixed(0) + '%')}`);
  }

  logger.blank();
  logger.section('LLM');
  console.log(`  Включён:    ${config.llm.enabled ? chalk.green('да') : chalk.gray('нет')}`);
  if (config.llm.enabled) {
    console.log(`  Провайдер:  ${chalk.cyan(config.llm.provider)}`);
    console.log(`  Модель:     ${chalk.cyan(config.llm.model)}`);
    console.log(`  Endpoint:   ${chalk.cyan(config.llm.endpoint)}`);
    console.log(`  Токенов:    ${chalk.cyan(config.llm.max_tokens)}`);
  }

  if (config.stackSnapshot) {
    logger.blank();
    logger.section('Снимок стека (на момент последней инициализации)');
    console.log(`  TypeScript:   ${config.stackSnapshot.hasTypeScript ? chalk.green('да') : chalk.gray('нет')}`);
    console.log(`  React:        ${config.stackSnapshot.hasReact ? chalk.green('да') : chalk.gray('нет')}`);
    console.log(`  Vue:          ${config.stackSnapshot.hasVue ? chalk.green('да') : chalk.gray('нет')}`);
    console.log(`  Next.js:      ${config.stackSnapshot.hasNext ? chalk.green('да') : chalk.gray('нет')}`);
    console.log(`  Nuxt:         ${config.stackSnapshot.hasNuxt ? chalk.green('да') : chalk.gray('нет')}`);
    console.log(`  Тест-раннер:  ${chalk.cyan(config.stackSnapshot.testRunner)}`);
    console.log(`  Дата снимка:  ${chalk.gray(config.stackSnapshot.capturedAt?.slice(0, 16) ?? '—')}`);
  }

  logger.blank();
  logger.info('Для вывода в формате JSON используйте: pulsqual config show | cat (или перенаправление)');
  logger.info('Полный JSON конфигурации:');
  console.log(chalk.gray(JSON.stringify(config, null, 2)));
}

export async function runConfigReset(): Promise<void> {
  const root = findProjectRoot();
  requireInit(root);

  const currentConfig = loadConfig(root);

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: chalk.yellow('Сбросить конфигурацию к значениям по умолчанию?'),
    default: false,
  }]);

  if (!confirm) {
    logger.info('Сброс конфигурации отменён.');
    return;
  }

  const { DEFAULT_CONFIG } = await import('../core/types.js');
  // Сохраняем stackSnapshot, чтобы не потерять данные о стеке
  const newConfig = { ...DEFAULT_CONFIG, stackSnapshot: currentConfig.stackSnapshot };
  saveConfig(root, newConfig);
  logger.success('Конфигурация сброшена к значениям по умолчанию.');
  logger.info('Снимок стека (stackSnapshot) сохранён. Для его обновления запустите: pulsqual init');

  logger.blank();
  logger.section('Новые пороговые значения');
  console.log(`  Минимальный Q-Score:      ${chalk.cyan(newConfig.thresholds.q_score)}`);
  console.log(`  Максимальная сложность:   ${chalk.cyan(newConfig.thresholds.max_complexity)}`);
  console.log(`  Минимальное покрытие (%): ${chalk.cyan(newConfig.thresholds.min_coverage)}`);
}

export async function runConfigThreshold(type: string, value: string): Promise<void> {
  const root = findProjectRoot();
  requireInit(root);

  const config = loadConfig(root);
  const num = parseFloat(value);

  if (isNaN(num)) {
    logger.error(`Значение "${value}" не является числом.`);
    return;
  }

  const validTypes: Record<string, { min: number; max: number; field: keyof typeof config.thresholds }> = {
    qscore:     { min: 0, max: 100, field: 'q_score' },
    coverage:   { min: 0, max: 100, field: 'min_coverage' },
    complexity: { min: 1, max: 100, field: 'max_complexity' },
  };

  const typeInfo = validTypes[type];
  if (!typeInfo) {
    logger.error(
      `Неизвестный тип порога: "${type}". Допустимые значения: qscore, coverage, complexity`
    );
    return;
  }

  if (num < typeInfo.min || num > typeInfo.max) {
    logger.error(
      `Значение ${num} выходит за допустимый диапазон [${typeInfo.min}, ${typeInfo.max}] для ${type}.`
    );
    return;
  }

  const oldValue = config.thresholds[typeInfo.field];
  config.thresholds[typeInfo.field] = num;
  saveConfig(root, config);
  logger.success(`Порог "${type}" изменён: ${oldValue} -> ${num}`);
}

export async function runConfigPaths(): Promise<void> {
  const root = findProjectRoot();
  requireInit(root);

  const config = loadConfig(root);

  logger.info(
    'Укажите относительные пути от корня проекта. ' +
    'Директории не обязаны существовать прямо сейчас.'
  );

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'source',
      message: 'Путь к исходному коду (относительно корня проекта):',
      default: config.paths.source,
      validate: (v: string) => v.trim().length > 0 ? true : 'Путь не может быть пустым',
    },
    {
      type: 'input',
      name: 'tests',
      message: 'Путь к тестам (относительно корня проекта):',
      default: config.paths.tests,
      validate: (v: string) => v.trim().length > 0 ? true : 'Путь не может быть пустым',
    },
  ]);

  const oldSource = config.paths.source;
  const oldTests  = config.paths.tests;

  config.paths.source = answers.source.trim();
  config.paths.tests  = answers.tests.trim();
  saveConfig(root, config);

  logger.success('Пути обновлены.');
  if (oldSource !== config.paths.source) {
    logger.info(`  Исходный код: ${oldSource} -> ${config.paths.source}`);
  }
  if (oldTests !== config.paths.tests) {
    logger.info(`  Тесты: ${oldTests} -> ${config.paths.tests}`);
  }

  // Предупреждение если путь не существует
  const srcExists   = require('fs').existsSync(path.join(root, config.paths.source));
  const testsExists = require('fs').existsSync(path.join(root, config.paths.tests));
  if (!srcExists) {
    logger.warn(`Директория исходного кода "${config.paths.source}" не найдена в проекте.`);
  }
  if (!testsExists) {
    logger.warn(`Директория тестов "${config.paths.tests}" не найдена в проекте.`);
  }
}

export async function runConfigLlmEnable(): Promise<void> {
  const root = findProjectRoot();
  requireInit(root);

  const config = loadConfig(root);

  const { provider } = await inquirer.prompt([{
    type: 'list',
    name: 'provider',
    message: 'Выберите LLM-провайдер:',
    choices: [
      { name: 'Ollama (локальный, без передачи данных)', value: 'ollama' },
      { name: 'GigaChat (облачный, без VPN в России)',   value: 'gigachat' },
    ],
  }]);

  config.llm.provider = provider;

  if (provider === 'ollama') {
    const { endpoint, model } = await inquirer.prompt([
      {
        type: 'input',
        name: 'endpoint',
        message: 'Адрес Ollama:',
        default: 'http://localhost:11434',
      },
      {
        type: 'input',
        name: 'model',
        message: 'Модель:',
        default: 'qwen2.5-coder:7b',
      },
    ]);
    config.llm.endpoint = endpoint;
    config.llm.model    = model;

    logger.info('Проверяю подключение к Ollama...');
    const ollamaProvider = LLMProviderRegistry.get('ollama');
    const ok = await ollamaProvider?.testConnection({
      maxTokens: config.llm.max_tokens,
      endpoint,
      model,
    });
    if (ok) {
      logger.success('Ollama доступна!');
    } else {
      logger.warn(
        'Ollama не отвечает. Убедитесь, что сервис запущен: ollama serve\n' +
        'LLM будет включён в конфигурации, но может не работать до запуска сервиса.'
      );
    }
  } else if (provider === 'gigachat') {
    config.llm.model = 'GigaChat';
    config.llm.endpoint = '';
    const { apiKey } = await inquirer.prompt([{
      type: 'password',
      name: 'apiKey',
      message: 'API-ключ GigaChat (будет сохранён в переменной окружения):',
    }]);

    if (apiKey) {
      config.llm.api_key_env = 'GIGACHAT_API_KEY';
      logger.info(
        'API-ключ не сохраняется в конфигурационный файл напрямую.\n' +
        'Установите переменную окружения:\n' +
        `  export GIGACHAT_API_KEY="${apiKey}"\n` +
        'Или добавьте в файл .env (убедитесь, что он в .gitignore).'
      );
    }
  }

  config.llm.enabled = true;
  saveConfig(root, config);
  logger.success('LLM-рецензент включён.');
  logger.blank();
  logger.section('Ограничения MVP');
  console.log(`  · ${LLM_LIMITS_INFO}`);
}

export async function runConfigLlmDisable(): Promise<void> {
  const root = findProjectRoot();
  requireInit(root);

  const config = loadConfig(root);
  config.llm.enabled = false;
  saveConfig(root, config);
  logger.success('LLM-рецензент отключён.');
}

export async function runConfigLlmTest(): Promise<void> {
  const root = findProjectRoot();
  requireInit(root);

  const config = loadConfig(root);

  if (!config.llm.enabled) {
    logger.warn('LLM не включён в конфигурации. Используйте: pulsqual config llm enable');
    return;
  }

  logger.info(`Проверяю подключение к ${config.llm.provider}...`);

  const provider = LLMProviderRegistry.get(config.llm.provider);
  if (!provider) {
    logger.error(`Провайдер "${config.llm.provider}" не зарегистрирован.`);
    return;
  }

  const llmOptions = {
    maxTokens: config.llm.max_tokens,
    model: config.llm.model,
    endpoint: config.llm.endpoint,
    apiKey: getLlmApiKey(config.llm.api_key_env),
  };

  const ok = await provider.testConnection(llmOptions);
  if (!ok) {
    logger.error(
      `Провайдер "${config.llm.provider}" недоступен.\n` +
      'Проверьте настройки подключения: pulsqual config llm enable'
    );
    return;
  }

  logger.success(`Провайдер "${config.llm.provider}" доступен.`);

  try {
    logger.info('Отправляю тестовый запрос...');
    const reply = await provider.complete(
      'Ответь одним словом: OK',
      { ...llmOptions, maxTokens: 32 },
    );
    logger.success(`Тестовый ответ: ${reply.slice(0, 80)}`);
  } catch (err) {
    logger.error(`Тестовый запрос не прошёл: ${String(err)}`);
  }
}