import fs from 'fs';
import path from 'path';
import type {
  TestRunnerReport, FailedTestDetail, AssertionResult, TestRunResultOk,
} from '../../core/types.js';
import { readCoverageSummary, detectCoverageExtraDirs } from '../CoverageReader.js';

export function readCoverage(projectRoot: string) {
  const extraDirs = detectCoverageExtraDirs(projectRoot);
  return readCoverageSummary(projectRoot, extraDirs);
}

export function extractJsonFromOutput(output: string): TestRunnerReport | null {
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

export function extractFailedTests(raw: TestRunnerReport | null): FailedTestDetail[] {
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
        testName: assertion.title ?? assertion.fullName ?? 'unknown',
        errorMessage: (assertion.failureMessages ?? []).join('\n').slice(0, 500),
        duration: assertion.duration,
      });
    }
  }

  return failed;
}

export function parseTestJson(raw: TestRunnerReport | null): {
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
      passed: raw.numPassedTests ?? 0,
      failed: raw.numFailedTests ?? 0,
      skipped:
        (raw.numPendingTests ?? 0) +
        (raw.numTodoTests ?? 0) +
        (raw.numSkippedTests ?? 0),
    };
  }

  if (Array.isArray(raw.testResults)) {
    let testsRun = 0;
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const suite of raw.testResults) {
      const assertions: AssertionResult[] = Array.isArray(suite.assertionResults)
        ? suite.assertionResults
        : [];

      for (const t of assertions) {
        testsRun++;
        if (t.status === 'passed') passed++;
        else if (t.status === 'failed') failed++;
        else skipped++;
      }
    }

    return { testsRun, passed, failed, skipped };
  }

  return { testsRun: 0, passed: 0, failed: 0, skipped: 0 };
}

export function buildOkResult(
  projectRoot: string,
  rawReport: TestRunnerReport | null,
): TestRunResultOk {
  const stats = parseTestJson(rawReport);
  return {
    status: 'ok',
    testsRun: stats.testsRun,
    passed: stats.passed,
    failed: stats.failed,
    skipped: stats.skipped,
    coverage: readCoverage(projectRoot),
    failedTests: extractFailedTests(rawReport),
    rawReport,
  };
}

export function clearCoverageSummary(projectRoot: string): void {
  const oldSummary = path.join(projectRoot, 'coverage', 'coverage-summary.json');
  if (fs.existsSync(oldSummary)) {
    try { fs.unlinkSync(oldSummary); } catch { /* игнорируем */ }
  }
}
