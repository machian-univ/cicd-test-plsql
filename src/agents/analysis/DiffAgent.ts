import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { Agent } from '../base/Agent.js';
import { makeResult } from '../base/Agent.js';
import type { RunContext } from '../../core/RunContext.js';
import type { DiffMetrics, AgentResult, CommitInfo } from '../../core/types.js';
import { logger } from '../../utils/logger.js';
import { git } from '../../utils/git.js';

const TS_EXTS  = new Set(['.ts', '.tsx', '.mts', '.cts']);
const JS_EXTS  = new Set(['.js', '.jsx', '.mjs', '.cjs']);
const VUE_EXTS = new Set(['.vue']);

const TEST_PATTERNS = [
  /\.spec\./i, /\.test\./i, /__tests__\//i, /\.e2e\./i,
];

const CONFIG_PATTERNS = [
  /tsconfig/i, /eslintrc/i, /eslint\.config/i, /package\.json$/,
  /vite\.config/i, /jest\.config/i, /vitest\.config/i, /babel\.config/i,
  /webpack\.config/i, /\.babelrc/, /\.eslintignore$/,
];

export class DiffAgent implements Agent<DiffMetrics> {
  readonly name = 'DiffAgent';

  async run(context: RunContext): Promise<AgentResult<DiffMetrics>> {
    const start = Date.now();
    const projectRoot = context.get('projectRoot');
    const mode = context.get('mode');
    const commitHash = context.get('commitHash');

    try {
      const baseRef = this.resolveBaseRef(mode, projectRoot);

      if (!baseRef) {
        return makeResult(
          this.name,
          this.emptyMetrics('Не удалось определить базовую точку для diff'),
          Date.now() - start
        );
      }

      const diffArgs = mode === 'quick'
        ? ['diff', '--cached', baseRef, '--numstat']
        : ['diff', baseRef, '--numstat'];

      const nameOnlyArgs = mode === 'quick'
        ? ['diff', '--cached', baseRef, '--name-only']
        : ['diff', baseRef, '--name-only'];

      const numstatOutput = this.tryExecFile('git', diffArgs, projectRoot, '');
      const nameOnlyOutput = this.tryExecFile('git', nameOnlyArgs, projectRoot, '');

      if (!numstatOutput && !nameOnlyOutput) {
        logger.verbose('DiffAgent: нет изменений в diff');
        return makeResult(this.name, this.emptyMetrics('Нет изменений'), Date.now() - start);
      }

      const numstatMetrics = this.parseNumstat(numstatOutput);
      const changedFiles = this.parseNameOnly(nameOnlyOutput, projectRoot);

      const tsFilesChanged  = changedFiles.filter(f => TS_EXTS.has(path.extname(f))).length;
      const jsFilesChanged  = changedFiles.filter(f => JS_EXTS.has(path.extname(f))).length;
      const vueFilesChanged = changedFiles.filter(f => VUE_EXTS.has(path.extname(f))).length;

      const hasTestsChanged  = changedFiles.some(f => TEST_PATTERNS.some(p => p.test(f)));
      const hasConfigChanged = changedFiles.some(f => CONFIG_PATTERNS.some(p => p.test(f)));

      const hasTs = fs.existsSync(path.join(projectRoot, 'tsconfig.json'));

      const { locAdded, locRemoved } = numstatMetrics;
      const changeRatio = locRemoved / (locAdded + locRemoved + 1);

      const commitAuthor = context.get('commitAuthor') ?? 'unknown';
      const authorExperience = this.getAuthorExperience(
        projectRoot,
        commitAuthor,
        mode !== 'quick' ? commitHash : undefined
      );

      const fileChurnAvg = this.getFileChurnAvg(projectRoot, changedFiles);

      // Собираем сообщения коммитов
      let commitMessages: string[] = [];
      let prCommits: CommitInfo[] | undefined;

      if (mode === 'ci') {
        // CI: получаем все коммиты PR
        prCommits = git.getPrCommits(projectRoot, baseRef);
        commitMessages = prCommits.map(c => c.message).filter(Boolean);
        logger.verbose(`DiffAgent: найдено ${prCommits.length} коммитов в PR`);
      } else if (mode !== 'quick') {
        // full: сообщение HEAD-коммита
        const headMsg = git.getCommitMessage(projectRoot);
        if (headMsg) commitMessages = [headMsg];
      }

      const metrics: DiffMetrics = {
        locAdded,
        locRemoved,
        locNet:         locAdded - locRemoved,
        filesChanged:   changedFiles.length,
        tsFilesChanged,
        jsFilesChanged,
        vueFilesChanged,
        changeRatio,
        hasTestsChanged,
        hasConfigChanged,
        hasTs,
        authorExperience,
        fileChurnAvg,
        changedFiles,
        baseRef,
        commitMessages,
        prCommits,
        status: 'ok',
      };

      return makeResult(this.name, metrics, Date.now() - start);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.warn(`DiffAgent: ${errorMessage}`);
      return makeResult(this.name, this.emptyMetrics(errorMessage), Date.now() - start);
    }
  }

