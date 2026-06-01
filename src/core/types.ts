export type CheckMode = 'full' | 'quick' | 'ci';
export type LLMProviderName = 'ollama' | 'gigachat';
export type CIPlatform = 'github' | 'gitlab' | 'jenkins';
export type CITrigger = 'pr' | 'push' | 'both';
export type TestRunner = 'jest' | 'vitest' | 'mocha' | 'unknown';

// Версионная информация

export interface VersionInfo {
  raw: string;
  major: number;
  minor: number;
  patch: number;
  valid: boolean;
}

export interface DetectedVersions {
  node?: VersionInfo;
  typescript?: VersionInfo;
  nuxt?: VersionInfo;
  next?: VersionInfo;
  nestjs?: VersionInfo;
  gitleaks?: VersionInfo;
  eslint?: VersionInfo;
  vitest?: VersionInfo;
  jest?: VersionInfo;
  react?: VersionInfo;
  vue?: VersionInfo;
  sonarjs?: VersionInfo;
  vitestCoverageV8?: VersionInfo;
  npm?: VersionInfo;
  git?: VersionInfo;
}

// Центральный реестр стека технологий 

export interface StackToolSpec {
  packageName: string;
  displayName: string;
  minVersion: { major: number; minor: number; patch: number } | null;
  recommendedVersion: { major: number; minor?: number; patch?: number } | null;
  belowMinMessage: string | null;
  belowRecommendedMessage: string | null;
}

export const STACK_REGISTRY: Record<string, StackToolSpec> = {
  node: {
    packageName: 'node',
    displayName: 'Node.js',
    minVersion: { major: 18, minor: 18, patch: 0 },
    recommendedVersion: { major: 20 },
    belowMinMessage:
      'Node.js {version} не поддерживается. Минимальная версия: 18.18.0. ' +
      'Установите Node.js 20 LTS: https://nodejs.org/',
    belowRecommendedMessage:
      'Node.js {version} работает, но рекомендуется обновиться до Node.js 20 LTS.',
  },
  typescript: {
    packageName: 'typescript',
    displayName: 'TypeScript',
    minVersion: null,
    recommendedVersion: { major: 5 },
    belowMinMessage: null,
    belowRecommendedMessage:
      'TypeScript {version} устарел. Рекомендуется TypeScript 5.x.',
  },
  eslint: {
    packageName: 'eslint',
    displayName: 'ESLint',
    minVersion: null,
    recommendedVersion: { major: 9 },
    belowMinMessage: null,
    belowRecommendedMessage:
      'ESLint {version} установлен. Рекомендуется версия 9 или 8.57+ для поддержки Flat Config (eslint.config.mjs). ' +
      'Если версия ниже 8.57, создайте конфигурацию самостоятельно.',
  },
  react: {
    packageName: 'react',
    displayName: 'React',
    minVersion: { major: 18, minor: 0, patch: 0 },
    recommendedVersion: { major: 18, minor: 2 },
    belowMinMessage:
      'React {version} не поддерживается Pulsqual. Минимальная версия: 18.0.0. ' +
      'Рекомендуется 18.2.0 и выше. Инициализация невозможна.',
    belowRecommendedMessage:
      'React {version} работает, но рекомендуется 18.2.0 и выше для полной совместимости.',
  },
  next: {
    packageName: 'next',
    displayName: 'Next.js',
    minVersion: { major: 14, minor: 2, patch: 0 },
    recommendedVersion: { major: 15 },
    belowMinMessage:
      'Next.js {version} не поддерживается Pulsqual. Минимальная версия: 14.2.0. ' +
      'Рекомендуется 15.x и выше. Инициализация невозможна.',
    belowRecommendedMessage:
      'Next.js {version} работает, но рекомендуется обновиться до 15.x для полной совместимости.',
  },
  vue: {
    packageName: 'vue',
    displayName: 'Vue',
    minVersion: { major: 2, minor: 0, patch: 0 },
    recommendedVersion: { major: 3, minor: 4 },
    belowMinMessage:
      'Vue {version} не поддерживается Pulsqual. Минимальная версия: 2.0.0. ' +
      'Рекомендуется 3.4 и выше. Инициализация невозможна.',
    belowRecommendedMessage:
      'Vue {version} установлен. Рекомендуется Vue 3.4 и выше для корректной работы Pulsqual.',
  },
  nuxt: {
    packageName: 'nuxt',
    displayName: 'Nuxt',
    minVersion: { major: 3, minor: 0, patch: 0 },
    recommendedVersion: { major: 3 },
    belowMinMessage:
      'Nuxt {version} не поддерживается. Минимальная версия: 3.0.0.',
    belowRecommendedMessage: null,
  },
  vitest: {
    packageName: 'vitest',
    displayName: 'Vitest',
    minVersion: { major: 1, minor: 0, patch: 0 },
    recommendedVersion: { major: 1 },
    belowMinMessage:
      'Vitest {version} не поддерживается Pulsqual. Минимальная версия: 1.0.0. ' +
      'Инициализация невозможна.',
    belowRecommendedMessage: null,
  },
  jest: {
    packageName: 'jest',
    displayName: 'Jest',
    minVersion: null,
    recommendedVersion: null,
    belowMinMessage: null,
    belowRecommendedMessage: null,
  },
  sonarjs: {
    packageName: 'eslint-plugin-sonarjs',
    displayName: 'eslint-plugin-sonarjs',
    minVersion: null,
    recommendedVersion: null,
    belowMinMessage: null,
    belowRecommendedMessage:
      'Рекомендуется eslint-plugin-sonarjs версии 1.0.0 и выше для стабильной работы Pulsqual.',
  },
  gitleaks: {
    packageName: 'gitleaks',
    displayName: 'gitleaks',
    minVersion: { major: 8, minor: 0, patch: 0 },
    recommendedVersion: { major: 8 },
    belowMinMessage:
      'gitleaks {version} не поддерживается. Требуется версия 8.x.',
    belowRecommendedMessage: null,
  },
};

