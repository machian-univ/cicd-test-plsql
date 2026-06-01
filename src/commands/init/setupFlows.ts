import inquirer from 'inquirer';
import { logger } from '../../utils/logger.js';
import { loadConfig } from '../../utils/fs.js';
import type { ProjectContext } from '../../core/types.js';
import { buildInstallCmd, installPackages } from './packageManager.js';
import type { PackageManager } from './types.js';
import {
  getEslintCorePackages,
  getVitestPackages,
  getJestPackages,
} from './stackPackages.js';
import { checkAndWarnEslintVersion } from './versionChecks.js';
import { maybeCreateEslintConfig } from './eslintConfig.js';
import {
  createConfigAndDir,
  inspectProject,
  maybeCreateTsConfig,
} from './projectSetup.js';
import { installEslintPluginsForStack } from './eslintPlugins.js';
import { askStackSequentially, applyManualStackToProject } from './stackPrompts.js';
import { printInstallStatus } from './messages.js';

export async function runFullSetup(
  root: string,
  project: ProjectContext,
  pm: PackageManager,
): Promise<void> {
  let eslintOk = project.hasEslint;
  let runnerOk = project.testRunner !== 'unknown';

  if (!project.hasEslint) {
    logger.section('Установка ESLint...');
    const ok = installPackages(getEslintCorePackages(), root, pm);
    eslintOk = ok;
    if (ok) logger.success('ESLint установлен');
    else logger.error('Не удалось установить ESLint');
  } else {
    logger.success('ESLint: уже установлен');
    checkAndWarnEslintVersion(root);
  }

  if (project.testRunner === 'unknown') {
    logger.blank();
    logger.warn('Тест-раннер не обнаружен. Установите вручную:');
    logger.info(`  ${buildInstallCmd(pm, getVitestPackages())}`);
    logger.info(`  ${buildInstallCmd(pm, getJestPackages(project.hasTypeScript))}`);
    runnerOk = false;
  } else {
    logger.success(`Тест-раннер: ${project.testRunner} (уже установлен)`);
  }

  await maybeCreateTsConfig(root, project);

  const updatedProject = await inspectProject(root) ?? project;
  await installEslintPluginsForStack(root, updatedProject, pm, true);
  const projectAfterPlugins = await inspectProject(root) ?? updatedProject;
  await maybeCreateEslintConfig(root, projectAfterPlugins, true);
  await createConfigAndDir(root, projectAfterPlugins);

  const config = loadConfig(root);
  printInstallStatus(eslintOk, runnerOk, pm, projectAfterPlugins, config);
}

export async function runSelectiveSetup(
  root: string,
  project: ProjectContext,
  pm: PackageManager,
): Promise<void> {
  const stackSelection = await askStackSequentially(project);
  const projectWithStack = applyManualStackToProject(project, stackSelection);

  let eslintOk = project.hasEslint;
  let runnerOk = project.testRunner !== 'unknown';

  logger.blank();
  logger.section('ESLint (статический анализ кода)');
  if (project.hasEslint) {
    logger.success('ESLint уже установлен — пропускаю');
    checkAndWarnEslintVersion(root);
  } else {
    const { installEslint } = await inquirer.prompt([{
      type: 'confirm',
      name: 'installEslint',
      message: 'Установить ESLint?',
      default: true,
    }]);
    if (installEslint) {
      const ok = installPackages(getEslintCorePackages(), root, pm);
      eslintOk = ok;
      if (ok) logger.success('ESLint установлен');
      else logger.error('Не удалось установить ESLint');
    } else {
      logger.warn('Без ESLint статический анализ работать не будет');
      eslintOk = false;
    }
  }

  logger.blank();
  logger.section('Тест-раннер (метрики покрытия)');

  if (stackSelection.testRunner === 'skip') {
    if (project.testRunner !== 'unknown') {
      logger.success(`${project.testRunner} уже установлен — пропускаю`);
    } else {
      logger.warn('Метрики покрытия не будут рассчитываться без тест-раннера');
      runnerOk = false;
    }
  } else if (stackSelection.testRunner === 'vitest') {
    if (project.testRunner === 'vitest') {
      logger.success('Vitest уже установлен — пропускаю');
    } else {
      const ok = installPackages(getVitestPackages(), root, pm);
      runnerOk = ok;
      if (ok) logger.success('Vitest и @vitest/coverage-v8 установлены');
      else logger.error('Не удалось установить Vitest');
    }
  } else if (stackSelection.testRunner === 'jest') {
    if (project.testRunner === 'jest') {
      logger.success('Jest уже установлен — пропускаю');
    } else {
      const ok = installPackages(getJestPackages(stackSelection.hasTypeScript), root, pm);
      runnerOk = ok;
      if (ok) logger.success('Jest установлен');
      else logger.error('Не удалось установить Jest');
    }
  }

  logger.blank();
  await maybeCreateTsConfig(root, projectWithStack);

  const updatedProject = await inspectProject(root) ?? projectWithStack;
  const finalProject = applyManualStackToProject(updatedProject, stackSelection);
  await installEslintPluginsForStack(root, finalProject, pm, false);
  const finalAfterPlugins = await inspectProject(root) ?? finalProject;
  const finalWithStack = applyManualStackToProject(finalAfterPlugins, stackSelection);
  await maybeCreateEslintConfig(root, finalWithStack, false);
  await createConfigAndDir(root, finalWithStack);

  const config = loadConfig(root);
  printInstallStatus(eslintOk, runnerOk, pm, finalWithStack, config);
}
