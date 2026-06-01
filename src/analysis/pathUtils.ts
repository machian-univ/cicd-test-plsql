import fs from 'fs';
import path from 'path';

/** Абсолютные пути к существующим файлам/директориям относительно корня проекта. */
export function resolveExistingPaths(projectRoot: string, relativePaths: string[]): string[] {
  const existing: string[] = [];

  for (const rel of relativePaths) {
    if (!rel?.trim()) continue;
    const abs = path.isAbsolute(rel) ? rel : path.join(projectRoot, rel);
    if (fs.existsSync(abs)) {
      existing.push(abs);
    }
  }

  return existing;
}

/** Первый подходящий tsconfig в корне проекта. */
export function resolveTsConfigPath(projectRoot: string): string | null {
  const preferred = path.join(projectRoot, 'tsconfig.json');
  if (fs.existsSync(preferred)) return preferred;

  try {
    const candidates = fs.readdirSync(projectRoot)
      .filter(name => /^tsconfig.*\.json$/i.test(name))
      .sort((a, b) => {
        if (a === 'tsconfig.json') return -1;
        if (b === 'tsconfig.json') return 1;
        return a.localeCompare(b);
      });

    for (const name of candidates) {
      const full = path.join(projectRoot, name);
      if (fs.existsSync(full)) return full;
    }
  } catch { /* нет доступа к каталогу */ }

  return null;
}
