import path from 'path';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { findProjectRoot, isInitialized, loadConfig } from '../utils/fs.js';
import { Database } from '../db/Database.js';

export interface HistoryOptions {
  limit?: string;
  json?: boolean;
}

export async function runHistory(options: HistoryOptions): Promise<void> {
  const root = findProjectRoot();

  if (!isInitialized(root)) {
    logger.error('Проект не инициализирован. Запустите сначала: pulsqual init');
    process.exit(1);
  }

  const config = loadConfig(root);
  const outputDir = path.join(root, config.paths.output);

  const limitRaw = options.limit ? parseInt(options.limit, 10) : 10;
  const limit = isNaN(limitRaw) || limitRaw <= 0 ? 10 : limitRaw;

  let db: Database;
  try {
    db = new Database(outputDir);
  } catch (err) {
    logger.error(`Не удалось открыть базу данных: ${String(err)}`);
    logger.info('Возможно, проверки ещё не выполнялись. Запустите: pulsqual check');
    return;
  }

  try {
    const records = await db.getHistory(limit);
    db.close();

    if (options.json) {
      console.log(JSON.stringify(records, null, 2));
      return;
    }

    if (records.length === 0) {
      logger.info(
        'История проверок пуста. Запустите полную проверку: pulsqual check'
      );
      return;
    }

    logger.header(`История проверок (последние ${records.length})`);
    logger.info('Формат: [gate] дата  Q-Score  коммит  режим  ветка  длительность');
    logger.blank();

    for (const rec of records) {
      const gateLabel = rec.gate_passed
        ? chalk.green('ПРОЙДЕН')
        : chalk.red('НЕ ПРОЙДЕН');

      const score = rec.q_score !== null
        ? chalk.cyan(rec.q_score.toFixed(1).padStart(5))
        : chalk.gray('  N/A');

      const hash   = (rec.commit_hash ?? 'unknown').slice(0, 7);
      const branch = rec.branch ? chalk.gray(rec.branch.slice(0, 20)) : chalk.gray('—');
      const date   = (rec.created_at ?? '').slice(0, 16);

      const modeLabel: Record<string, string> = {
        full: 'full',
        ci:   'ci  ',
        quick: 'quick',
      };
      const mode = chalk.gray(modeLabel[rec.mode] ?? rec.mode);

      const duration = rec.duration_sec !== null && rec.duration_sec !== undefined
        ? chalk.gray(`${Number(rec.duration_sec).toFixed(0)}с`)
        : chalk.gray('—');

      console.log(
        `  [${gateLabel}]  ${chalk.gray(date)}  Q:${score}  ` +
        `${chalk.gray(hash)}  ${mode}  ${branch}  ${duration}`
      );
    }

    logger.blank();
    logger.info(`Для просмотра полного отчёта: pulsqual report`);
    logger.info(`Для вывода в формате JSON: pulsqual history --json`);
  } catch (err) {
    logger.error(`Ошибка при чтении истории: ${String(err)}`);
    logger.info('Если база данных повреждена, запустите pulsqual check для создания новой записи.');
  }
}