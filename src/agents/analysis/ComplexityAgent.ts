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

// Правила когнитивной сложности (sonarjs)
const COGNITIVE_RULES = new Set([
  'sonarjs/cognitive-complexity',
]);

// Правила цикломатической сложности (встроенное ESLint)
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
      const maxAllowed = config.thresholds.max_complexity;

      const complexityMessages: EslintComplexityMessage[] = shared?.eslintComplexityMessages ?? [];

      // считаем LOC по файлам из lintResults
      const fileLocs = this.computeFileLocs(context);
      const totalLoc = fileLocs.reduce((sum, f) => sum + f.totalLines, 0);
      const avgFileLoc = fileLocs.length > 0
        ? parseFloat((totalLoc / fileLocs.length).toFixed(1))
        : 0;

      if (complexityMessages.length === 0) {
        return makeResult(this.name, {
          maxComplexity: 0,
          averageComplexity: 0,
          violations: [],
          complexityType: 'unknown',
          status: 'skipped',
          errorMessage: 'Нет данных о сложности. Установите eslint-plugin-sonarjs или включите правило complexity.',
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
          // LOC функции не можем определить без AST-анализа, оставляем undefined
          functionLoc: undefined,
        }))
        .sort((a, b) => b.complexity - a.complexity);

      const complexityType: ComplexityResult['complexityType'] = this.detectComplexityType(complexityMessages);

      const result: ComplexityResult = {
        maxComplexity,
        averageComplexity,
        violations,
        complexityType,
        status: 'ok',
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

    // Если есть оба типа — приоритет у когнитивной (более информативна)
    if (hasCognitive)  return 'cognitive';
    if (hasCyclomatic) return 'cyclomatic';
    return 'unknown';
  }

  // подсчёт LOC по файлам из lintResults (физический размер файлов)
  private computeFileLocs(context: RunContext): FileLoc[] {
    const lintData = context.get('lintResults')?.data ?? [];
    const fileLocs: FileLoc[] = [];

    // Собираем уникальные пути файлов из lint-результатов
    const filePaths = new Set(lintData.map(r => r.filePath));

    for (const filePath of filePaths) {
      try {
        if (!fs.existsSync(filePath)) continue;

        const content = fs.readFileSync(filePath, 'utf8');
        const totalLines = content.split('\n').length;

        fileLocs.push({
          filePath,
          totalLines,
          // avgFunctionLoc: без AST-анализа не можем определить точно
          // используем грубую эвристику: если есть данные сложности по этому файлу
          avgFunctionLoc: undefined,
        });
      } catch {
        // Файл недоступен — пропускаем
      }
    }

    return fileLocs;
  }
}