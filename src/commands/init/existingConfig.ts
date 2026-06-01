import chalk from 'chalk';
import path from 'path';
import inquirer from 'inquirer';
import { logger } from '../../utils/logger.js';
import { loadConfig, getPulsqualDir, ensureDir } from '../../utils/fs.js';
import type { ProjectContext } from '../../core/types.js';
import {
  installPackages,
  isPackageInstalledLocally,
  isBinAvailableLocally,
  safeReadJson,
} from './packageManager.js';
import type { PackageManager } from './types.js';
import {
  getEslintCorePackages,
  getVitestPackages,
  getJestPackages,
} from './stackPackages.js';
import {
  saveStackSnapshot,
  inspectProject,
} from './projectSetup.js';
import { installEslintPluginsForStack } from './eslintPlugins.js';
import { maybeCreateEslintConfig } from './eslintConfig.js';
import { printFinalMessage } from './messages.js';
import { warnIncompatibleVersions } from './versionChecks.js';

export async function handleExistingConfig(
  root: string,
  pm: PackageManager,
): Promise<'done' | 'rewrite'> {
  logger.success('Файл .pulsqual.yml найден');

  const pkg = safeReadJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(path.join(root, 'package.json'));
  const deps = pkg?.dependencies ?? {};
  const devDeps = pkg?.devDependencies ?? {};

  const eslintInstalled =
    isPackageInstalledLocally('eslint', root) &&
    isBinAvailableLocally('eslint', root);

  let testRunner: 'jest' | 'vitest' | null = null;
  if (isPackageInstalledLocally('vitest', root) && isBinAvailableLocally('vitest', root)) {
    testRunner = 'vitest';
  } else if (isPackageInstalledLocally('jest', root) && isBinAvailableLocally('jest', root)) {
    testRunner = 'jest';
  }

  const allOk = eslintInstalled && testRunner !== null;

  if (allOk) {
    logger.success('ESLint: установлен');
    logger.success(`Тест-раннер: ${testRunner}`);
    logger.blank();

    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'Pulsqual уже настроен. Что сделать?',
      choices: [
        { name: 'Выйти (ничего не менять)', value: 'exit' },
        { name: 'Настроить конфигурацию Pulsqual заново', value: 'rewrite' },
      ],
    }]);

    if (action === 'exit') {
      logger.info('Инициализация отменена.');
      return 'done';
    }
    return 'rewrite';
  }

  logger.blank();
  if (!eslintInstalled) console.log(chalk.red('  Не найдено: ESLint'));
  else console.log(chalk.green('  Установлено: ESLint'));
  if (!testRunner) console.log(chalk.red('  Не найдено: Jest или Vitest'));
  else console.log(chalk.green(`  Установлено: тест-раннер ${testRunner}`));
  logger.blank();

  const { action } = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: 'Конфиг найден, но не хватает зависимостей. Что делать?',
    choices: [
      { name: 'Установить недостающее (конфиг не трогать)', value: 'install' },
      { name: 'Настроить конфигурацию заново', value: 'rewrite' },
      { name: 'Отмена', value: 'cancel' },
    ],
  }]);

  if (action === 'cancel') {
    logger.info('Инициализация отменена.');
    return 'done';
  }

  if (action === 'install') {
    const hasTs = isPackageInstalledLocally('typescript', root);

    if (!eslintInstalled) {
      logger.section('Установка ESLint...');
      const ok = installPackages(getEslintCorePackages(), root, pm);
      if (ok) logger.success('ESLint установлен');
    }

    if (!testRunner) {
      const { runner } = await inquirer.prompt([{
        type: 'list',
        name: 'runner',
        message: 'Какой тест-раннер установить?',
        choices: [
          { name: 'Vitest (рекомендуется)', value: 'vitest' },
          { name: 'Jest', value: 'jest' },
          { name: 'Пропустить', value: 'skip' },
        ],
      }]);
      if (runner === 'vitest') {
        const ok = installPackages(getVitestPackages(), root, pm);
        if (ok) logger.success('Vitest и @vitest/coverage-v8 установлены');
      } else if (runner === 'jest') {
        const ok = installPackages(getJestPackages(hasTs), root, pm);
        if (ok) logger.success('Jest установлен');
      } else {
        logger.warn('Тест-раннер не установлен.');
      }
    }

    const dir = getPulsqualDir(root);
    ensureDir(dir);
    ensureDir(path.join(dir, 'reports'));

    const project = await inspectProject(root);
    if (project) {
      saveStackSnapshot(root, project);
      await installEslintPluginsForStack(root, project, pm, false);
      const updatedProject = await inspectProject(root) ?? project;
      await maybeCreateEslintConfig(root, updatedProject, false);
      warnIncompatibleVersions(root);
    }

    logger.blank();
    logger.success('Готово.');

    const config = loadConfig(root);
    const fallbackProject: ProjectContext = {
      rootPath: root,
      hasGit: false,
      hasTypeScript: isPackageInstalledLocally('typescript', root),
      hasReact: false,
      hasVue: false,
      hasNuxt: false,
      hasNext: false,
      testRunner: testRunner ?? 'unknown',
      hasEslint: eslintInstalled,
      hasTsConfig: false,
      hasJestConfig: false,
      hasVitestConfig: false,
      dependencies: deps,
      devDependencies: devDeps,
      requiresDecorators: false,
      eslintConfigExists: false,
      detectedVersions: {},
      versionWarnings: [],
    };
    printFinalMessage(project ?? fallbackProject, config);

    return 'done';
  }

  return 'rewrite';
}
