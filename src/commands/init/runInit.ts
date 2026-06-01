import chalk from 'chalk';
import path from 'path';
import inquirer from 'inquirer';
import { logger } from '../../utils/logger.js';
import { configExists, loadConfig, findProjectRoot } from '../../utils/fs.js';
import type { InitOptions } from './types.js';
import { detectPackageManager } from './packageManager.js';
import {
  checkAndWarnEslintVersion,
  checkAndBlockIncompatibleVersions,
} from './versionChecks.js';
import { inspectProject, createConfigAndDir } from './projectSetup.js';
import { installEslintPluginsForStack } from './eslintPlugins.js';
import { maybeCreateEslintConfig } from './eslintConfig.js';
import { printInstallStatus } from './messages.js';
import { handleExistingConfig } from './existingConfig.js';
import { runFullSetup, runSelectiveSetup } from './setupFlows.js';

export async function runInit(options: InitOptions): Promise<void> {
  const root = findProjectRoot();
  const pm = detectPackageManager(root);

  logger.header('Инициализация Pulsqual');
  logger.info(`Пакетный менеджер: ${pm}`);
  logger.blank();

  if (configExists(root)) {
    const decision = await handleExistingConfig(root, pm);
    if (decision === 'done') return;
    logger.blank();
    logger.info('Перезаписываем конфигурацию...');
    logger.blank();
  }

  logger.info('Анализирую проект...');
  const project = await inspectProject(root);

  if (!project) {
    logger.error(
      'Не удалось проанализировать проект. ' +
      'Убедитесь, что вы находитесь в папке Node.js-проекта с файлом package.json.',
    );
    process.exit(1);
  }

  const blocked = checkAndBlockIncompatibleVersions(project);
  if (blocked) process.exit(1);

  if (project.hasEslint) {
    checkAndWarnEslintVersion(root);
  }

  logger.blank();
  logger.section('Результаты анализа проекта');
  const ok = (label: string) => console.log(chalk.green(`  Обнаружено: ${label}`));
  const bad = (label: string) => console.log(chalk.red(`  Отсутствует: ${label}`));

  project.hasEslint ? ok('ESLint') : bad('ESLint');
  if (project.hasEslint) {
    project.eslintConfigExists
      ? ok(`Конфиг ESLint: ${path.basename(project.eslintConfigPath ?? 'package.json')}`)
      : bad('Конфиг ESLint (будет предложено создать)');
  }

  if (project.hasTypeScript) ok('TypeScript');
  if (project.hasTypeScript) {
    project.hasTsConfig ? ok('tsconfig.json') : bad('tsconfig.json');
  }
  if (project.requiresDecorators) ok('NestJS v10 и выше (декораторы включены)');
  if (project.hasReact) ok(`React ${project.detectedVersions.react?.raw ?? ''}`);
  if (project.hasNext) ok(`Next.js ${project.detectedVersions.next?.raw ?? ''}`);
  if (project.hasVue) ok(`Vue ${project.detectedVersions.vue?.raw ?? ''}`);
  if (project.hasNuxt) ok(`Nuxt ${project.detectedVersions.nuxt?.raw ?? ''}`);

  project.testRunner !== 'unknown'
    ? ok(`Тест-раннер: ${project.testRunner}`)
    : bad('Тест-раннер (Jest или Vitest не найдены)');

  if (project.versionWarnings.length > 0) {
    logger.blank();
    logger.section('Предупреждения о версиях:');
    for (const w of project.versionWarnings) {
      if (w.level === 'critical' || w.level === 'error') {
        console.log(chalk.red(`  [${w.tool}] ${w.message}`));
      } else if (w.level === 'warning') {
        console.log(chalk.yellow(`  [${w.tool}] ${w.message}`));
      } else {
        console.log(chalk.gray(`  [${w.tool}] ${w.message}`));
      }
    }
  }

  logger.blank();

  let installMode: 'full' | 'selective' | 'skip';

  if (options.yes) {
    installMode = 'full';
  } else if (options.skipDeps) {
    installMode = 'skip';
  } else {
    const { choice } = await inquirer.prompt([{
      type: 'list',
      name: 'choice',
      message: 'Как настроить Pulsqual?',
      choices: [
        { name: 'Полная настройка (установить всё недостающее автоматически)', value: 'full' },
        { name: 'Выборочная настройка (выбрать что устанавливать)', value: 'selective' },
        { name: 'Только создать .pulsqual.yml (зависимости установлю самостоятельно)', value: 'skip' },
      ],
    }]);
    installMode = choice;
  }

  logger.blank();

  if (installMode === 'full') {
    await runFullSetup(root, project, pm);
  } else if (installMode === 'selective') {
    await runSelectiveSetup(root, project, pm);
  } else {
    logger.warn(
      'Зависимости не устанавливаются: ESLint-плагины могут отсутствовать. ' +
      'eslint.config.mjs будет сгенерирован только для уже установленных пакетов.',
    );
    const updatedProject = await inspectProject(root) ?? project;
    await installEslintPluginsForStack(root, updatedProject, pm, false);
    const afterPlugins = await inspectProject(root) ?? updatedProject;
    await maybeCreateEslintConfig(root, afterPlugins, false);
    await createConfigAndDir(root, afterPlugins);
    const config = loadConfig(root);
    printInstallStatus(project.hasEslint, project.testRunner !== 'unknown', pm, afterPlugins, config);
  }
}
