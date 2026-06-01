import type { Agent } from '../base/Agent.js';
import { makeResult } from '../base/Agent.js';
import type { RunContext } from '../../core/RunContext.js';
import type {
  Scores, LintResult, ComplexityResult, TestRunResult,
  SecurityResult, DegradationResult, AgentResult,
  DiffMetrics,
} from '../../core/types.js';
import { buildNormalizedFeatures } from '../../ml/normalizeFeatures.js';

interface WeightedScore {
  score: number;
  weight: number;
  skipped: boolean;
}

export class ScoreCalculatorAgent implements Agent<Scores> {
  readonly name = 'ScoreCalculatorAgent';

  async run(context: RunContext): Promise<AgentResult<Scores>> {
    const start = Date.now();
    const config = context.get('config');
    const weights = config.weights;
    const thresholds = config.thresholds;

    const lintData    = (context.get('lintResults')?.data ?? []) as LintResult[];
    const complexity  = context.get('complexityResult')?.data as ComplexityResult | null;
    const testRun     = context.get('testRunResult')?.data as TestRunResult | null;
    const security    = context.get('securityResult')?.data as SecurityResult | null;
    const degradation = context.get('degradationResult')?.data as DegradationResult | null;
    const diffMetrics = context.get('diffResult')?.data as DiffMetrics | null;

    const components: Record<string, WeightedScore> = {
      static_analysis: {
        score:   this.calcStaticScore(lintData),
        weight:  weights.static_analysis,
        skipped: lintData.length === 0 && !context.get('lintResults')?.success,
      },
      complexity: {
        score:   this.calcComplexityScore(complexity, thresholds.max_complexity),
        weight:  weights.complexity,
        skipped: !complexity || complexity.status === 'skipped',
      },
      test_coverage: {
        score:   this.calcCoverageScore(testRun, thresholds.min_coverage),
        weight:  weights.test_coverage,
        skipped: !testRun || testRun.status === 'skipped',
      },
      security: {
        score:   this.calcSecurityScore(security),
        weight:  weights.security,
        skipped: !security || security.status === 'skipped',
      },
      degradation: {
        score:   this.calcDegradationScore(degradation),
        weight:  weights.degradation,
        skipped: !degradation || degradation.status === 'skipped',
      },
    };

    let totalWeight = 0;
    let weightedSum = 0;

    for (const comp of Object.values(components)) {
      if (!comp.skipped) {
        weightedSum += comp.score * comp.weight;
        totalWeight += comp.weight;
      }
    }

    const qScore = totalWeight > 0
      ? Math.round((weightedSum / totalWeight) * 10) / 10
      : 0;

    const breakdown: Record<string, number> = {};
    for (const [key, comp] of Object.entries(components)) {
      if (!comp.skipped) {
        breakdown[key] = Math.round(comp.score);
      }
    }

    const gatePassed = qScore >= thresholds.q_score;

    const normalizedFeatures = buildNormalizedFeatures({
      lintData,
      complexity,
      testRun,
      security,
      diff: diffMetrics,
      thresholds,
    });

    const result = makeResult(
      this.name,
      { qScore, gScore: null, gatePassed, breakdown },
      Date.now() - start,
    );
    (result as any).__normalizedFeatures = normalizedFeatures;
    return result;
  }

  private calcStaticScore(results: LintResult[]): number {
    if (results.length === 0) return 100;
    const totalErrors = results.reduce((s, r) => s + r.errorCount, 0);
    return Math.max(0, 100 - totalErrors * 5);
  }

  private calcComplexityScore(data: ComplexityResult | null, maxAllowed: number): number {
    if (!data || data.status === 'skipped') return 100;
    if (data.maxComplexity === 0) return 100;
    if (data.maxComplexity <= maxAllowed) return 100;
    const overshoot = data.maxComplexity - maxAllowed;
    return Math.max(0, 100 - overshoot * 5);
  }

  private calcCoverageScore(data: TestRunResult | null, minCoverage: number): number {
    if (!data || data.status === 'skipped' || data.status === 'error') return 0;
    if (data.testsRun === 0) return 0;

    let baseScore = 0;
    const coverage = data.coverage;
    const lines = coverage?.lines ?? coverage?.statements ?? 0;

    if (lines >= minCoverage) {
      baseScore = 100;
    } else {
      baseScore = Math.round((lines / minCoverage) * 100);
    }

    const passRate = (data.testsRun - data.failed) / data.testsRun;
    const finalScore = Math.round(baseScore * passRate);

    return Math.max(0, finalScore);
  }

  private calcSecurityScore(data: SecurityResult | null): number {
    if (!data || data.status === 'skipped') return 100;
    const penalty =
      data.auditCritical    * 20 +
      data.auditHigh        * 10 +
      data.auditModerate    *  5 +
      data.auditVulnerabilities * 2;
    return Math.max(0, 100 - penalty);
  }

  private calcDegradationScore(data: DegradationResult | null): number {
    if (!data || data.status === 'skipped' || data.status === 'error') return 100;
    return Math.max(0, Math.min(100, 100 - data.score));
  }
}