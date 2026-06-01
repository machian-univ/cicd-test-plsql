import inquirer from 'inquirer';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger.js';
import { findProjectRoot, isInitialized, loadConfig } from '../utils/fs.js';
import { ciGeneratorRegistry } from '../adapters/ci/CIGenerator.js';
import type { CITrigger } from '../core/types.js';

import '../adapters/ci/GitHubActionsGenerator.js';

export async function runCiSetup(): Promise<void> {
  const root = findProjectRoot();

  if (!isInitialized(root)) {
    logger.error('Проект не инициализирован. Запустите сначала: pulsqual init');
    process.exit(1);
  }

  const config = loadConfig(root);

  logger.header('Настройка CI/CD интеграции');

  const { platform } = await inquirer.prompt([{
    type: 'list',
    name: 'platform',
    message: 'Какую платформу используете?',
    choices: [{ name: 'GitHub Actions', value: 'github' }],
  }]);

  logger.section(`Настройка ${platform === 'github' ? 'GitHub Actions' : platform}`);

  const { triggerChoice } = await inquirer.prompt([{
    type: 'list',
    name: 'triggerChoice',
    message: 'Когда запускать проверку? (в текущей версии доступен только PR)',
    choices: [
      { name: 'При Pull Request в main/develop', value: 'pr' },
    ],
  }]);

  const trigger = triggerChoice as CITrigger;

  const { qScoreThreshold } = await inquirer.prompt([{
    type: 'input',
    name: 'qScoreThreshold',
    message: 'Минимальный Q-Score для прохождения проверки?',
    default: String(config.thresholds.q_score),
    validate: (v: string) =>
      !isNaN(parseFloat(v)) && parseFloat(v) >= 0 && parseFloat(v) <= 100
        ? true
        : 'Введите число от 0 до 100',
  }]);

  const { useLLM } = await inquirer.prompt([{
    type: 'confirm',
    name: 'useLLM',
    message: 'Используете LLM-рецензента?',
    default: false,
  }]);

  let llmSecretAdded = false;
  if (useLLM) {
    logger.blank();
    logger.section('Настройка API-ключа для CI/CD');
    console.log(chalk.cyan('Для работы LLM в CI/CD нужно добавить API-ключ в GitHub Secrets.\n'));
    console.log('Инструкция:');
    console.log(chalk.gray('  1. Откройте ваш репозиторий на GitHub'));
    console.log(chalk.gray('  2. Перейдите: Settings → Secrets and variables → Actions'));
    console.log(chalk.gray('  3. Нажмите "New repository secret"'));
    console.log(chalk.gray('  4. Name: GIGACHAT_API_KEY'));
    console.log(chalk.gray('  5. Value: ваш API-ключ GigaChat'));
    logger.blank();

    const { secretAdded } = await inquirer.prompt([{
      type: 'confirm',
      name: 'secretAdded',
      message: 'Ключ уже добавлен в GitHub Secrets?',
      default: false,
    }]);

    llmSecretAdded = secretAdded;

    if (!secretAdded) {
      logger.warn('Не забудьте добавить ключ позже, иначе LLM не будет работать в CI/CD.');
      logger.info('Создам конфигурацию с LLM (строка с ключом будет закомментирована).');
    }
  }

  logger.blank();
  logger.info('Создаю конфигурацию...');

  const generator = ciGeneratorRegistry.get(platform as 'github');
  if (!generator) {
    logger.error(`Генератор для платформы ${platform} не найден`);
    return;
  }

  const workflowContent = generator.generate(config, {
    trigger,
    qScoreThreshold: parseFloat(qScoreThreshold),
    useLLM,
    llmSecretAdded,
  });

  const workflowDir = path.join(root, '.github', 'workflows');
  fs.mkdirSync(workflowDir, { recursive: true });
  const workflowPath = path.join(workflowDir, 'pulsqual.yml');
  fs.writeFileSync(workflowPath, workflowContent, 'utf8');

  logger.blank();
  logger.success('Создана папка .github/workflows/');
  logger.success('Создан файл .github/workflows/pulsqual.yml');
  logger.blank();
  logger.section('Содержимое:');
  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.white(workflowContent));
  console.log(chalk.gray('─'.repeat(50)));
  logger.blank();
  logger.success('GitHub Actions настроен!');
  logger.blank();
  logger.section('Что дальше:');
  console.log('  1. Закоммитьте файл .github/workflows/pulsqual.yml');
  console.log('  2. Запушьте в репозиторий');
  if (trigger === 'pr' || trigger === 'both') {
    console.log('  3. Создайте Pull Request — проверка запустится автоматически!');
  } else {
    console.log('  3. Выполните push — проверка запустится автоматически!');
  }

  if (useLLM && !llmSecretAdded) {
    logger.blank();
    logger.section('Если используете LLM:');
    console.log(chalk.yellow('  • Добавьте API-ключ в GitHub Secrets (см. инструкцию выше)'));
    console.log(chalk.yellow('  • Раскомментируйте строку с API-ключом в workflow-файле'));
  }
}

export async function runCiBadge(): Promise<void> {
  const root = findProjectRoot();

  if (!isInitialized(root)) {
    logger.error('Проект не инициализирован. Запустите сначала: pulsqual init');
    process.exit(1);
  }

  logger.info('Генерация badge для README...');
  const badge =
    `[![Code Quality](https://github.com/your-org/your-repo/actions/workflows/pulsqual.yml/badge.svg)]` +
    `(https://github.com/your-org/your-repo/actions/workflows/pulsqual.yml)`;
  logger.blank();
  console.log('Добавьте в README.md:');
  console.log(chalk.cyan(badge));
}