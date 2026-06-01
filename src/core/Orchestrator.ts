// src/core/Orchestrator.ts

import fs from 'fs';
import { RunContext } from './RunContext.js';
import type {
  PulsqualConfig, CheckMode, EnvCheckResult,
  AnalysisSharedData, NormalizedFeatures, DiffMetrics,
  ProjectContext, VersionWarning, DetectedVersions,
} from './types.js';
import { STACK_REGISTRY } from './types.js';
import { git } from '../utils/git.js';
import { logger } from '../utils/logger.js';

import { ProjectInspectorAgent } from '../agents/preparation/ProjectInspectorAgent.js';
import { EnvCheckerAgent } from '../agents/preparation/EnvCheckerAgent.js';
import { DiffAgent } from '../agents/analysis/DiffAgent.js';
import { StaticAnalysisAgent } from '../agents/analysis/StaticAnalysisAgent.js';
import { ComplexityAgent } from '../agents/analysis/ComplexityAgent.js';
import { TestRunnerAgent } from '../agents/analysis/TestRunnerAgent.js';
import { SecurityScanAgent } from '../agents/analysis/SecurityScanAgent.js';
import { DegradationDetectorAgent } from '../agents/analysis/DegradationDetectorAgent.js';
import { ProgressTrackerAgent } from '../agents/growth/ProgressTrackerAgent.js';
import { AchievementEngineAgent } from '../agents/growth/AchievementEngineAgent.js';
import { LLMReviewerAgent } from '../agents/growth/LLMReviewerAgent.js';
import { ScoreCalculatorAgent } from '../agents/output/ScoreCalculatorAgent.js';
import { ReportAgent } from '../agents/output/ReportAgent.js';
import type { QScoreHistoryPoint } from './RunContext.js';
import { resolveLlmForRun } from '../llm/resolveLlmConfig.js';

export interface OrchestratorRunOptions {
  projectRoot: string;
  config: PulsqualConfig;
  mode: CheckMode;
  noLlm?: boolean;
  nonInteractive?: boolean;
}

