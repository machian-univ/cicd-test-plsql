import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';

interface CheckRecord {
  commit_hash: string;
  commit_author?: string;
  commit_date: string;
  branch?: string;
  mode: string;
  q_score?: number | null;
  g_score?: number | null;
  gate_passed?: number;
  duration_sec?: number | null;
  stack_info?: string | null;
  env_versions?: string | null;
}

interface HistoryRecord {
  id: number;
  commit_hash: string;
  commit_author: string | null;
  commit_date: string;
  branch: string | null;
  mode: string;
  q_score: number | null;
  g_score: number | null;
  gate_passed: number;
  duration_sec: number | null;
  created_at: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS checks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  commit_hash   TEXT NOT NULL,
  commit_author TEXT,
  commit_date   TEXT NOT NULL,
  branch        TEXT,
  mode          TEXT NOT NULL DEFAULT 'full',
  q_score       REAL,
  g_score       REAL,
  gate_passed   INTEGER DEFAULT 0,
  duration_sec  REAL,
  stack_info    TEXT,
  env_versions  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS metrics (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id   INTEGER NOT NULL REFERENCES checks(id),
  agent      TEXT NOT NULL,
  score      REAL,
  raw_data   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS achievements (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id  INTEGER NOT NULL REFERENCES checks(id),
  author    TEXT NOT NULL,
  type      TEXT NOT NULL,
  earned_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Нормализованные признаки для ML-модели
CREATE TABLE IF NOT EXISTS normalized_features (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id                INTEGER NOT NULL REFERENCES checks(id),
  lint_errors_norm        REAL,
  lint_warnings_norm      REAL,
  max_complexity_norm     REAL,
  avg_complexity_norm     REAL,
  violation_rate_norm     REAL,
  total_loc               INTEGER,
  avg_file_loc            REAL,
  coverage_lines_norm     REAL,
  coverage_branches_norm  REAL,
  coverage_functions_norm REAL,
  test_pass_rate_norm     REAL,
  test_fail_rate_norm     REAL,
  critical_vuln_count     INTEGER,
  high_vuln_count         INTEGER,
  gitleaks_leak_count     INTEGER,
  loc_added               INTEGER,
  loc_removed             INTEGER,
  change_ratio            REAL,
  has_tests_changed       INTEGER,
  has_config_changed      INTEGER,
  author_experience       INTEGER,
  file_churn_avg          REAL,
  created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Требование 7: детальные данные git-diff для каждой проверки
CREATE TABLE IF NOT EXISTS diff_metrics (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id         INTEGER NOT NULL REFERENCES checks(id),
  loc_added        INTEGER DEFAULT 0,
  loc_removed      INTEGER DEFAULT 0,
  loc_net          INTEGER DEFAULT 0,
  files_changed    INTEGER DEFAULT 0,
  ts_files_changed INTEGER DEFAULT 0,
  js_files_changed INTEGER DEFAULT 0,
  vue_files_changed INTEGER DEFAULT 0,
  change_ratio     REAL DEFAULT 0,
  has_tests_changed INTEGER DEFAULT 0,
  has_config_changed INTEGER DEFAULT 0,
  base_ref         TEXT,
  changed_files    TEXT,
  author_experience INTEGER DEFAULT 0,
  file_churn_avg   REAL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Требование 7: детальные данные ESLint по файлам
CREATE TABLE IF NOT EXISTS lint_details (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id     INTEGER NOT NULL REFERENCES checks(id),
  file_path    TEXT NOT NULL,
  error_count  INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  messages     TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Требование 7: детальные данные тестов (упавшие тесты)
CREATE TABLE IF NOT EXISTS test_details (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id      INTEGER NOT NULL REFERENCES checks(id),
  suite_name    TEXT,
  test_name     TEXT NOT NULL,
  status        TEXT NOT NULL,
  error_message TEXT,
  duration_ms   REAL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Требование 7: детальные данные безопасности
CREATE TABLE IF NOT EXISTS security_details (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id     INTEGER NOT NULL REFERENCES checks(id),
  source       TEXT NOT NULL,
  severity     TEXT,
  package_name TEXT,
  title        TEXT,
  description  TEXT,
  file_path    TEXT,
  line         INTEGER,
  url          TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Требование 7: информация об окружении
CREATE TABLE IF NOT EXISTS environment_info (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id        INTEGER NOT NULL REFERENCES checks(id),
  node_version    TEXT,
  os_platform     TEXT,
  os_arch         TEXT,
  has_typescript  INTEGER DEFAULT 0,
  has_react       INTEGER DEFAULT 0,
  has_vue         INTEGER DEFAULT 0,
  has_next        INTEGER DEFAULT 0,
  has_nuxt        INTEGER DEFAULT 0,
  eslint_version  TEXT,
  typescript_version TEXT,
  test_runner     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export class Database {
  private db!: SqlJsDatabase;
  private dbPath: string;
  private ready: Promise<void>;

  constructor(outputDir: string) {
    this.dbPath = path.join(outputDir, 'pulsqual.db');
    this.ready = this.init(outputDir);
  }

  private async init(outputDir: string): Promise<void> {
    const SQL = await initSqlJs();
    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
    }
    // Применяем схему — каждый CREATE TABLE IF NOT EXISTS идемпотентен
    this.db.run(SCHEMA);
    this.persist();
  }

  private persist(): void {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  async saveCheck(record: CheckRecord): Promise<number> {
    await this.ready;

    this.db.run(
      `INSERT INTO checks (
        commit_hash, commit_author, commit_date, branch,
        mode, q_score, g_score, gate_passed,
        duration_sec, stack_info, env_versions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.commit_hash,
        record.commit_author ?? null,
        record.commit_date,
        record.branch ?? null,
        record.mode,
        record.q_score ?? null,
        record.g_score ?? null,
        record.gate_passed ?? 0,
        record.duration_sec ?? null,
        record.stack_info ?? null,
        record.env_versions ?? null,
      ]
    );

    const result = this.db.exec('SELECT last_insert_rowid() as id');
    const id = result[0]?.values[0]?.[0] as number ?? 0;
    this.persist();
    return id;
  }

  async saveNormalizedFeatures(
    checkId: number,
    features: import('../core/types.js').NormalizedFeatures
  ): Promise<void> {
    await this.ready;

    this.db.run(
      `INSERT INTO normalized_features (
        check_id,
        lint_errors_norm, lint_warnings_norm,
        max_complexity_norm, avg_complexity_norm, violation_rate_norm,
        total_loc, avg_file_loc,
        coverage_lines_norm, coverage_branches_norm, coverage_functions_norm,
        test_pass_rate_norm, test_fail_rate_norm,
        critical_vuln_count, high_vuln_count, gitleaks_leak_count,
        loc_added, loc_removed, change_ratio,
        has_tests_changed, has_config_changed,
        author_experience, file_churn_avg
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        checkId,
        features.lintErrorsNorm,
        features.lintWarningsNorm,
        features.maxComplexityNorm,
        features.avgComplexityNorm,
        features.violationRateNorm,
        features.totalLoc,
        features.avgFileLoc,
        features.coverageLinesNorm,
        features.coverageBranchesNorm,
        features.coverageFunctionsNorm,
        features.testPassRateNorm,
        features.testFailRateNorm,
        features.criticalVulnCount,
        features.highVulnCount,
        features.gitleaksLeakCount,
        features.locAdded,
        features.locRemoved,
        features.changeRatio,
        features.hasTestsChanged,
        features.hasConfigChanged,
        features.authorExperience,
        features.fileChurnAvg,
      ]
    );
    this.persist();
  }

  async saveDiffMetrics(
    checkId: number,
    diff: import('../core/types.js').DiffMetrics
  ): Promise<void> {
    await this.ready;

    this.db.run(
      `INSERT INTO diff_metrics (
        check_id, loc_added, loc_removed, loc_net,
        files_changed, ts_files_changed, js_files_changed, vue_files_changed,
        change_ratio, has_tests_changed, has_config_changed,
        base_ref, changed_files, author_experience, file_churn_avg
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        checkId,
        diff.locAdded,
        diff.locRemoved,
        diff.locNet,
        diff.filesChanged,
        diff.tsFilesChanged,
        diff.jsFilesChanged,
        diff.vueFilesChanged,
        diff.changeRatio,
        diff.hasTestsChanged ? 1 : 0,
        diff.hasConfigChanged ? 1 : 0,
        diff.baseRef ?? null,
        JSON.stringify(diff.changedFiles),
        diff.authorExperience,
        diff.fileChurnAvg,
      ]
    );
    this.persist();
  }

  async saveLintDetails(
    checkId: number,
    lintResults: import('../core/types.js').LintResult[]
  ): Promise<void> {
    await this.ready;

    for (const file of lintResults) {
      this.db.run(
        `INSERT INTO lint_details (check_id, file_path, error_count, warning_count, messages)
         VALUES (?, ?, ?, ?, ?)`,
        [
          checkId,
          file.filePath,
          file.errorCount,
          file.warningCount,
          JSON.stringify(file.messages),
        ]
      );
    }
    this.persist();
  }

  async saveTestDetails(
    checkId: number,
    testRun: import('../core/types.js').TestRunResult
  ): Promise<void> {
    await this.ready;

    if (testRun.status !== 'ok') return;

    const failedTests = testRun.failedTests ?? [];
    for (const t of failedTests) {
      this.db.run(
        `INSERT INTO test_details (check_id, suite_name, test_name, status, error_message, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          checkId,
          t.suiteName,
          t.testName,
          'failed',
          t.errorMessage,
          t.duration ?? null,
        ]
      );
    }
    this.persist();
  }

  async saveSecurityDetails(
    checkId: number,
    security: import('../core/types.js').SecurityResult
  ): Promise<void> {
    await this.ready;

    // npm audit advisory
    for (const adv of security.auditAdvisories ?? []) {
      this.db.run(
        `INSERT INTO security_details (check_id, source, severity, package_name, title, url)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [checkId, 'npm-audit', adv.severity, adv.packageName, adv.title, adv.url ?? null]
      );
    }

    for (const leak of security.gitleaksLeaks ?? []) {
      this.db.run(
        `INSERT INTO security_details (check_id, source, description, file_path, line)
         VALUES (?, ?, ?, ?, ?)`,
        [checkId, 'gitleaks', leak.description, leak.file, leak.line ?? null]
      );
    }
    this.persist();
  }

  async saveEnvironmentInfo(
    checkId: number,
    project: import('../core/types.js').ProjectContext,
    detectedVersions: import('../core/types.js').DetectedVersions
  ): Promise<void> {
    await this.ready;

    this.db.run(
      `INSERT INTO environment_info (
        check_id, node_version, os_platform, os_arch,
        has_typescript, has_react, has_vue, has_next, has_nuxt,
        eslint_version, typescript_version, test_runner
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        checkId,
        detectedVersions.node?.raw ?? process.version,
        process.platform,
        process.arch,
        project.hasTypeScript ? 1 : 0,
        project.hasReact ? 1 : 0,
        project.hasVue ? 1 : 0,
        project.hasNext ? 1 : 0,
        project.hasNuxt ? 1 : 0,
        detectedVersions.eslint?.raw ?? null,
        detectedVersions.typescript?.raw ?? null,
        project.testRunner,
      ]
    );
    this.persist();
  }

  async saveMetric(
    checkId: number,
    agent: string,
    score: unknown,
    rawData: unknown
  ): Promise<void> {
    await this.ready;

    this.db.run(
      `INSERT INTO metrics (check_id, agent, score, raw_data) VALUES (?, ?, ?, ?)`,
      [checkId, agent, score as number ?? null, JSON.stringify(rawData)]
    );
    this.persist();
  }

  async saveAchievement(
    checkId: number,
    author: string,
    type: string
  ): Promise<void> {
    await this.ready;

    this.db.run(
      `INSERT INTO achievements (check_id, author, type) VALUES (?, ?, ?)`,
      [checkId, author, type]
    );
    this.persist();
  }

  async getHistory(limit: number): Promise<HistoryRecord[]> {
    await this.ready;

    const result = this.db.exec(
      `SELECT id, commit_hash, commit_author, commit_date, branch,
              mode, q_score, g_score, gate_passed, duration_sec, created_at
       FROM checks
       ORDER BY created_at DESC
       LIMIT ?`,
      [limit]
    );

    if (!result[0]) return [];

    const cols = result[0].columns;
    return result[0].values.map(row => {
      const rec: Record<string, unknown> = {};
      cols.forEach((col, i) => { rec[col] = row[i]; });
      return rec as unknown as HistoryRecord;
    });
  }

  async getCheckById(checkId: number): Promise<HistoryRecord | null> {
    await this.ready;

    const result = this.db.exec(
      `SELECT id, commit_hash, commit_author, commit_date, branch,
              mode, q_score, g_score, gate_passed, duration_sec, created_at
       FROM checks WHERE id = ?`,
      [checkId]
    );

    if (!result[0] || result[0].values.length === 0) return null;

    const cols = result[0].columns;
    const row = result[0].values[0];
    const rec: Record<string, unknown> = {};
    cols.forEach((col, i) => { rec[col] = row[i]; });
    return rec as unknown as HistoryRecord;
  }

  async getMetricsForCheck(checkId: number): Promise<Array<{ agent: string; score: number | null; raw_data: string }>> {
    await this.ready;

    const result = this.db.exec(
      `SELECT agent, score, raw_data FROM metrics WHERE check_id = ?`,
      [checkId]
    );

    if (!result[0]) return [];

    return result[0].values.map(row => ({
      agent:    row[0] as string,
      score:    row[1] as number | null,
      raw_data: row[2] as string,
    }));
  }

  async getDiffMetricsForCheck(checkId: number): Promise<Record<string, unknown> | null> {
    await this.ready;

    const result = this.db.exec(
      `SELECT * FROM diff_metrics WHERE check_id = ? LIMIT 1`,
      [checkId]
    );

    if (!result[0] || result[0].values.length === 0) return null;

    const cols = result[0].columns;
    const row = result[0].values[0];
    const rec: Record<string, unknown> = {};
    cols.forEach((col, i) => { rec[col] = row[i]; });
    return rec;
  }

  async getLintDetailsForCheck(checkId: number): Promise<Array<{ file_path: string; error_count: number; warning_count: number; messages: string }>> {
    await this.ready;

    const result = this.db.exec(
      `SELECT file_path, error_count, warning_count, messages
       FROM lint_details WHERE check_id = ?
       ORDER BY error_count DESC`,
      [checkId]
    );

    if (!result[0]) return [];

    return result[0].values.map(row => ({
      file_path:     row[0] as string,
      error_count:   row[1] as number,
      warning_count: row[2] as number,
      messages:      row[3] as string,
    }));
  }

  async getRecentMetrics(
    agentName: string,
    limit: number
  ): Promise<Array<{ q_score: number | null; raw_data: string; created_at: string }>> {
    await this.ready;

    const result = this.db.exec(
      `SELECT c.q_score, m.raw_data, c.created_at
       FROM checks c
       JOIN metrics m ON m.check_id = c.id
       WHERE m.agent = ?
       ORDER BY c.created_at DESC
       LIMIT ?`,
      [agentName, limit]
    );

    if (!result[0]) return [];

    return result[0].values.map(row => ({
      q_score:    row[0] as number | null,
      raw_data:   row[1] as string,
      created_at: row[2] as string,
    }));
  }

  /**
   * Q-Score последней сохранённой проверки.
   * Вызывается до записи текущего прогона — в БД ещё нет текущей проверки.
   */
  async getPreviousQScore(): Promise<number | null> {
    await this.ready;

    const result = this.db.exec(
      `SELECT q_score
       FROM checks
       WHERE mode IN ('full', 'ci')
         AND q_score IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 1`,
    );

    if (!result[0] || result[0].values.length === 0) return null;

    const value = result[0].values[0]?.[0] as number | null;
    if (value === null || value === undefined) return null;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }


  async getQScoreHistory(limit: number = 20): Promise<Array<{ q_score: number | null; created_at: string; commit_hash: string; branch: string | null }>> {
    await this.ready;

    const result = this.db.exec(
      `SELECT q_score, created_at, commit_hash, branch
       FROM checks
       WHERE mode IN ('full', 'ci')
       ORDER BY created_at DESC
       LIMIT ?`,
      [limit]
    );

    if (!result[0]) return [];

    return result[0].values.map(row => ({
      q_score:     row[0] as number | null,
      created_at:  row[1] as string,
      commit_hash: (row[2] as string ?? '').slice(0, 7),
      branch:      row[3] as string | null,
    }));
  }

  async getChecksCount(): Promise<number> {
    await this.ready;

    const result = this.db.exec(`SELECT COUNT(*) as cnt FROM checks`);

    if (!result[0] || result[0].values.length === 0) return 0;

    const cnt = result[0].values[0]?.[0] as number;
    return Number.isFinite(cnt) ? cnt : 0;
  }

  async getCheckStatsForBranch(branch: string | null): Promise<{
    total: number;
    passed: number;
    failed: number;
  }> {
    await this.ready;

    if (!branch) {
      const total = await this.getChecksCount();
      return { total, passed: 0, failed: 0 };
    }

    const result = this.db.exec(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN gate_passed = 1 THEN 1 ELSE 0 END) as passed
       FROM checks
       WHERE branch = ? AND mode IN ('full', 'ci')`,
      [branch],
    );

    if (!result[0] || result[0].values.length === 0) {
      return { total: 0, passed: 0, failed: 0 };
    }

    const total = Number(result[0].values[0]?.[0] ?? 0);
    const passed = Number(result[0].values[0]?.[1] ?? 0);
    return {
      total: Number.isFinite(total) ? total : 0,
      passed: Number.isFinite(passed) ? passed : 0,
      failed: Math.max(0, (Number.isFinite(total) ? total : 0) - (Number.isFinite(passed) ? passed : 0)),
    };
  }

  close(): void {
    this.persist();
  }
}