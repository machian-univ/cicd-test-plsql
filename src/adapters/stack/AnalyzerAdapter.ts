import type { ProjectContext, LintResult, CoverageResult } from '../../core/types.js';

export interface LintConfig {
  rootPath: string;
  sourcePath: string;
}

export interface AnalyzerAdapter {
  name: string;
  canHandle(project: ProjectContext): boolean;
  getLintResults(config: LintConfig): Promise<LintResult[]>;
  getCoverageResults(config: LintConfig): Promise<CoverageResult>;
}

class AdapterRegistry {
  private adapters: AnalyzerAdapter[] = [];

  register(adapter: AnalyzerAdapter): void {
    this.adapters.push(adapter);
  }

  resolve(project: ProjectContext): AnalyzerAdapter | null {
    return this.adapters.find((a) => a.canHandle(project)) ?? null;
  }
}

export const analyzerRegistry = new AdapterRegistry();