export class Orchestrator {
  async run(options: OrchestratorRunOptions): Promise<RunContext> {
    const { projectRoot, config, mode, noLlm } = options;
    const nonInteractive = options.nonInteractive ?? (mode === 'ci');

    // Шаг 0: Проверка Git
    const hasGit = git.isRepo(projectRoot);
    if (!hasGit) {
      logger.error(
        'Git-репозиторий не найден в директории проекта.\n' +
        '  Pulsqual требует Git для определения области анализа.\n' +
        '  Решение:\n' +
        '    1. git init\n' +
        '    2. git add .\n' +
        '    3. git commit -m "init"\n' +
        '    4. pulsqual check'
      );
      process.exit(1);
    }

    const stagedFiles = mode === 'quick' ? git.getStagedFiles(projectRoot) : [];

    if (mode === 'quick' && stagedFiles.length === 0) {
      logger.warn(
        'Нет staged-файлов для анализа.\n' +
        '  В quick-режиме анализируются только файлы, добавленные через git add.\n' +
        '  Добавьте файлы: git add <файлы>  или  git add .'
      );
    }

    // Собираем расширенную информацию о коммите
    const headCommitInfo = git.getHeadCommitInfo(projectRoot);

    const resolvedLlm = resolveLlmForRun(config, mode, noLlm);
    if (resolvedLlm.skipReason) {
      logger.warn(resolvedLlm.skipReason);
    }

    const effectiveConfig = {
      ...config,
      llm: {
        ...config.llm,
        enabled: resolvedLlm.enabled,
        provider: resolvedLlm.provider,
        model: resolvedLlm.model,
        endpoint: resolvedLlm.endpoint,
        max_tokens: resolvedLlm.max_tokens,
        api_key_env: resolvedLlm.api_key_env,
      },
    };

    let ctx = new RunContext({
      config:         effectiveConfig,
      projectRoot,
      startedAt:      new Date(),
      mode,
      gitAvailable:   true,
      commitHash:     headCommitInfo.hash,
      commitAuthor:   headCommitInfo.author,
      commitDate:     headCommitInfo.date,
      branch:         git.getBranch(projectRoot),
      analysisShared: { stagedFiles },
      versionWarnings: [],
      commitInfo:     headCommitInfo,
    });

    // Слой 1: Preparation 
    logger.step('[ProjectInspectorAgent]');
    ctx = await this.runAgent(new ProjectInspectorAgent(), ctx, 'projectContext');

    logger.step('[EnvCheckerAgent]');
    ctx = await this.runAgent(new EnvCheckerAgent(), ctx, 'envCheck');

    const envData     = ctx.get('envCheck')?.data as EnvCheckResult | null;
    const projectCtx  = ctx.get('projectContext')?.data as ProjectContext | null;

    if (envData) {
      for (const warn of envData.warnings) {
        logger.warn(`EnvChecker: ${warn}`);
      }

      const stackDrift = envData.stackDrift;
      if (stackDrift?.hasDrift) {
        const driftSummary = stackDrift.drifts
          .map(d => `  - ${d.field}: ожидалось "${d.expected}", найдено "${d.actual}"`)
          .join('\n');

        logger.error(
          'ОБНАРУЖЕНО ИЗМЕНЕНИЕ СТЕКА ПРОЕКТА с момента последнего pulsqual init.\n' +
          'Это может привести к ложным результатам анализа.\n' +
          'Изменения:\n' + driftSummary + '\n' +
          'Обновите конфигурацию: pulsqual init'
        );

        const hasCriticalDrift = envData.missingRequired.includes('stack-snapshot-update-required');
        if (hasCriticalDrift) {
          logger.error(
            'Критическое изменение стека проекта обнаружено.\n' +
            'Анализ остановлен для предотвращения ложных результатов.\n' +
            'Обновите конфигурацию: pulsqual init'
          );
          process.exit(1);
        }
      }

      const blockingWarnings = envData.versionWarnings.filter(w => w.blocking);
      if (blockingWarnings.length > 0) {
        for (const w of blockingWarnings) {
          logger.error(`[BLOCKING] ${w.tool}: ${w.message}`);
        }
        logger.error(
          'Анализ остановлен из-за неподдерживаемой версии инструментов.\n' +
          'Исправьте ошибки выше и повторите запуск.'
        );
        process.exit(1);
      }

      const nonBlockingVersionWarnings = envData.versionWarnings.filter(w => !w.blocking);
      for (const w of nonBlockingVersionWarnings) {
        if (w.level === 'critical') {
          logger.error(`[${w.tool}] ${w.message}`);
        } else if (w.level === 'warning') {
          logger.warn(`[${w.tool}] ${w.message}`);
        } else {
          logger.info(`[${w.tool}] ${w.message}`);
        }
      }

      ctx = ctx.with({
        versionWarnings:  envData.versionWarnings,
        detectedVersions: envData.detectedVersions,
      });

      const nonSpecialMissing = envData.missingRequired.filter(
        m => m !== 'stack-snapshot-update-required' && m !== 'node-version-too-old'
      );
      for (const missing of nonSpecialMissing) {
        logger.warn(`Отсутствует обязательный инструмент: ${missing} — часть анализа будет пропущена`);
      }
    }

    if (projectCtx?.requiresDecorators) {
      logger.info(
        '[NestJS] Проект использует декораторы. ' +
        'ESLint настроен с TYPESCRIPT_ESLINT_LEGACY_DECORATORS=true.'
      );
    }

    if (projectCtx?.hasEslint && !projectCtx.eslintConfigExists) {
      if (nonInteractive) {
        logger.error(
          '[ESLint] Конфигурационный файл ESLint не найден.\n' +
          'Анализ невозможен без конфигурации ESLint.\n' +
          'Создайте eslint.config.mjs или запустите: pulsqual init'
        );
        process.exit(1);
      } else {
        const created = await this.handleMissingEslintConfig(projectCtx, projectRoot);
        if (!created) {
          logger.error(
            '[ESLint] Конфигурационный файл ESLint не создан.\n' +
            'Анализ невозможен без конфигурации ESLint.\n' +
            'Создайте eslint.config.mjs или запустите: pulsqual init'
          );
          process.exit(1);
        }
        logger.step('[ProjectInspectorAgent] (повторно после создания eslint.config.mjs)');
        ctx = await this.runAgent(new ProjectInspectorAgent(), ctx, 'projectContext');
      }
    } else if (!projectCtx?.hasEslint) {
      logger.warn('[ESLint] ESLint не установлен. Статический анализ будет пропущен.');
    }

    // Слой 2: DiffAgent
    logger.step('[DiffAgent]');
    ctx = await this.runAgent(new DiffAgent(), ctx, 'diffResult');

    const diffData = ctx.get('diffResult')?.data as DiffMetrics | null;
    if (diffData?.changedFiles && diffData.changedFiles.length > 0) {
      const existingShared = ctx.get('analysisShared') ?? {};
      ctx = ctx.with({
        analysisShared: {
          ...existingShared,
          stagedFiles: mode === 'quick'
            ? (existingShared.stagedFiles ?? diffData.changedFiles)
            : existingShared.stagedFiles,
          diffMetrics: diffData,
        },
      });
    }

    // Обновляем commitInfo для CI: добавляем prCommits
    if (mode === 'ci' && diffData?.prCommits) {
      const currentCommitInfo = ctx.get('commitInfo');
      if (currentCommitInfo) {
        ctx = ctx.with({
          commitInfo: {
            ...currentCommitInfo,
            prCommits: diffData.prCommits,
          },
        });
      }
    }

    // Слой 3: Analysis 
    logger.step('[StaticAnalysisAgent]');
    ctx = await this.runAgent(new StaticAnalysisAgent(), ctx, 'lintResults');
    ctx = this.extractSharedFromStaticAgent(ctx);

    logger.step('[ComplexityAgent]');
    ctx = await this.runAgent(new ComplexityAgent(), ctx, 'complexityResult');

    logger.step('[TestRunnerAgent]');
    ctx = await this.runAgent(new TestRunnerAgent(), ctx, 'testRunResult');

    logger.step('[SecurityScanAgent]');
    ctx = await this.runAgent(new SecurityScanAgent(), ctx, 'securityResult');

    if (mode !== 'quick') {
      logger.step('[DegradationDetectorAgent]');
      ctx = await this.runAgent(new DegradationDetectorAgent(), ctx, 'degradationResult');
    }

    // Слой 4: Score
    logger.step('[ScoreCalculatorAgent]');
    ctx = await this.runAgent(new ScoreCalculatorAgent(), ctx, 'scores');

    const scoresResult = ctx.get('scores');
    if (scoresResult && (scoresResult as any).__normalizedFeatures) {
      const features = (scoresResult as any).__normalizedFeatures as NormalizedFeatures;
      delete (scoresResult as any).__normalizedFeatures;
      ctx = ctx.with({ normalizedFeatures: features });
    }

    // Слой 5: Growth (только для ci/full)
    if (mode !== 'quick') {
      logger.step('[ProgressTrackerAgent]');
      ctx = await this.runAgent(new ProgressTrackerAgent(), ctx, 'progressResult');

      // Извлекаем историю Q-Score из служебного поля
      ctx = this.extractQScoreHistory(ctx);

      logger.step('[AchievementEngineAgent]');
      ctx = await this.runAgent(new AchievementEngineAgent(), ctx, 'achievements');
    }

    if (effectiveConfig.llm.enabled) {
      logger.step('[LLMReviewerAgent]');
      ctx = await this.runAgent(new LLMReviewerAgent(), ctx, 'llmReview');
    }

    // Слой 6: Output (только для ci/full) 
    if (mode !== 'quick') {
      logger.step('[ReportAgent]');
      ctx = await this.runAgent(new ReportAgent(), ctx, 'reportResult');
    }

    return ctx;
  }