// Предупреждения валидации версий

export type VersionWarningLevel = 'info' | 'warning' | 'critical' | 'error';

export interface VersionWarning {
  tool: string;
  level: VersionWarningLevel;
  message: string;
  blocking: boolean;
}

// Git: информация о коммитах

export interface CommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
  /** Только для CI-режима: список всех коммитов в PR */
  prCommits?: CommitInfo[];
}

// Конфигурация 

export interface PulsqualConfig {
  version: number;
  paths: {
    source: string;
    tests: string;
    output: string;
  };
  mode: CheckMode;
  thresholds: {
    q_score: number;
    max_complexity: number;
    min_coverage: number;
  };
  weights: {
    static_analysis: number;
    complexity: number;
    security: number;
    test_coverage: number;
    degradation: number;
  };
  llm: {
    enabled: boolean;
    provider: LLMProviderName;
    model: string;
    endpoint: string;
    api_key_env?: string;
    max_tokens: number;
  };
  stackSnapshot?: StackSnapshot;
}

export interface StackSnapshot {
  testRunner: TestRunner;
  hasTypeScript: boolean;
  hasEslint: boolean;
  hasReact: boolean;
  hasVue: boolean;
  hasNext: boolean;
  hasNuxt: boolean;
  capturedAt: string;
}

// Контекст проекта

export interface ProjectContext {
  rootPath: string;
  hasGit: boolean;
  hasTypeScript: boolean;
  hasReact: boolean;
  hasVue: boolean;
  hasNuxt: boolean;
  hasNext: boolean;
  testRunner: TestRunner;
  hasEslint: boolean;
  hasTsConfig: boolean;
  hasJestConfig: boolean;
  hasVitestConfig: boolean;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  stagedFiles?: string[];
  stackDrift?: StackDriftResult;
  requiresDecorators: boolean;
  eslintConfigExists: boolean;
  eslintConfigPath?: string;
  detectedVersions: DetectedVersions;
  versionWarnings: VersionWarning[];
}

// Stack Drift 

export interface StackDriftResult {
  hasDrift: boolean;
  drifts: StackDriftItem[];
}

export interface StackDriftItem {
  field: string;
  expected: string;
  actual: string;
}

// EnvCheck 

export interface EnvCheckResult {
  missingRequired: string[];
  missingOptional: string[];
  present: string[];
  warnings: string[];
  gitAvailable: boolean;
  stackDrift?: StackDriftResult;
  versionWarnings: VersionWarning[];
  detectedVersions: DetectedVersions;
}

//Lint 

export interface LintMessage {
  ruleId: string | null;
  message: string;
  line: number;
  column?: number;
  endLine?: number;
  severity?: 1 | 2;
  source: 'eslint' | 'tsc';
}

