import chalk from 'chalk';
import path from 'path';
import inquirer from 'inquirer';
import { STACK_REGISTRY } from '../../core/types.js';
import type { ProjectContext } from '../../core/types.js';
import { parseVersion } from '../../utils/version.js';
import { logger } from '../../utils/logger.js';
import {
  buildInstallCmd,
  installPackages,
  isPackageInstalledLocally,
  safeReadJson,
} from './packageManager.js';
import type { PackageManager } from './types.js';
import { getEslintPluginsForStack } from './stackPackages.js';

export async function installEslintPluginsForStack(
  root: string,
  project: ProjectContext,
  pm: PackageManager,
  autoYes: boolean,
): Promise<void> {
  if (!project.hasEslint) return;

  const pluginsToInstall = getEslintPluginsForStack(project, root);

  if (!isPackageInstalledLocally('eslint-plugin-sonarjs', root)) {
    if (!pluginsToInstall.includes('eslint-plugin-sonarjs')) {
      pluginsToInstall.unshift('eslint-plugin-sonarjs');
    }
  } else {
    const sonPkg = safeReadJson<{ version?: string }>(
      path.join(root, 'node_modules', 'eslint-plugin-sonarjs', 'package.json'),
    );
    if (sonPkg?.version) {
      const v = parseVersion(sonPkg.version);
      if (v.valid && v.major < 1) {
        logger.warn(
          `[eslint-plugin-sonarjs] Установлена версия ${sonPkg.version}. ` +
          STACK_REGISTRY.sonarjs.belowRecommendedMessage!,
        );
      }
    }
  }

  if (pluginsToInstall.length === 0) return;

  logger.blank();
  logger.section('Плагины ESLint для вашего стека:');
  for (const p of pluginsToInstall) {
    console.log(chalk.cyan(`  + ${p}`));
  }

  let doInstall = autoYes;
  if (!autoYes) {
    const { install } = await inquirer.prompt([{
      type: 'confirm',
      name: 'install',
      message: `Установить плагины (${pluginsToInstall.join(', ')})?`,
      default: true,
    }]);
    doInstall = install;
  }

  if (doInstall) {
    const ok = installPackages(pluginsToInstall, root, pm);
    if (ok) {
      logger.success(`Плагины установлены: ${pluginsToInstall.join(', ')}`);
    } else {
      logger.warn(
        `Не удалось установить плагины автоматически. Выполните вручную:\n` +
        `  ${buildInstallCmd(pm, pluginsToInstall)}`,
      );
    }
  } else {
    logger.info(`Для ручной установки:\n  ${buildInstallCmd(pm, pluginsToInstall)}`);
  }
}
