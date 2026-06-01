import type { TestRunner } from '../../core/types.js';
import type { RunnableTestFrameworkId, TestFramework } from './TestFramework.js';
import { JestTestFramework } from './JestTestFramework.js';
import { VitestTestFramework } from './VitestTestFramework.js';

const frameworks = new Map<RunnableTestFrameworkId, TestFramework>([
  ['jest', new JestTestFramework()],
  ['vitest', new VitestTestFramework()],
]);

export function getTestFramework(id: RunnableTestFrameworkId): TestFramework {
  const framework = frameworks.get(id);
  if (!framework) {
    throw new Error(`Тестовый фреймворк не зарегистрирован: ${id}`);
  }
  return framework;
}

export function resolveRunnableTestFramework(
  runner: TestRunner,
): TestFramework | null {
  if (runner === 'jest' || runner === 'vitest') {
    return getTestFramework(runner);
  }
  return null;
}

/** Для расширения: регистрация дополнительных фреймворков без правок ядра. */
export function registerTestFramework(framework: TestFramework): void {
  frameworks.set(framework.id, framework);
}

export function listRegisteredTestFrameworks(): RunnableTestFrameworkId[] {
  return [...frameworks.keys()];
}
