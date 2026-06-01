import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import type {
  TestRunResult, TestRunResultOk, TestRunResultSkipped, TestRunResultError,
  CoverageResult, FailedTestDetail, TestRunnerReport, AssertionResult,
} from '../core/types.js';
import { readCoverageSummary, detectCoverageExtraDirs } from './CoverageReader.js';

const VITEST_JSON_REPORT = '.pulsqual-vitest-report.json';

function findBin(projectRoot: string, name: string): string | null {
  // req. 4: .cmd на Windows
  const ext = process.platform === 'win32' ? '.cmd' : '';
  const binPath = path.join(projectRoot, 'node_modules', '.bin', `${name}${ext}`);
  return fs.existsSync(binPath) ? binPath : null;
}

function readCoverage(projectRoot: string): CoverageResult | null {
  const extraDirs = detectCoverageExtraDirs(projectRoot);
  return readCoverageSummary(projectRoot, extraDirs);
}

// Поиск JSON-объекта с numTotalTests в выводе
function extractJsonFromOutput(output: string): TestRunnerReport | null {
  if (!output.trim()) return null;

  let idx = 0;
  while (idx < output.length) {
    const start = output.indexOf('{', idx);
    if (start === -1) break;

    const end = findMatchingBrace(output, start);
    if (end === -1) break;

    const candidate = output.slice(start, end + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        typeof parsed.numTotalTests === 'number'
      ) {
        return parsed as TestRunnerReport;
      }
    } catch { /* продолжаем поиск */ }

    idx = start + 1;
  }

  return null;
}

function findMatchingBrace(str: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < str.length; i++) {
    const ch = str[i];

    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function extractFailedTests(raw: TestRunnerReport | null): FailedTestDetail[] {
  if (!raw || !Array.isArray(raw.testResults)) return [];

  const failed: FailedTestDetail[] = [];

  for (const suite of raw.testResults) {
    if (!Array.isArray(suite.assertionResults)) continue;

    for (const assertion of suite.assertionResults as AssertionResult[]) {
      if (assertion.status !== 'failed') continue;

      const suiteName = Array.isArray(assertion.ancestorTitles)
        ? assertion.ancestorTitles.join(' > ')
        : suite.testFilePath ?? 'unknown suite';

      failed.push({
        suiteName,
        testName:     assertion.title ?? assertion.fullName ?? 'unknown',
        errorMessage: (assertion.failureMessages ?? []).join('\n').slice(0, 500),
        duration:     assertion.duration,
      });
    }
  }

  return failed;
}

function parseTestJson(raw: TestRunnerReport | null): {
  testsRun: number;
  passed: number;
  failed: number;
  skipped: number;
} {
  if (!raw || typeof raw !== 'object') {
    return { testsRun: 0, passed: 0, failed: 0, skipped: 0 };
  }

  if (typeof raw.numTotalTests === 'number') {
    return {
      testsRun: raw.numTotalTests,
      passed:   raw.numPassedTests  ?? 0,
      failed:   raw.numFailedTests  ?? 0,
      skipped:  (raw.numPendingTests ?? 0) + (raw.numTodoTests ?? 0) + (raw.numSkippedTests ?? 0),
    };
  }

  if (Array.isArray(raw.testResults)) {
    let testsRun = 0, passed = 0, failed = 0, skipped = 0;

    for (const suite of raw.testResults) {
      const assertions: AssertionResult[] = Array.isArray(suite.assertionResults)
        ? suite.assertionResults : [];

      for (const t of assertions) {
        testsRun++;
        if (t.status === 'passed')      passed++;
        else if (t.status === 'failed') failed++;
        else                            skipped++;
      }
    }

    return { testsRun, passed, failed, skipped };
  }

  return { testsRun: 0, passed: 0, failed: 0, skipped: 0 };
}

function readVitestReportFile(outputFile: string): TestRunnerReport | null {
  if (!fs.existsSync(outputFile)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    if (typeof raw === 'object' && raw !== null && typeof raw.numTotalTests === 'number') {
      return raw as TestRunnerReport;
    }
    return null;
  } catch {
    return null;
  } finally {
    try { fs.unlinkSync(outputFile); } catch { /* игнорируем */ }
  }
}

function runVitest(projectRoot: string): TestRunResult {
  const bin = findBin(projectRoot, 'vitest');
  if (!bin) {
    const skipped: TestRunResultSkipped = {
      status: 'skipped',
      testsRun: 0,
      passed: 0,
      failed: 0,
      errorMessage: 'vitest не найден в node_modules. Запустите: pulsqual init',
    };
    return skipped;
  }

  const outputFile = path.join(projectRoot, VITEST_JSON_REPORT);
  if (fs.existsSync(outputFile)) {
    try { fs.unlinkSync(outputFile); } catch { /* игнорируем */ }
  }

  const coverageDir = path.join(projectRoot, 'coverage');
  const oldSummary  = path.join(coverageDir, 'coverage-summary.json');
  if (fs.existsSync(oldSummary)) {
    try { fs.unlinkSync(oldSummary); } catch { /* игнорируем */ }
  }

  let stdout = '';
  let stderr = '';

  try {
    stdout = execFileSync(bin, [
      'run',
      '--reporter=json',
      '--reporter=verbose',
      `--outputFile.json=${outputFile}`,
      '--coverage',
      '--coverage.reporter=json-summary',
      '--coverage.reportOnFailure=true',
    ], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300_000,
      maxBuffer: 30 * 1024 * 1024,
      shell: process.platform === 'win32',
    });
  } catch (err: any) {
    if (typeof err.status === 'number' && err.status === 1) {
      stdout = err.stdout ?? '';
      stderr = err.stderr ?? '';
    } else {
      const msg = err.stderr ?? err.message ?? String(err);
      const errorResult: TestRunResultError = {
        status: 'error',
        testsRun: 0,
        passed: 0,
        failed: 0,
        coverage: null,
        errorMessage: `Vitest завершился с ошибкой: ${msg}`,
      };
      return errorResult;
    }
  }

  const rawReport: TestRunnerReport | null =
    readVitestReportFile(outputFile) ??
    extractJsonFromOutput(stdout)    ??
    extractJsonFromOutput(stderr);

  const stats = parseTestJson(rawReport);
  const coverage = readCoverage(projectRoot);
  const failedTests = extractFailedTests(rawReport);

  const okResult: TestRunResultOk = {
    status: 'ok',
    testsRun: stats.testsRun,
    passed:   stats.passed,
    failed:   stats.failed,
    skipped:  stats.skipped,
    coverage,
    failedTests,
    rawReport,
  };
  return okResult;
}

