import type { QScoreHistoryPoint } from '../core/RunContext.js';
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
  CommitInfo,
  DetectedVersions,
  LLMReviewResult,
} from '../core/types.js';
export interface ReportHtmlData {
  isCiMode: boolean;
  commitShort: string;
  commitHash: string;
  branch: string;
  mode: string;
  commitAuthor: string;
  commitDate: string;
  commitInfo?: CommitInfo;
  startedAt: string;
  finishedAt: string;
  durationSec: string;
  scores: Scores | null;
  threshold: number;
  thresholdComplexity: number;
  thresholdCoverage: number;
  breakdownLabels: string[];
  breakdownValues: number[];
  progress: ProgressResult | null;
  qScoreHistory: QScoreHistoryPoint[];
  lintResults: LintResult[];
  lintSuccess: boolean;
  lintError?: string;
  totalErrors: number;
  totalWarnings: number;
  filesWithIssues: LintResult[];
  topIssueFiles: LintResult[];
  complexity: ComplexityResult | null;
  complexityErr?: string;
  testRun: TestRunResult | null;
  testRunErr?: string;
  security: SecurityResult | null;
  securityErr?: string;
  degradation: DegradationResult | null;
  diffMetrics: DiffMetrics | null;
  projectCtx: ProjectContext | null;
  detectedVersions: DetectedVersions;
  achievements: Achievement[];
  llmReview: LLMReviewResult | null;
  projectRoot?: string;
}