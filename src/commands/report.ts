import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { logger } from '../utils/logger.js';
import { findProjectRoot, isInitialized, loadConfig } from '../utils/fs.js';

export interface ReportOptions {
  last?: string;
  output?: string;
}

export async function runReport(options: ReportOptions): Promise<void> {
  const root = findProjectRoot();

  if (!isInitialized(root)) {
    logger.error('Проект не инициализирован. Запустите сначала: pulsqual init');
    process.exit(1);
  }

  const config = loadConfig(root);
  const outputDir  = path.join(root, config.paths.output);
  const reportsDir = path.join(outputDir, 'reports');

  if (!fs.existsSync(reportsDir)) {
    logger.error('Отчёты не найдены. Сначала запустите: pulsqual check');
    return;
  }

  const reports = fs
    .readdirSync(reportsDir)
    .filter(f => f.endsWith('.html'))
    .sort()
    .reverse();

  if (reports.length === 0) {
    logger.error('Нет сохранённых отчётов.');
    return;
  }

  const index = options.last ? parseInt(options.last, 10) - 1 : 0;
  const targetReport = reports[Math.min(index, reports.length - 1)];
  const reportPath   = path.join(reportsDir, targetReport);

  if (options.output) {
    fs.copyFileSync(reportPath, options.output);
    logger.success(`Отчёт скопирован в: ${options.output}`);
    return;
  }

  logger.info(`Открываю отчёт: ${reportPath}`);
  openInBrowser(reportPath);
}

function openInBrowser(filePath: string): void {
  const url = `file://${filePath.replace(/\\/g, '/')}`;
  const cmd =
    process.platform === 'win32'
      ? `start "" "${filePath}"`
      : process.platform === 'darwin'
        ? `open "${filePath}"`
        : `xdg-open "${filePath}"`;
  try {
    execSync(cmd, { stdio: 'ignore' });
  } catch {
    logger.warn(`Не удалось открыть браузер. Откройте вручную: ${url}`);
  }
}