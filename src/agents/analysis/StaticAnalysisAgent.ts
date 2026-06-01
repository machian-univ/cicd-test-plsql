import fs from 'fs';
import path from 'path';
import type { Agent } from '../base/Agent.js';
import { makeResult, makeError } from '../base/Agent.js';
import type { RunContext } from '../../core/RunContext.js';
import type {
  LintResult, LintMessage, AgentResult, ProjectContext, AnalysisSharedData,
} from '../../core/types.js';
import { runEslint, runTsc } from '../../analysis/EslintRunner.js';
import { resolveExistingPaths } from '../../analysis/pathUtils.js';
import { logger } from '../../utils/logger.js';

export class StaticAnalysisAgent implements Agent<LintResult[]> {
  readonly name = 'StaticAnalysisAgent';

  async run(context: RunContext): Promise<AgentResult<LintResult[]>> {
    const start = Date.now();

    try {
      const projectRoot   = context.get('projectRoot');
      const config        = context.get('config');
      const mode          = context.get('mode');
      const projectResult = context.get('projectContext');
      const project       = projectResult?.data as ProjectContext | null;

      if (!project?.hasEslint) {
        logger.verbose('StaticAnalysisAgent: ESLint не установлен в проекте, пропускаем');
        return this.returnEmpty(context, Date.now() - start);
      }

      if (project.hasTypeScript) {
        logger.verbose(
          `StaticAnalysisAgent: TypeScript обнаружен (версия: ${project.detectedVersions.typescript?.raw ?? 'определена по tsconfig/файлам'}). ` +
          'TypeScript-плагин ESLint будет применён.'
        );
      } else {
        logger.verbose('StaticAnalysisAgent: TypeScript не обнаружен, TypeScript-плагин ESLint не применяется.');
      }

      if (!project.eslintConfigExists) {
        logger.verbose('StaticAnalysisAgent: конфиг ESLint не найден, пропускаем lint');
        return this.returnEmpty(context, Date.now() - start, 'Конфиг ESLint не найден — требуется создание');
      }

      const extensions = this.buildExtensions(project);
      let lintResults: LintResult[] = [];
      let eslintRunResult;

      const requiresDecorators = project.requiresDecorators ?? false;

      if (mode === 'quick') {
        const diffResult = context.get('diffResult');
        const changedFiles = diffResult?.data?.changedFiles
          ?? context.get('analysisShared')?.stagedFiles
          ?? [];

        if (changedFiles.length === 0) {
          logger.verbose('StaticAnalysisAgent: нет изменённых файлов для анализа');
          return this.returnEmpty(context, Date.now() - start);
        }

        const lintableFiles = changedFiles.filter(f => {
          if (!extensions.some(ext => f.endsWith(ext))) return false;
          const abs = path.isAbsolute(f) ? f : path.join(projectRoot, f);
          return fs.existsSync(abs);
        });

        if (lintableFiles.length === 0) {
          logger.verbose(
            `StaticAnalysisAgent: ни один из ${changedFiles.length} изменённых файлов ` +
            `не соответствует расширениям ${extensions.join(', ')}`
          );
          return this.returnEmpty(context, Date.now() - start);
        }

        eslintRunResult = runEslint({
          projectRoot,
          targetPaths: lintableFiles,
          extensions,
          failSilently: true,
          requiresDecorators,
        });

        if (eslintRunResult.configError) {
          logger.error(`StaticAnalysisAgent (ошибка конфига ESLint): ${eslintRunResult.configError}`);
          return this.returnEmpty(context, Date.now() - start, eslintRunResult.configError);
        }

        if (eslintRunResult.runError) {
          logger.warn(`StaticAnalysisAgent (ESLint): ${eslintRunResult.runError}`);
        }

        lintResults = eslintRunResult.lintResults.map(r => this.enrichLintResult(r));

        const sharedUpdate: AnalysisSharedData = {
          ...context.get('analysisShared'),
          eslintComplexityMessages: eslintRunResult.complexityMessages,
          tscErrors: [],
        };

        const result = makeResult(this.name, lintResults, Date.now() - start);
        (result as any).__sharedUpdate = sharedUpdate;
        return result;
      }

      // CI/Full-режим — только существующие каталоги/файлы
      const lintTargets = resolveExistingPaths(projectRoot, [
        config.paths.source,
        config.paths.tests,
      ]);

      if (lintTargets.length === 0) {
        logger.verbose(
          'StaticAnalysisAgent: каталоги source/tests не найдены, пропускаем lint'
        );
        return this.returnEmpty(context, Date.now() - start);
      }

      eslintRunResult = runEslint({
        projectRoot,
        targetPaths: lintTargets,
        extensions,
        failSilently: true,
        requiresDecorators,
      });

      if (eslintRunResult.configError) {
        logger.error(`StaticAnalysisAgent (ошибка конфига ESLint): ${eslintRunResult.configError}`);
        return this.returnEmpty(context, Date.now() - start, eslintRunResult.configError);
      }

      if (eslintRunResult.runError) {
        logger.warn(`StaticAnalysisAgent (ESLint): ${eslintRunResult.runError}`);
      }

      lintResults = eslintRunResult.lintResults.map(r => this.enrichLintResult(r));

      const tscErrors: AnalysisSharedData['tscErrors'] = [];

      if (project?.hasTypeScript && project.hasTsConfig) {
        const tscResult = runTsc(projectRoot);

        if (tscResult.runError) {
          logger.warn(`StaticAnalysisAgent (tsc): ${tscResult.runError}`);
        }

        if (tscResult.errors.length > 0) {
          const byFile = new Map<string, typeof tscResult.errors>();
          for (const err of tscResult.errors) {
            const existing = byFile.get(err.file) ?? [];
            existing.push(err);
            byFile.set(err.file, existing);
          }

          for (const [file, errors] of byFile) {
            const tscMessages: LintMessage[] = errors.map(e => ({
              ruleId: `TS${e.code}`,
              message: e.message,
              line: e.line,
              severity: 2 as const,
              source: 'tsc' as const,
            }));

            const existing = lintResults.find(r => r.filePath === file);
            if (existing) {
              existing.messages.push(...tscMessages);
              existing.tscMessages.push(...tscMessages);
              existing.errorCount += errors.length;
            } else {
              lintResults.push({
                filePath: file,
                errorCount: errors.length,
                warningCount: 0,
                messages: tscMessages,
                eslintMessages: [],
                tscMessages,
              });
            }
          }
        }

        tscErrors.push(...(tscResult.errors ?? []));
      }

      const sharedUpdate: AnalysisSharedData = {
        ...context.get('analysisShared'),
        eslintComplexityMessages: eslintRunResult.complexityMessages,
        tscErrors,
      };

      const result = makeResult(this.name, lintResults, Date.now() - start);
      (result as any).__sharedUpdate = sharedUpdate;
      return result;

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`StaticAnalysisAgent: необработанное исключение: ${errorMsg}`);
      return makeError<LintResult[]>(this.name, errorMsg, Date.now() - start);
    }
  }

  private enrichLintResult(raw: LintResult): LintResult {
    const messages: LintMessage[] = raw.messages.map(m => ({
      ...m,
      source: (m.source ?? 'eslint') as 'eslint' | 'tsc',
    }));

    return {
      ...raw,
      messages,
      eslintMessages: messages.filter(m => m.source === 'eslint'),
      tscMessages: messages.filter(m => m.source === 'tsc'),
    };
  }

  private returnEmpty(
    context: RunContext,
    durationMs: number,
    skipReason?: string
  ): AgentResult<LintResult[]> {
    if (skipReason) {
      logger.verbose(`StaticAnalysisAgent: пропуск — ${skipReason}`);
    }
    const sharedUpdate: AnalysisSharedData = {
      ...context.get('analysisShared'),
      eslintComplexityMessages: [],
      tscErrors: [],
    };
    const result = makeResult(this.name, [] as LintResult[], durationMs);
    (result as any).__sharedUpdate = sharedUpdate;
    return result;
  }

  private buildExtensions(project: ProjectContext | null): string[] {
    const exts = new Set(['.js', '.mjs', '.cjs']);

    if (project?.hasTypeScript) {
      exts.add('.ts');
      exts.add('.mts');
      exts.add('.cts');
    }

    if (project?.hasReact || project?.hasNext) {
      exts.add('.jsx');
      if (project?.hasTypeScript) {
        exts.add('.tsx');
      }
    }

    if (project?.hasVue) {
      exts.add('.vue');
    }

    return Array.from(exts);
  }
}