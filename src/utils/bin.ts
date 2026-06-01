import fs from 'fs';
import path from 'path';

/** Локальный бинарь из node_modules/.bin (с учётом .cmd на Windows). */
export function findLocalBin(projectRoot: string, name: string): string | null {
  const ext = process.platform === 'win32' ? '.cmd' : '';
  const binPath = path.join(projectRoot, 'node_modules', '.bin', `${name}${ext}`);
  return fs.existsSync(binPath) ? binPath : null;
}

/** На Windows .cmd-обёртки требуют shell при spawn/exec. */
export function useShellForLocalBin(): boolean {
  return process.platform === 'win32';
}
