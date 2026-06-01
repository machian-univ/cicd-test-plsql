import path from 'path';
import { STACK_REGISTRY } from '../../core/types.js';
import type { ProjectContext } from '../../core/types.js';
import { getPackageVersion, isAtLeast, checkVersionAgainstSpec } from '../../utils/version.js';
import { logger } from '../../utils/logger.js';
import { safeReadJson } from './packageManager.js';
import type { StackCheckResult } from './types.js';

export function checkStackVersionsForInit(
  deps: Record<string, string>,
  devDeps: Record<string, string>,
): StackCheckResult {
  const result: StackCheckResult = { blocking: false, messages: [] };

  const toolsToCheck: Array<[string, string]> = [
    ['react', 'react'],
    ['vue', 'vue'],
    ['next', 'next'],
    ['vitest', 'vitest'],
    ['jest', 'jest'],
    ['eslint', 'eslint'],
    ['nuxt', 'nuxt'],
  ];

  for (const [pkgName, registryKey] of toolsToCheck) {
    const version = getPackageVersion(pkgName, deps, devDeps);
    if (!version) continue;

    const spec = STACK_REGISTRY[registryKey];
    if (!spec) continue;

    const issue = checkVersionAgainstSpec(version, spec);
    if (issue) {
      result.messages.push({
        blocking: issue.blocking,
        tool: spec.displayName,
        message: issue.message,
      });
      if (issue.blocking) result.blocking = true;
    }
  }

  return result;
}

export function checkAndWarnEslintVersion(root: string): void {
  const pkgJson = safeReadJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(path.join(root, 'package.json'));

  const deps = pkgJson?.dependencies ?? {};
  const devDeps = pkgJson?.devDependencies ?? {};

  const eslintVersion = getPackageVersion('eslint', deps, devDeps);
  if (!eslintVersion) return;

  const spec = STACK_REGISTRY.eslint;
  const issue = checkVersionAgainstSpec(eslintVersion, spec);

  if (issue && !issue.blocking) {
    logger.warn(`[ESLint] ${issue.message}`);
    if (!isAtLeast(eslintVersion, 8, 57)) {
      logger.warn(
        '[ESLint] Версия ниже 8.57. Flat Config (eslint.config.mjs) не поддерживается. ' +
        'Обновите ESLint до 8.57 и выше или до версии 9 для корректной работы. ' +
        'При необходимости настройте конфигурацию самостоятельно.',
      );
    }
  }
}

export function checkAndBlockIncompatibleVersions(project: ProjectContext): boolean {
  const pkg = safeReadJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(path.join(project.rootPath, 'package.json'));

  const deps = pkg?.dependencies ?? {};
  const devDeps = pkg?.devDependencies ?? {};

  const result = checkStackVersionsForInit(deps, devDeps);

  if (result.messages.length > 0) {
    for (const msg of result.messages) {
      if (msg.blocking) {
        logger.error(`[${msg.tool}] ${msg.message}`);
      } else {
        logger.warn(`[${msg.tool}] ${msg.message}`);
      }
    }
  }

  if (result.blocking) {
    logger.error(
      'Инициализация невозможна из-за несовместимых версий зависимостей. ' +
      'Обновите указанные пакеты и запустите pulsqual init повторно.',
    );
    return true;
  }

  return false;
}

export function warnIncompatibleVersions(root: string): void {
  const pkg = safeReadJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(path.join(root, 'package.json'));

  const deps = pkg?.dependencies ?? {};
  const devDeps = pkg?.devDependencies ?? {};
  const result = checkStackVersionsForInit(deps, devDeps);

  for (const msg of result.messages) {
    logger.warn(`[${msg.tool}] ${msg.message}`);
  }
}
