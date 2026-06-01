import type { Agent } from '../base/Agent.js';
import { makeResult, makeError } from '../base/Agent.js';
import type { RunContext } from '../../core/RunContext.js';
import type {
  AgentResult, Scores, Achievement, NormalizedFeatures,
  LintResult, TestRunResult, SecurityResult, DiffMetrics,
  ProjectContext,
} from '../../core/types.js';
import { ReportGenerator } from '../../report/ReportGenerator.js';
import { Database } from '../../db/Database.js';
import path from 'path';
import fs from 'fs';

export class ReportAgent implements Agent<string> {
  readonly name = 'ReportAgent';

  async run(context: RunContext): Promise<AgentResult<string>> {
    const start = Date.now();

    try {
      const config = context.get('config');
      const root   = context.get('projectRoot');
      const mode   = context.get('mode');
      const outputDir  = path.join(root, config.paths.output);

      fs.mkdirSync(outputDir, { recursive: true });

      const reportDir = path.join(outputDir, 'reports');
      fs.mkdirSync(reportDir, { recursive: true });

      const generator = new ReportGenerator();
      const htmlPath = await generator.generate(context, reportDir);

      // Сохранение в БД только для ci/full
      if (mode !== 'quick') {
        const db = new Database(outputDir);
        try {
          await this.persistToDb(db, context, htmlPath);
        } finally {
          db.close();
        }
      }

      return makeResult(this.name, htmlPath, Date.now() - start);
    } catch (err) {
      return makeError(this.name, String(err), Date.now() - start);
    }
  }

  private async persistToDb(
    db: Database,
    context: RunContext,
    _reportPath: string
  ): Promise<void> {
    const scoresResult = context.get('scores');
    const scores = scoresResult?.data as Scores | null;

    const projectCtx = context.get('projectContext')?.data as ProjectContext | null;
    const detectedVersions = context.get('detectedVersions') ?? projectCtx?.detectedVersions ?? {};

    const startedAt  = context.get('startedAt');
    const finishedAt = new Date();
    const durationSec = (finishedAt.getTime() - startedAt.getTime()) / 1000;

    const stackInfo = projectCtx ? JSON.stringify({
      hasTypeScript: projectCtx.hasTypeScript,
      hasReact:      projectCtx.hasReact,
      hasVue:        projectCtx.hasVue,
      hasNext:       projectCtx.hasNext,
      hasNuxt:       projectCtx.hasNuxt,
      testRunner:    projectCtx.testRunner,
      hasEslint:     projectCtx.hasEslint,
    }) : null;

    const envVersions = JSON.stringify({
      node:             detectedVersions.node?.raw       ?? process.version,
      typescript:       detectedVersions.typescript?.raw ?? null,
      eslint:           detectedVersions.eslint?.raw     ?? null,
      vitest:           detectedVersions.vitest?.raw     ?? null,
      jest:             detectedVersions.jest?.raw       ?? null,
      react:            detectedVersions.react?.raw      ?? null,
      vue:              detectedVersions.vue?.raw        ?? null,
      next:             detectedVersions.next?.raw       ?? null,
      nuxt:             detectedVersions.nuxt?.raw       ?? null,
      nestjs:           detectedVersions.nestjs?.raw     ?? null,
      gitleaks:         detectedVersions.gitleaks?.raw   ?? null,
      sonarjs:          detectedVersions.sonarjs?.raw    ?? null,
      vitestCoverageV8: detectedVersions.vitestCoverageV8?.raw ?? null,
      npm:              detectedVersions.npm?.raw        ?? null,
      git:              detectedVersions.git?.raw        ?? null,
    });

    const checkId = await db.saveCheck({
      commit_hash:   context.get('commitHash')   || 'unknown',
      commit_author: context.get('commitAuthor') || undefined,
      commit_date:   context.get('commitDate')   || new Date().toISOString(),
      branch:        context.get('branch')       || undefined,
      mode:          context.get('mode')         || 'full',
      q_score:       scores?.qScore              ?? null,
      g_score:       scores?.gScore              ?? null,
      gate_passed:   scores?.gatePassed ? 1 : 0,
      duration_sec:  durationSec,
      stack_info:    stackInfo,
      env_versions:  envVersions,
    });

    if (scores?.breakdown) {
      for (const [agent, score] of Object.entries(scores.breakdown)) {
        await db.saveMetric(checkId, agent, score, {});
      }
    }

    await this.saveRawMetrics(db, checkId, context);

    const normalizedFeatures = context.get('normalizedFeatures') as NormalizedFeatures | undefined;
    if (normalizedFeatures) {
      await db.saveNormalizedFeatures(checkId, normalizedFeatures);
    }

    const diffData = context.get('diffResult')?.data as DiffMetrics | null;
    if (diffData && diffData.status === 'ok') {
      await db.saveDiffMetrics(checkId, diffData);
    }

    const lintResults = (context.get('lintResults')?.data ?? []) as LintResult[];
    if (lintResults.length > 0) {
      await db.saveLintDetails(checkId, lintResults);
    }

    const testRun = context.get('testRunResult')?.data as TestRunResult | null;
    if (testRun) {
      await db.saveTestDetails(checkId, testRun);
    }

    const security = context.get('securityResult')?.data as SecurityResult | null;
    if (security) {
      await db.saveSecurityDetails(checkId, security);
    }

    if (projectCtx) {
      await db.saveEnvironmentInfo(checkId, projectCtx, detectedVersions);
    }

    const achievementsResult = context.get('achievements');
    const achievements = (achievementsResult?.data ?? []) as Achievement[];
    const author = context.get('commitAuthor') || 'unknown';

    for (const ach of achievements) {
      await db.saveAchievement(checkId, author, ach.type);
    }
  }

  private async saveRawMetrics(
    db: Database,
    checkId: number,
    context: RunContext
  ): Promise<void> {
    const agentKeys = [
      'lintResults',
      'complexityResult',
      'testRunResult',
      'securityResult',
      'degradationResult',
      'diffResult',
    ] as const;

    for (const key of agentKeys) {
      const result = context.get(key);
      if (result?.data !== null && result?.data !== undefined) {
        await db.saveMetric(
          checkId,
          String(key),
          null,
          result.data
        );
      }
    }
  }
}