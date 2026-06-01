import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import type { LintResult, LintMessage, EslintComplexityMessage, TscError } from '../core/types.js';
import { findLocalBin, useShellForLocalBin } from '../utils/bin.js';
import { resolveExistingPaths, resolveTsConfigPath } from './pathUtils.js';

interface EslintJsonMessage {
  ruleId: string | null;
  severity: 1 | 2;
  message: string;
  line: number;
  column: number;
  endLine?: number;
  nodeType?: string;
}

interface EslintJsonResult {
  filePath: string;
  messages: EslintJsonMessage[];
  errorCount: number;
  warningCount: number;
}

export interface EslintRunOptions {
  projectRoot: string;
  targetPaths: string[];
  extensions?: string[];
  failSilently?: boolean;
  requiresDecorators?: boolean;
}

export interface EslintRunResult {
  lintResults: LintResult[];
  complexityMessages: EslintComplexityMessage[];
  runError?: string;
  configError?: string;
}

//  Вспомогательные функции 

function findEslintBin(projectRoot: string): string | null {
  return findLocalBin(projectRoot, 'eslint');
}

function getEslintVersion(eslintBin: string): number {
  try {
    // shell: true для Windows
    const result = spawnSync(eslintBin, ['--version'], {
      encoding: 'utf8',
      shell: useShellForLocalBin(),
      timeout: 10_000,
    });
    const match = result.stdout?.match(/v(\d+)\./);
    return match ? parseInt(match[1], 10) : 8;
  } catch {
    return 8;
  }
}

function extractComplexityMessages(results: EslintJsonResult[]): EslintComplexityMessage[] {
  const messages: EslintComplexityMessage[] = [];
  const complexityRules = new Set([
    'sonarjs/cognitive-complexity',
    'complexity',
    '@typescript-eslint/complexity',
  ]);

  const sonarRegex = /from\s+(\d+)\s+to/i;
  const builtinRegex = /complexity of (\d+)/i;
  const funcNameRegex = /Function '([^']+)'/i;

  for (const file of results) {
    for (const msg of file.messages) {
      if (!msg.ruleId || !complexityRules.has(msg.ruleId)) continue;

      let complexity = 0;
      const sonarMatch = sonarRegex.exec(msg.message);
      const builtinMatch = builtinRegex.exec(msg.message);

      if (sonarMatch) complexity = parseInt(sonarMatch[1], 10);
      else if (builtinMatch) complexity = parseInt(builtinMatch[1], 10);

      if (complexity <= 0) continue;

      const funcMatch = funcNameRegex.exec(msg.message);
      const functionName = funcMatch ? funcMatch[1] : `<анонимная@${msg.line}>`;

      messages.push({
        filePath: file.filePath,
        functionName,
        complexity,
        line: msg.line,
        ruleId: msg.ruleId,
      });
    }
  }
  return messages;
}


 //Определяет является ли ошибка ESLint ошибкой конфигурации.
// Анализирует текст ошибки для вывода понятного сообщения пользователю.
function parseEslintConfigError(stderr: string, stdout: string): string | undefined {
  const combined = (stderr + '\n' + stdout).toLowerCase();

  if (
    combined.includes('error while loading rule') ||
    combined.includes('definition for rule') ||
    combined.includes('failed to load plugin') ||
    combined.includes('cannot find module') ||
    combined.includes('eslint.config') ||
    combined.includes('.eslintrc') ||
    combined.includes('parsing error') ||
    combined.includes('configuration for rule') ||
    combined.includes('invalid option')
  ) {
    // Возвращаем оригинальный stderr для отображения
    const lines = (stderr || stdout).split('\n').slice(0, 10).join('\n');
    return `Ошибка конфигурации ESLint:\n${lines}\n\nПроверьте файл конфигурации ESLint. Убедитесь, что все плагины установлены.`;
  }

  return undefined;
}

// Основная функция 

