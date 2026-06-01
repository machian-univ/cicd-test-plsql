import fs from 'fs';
import path from 'path';
import { DEGRADATION_MODEL_FILENAME } from './DegradationPredictor.js';

export function resolveBundledModelPath(): string | null {
  const candidates: string[] = [
    path.join(__dirname, '..', '..', DEGRADATION_MODEL_FILENAME),
    path.join(__dirname, '..', '..', 'dist', DEGRADATION_MODEL_FILENAME),
  ];

  try {
    const packageRoot = path.dirname(require.resolve('../../package.json'));
    candidates.unshift(
      path.join(packageRoot, DEGRADATION_MODEL_FILENAME),
      path.join(packageRoot, 'dist', DEGRADATION_MODEL_FILENAME),
    );
  } catch {
    // вне npm-пакета
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function ensureDegradationModelInProject(pulsqualDir: string, projectRoot: string): boolean {
  const dest = path.join(pulsqualDir, DEGRADATION_MODEL_FILENAME);
  if (fs.existsSync(dest)) {
    return true;
  }

  const sources = [
    path.join(projectRoot, DEGRADATION_MODEL_FILENAME),
    resolveBundledModelPath(),
  ].filter((p): p is string => p !== null);

  for (const src of sources) {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      return true;
    }
  }

  return false;
}
