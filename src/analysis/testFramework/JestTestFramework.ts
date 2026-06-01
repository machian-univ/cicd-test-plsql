import type { TestRunResult, TestRunResultError, TestRunResultSkipped } from '../../core/types.js';
import type { TestFramework } from './TestFramework.js';
import { execTestCommand } from './testCommandRunner.js';
import {
  buildOkResult,
  clearCoverageSummary,
  extractJsonFromOutput,
} from './testReportParsing.js';
import { findLocalBin } from '../../utils/bin.js';

export class JestTestFramework implements TestFramework {
  readonly id = 'jest' as const;
  readonly binaryName = 'jest';

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
        errorMessage: 'jest не найден в node_modules. Запустите: pulsqual init',
      };
      return skipped;
    }

    clearCoverageSummary(projectRoot);

    const execResult = execTestCommand({
      projectRoot,
      binaryName: this.binaryName,
      acceptExitCode1: true,
      recoverOutputFromError: true,
      env: {
        ...process.env,
        NODE_OPTIONS: '--experimental-vm-modules',
      },
      args: [
        '--coverage',
        '--coverageReporters=json-summary',
        '--json',
        '--passWithNoTests',
        '--forceExit',
      ],
    });

    if (!execResult.ok) {
      const errorResult: TestRunResultError = {
        status: 'error',
        testsRun: 0,
        passed: 0,
        failed: 0,
        coverage: null,
        errorMessage: `Jest завершился с ошибкой: ${execResult.errorMessage}`,
      };
      return errorResult;
    }

    const rawReport =
      extractJsonFromOutput(execResult.stdout) ??
      extractJsonFromOutput(execResult.stderr);

    return buildOkResult(projectRoot, rawReport);
  }
}
