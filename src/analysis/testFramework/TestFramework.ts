import type { TestRunResult } from '../../core/types.js';

/** Идентификаторы тест-раннеров, которые Pulsqual умеет запускать. */
export type RunnableTestFrameworkId = 'jest' | 'vitest';

export interface TestFramework {
  readonly id: RunnableTestFrameworkId;
  /** Имя бинаря в node_modules/.bin (без расширения). */
  readonly binaryName: string;
  isAvailable(projectRoot: string): boolean;
  run(projectRoot: string): TestRunResult;
}