export interface LintResult {
  filePath: string;
  errorCount: number;
  warningCount: number;
  messages: LintMessage[];
  eslintMessages: LintMessage[];
  tscMessages: LintMessage[];
}

//  Coverage 

export interface CoverageResult {
  lines: number | null;
  branches: number | null;
  functions: number | null;
  statements: number | null;
  status: 'ok' | 'skipped' | 'error';
}

// Complexity

export interface ComplexityViolation {
  file: string;
  function: string;
  complexity: number;
  line?: number;
  functionLoc?: number;
}

export interface FileLoc {
  filePath: string;
  totalLines: number;
  avgFunctionLoc?: number;
}

export interface ComplexityResult {
  maxComplexity: number;
  averageComplexity: number;
  violations: ComplexityViolation[];
  complexityType: 'cognitive' | 'cyclomatic' | 'unknown';
  status: 'ok' | 'skipped' | 'error';
  errorMessage?: string;
  skipReason?: 'no_plugin_or_rule' | 'below_threshold';
  fileLocs: FileLoc[];
  totalLoc: number;
  avgFileLoc: number;
}

//Security 

export type SecurityUnavailableReason = 'not_installed' | 'execution_error' | 'config_error';

export interface SecurityResult {
  auditVulnerabilities: number;
  auditCritical: number;
  auditHigh: number;
  auditModerate: number;
  auditLow: number;
  gitleaksFound: number;
  gitleaksAvailable: boolean;
  gitleaksUnavailableReason?: SecurityUnavailableReason;
  gitleaksError?: string;
  auditAdvisories?: AuditAdvisory[];
  gitleaksLeaks?: GitleaksLeak[];
  status: 'ok' | 'skipped' | 'error';
  errorMessage?: string;
}

export interface AuditAdvisory {
  id: number | string;
  title: string;
  severity: 'critical' | 'high' | 'moderate' | 'low' | 'info';
  packageName: string;
  url?: string;
}

export interface GitleaksLeak {
  description: string;
  file: string;
  line?: number;
  ruleId?: string;
}

// Tests 

export type TestRunResult =
  | TestRunResultOk
  | TestRunResultSkipped
  | TestRunResultError;

export interface TestRunResultBase {
  testsRun: number;
  passed: number;
  failed: number;
  skipped?: number;
  failedTests?: FailedTestDetail[];
  rawReport?: TestRunnerReport | null;
}

export interface TestRunResultOk extends TestRunResultBase {
  status: 'ok';
  coverage: CoverageResult | null;
}

export interface TestRunResultSkipped {
  status: 'skipped';
  testsRun: 0;
  passed: 0;
  failed: 0;
  skipped?: 0;
  errorMessage: string;
}

export interface TestRunResultError extends TestRunResultBase {
  status: 'error';
  coverage: null;
  errorMessage: string;
}

export interface FailedTestDetail {
  suiteName: string;
  testName: string;
  errorMessage: string;
  duration?: number;
}

export interface TestRunnerReport {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests?: number;
  numSkippedTests?: number;
  numTodoTests?: number;
  testResults?: TestSuiteResult[];
}

export interface TestSuiteResult {
  testFilePath: string;
  status: 'passed' | 'failed';
  assertionResults?: AssertionResult[];
}

export interface AssertionResult {
  fullName: string;
  ancestorTitles: string[];
  title: string;
  status: 'passed' | 'failed' | 'pending' | 'skipped' | 'todo';
  failureMessages?: string[];
  duration?: number;
}

// Degradation 

/** Объяснение одного фактора влияния на прогноз модели */
export interface DegradationFactor {
  factor: string;
  value: string;
  impact: 'positive' | 'negative' | 'neutral';
  description: string;
}

export interface DegradationResult {
  /** Выходное значение модели train_target ∈ [0, 1]: 1 = стабильно, 0 = деградация */
  score: number;
  /** Классификация прогноза */
  prediction: 'stable' | 'degrading' | 'unknown';
  /** Уверенность модели ∈ [0, 1] */
  confidence: number;
  status: 'ok' | 'skipped' | 'error';
  errorMessage?: string;
  /** Путь к использованной модели (для отображения в отчёте) */
  modelPath?: string;
  /** Объяснение факторов влияния на прогноз */
  factors?: DegradationFactor[];
  /** Сырое значение train_target из модели */
  rawScore?: number;
}

// Diff

