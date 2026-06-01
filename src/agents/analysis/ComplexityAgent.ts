import fs from 'fs';
import path from 'path';
import type { Agent } from '../base/Agent.js';
import { makeResult } from '../base/Agent.js';
import type { RunContext } from '../../core/RunContext.js';
import type {
  ComplexityResult,
  AgentResult,
  EslintComplexityMessage,
  ComplexityViolation,
  FileLoc,
} from '../../core/types.js';
import { logger } from '../../utils/logger.js';

const COGNITIVE_RULES = new Set([
  'sonarjs/cognitive-complexity',
]);

const CYCLOMATIC_RULES = new Set([
  'complexity',
  '@typescript-eslint/complexity',
]);

export class ComplexityAgent implements Agent<ComplexityResult> {
  readonly name = 'ComplexityAgent';

  async run(context: RunContext): Promise<AgentResult<ComplexityResult>> {
    const start = Date.now();

    try {
      const shared  = context.get('analysisShared');
      const config  = context.get('config');
      const project = context.get('projectContext')?.data;
      const maxAllowed = config.thresholds.max_complexity;

      const complexityMessages: EslintComplexityMessage[] = shared?.eslintComplexityMessages ?? [];

      const fileLocs = this.computeFileLocs(context);
      const totalLoc = fileLocs.reduce((sum, f) => sum + f.totalLines, 0);
      const avgFileLoc = fileLocs.length > 0
        ? parseFloat((totalLoc / fileLocs.length).toFixed(1))
        : 0;

      if (complexityMessages.length === 0) {
        const hasSonarjs = Boolean(project?.detectedVersions?.sonarjs?.valid);
        const hint = !hasSonarjs
          ? 'Установите eslint-plugin-sonarjs и включите правило sonarjs/cognitive-complexity или complexity в eslint.config. Запустите: pulsqual init'
          : 'Включите в eslint.config правило complexity или sonarjs/cognitive-complexity. Pulsqual собирает метрики из сообщений ESLint.';

        logger.warn(`ComplexityAgent: ${hint}`);

        return makeResult(this.name, {
          maxComplexity: 0,
          averageComplexity: 0,
          violations: [],
          complexityType: 'unknown',
          status: 'skipped',
          skipReason: 'no_plugin_or_rule',
          errorMessage: hint,
          thresholdExceeded: false,
          fileLocs,
          totalLoc,
          avgFileLoc,
        }, Date.now() - start);
      }

      const complexities = complexityMessages.map(m => m.complexity);
      const maxComplexity = Math.max(...complexities);
      const averageComplexity = parseFloat(
        (complexities.reduce((a, b) => a + b, 0) / complexities.length).toFixed(2)
      );

      const violations: ComplexityViolation[] = complexityMessages
        .filter(m => m.complexity > maxAllowed)
        .map(m => ({
          file: m.filePath,
          function: m.functionName,
          complexity: m.complexity,
          line: m.line,
          functionLoc: undefined,
        }))
        .sort((a, b) => b.complexity - a.complexity);

      const thresholdExceeded = maxComplexity > maxAllowed;
      if (thresholdExceeded) {
        logger.warn(
          `ComplexityAgent: превышен порог сложности (${maxComplexity} > ${maxAllowed}). ` +
          `Нарушений: ${violations.length}`,
        );
      }

      const complexityType: ComplexityResult['complexityType'] =
        this.detectComplexityType(complexityMessages);

      const result: ComplexityResult = {
        maxComplexity,
        averageComplexity,
        violations,
        complexityType,
        status: 'ok',
        thresholdExceeded,
        fileLocs,
        totalLoc,
        avgFileLoc,
      };

      return makeResult(this.name, result, Date.now() - start);
    } catch (err) {
      return makeResult(this.name, {
        maxComplexity: 0,
        averageComplexity: 0,
        violations: [],
        complexityType: 'unknown',
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
        thresholdExceeded: false,
        fileLocs: [],
        totalLoc: 0,
        avgFileLoc: 0,
      }, Date.now() - start);
    }
  }

  private detectComplexityType(messages: EslintComplexityMessage[]): ComplexityResult['complexityType'] {
    let hasCognitive  = false;
    let hasCyclomatic = false;

    for (const m of messages) {
      if (COGNITIVE_RULES.has(m.ruleId))   hasCognitive  = true;
      if (CYCLOMATIC_RULES.has(m.ruleId))  hasCyclomatic = true;
    }

    if (hasCognitive)  return 'cognitive';
    if (hasCyclomatic) return 'cyclomatic';
    return 'unknown';
  }

  private computeFileLocs(context: RunContext): FileLoc[] {
    const lintData = context.get('lintResults')?.data ?? [];
    const projectRoot = context.get('projectRoot');
    const fileLocs: FileLoc[] = [];
    const filePaths = new Set(lintData.map(r => r.filePath));

    for (const filePath of filePaths) {
      try {
        if (!fs.existsSync(filePath)) continue;

        const content = fs.readFileSync(filePath, 'utf8');
        const totalLines = content.split('\n').length;

        fileLocs.push({
          filePath,
          totalLines,
          avgFunctionLoc: undefined,
        });
      } catch {
        // пропуск
      }
    }

    // Дополнительно: файлы из diff с метриками сложности
    const diffFiles = context.get('diffResult')?.data?.changedFiles ?? [];
    for (const filePath of diffFiles) {
      const abs = path.isAbsolute(filePath)
        ? filePath
        : path.join(projectRoot, filePath);
      if (!fs.existsSync(abs) || filePaths.has(abs)) continue;
      try {
        const content = fs.readFileSync(abs, 'utf8');
        fileLocs.push({
          filePath: abs,
          totalLines: content.split('\n').length,
          avgFunctionLoc: undefined,
        });
      } catch { /* ignore */ }
    }

    return fileLocs;
  }
}
