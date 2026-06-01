import path from 'path';

/**
 * Путь файла для отображения в отчёте: относительный к корню проекта, без обрезки.
 */
export function formatReportFilePath(filePath: string, projectRoot?: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  if (projectRoot) {
    const rootNorm = projectRoot.replace(/\\/g, '/').replace(/\/$/, '');
    if (normalized.startsWith(rootNorm + '/')) {
      return normalized.slice(rootNorm.length + 1);
    }
    if (normalized.toLowerCase().startsWith(rootNorm.toLowerCase() + '/')) {
      return normalized.slice(rootNorm.length + 1);
    }
  }

  // CI: убрать префикс рабочей директории runner
  const runnerMatch = normalized.match(/\/work\/[^/]+\/[^/]+\/(.+)$/);
  if (runnerMatch?.[1]) return runnerMatch[1];

  const basename = path.basename(normalized);
  const srcIdx = normalized.lastIndexOf('/src/');
  if (srcIdx >= 0) return normalized.slice(srcIdx + 1);

  return normalized;
}

export function stabilityIndexColor(rawScore: number): string {
  if (rawScore >= 0.75) return 'var(--accent)';
  if (rawScore >= 0.25) return 'var(--yellow)';
  return 'var(--red)';
}

export function formatPercent(value: number, decimals = 0): string {
  const pct = value <= 1 && value >= 0 ? value * 100 : value;
  return `${pct.toFixed(decimals)}%`;
}
