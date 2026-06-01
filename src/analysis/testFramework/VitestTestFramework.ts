import fs from 'fs';
import path from 'path';
import type { TestRunResult, TestRunResultError, TestRunResultSkipped, TestRunnerReport } from '../../core/types.js';
import type { TestFramework } from './TestFramework.js';
import { execTestCommand } from './testCommandRunner.js';
import {
  buildOkResult,
  clearCoverageSummary,
  extractJsonFromOutput,
} from './testReportParsing.js';
import { findLocalBin } from '../../utils/bin.js';

const VITEST_JSON_REPORT = '.pulsqual-vitest-report.json';

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

export class VitestTestFramework implements TestFramework {
  readonly id = 'vitest' as const;
  readonly binaryName = 'vitest';

  isAvailable(projectRoot: string): boolean {
    return findLocalBin(projectRoot, this.binaryName) !== null;
  }

  run(projectRoot: string): TestRunResult {
    if (!this.isAvailable(projectRoot)) {
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

    clearCoverageSummary(projectRoot);

    const execResult = execTestCommand({
      projectRoot,
      binaryName: this.binaryName,
      acceptExitCode1: true,
      args: [
        'run',
        '--reporter=json',
        '--reporter=verbose',
        `--outputFile.json=${outputFile}`,
        '--coverage',
        '--coverage.reporter=json-summary',
        '--coverage.reportOnFailure=true',
      ],
    });

    if (!execResult.ok) {
      const errorResult: TestRunResultError = {
        status: 'error',
        testsRun: 0,
        passed: 0,
        failed: 0,
        coverage: null,
        errorMessage: `Vitest завершился с ошибкой: ${execResult.errorMessage}`,
      };
      return errorResult;
    }

    const rawReport =
      readVitestReportFile(outputFile) ??
      extractJsonFromOutput(execResult.stdout) ??
      extractJsonFromOutput(execResult.stderr);

    return buildOkResult(projectRoot, rawReport);
  }
}