export function runEslint(options: EslintRunOptions): EslintRunResult {
  const {
    projectRoot,
    targetPaths,
    extensions,
    failSilently = true,
    requiresDecorators = false,
  } = options;

  const eslintBin = findEslintBin(projectRoot);

  if (!eslintBin) {
    const error = 'ESLint не найден в node_modules проекта.';
    return { lintResults: [], complexityMessages: [], runError: failSilently ? undefined : error };
  }

  const version = getEslintVersion(eslintBin);
  const normalizedPaths = resolveExistingPaths(projectRoot, targetPaths);

  if (normalizedPaths.length === 0) {
    return { lintResults: [], complexityMessages: [] };
  }

  let hasFlatConfig = false;
  try {
    hasFlatConfig = fs.readdirSync(projectRoot).some(file =>
      file.startsWith('eslint.config.')
    );
  } catch { /* нет доступа — считаем legacy */ }

  const args = ['--format', 'json', '--no-error-on-unmatched-pattern'];

  // Флаг --ext добавляем ТОЛЬКО если версия < 9 И НЕТ нового конфига
  if (version < 9 && !hasFlatConfig) {
    const validExtensions = (extensions && extensions.length > 0)
      ? extensions
      : ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'];
    args.push('--ext', validExtensions.join(','));
  }

  args.push(...normalizedPaths);

  // для NestJS с legacyDecorators передаём через переменную окружения
  // TYPESCRIPT_ESLINT_LEGACY_DECORATORS — поддерживается @typescript-eslint/parser
  const env: Record<string, string> = { ...process.env as Record<string, string> };
  if (requiresDecorators) {
    env['TYPESCRIPT_ESLINT_LEGACY_DECORATORS'] = 'true';
  }

  let rawOutput = '';
  let rawStderr = '';
  let runError: string | undefined;
  let configError: string | undefined;

  try {
    const result = spawnSync(eslintBin, args, {
      cwd: projectRoot,
      encoding: 'utf8',
      shell: useShellForLocalBin(),
      env,
      timeout: 300_000,
      // maxBuffer 50MB
      maxBuffer: 50 * 1024 * 1024,
    });

    rawOutput = result.stdout || '';
    rawStderr = result.stderr || '';

    // Статус 0 = нет ошибок, 1 = есть lint-ошибки (нормально), остальное = системная ошибка
    if (result.status !== 0 && result.status !== 1) {
      // проверяем является ли это ошибкой конфигурации
      configError = parseEslintConfigError(rawStderr, rawOutput);
      if (!configError) {
        runError = rawStderr || rawOutput || `ESLint завершился с кодом ${result.status}`;
      }
    }

    // Дополнительная проверка stderr на ошибки конфига даже при статусе 1
    if (!configError && rawStderr) {
      configError = parseEslintConfigError(rawStderr, '');
    }
  } catch (err: any) {
    runError = `Критическая ошибка запуска ESLint: ${err.message}`;
  }

  // если конфиг есть, но линтер не может его распарсить
  if (configError) {
    return { lintResults: [], complexityMessages: [], configError };
  }

  if (!rawOutput.trim() || !rawOutput.trim().startsWith('[')) {
    return {
      lintResults: [],
      complexityMessages: [],
      runError: runError || (rawOutput.trim() ? rawOutput : 'ESLint вернул пустой ответ'),
    };
  }

  let parsed: EslintJsonResult[] = [];
  try {
    const jsonStart = rawOutput.indexOf('[');
    parsed = JSON.parse(rawOutput.substring(jsonStart)) as EslintJsonResult[];
  } catch {
    return {
      lintResults: [],
      complexityMessages: [],
      runError: 'Не удалось распарсить JSON-вывод ESLint',
    };
  }

  const lintResults: LintResult[] = parsed.map(file => {
    const messages: LintMessage[] = file.messages.map((m): LintMessage => ({
      ruleId: m.ruleId,
      message: m.message,
      line: m.line,
      severity: m.severity,
      source: 'eslint',
    }));

    return {
      filePath: file.filePath,
      errorCount: file.errorCount,
      warningCount: file.warningCount,
      messages,
      eslintMessages: messages,
      tscMessages: [],
    };
  });

  const complexityMessages = extractComplexityMessages(parsed);

  return { lintResults, complexityMessages, runError };
}

// tsc --noEmit

export function runTsc(projectRoot: string): { errors: TscError[]; runError?: string } {
  const tscBin = findLocalBin(projectRoot, 'tsc');

  if (!tscBin) {
    return {
      errors: [],
      runError: 'TypeScript не установлен в проекте. Добавьте typescript в devDependencies.',
    };
  }

  const tsConfigPath = resolveTsConfigPath(projectRoot);
  if (!tsConfigPath) {
    return {
      errors: [],
      runError: 'tsconfig не найден. Создайте tsconfig.json или запустите pulsqual init.',
    };
  }

  const tscArgs = ['--noEmit', '--pretty', 'false'];
  if (path.basename(tsConfigPath) !== 'tsconfig.json') {
    tscArgs.push('-p', tsConfigPath);
  }

  let output = '';
  try {
    const result = spawnSync(tscBin, tscArgs, {
      cwd: projectRoot,
      encoding: 'utf8',
      shell: useShellForLocalBin(),
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (result.status === 0) {
      return { errors: [] };
    }
    output = (result.stdout ?? '') + (result.stderr ?? '');
    if (!output.trim() && result.error) {
      return {
        errors: [],
        runError: `tsc завершился с кодом ${result.status}: ${result.error.message}`,
      };
    }
  } catch (err: unknown) {
    const e = err as { message?: string };
    return {
      errors: [],
      runError: `Критическая ошибка запуска tsc: ${e.message ?? String(err)}`,
    };
  }

  const errors: TscError[] = [];
  // Паттерн: «src/file.ts(10,5): error TS2345: message»
  const lineRegex = /^(.+?)\((\d+),\d+\): error (TS\d+): (.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = lineRegex.exec(output)) !== null) {
    errors.push({
      file: match[1].trim(),
      line: parseInt(match[2], 10),
      code: parseInt(match[3].replace('TS', ''), 10),
      message: match[4].trim(),
    });
  }

  return { errors };
}