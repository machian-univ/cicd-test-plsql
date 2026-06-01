import type { AnalyzerAdapter, LintConfig } from './AnalyzerAdapter.js';
import type { ProjectContext, LintResult, CoverageResult } from '../../core/types.js';
import { analyzerRegistry } from './AnalyzerAdapter.js';
import { runEslint } from '../../analysis/EslintRunner.js';
import { readCoverageSummary } from '../../analysis/CoverageReader.js';


// StaticAnalysisAgent вызывает runEslint() напрямую для большей гибкости.
// ESLintAdapter предназначен для внешних интеграций и расширений.
class ESLintAdapter implements AnalyzerAdapter {
  name = 'ESLintAdapter';

  canHandle(project: ProjectContext): boolean {
    return project.hasEslint;
  }

  async getLintResults(config: LintConfig): Promise<LintResult[]> {
    const result = runEslint({
      projectRoot: config.rootPath,
      targetPaths: [config.sourcePath],
      failSilently: true,
    });

    return result.lintResults;
  }

  async getCoverageResults(config: LintConfig): Promise<CoverageResult> {
    // Метод вызывается ПОСЛЕ TestRunnerAgent (coverage уже сгенерирована)
    const result = readCoverageSummary(config.rootPath);
    return result ?? {
      lines: null,
      branches: null,
      functions: null,
      statements: null,
      status: 'skipped',
    };
  }
}

analyzerRegistry.register(new ESLintAdapter());