function runJest(projectRoot: string): TestRunResult {
  const bin = findBin(projectRoot, 'jest');
  if (!bin) {
    const skipped: TestRunResultSkipped = {
      status: 'skipped',
      testsRun: 0,
      passed: 0,
      failed: 0,
      errorMessage: 'jest не найден в node_modules. Запустите: pulsqual init',
    };
    return skipped;
  }

  const coverageDir = path.join(projectRoot, 'coverage');
  const oldSummary  = path.join(coverageDir, 'coverage-summary.json');
  if (fs.existsSync(oldSummary)) {
    try { fs.unlinkSync(oldSummary); } catch { /* игнорируем */ }
  }

  let stdout = '';
  let stderr = '';

  try {
    stdout = execFileSync(bin, [
      '--coverage',
      '--coverageReporters=json-summary',
      '--json',
      '--passWithNoTests',
      '--forceExit',
    ], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300_000,
      maxBuffer: 30 * 1024 * 1024,
      shell: process.platform === 'win32',
    });
  } catch (err: any) {
    if (err.stdout) {
      stdout = err.stdout;
      stderr = err.stderr ?? '';
    } else {
      const msg = err.stderr ?? err.message ?? String(err);
      const errorResult: TestRunResultError = {
        status: 'error',
        testsRun: 0,
        passed: 0,
        failed: 0,
        coverage: null,
        errorMessage: `Jest завершился с ошибкой: ${msg}`,
      };
      return errorResult;
    }
  }

  const rawReport: TestRunnerReport | null =
    extractJsonFromOutput(stdout) ?? extractJsonFromOutput(stderr);

  const stats      = parseTestJson(rawReport);
  const coverage   = readCoverage(projectRoot);
  const failedTests = extractFailedTests(rawReport);

  const okResult: TestRunResultOk = {
    status: 'ok',
    testsRun: stats.testsRun,
    passed:   stats.passed,
    failed:   stats.failed,
    skipped:  stats.skipped,
    coverage,
    failedTests,
    rawReport,
  };
  return okResult;
}

export function runTests(
  projectRoot: string,
  runner: 'jest' | 'vitest',
): TestRunResult {
  switch (runner) {
    case 'vitest': return runVitest(projectRoot);
    case 'jest':   return runJest(projectRoot);
  }
}