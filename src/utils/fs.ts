import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type { PulsqualConfig } from '../core/types.js';
import { DEFAULT_CONFIG } from '../core/types.js';

export const CONFIG_FILENAME = '.pulsqual.yml';

export function findProjectRoot(): string {
  return process.cwd();
}

export function getPulsqualDir(root: string): string {
  return path.join(root, '.pulsqual');
}

export function getConfigPath(root: string): string {
  return path.join(root, CONFIG_FILENAME);
}

export function configExists(root: string): boolean {
  return fs.existsSync(getConfigPath(root));
}

export function isInitialized(root: string): boolean {
  return configExists(root) && fs.existsSync(getPulsqualDir(root));
}

export function loadConfig(root: string): PulsqualConfig {
  const cfgPath = getConfigPath(root);
  if (!fs.existsSync(cfgPath)) {
    throw new Error(
      `Конфигурационный файл ${CONFIG_FILENAME} не найден в ${root}. ` +
      `Запустите: pulsqual init`
    );
  }
  const raw = yaml.load(fs.readFileSync(cfgPath, 'utf8')) as unknown;
  const override: Partial<PulsqualConfig> =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Partial<PulsqualConfig>)
      : {};
  return deepMerge(DEFAULT_CONFIG, override);
}

export function loadConfigOrNull(root: string): PulsqualConfig | null {
  if (!configExists(root)) return null;
  return loadConfig(root);
}

export function saveConfig(root: string, config: PulsqualConfig): void {
  const cfgPath = getConfigPath(root);
  const content = [
    '# Конфигурация Pulsqual',
    '# Документация: https://github.com/pulsqual/pulsqual',
    '',
    yaml.dump(config, { indent: 2, lineWidth: 80 }),
  ].join('\n');
  fs.writeFileSync(cfgPath, content, 'utf8');
}

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function deepMerge<T extends Record<string, any>>(base: T, override: Partial<T>): T {
  const result: T = { ...base };
  for (const key of Object.keys(override) as Array<keyof T>) {
    const oVal = override[key];
    if (oVal === undefined) continue;
    const bVal = base[key];
    if (isPlainObject(bVal) && isPlainObject(oVal)) {
      result[key] = deepMerge(bVal, oVal as any);
    } else {
      result[key] = oVal as T[typeof key];
    }
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}