export interface DiffMetrics {
  locAdded: number;
  locRemoved: number;
  locNet: number;
  filesChanged: number;
  tsFilesChanged: number;
  jsFilesChanged: number;
  vueFilesChanged: number;
  changeRatio: number;
  hasTestsChanged: boolean;
  hasConfigChanged: boolean;
  hasTs: boolean;
  authorExperience: number;
  fileChurnAvg: number;
  changedFiles: string[];
  baseRef: string;
  /** Сообщения коммитов для отчёта */
  commitMessages?: string[];
  /** Для CI: все коммиты PR */
  prCommits?: CommitInfo[];
  status: 'ok' | 'skipped' | 'error';
  errorMessage?: string;
}

// Progress / Achievements

export interface ProgressResult {
  previousQScore: number | null;
  delta: number | null;
  trend: 'up' | 'down' | 'stable' | 'unknown';
  checksCount: number;
}

export interface Achievement {
  type: string;
  label: string;
  description: string;
}

export interface LLMReviewResult {
  review: string;
  recommendations: string[];
  status: 'ok' | 'skipped' | 'error';
  errorMessage?: string;
}

export interface Scores {
  qScore: number;
  gScore: number | null;
  gatePassed: boolean;
  breakdown: Record<string, number>;
}

// Agent 

export interface AgentResult<T> {
  agentName: string;
  success: boolean;
  data: T | null;
  error?: string;
  durationMs: number;
}

// Shared 

export interface AnalysisSharedData {
  eslintComplexityMessages?: EslintComplexityMessage[];
  coverageSummaryPath?: string;
  tscErrors?: TscError[];
  stagedFiles?: string[];
  diffMetrics?: DiffMetrics;
}

export interface EslintComplexityMessage {
  filePath: string;
  functionName: string;
  complexity: number;
  line: number;
  ruleId: string;
}

export interface TscError {
  file: string;
  line: number;
  message: string;
  code: number;
}

// NormalizedFeatures 

export interface NormalizedFeatures {
  lintErrorsNorm: number;
  lintWarningsNorm: number;
  maxComplexityNorm: number;
  avgComplexityNorm: number;
  violationRateNorm: number;
  totalLoc: number;
  avgFileLoc: number;
  coverageLinesNorm: number;
  coverageBranchesNorm: number;
  coverageFunctionsNorm: number;
  testPassRateNorm: number;
  testFailRateNorm: number;
  criticalVulnCount: number;
  highVulnCount: number;
  gitleaksLeakCount: number;
  locAdded: number;
  locRemoved: number;
  changeRatio: number;
  hasTestsChanged: number;
  hasConfigChanged: number;
  authorExperience: number;
  fileChurnAvg: number;
}

// Mode descriptions

export interface ModeDescription {
  mode: CheckMode;
  title: string;
  description: string;
  scope: string;
  savesToDb: boolean;
  generatesReport: boolean;
}

export const MODE_DESCRIPTIONS: Record<CheckMode, ModeDescription> = {
  quick: {
    mode: 'quick',
    title: 'Quick Check',
    description: 'Быстрая локальная проверка staged-файлов.',
    scope: 'Только Git staged-файлы (git diff --cached)',
    savesToDb: false,
    generatesReport: false,
  },
  ci: {
    mode: 'ci',
    title: 'CI Check',
    description: 'Полная проверка в CI-пайплайне. Запускается автоматически при Pull Request.',
    scope: 'Весь исполняемый код и тесты относительно origin/main',
    savesToDb: true,
    generatesReport: true,
  },
  full: {
    mode: 'full',
    title: 'Full Check',
    description: 'Полная локальная проверка. Генерирует отчёт и сохраняет результат в базу данных.',
    scope: 'Весь исполняемый код и тесты относительно origin/main (или HEAD если находитесь в ветке main)',
    savesToDb: true,
    generatesReport: true,
  },
};

export const DEFAULT_CONFIG: PulsqualConfig = {
  version: 0.1,
  paths: {
    source: 'src',
    tests: 'tests',
    output: '.pulsqual',
  },
  mode: 'full',
  thresholds: {
    q_score: 70,
    max_complexity: 15,
    min_coverage: 60,
  },
  weights: {
    static_analysis: 0.30,
    complexity: 0.20,
    security: 0.15,
    test_coverage: 0.25,
    degradation: 0.10,
  },
  llm: {
    enabled: false,
    provider: 'ollama',
    model: 'qwen2.5-coder:7b',
    endpoint: 'http://localhost:11434',
    max_tokens: 1024,
  },
};