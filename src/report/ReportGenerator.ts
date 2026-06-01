import fs from 'fs';
import path from 'path';
import type { RunContext } from '../core/RunContext.js';
import type {
  Scores,
  Achievement,
  LintResult,
  ComplexityResult,
  TestRunResult,
  SecurityResult,
  DegradationResult,
  ProgressResult,
  DiffMetrics,
  ProjectContext,
  DetectedVersions,
  LLMReviewResult,
} from '../core/types.js';
import { buildReportHtml } from './buildReportHtml.js';
import { labelFor } from './reportUtils.js';
import type { ReportHtmlData } from './types.js';

export class ReportGenerator {
  async generate(context: RunContext, outputDir: string): Promise<string> {
    const lintResults = (context.get('lintResults')?.data ?? []) as LintResult[];

    let totalErrors = 0;
    let totalWarnings = 0;
    for (const r of lintResults) {
      totalErrors += r.errorCount;
      totalWarnings += r.warningCount;
    }

    const filesWithIssues = lintResults.filter(r => r.errorCount > 0 || r.warningCount > 0);
    const topIssueFiles = [...lintResults]
      .sort((a, b) => (b.errorCount + b.warningCount) - (a.errorCount + a.warningCount))
      .filter(r => r.errorCount + r.warningCount > 0);

    const projectCtx = context.get('projectContext')?.data as ProjectContext | null;
    const envDetected = context.get('detectedVersions') ?? {};
    const projDetected = projectCtx?.detectedVersions ?? {};
    const detectedVersions: DetectedVersions = { ...projDetected, ...envDetected };

    const finishedAt = new Date();
    const startedAt = context.get('startedAt');
    const scores = context.get('scores')?.data as Scores | null;
    const config = context.get('config');

    const reportData: ReportHtmlData = {
      isCiMode: context.get('mode') === 'ci',
      commitShort: (context.get('commitHash') || 'unknown').slice(0, 7),
      commitHash: context.get('commitHash') || 'unknown',
      branch: context.get('branch') || 'unknown',
      mode: context.get('mode'),
      commitAuthor: context.get('commitAuthor') || 'unknown',
      commitDate: context.get('commitDate') || '',
      commitInfo: context.get('commitInfo'),
      startedAt: startedAt.toLocaleString('ru-RU'),
      finishedAt: finishedAt.toLocaleString('ru-RU'),
      durationSec: ((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1),
      scores,
      threshold: config.thresholds.q_score,
      thresholdComplexity: config.thresholds.max_complexity,
      thresholdCoverage: config.thresholds.min_coverage,
      breakdownLabels: scores?.breakdown
        ? Object.keys(scores.breakdown).map(k => labelFor(k))
        : [],
      breakdownValues: scores?.breakdown ? Object.values(scores.breakdown) : [],
      progress: context.get('progressResult')?.data as ProgressResult | null,
      qScoreHistory: context.get('qScoreHistory') ?? [],
      lintResults,
      lintSuccess: context.get('lintResults')?.success ?? false,
      lintError: context.get('lintResults')?.error,
      totalErrors,
      totalWarnings,
      filesWithIssues,
      topIssueFiles,
      complexity: context.get('complexityResult')?.data as ComplexityResult | null,
      complexityErr: context.get('complexityResult')?.error,
      testRun: context.get('testRunResult')?.data as TestRunResult | null,
      testRunErr: context.get('testRunResult')?.error,
      security: context.get('securityResult')?.data as SecurityResult | null,
      securityErr: context.get('securityResult')?.error,
      degradation: context.get('degradationResult')?.data as DegradationResult | null,
      diffMetrics: context.get('diffResult')?.data as DiffMetrics | null,
      projectCtx,
      detectedVersions,
      achievements: (context.get('achievements')?.data ?? []) as Achievement[],
      llmReview: (context.get('llmReview')?.data ?? null) as LLMReviewResult | null,
    };

    const html = buildReportHtml(reportData);

    const fileName = `report-${Date.now()}.html`;
    const filePath = path.join(outputDir, fileName);
    fs.writeFileSync(filePath, html, 'utf8');
    return filePath;
  }
}
