import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { logger } from '../../utils/logger.js';
import type { PackageManager } from './types.js';

export function detectPackageManager(root: string): PackageManager {
  if (fs.existsSync(path.join(root, 'bun.lockb'))) return 'bun';
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

export function buildInstallCmd(pm: PackageManager, packages: string[]): string {
  const pkgStr = packages.join(' ');
  switch (pm) {
    case 'yarn': return `yarn add --dev ${pkgStr}`;
    case 'pnpm': return `pnpm add -D ${pkgStr}`;
    case 'bun': return `bun add -d ${pkgStr}`;
    default: return `npm install --save-dev ${pkgStr}`;
  }
}

export function isPackageInstalledLocally(packageName: string, root: string): boolean {
  try {
    const resolved = require.resolve(`${packageName}/package.json`, { paths: [root] });
    return fs.existsSync(resolved);
  } catch {
    return fs.existsSync(path.join(root, 'node_modules', packageName));
  }
}

export function isBinAvailableLocally(binName: string, root: string): boolean {
  const ext = process.platform === 'win32' ? '.cmd' : '';
  return fs.existsSync(path.join(root, 'node_modules', '.bin', binName + ext));
}

export function safeReadJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function installPackages(packages: string[], root: string, pm: PackageManager): boolean {
  const cmd = buildInstallCmd(pm, packages);
  logger.step(`Выполняю: ${cmd}`);
  try {
    execSync(cmd, { cwd: root, stdio: 'inherit' });
    return true;
  } catch (err) {
    logger.error(`Ошибка установки зависимостей: ${String(err)}`);
    return false;
  }
}
