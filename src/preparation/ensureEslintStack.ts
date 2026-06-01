import { logger } from '../utils/logger.js';
import type { ProjectContext } from '../core/types.js';
import { detectPackageManager } from '../commands/init/packageManager.js';
import { installEslintPluginsForStack } from '../commands/init/eslintPlugins.js';
import { inspectProject } from '../commands/init/projectSetup.js';

/**
 * Устанавливает недостающие ESLint-плагины после определения стека проекта.
 */
export async function ensureEslintStackDependencies(
  root: string,
  project: ProjectContext,
  autoInstall: boolean,
): Promise<ProjectContext> {
  if (!project.hasEslint) return project;

  await installEslintPluginsForStack(root, project, detectPackageManager(root), autoInstall);

  const refreshed = await inspectProject(root);
  return refreshed ?? project;
}

export async function ensureEslintStackWithLog(
  root: string,
  project: ProjectContext,
  autoInstall: boolean,
): Promise<ProjectContext> {
  const updated = await ensureEslintStackDependencies(root, project, autoInstall);
  if (updated.hasEslint && !updated.eslintConfigExists) {
    logger.verbose(
      'ensureEslintStack: ESLint установлен, но конфиг не найден — потребуется eslint.config или pulsqual init',
    );
  }
  return updated;
}
