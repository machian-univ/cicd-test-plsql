import type {
  LintResult,
  ComplexityResult,
  TestRunResult,
  SecurityResult,
  DiffMetrics,
  NormalizedFeatures,
  PulsqualConfig,
} from '../core/types.js';

export interface NormalizeFeaturesInput {
  lintData: LintResult[];
  complexity: ComplexityResult | null;
  testRun: TestRunResult | null;
  security: SecurityResult | null;
  diff: DiffMetrics | null;
  thresholds: PulsqualConfig['thresholds'];
}

const NEUTRAL_TEST_RATE = 0.5;

function computeTestRates(testRun: TestRunResult | null): { pass: number; fail: number } {
  if (testRun?.status !== 'ok') {
    return { pass: NEUTRAL_TEST_RATE, fail: NEUTRAL_TEST_RATE };
  }
  if (testRun.testsRun > 0) {
    return {
      pass: testRun.passed / testRun.testsRun,
      fail: testRun.failed / testRun.testsRun,
    };
  }
  return { pass: NEUTRAL_TEST_RATE, fail: NEUTRAL_TEST_RATE };
}

export function buildNormalizedFeatures(input: NormalizeFeaturesInput): NormalizedFeatures {
  const { lintData, complexity, testRun, security, diff, thresholds } = input;

  const totalErrors = lintData.reduce((s, r) => s + r.errorCount, 0);
  const totalWarnings = lintData.reduce((s, r) => s + r.warningCount, 0);
  const fileCount = Math.max(lintData.length, 1);

  const coverage = testRun?.status === 'ok' ? testRun.coverage : null;
  const testRates = computeTestRates(testRun);

  return {
    lintErrorsNorm: Math.min(totalErrors / (fileCount * 10), 1),
    lintWarningsNorm: Math.min(totalWarnings / (fileCount * 20), 1),

    maxComplexityNorm: complexity
      ? Math.min(complexity.maxComplexity / thresholds.max_complexity, 3)
      : 0,
    avgComplexityNorm: complexity
      ? Math.min(complexity.averageComplexity / thresholds.max_complexity, 3)
      : 0,
    violationRateNorm: complexity
      ? Math.min(complexity.violations.length / fileCount, 1)
      : 0,

    totalLoc: complexity?.totalLoc ?? 0,
    avgFileLoc: complexity?.avgFileLoc ?? 0,

    coverageLinesNorm: Math.min((coverage?.lines ?? 0) / 100, 1),
    coverageBranchesNorm: Math.min((coverage?.branches ?? 0) / 100, 1),
    coverageFunctionsNorm: Math.min((coverage?.functions ?? 0) / 100, 1),

    testPassRateNorm: testRates.pass,
    testFailRateNorm: testRates.fail,

    criticalVulnCount: security?.auditCritical ?? 0,
    highVulnCount: security?.auditHigh ?? 0,
    gitleaksLeakCount: security?.gitleaksFound ?? 0,

    locAdded: diff?.locAdded ?? 0,
    locRemoved: diff?.locRemoved ?? 0,
    changeRatio: diff?.changeRatio ?? 0,
    hasTestsChanged: diff?.hasTestsChanged ? 1 : 0,
    hasConfigChanged: diff?.hasConfigChanged ? 1 : 0,
    authorExperience: diff?.authorExperience ?? 0,
    fileChurnAvg: diff?.fileChurnAvg ?? 0,
  };
}

export function hasMinimalAnalysisData(input: Omit<NormalizeFeaturesInput, 'thresholds'>): boolean {
  const { lintData, complexity, testRun, security, diff } = input;
  if (diff) return true;
  if (security) return true;
  if (testRun) return true;
  if (complexity) return true;
  if (lintData.length > 0) return true;
  return false;
}