  private resolveBaseRef(mode: string, projectRoot: string): string | null {
    if (mode === 'quick') {
      return 'HEAD';
    }

    // В CI проверяем переменные окружения GitHub Actions
    if (mode === 'ci') {
      const ghBase = process.env['GITHUB_BASE_REF'];
      if (ghBase) {
        const originBase = `origin/${ghBase}`;
        const result = this.tryExecFile('git', ['rev-parse', '--verify', originBase], projectRoot, '');
        if (result.trim()) {
          logger.verbose(`DiffAgent: CI базовая ветка из GITHUB_BASE_REF: ${originBase}`);
          return originBase;
        }
      }
    }

    const candidates = ['origin/main', 'origin/master', 'main', 'master'];
    for (const branch of candidates) {
      const result = this.tryExecFile(
        'git', ['rev-parse', '--verify', branch],
        projectRoot, ''
      );
      if (result.trim()) return branch;
    }

    const firstCommit = this.tryExecFile(
      'git', ['rev-list', '--max-parents=0', 'HEAD'],
      projectRoot, ''
    ).trim();

    if (firstCommit) {
      logger.verbose(`DiffAgent: удалённый репозиторий не найден, используем первый коммит: ${firstCommit}`);
      return firstCommit;
    }

    return null;
  }

  private parseNumstat(output: string): { locAdded: number; locRemoved: number } {
    let locAdded = 0;
    let locRemoved = 0;

    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split('\t');
      if (parts.length < 2) continue;
      const added   = parseInt(parts[0], 10);
      const removed = parseInt(parts[1], 10);
      if (Number.isFinite(added))   locAdded   += added;
      if (Number.isFinite(removed)) locRemoved += removed;
    }

    return { locAdded, locRemoved };
  }

  private parseNameOnly(output: string, projectRoot: string): string[] {
    return output
      .split('\n')
      .map(f => f.trim())
      .filter(f => f.length > 0)
      .map(f => path.isAbsolute(f) ? f : path.join(projectRoot, f))
      .filter(f => fs.existsSync(f));
  }

  private getAuthorExperience(
    projectRoot: string,
    author: string,
    excludeCommit?: string
  ): number {
    if (!author || author === 'unknown') return 0;

    const args = ['log', `--author=${author}`, '--oneline'];
    if (excludeCommit && excludeCommit !== 'unknown') {
      args.push('--not', excludeCommit);
    }

    const output = this.tryExecFile('git', args, projectRoot, '');
    if (!output.trim()) return 0;
    return output.trim().split('\n').filter(l => l.trim()).length;
  }

  private getFileChurnAvg(projectRoot: string, files: string[]): number {
    if (files.length === 0) return 0;

    const output = this.tryExecFile(
      'git',
      ['log', '--since=90 days ago', '--name-only', '--format='],
      projectRoot,
      ''
    );

    if (!output.trim()) return 0;

    const churnMap = new Map<string, number>();
    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const normalized = trimmed.replace(/\\/g, '/');
      churnMap.set(normalized, (churnMap.get(normalized) ?? 0) + 1);
    }

    let totalChurn = 0;
    let countedFiles = 0;

    for (const file of files) {
      const relPath = path.relative(projectRoot, file).replace(/\\/g, '/');
      totalChurn += churnMap.get(relPath) ?? 0;
      countedFiles++;
    }

    if (countedFiles === 0) return 0;
    return parseFloat((totalChurn / countedFiles).toFixed(2));
  }

  private tryExecFile(
    cmd: string,
    args: string[],
    cwd: string,
    fallback: string
  ): string {
    try {
      return execFileSync(cmd, args, {
        cwd,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30_000,
        maxBuffer: 10 * 1024 * 1024,
      }).trim();
    } catch {
      return fallback;
    }
  }

  private emptyMetrics(errorMessage?: string): DiffMetrics {
    return {
      locAdded: 0,
      locRemoved: 0,
      locNet: 0,
      filesChanged: 0,
      tsFilesChanged: 0,
      jsFilesChanged: 0,
      vueFilesChanged: 0,
      changeRatio: 0,
      hasTestsChanged: false,
      hasConfigChanged: false,
      hasTs: false,
      authorExperience: 0,
      fileChurnAvg: 0,
      changedFiles: [],
      baseRef: '',
      commitMessages: [],
      status: errorMessage ? 'skipped' : 'ok',
      errorMessage,
    };
  }
}