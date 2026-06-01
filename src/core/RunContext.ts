import type {
  PulsqualConfig, ProjectContext, EnvCheckResult,
  LintResult, ComplexityResult, TestRunResult,
  SecurityResult, DegradationResult, ProgressResult,
  Achievement, LLMReviewResult, Scores, AgentResult,
  AnalysisSharedData, DiffMetrics, NormalizedFeatures,
  VersionWarning, DetectedVersions, CommitInfo,
} from './types.js';

export interface QScoreHistoryPoint {
  qScore: number | null;
  createdAt: string;
  commitHash: string;
  branch: string | null;
}

export interface RunContextData {
  readonly config: PulsqualConfig;
  readonly projectRoot: string;
  readonly startedAt: Date;
  readonly mode: string;
  readonly commitHash: string;
  readonly commitAuthor: string;
  readonly commitDate: string;
  readonly branch: string;
  readonly gitAvailable?: boolean;

  projectContext?: AgentResult<ProjectContext>;
  envCheck?: AgentResult<EnvCheckResult>;
  diffResult?: AgentResult<DiffMetrics>;
  lintResults?: AgentResult<LintResult[]>;
  complexityResult?: AgentResult<ComplexityResult>;
  testRunResult?: AgentResult<TestRunResult>;
  securityResult?: AgentResult<SecurityResult>;
  degradationResult?: AgentResult<DegradationResult>;
  progressResult?: AgentResult<ProgressResult>;
  achievements?: AgentResult<Achievement[]>;
  llmReview?: AgentResult<LLMReviewResult>;
  scores?: AgentResult<Scores>;
  reportResult?: AgentResult<string>;

  normalizedFeatures?: NormalizedFeatures;
  analysisShared?: AnalysisSharedData;

  versionWarnings?: VersionWarning[];
  detectedVersions?: DetectedVersions;

  commitInfo?: CommitInfo;

  qScoreHistory?: QScoreHistoryPoint[];
}

export class RunContext {
  private readonly data: RunContextData;

  constructor(data: RunContextData) {
    this.data = data;
  }

  get<K extends keyof RunContextData>(key: K): RunContextData[K] {
    return this.data[key];
  }

  with(updates: Partial<RunContextData>): RunContext {
    return new RunContext({ ...this.data, ...updates });
  }
}