  private extractQScoreHistory(ctx: RunContext): RunContext {
    const progressResult = ctx.get('progressResult');
    if (!progressResult?.data) return ctx;

    const history = (progressResult.data as any).__qScoreHistory as QScoreHistoryPoint[] | undefined;
    if (!history) return ctx;

    delete (progressResult.data as any).__qScoreHistory;
    return ctx.with({ qScoreHistory: history });
  }

  private async handleMissingEslintConfig(
    project: ProjectContext,
    projectRoot: string
  ): Promise<boolean> {
    try {
      const { default: inquirer } = await import('inquirer');
      const { createConfig } = await inquirer.prompt([{
        type: 'confirm',
        name: 'createConfig',
        message:
          'Файл конфигурации ESLint не найден. ' +
          'Без него анализ невозможен. ' +
          'Создать базовый eslint.config.mjs автоматически? (Y/n)',
        default: true,
      }]);

      if (!createConfig) return false;

      const { generateEslintConfigContent } = await import('../commands/init.js');
      const content = generateEslintConfigContent(project, projectRoot);
      fs.writeFileSync(`${projectRoot}/eslint.config.mjs`, content, 'utf8');
      logger.success('Создан eslint.config.mjs');
      logger.warn(
        'Автоматически созданный конфиг — базовый. ' +
        'Проверьте его и при необходимости установите дополнительные плагины.'
      );
      return true;
    } catch (err) {
      logger.warn(`Не удалось создать eslint.config.mjs: ${String(err)}`);
      return false;
    }
  }

