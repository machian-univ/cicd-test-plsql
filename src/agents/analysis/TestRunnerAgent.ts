import type { Agent } from '../base/Agent.js';
import { makeResult } from '../base/Agent.js';
import type { RunContext } from '../../core/RunContext.js';
import type {
  TestRunResult, TestRunResultSkipped, ProjectContext, AgentResult,
} from '../../core/types.js';
import { runTests } from '../../analysis/TestRunner.js';

export class TestRunnerAgent implements Agent<TestRunResult> {
  readonly name = 'TestRunnerAgent';

  async run(context: RunContext): Promise<AgentResult<TestRunResult>> {
    const start = Date.now();

    try {
      const projectResult = context.get('projectContext');
      const project = projectResult?.data as ProjectContext | null;
      const mode = context.get('mode');
      const projectRoot = context.get('projectRoot');

      // kipped — без coverage
      if (mode === 'quick') {
        const skipped: TestRunResultSkipped = {
          status: 'skipped',
          testsRun: 0,
          passed: 0,
          failed: 0,
          errorMessage: 'Тесты пропущены в quick-режиме. В quick-режиме анализируются только staged-файлы.',
        };
        return makeResult(this.name, skipped, Date.now() - start);
      }

      if (!project) {
        const skipped: TestRunResultSkipped = {
          status: 'skipped',
          testsRun: 0,
          passed: 0,
          failed: 0,
          errorMessage: 'Не удалось определить контекст проекта',
        };
        return makeResult(this.name, skipped, Date.now() - start);
      }

      if (project.testRunner === 'unknown') {
        const skipped: TestRunResultSkipped = {
          status: 'skipped',
          testsRun: 0,
          passed: 0,
          failed: 0,
          errorMessage:
            'Тест-раннер не обнаружен. Установите Jest или Vitest, ' +
            'затем запустите: pulsqual init',
        };
        return makeResult(this.name, skipped, Date.now() - start);
      }

      if (project.testRunner === 'mocha') {
        const skipped: TestRunResultSkipped = {
          status: 'skipped',
          testsRun: 0,
          passed: 0,
          failed: 0,
          errorMessage:
            'Mocha не поддерживается в текущей версии. Используйте Jest или Vitest.',
        };
        return makeResult(this.name, skipped, Date.now() - start);
      }

      const result = runTests(projectRoot, project.testRunner);
      return makeResult(this.name, result, Date.now() - start);
    } catch (err) {
      // error — со структурой TestRunResultError
      return makeResult(this.name, {
        status: 'error' as const,
        testsRun: 0,
        passed: 0,
        failed: 0,
        coverage: null,
        errorMessage: `TestRunnerAgent: ${err instanceof Error ? err.message : String(err)}`,
      }, Date.now() - start);
    }
  }
}