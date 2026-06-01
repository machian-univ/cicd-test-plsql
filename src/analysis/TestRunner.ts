import type { TestRunResult, TestRunner } from '../core/types.js';
import { resolveRunnableTestFramework } from './testFramework/registry.js';

export function runTests(
  projectRoot: string,
  runner: TestRunner,
): TestRunResult {
  const framework = resolveRunnableTestFramework(runner);
  if (!framework) {
    return {
      status: 'skipped',
      testsRun: 0,
      passed: 0,
      failed: 0,
      errorMessage: `Тест-раннер «${runner}» не поддерживается для автоматического запуска.`,
    };
  }
  return framework.run(projectRoot);
}