  private extractSharedFromStaticAgent(ctx: RunContext): RunContext {
    const result = ctx.get('lintResults');
    if (!result) return ctx;

    const sharedUpdate = (result as any).__sharedUpdate as AnalysisSharedData | undefined;
    if (!sharedUpdate) return ctx;

    delete (result as any).__sharedUpdate;

    const existingShared = ctx.get('analysisShared') ?? {};
    return ctx.with({
      analysisShared: { ...existingShared, ...sharedUpdate },
    });
  }

  private async runAgent<T>(
    agent: { name: string; run(ctx: RunContext): Promise<any> },
    ctx: RunContext,
    resultKey: keyof import('./RunContext.js').RunContextData,
  ): Promise<RunContext> {
    const agentStart = Date.now();

    try {
      const result = await agent.run(ctx);
      const durationMs = Date.now() - agentStart;

      if (!result.success && result.error) {
        logger.warn(`[${agent.name}] завершился с ошибкой за ${durationMs}мс: ${result.error}`);
        this.printVersionRecommendations(ctx);
      } else {
        logger.verbose(`[${agent.name}] OK за ${durationMs}мс`);
      }

      return ctx.with({ [resultKey]: result } as any);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - agentStart;

      logger.error(`[${agent.name}] необработанное исключение за ${durationMs}мс:\n  ${errorMsg}`);
      this.printVersionRecommendations(ctx);
      logger.info('Для обновления конфигурации запустите: pulsqual init');

      return ctx.with({
        [resultKey]: {
          agentName:  agent.name,
          success:    false,
          data:       null,
          error:      errorMsg,
          durationMs,
        },
      } as any);
    }
  }

  private printVersionRecommendations(ctx: RunContext): void {
    const detected = ctx.get('detectedVersions');
    const projectCtx = ctx.get('projectContext')?.data as ProjectContext | null;
    const detectedVers = detected ?? projectCtx?.detectedVersions;

    if (!detectedVers) return;

    const lines: string[] = ['Рекомендуемые версии инструментов для этого проекта:'];

    const toolsToShow: Array<[keyof DetectedVersions, string]> = [
      ['node',             'node'],
      ['typescript',       'typescript'],
      ['eslint',           'eslint'],
      ['vitest',           'vitest'],
      ['jest',             'jest'],
      ['react',            'react'],
      ['vue',              'vue'],
      ['sonarjs',          'sonarjs'],
      ['vitestCoverageV8', '@vitest/coverage-v8'],
    ];

    for (const [vKey, rKey] of toolsToShow) {
      const version = detectedVers[vKey];
      if (!version) continue;
      const spec = STACK_REGISTRY[rKey];
      if (!spec) continue;

      const rec = spec.recommendedVersion;
      if (rec) {
        const recStr = [rec.major, rec.minor, rec.patch]
          .filter(v => v !== undefined)
          .join('.');
        lines.push(`  ${spec.displayName}: установлено ${version.raw}, рекомендуется ${recStr}+`);
      } else {
        lines.push(`  ${spec.displayName}: установлено ${version.raw}`);
      }
    }

    logger.info(lines.join('\n'));
    logger.info('Проверьте версии вручную и при необходимости обновите конфиг: pulsqual init');
  }
}