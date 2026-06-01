import type { Agent } from '../base/Agent.js';
import { makeResult } from '../base/Agent.js';
import type { RunContext } from '../../core/RunContext.js';
import type {
  DegradationResult,
  NormalizedFeatures,
  AgentResult,
  LintResult,
  ComplexityResult,
  TestRunResult,
  SecurityResult,
  DiffMetrics,
} from '../../core/types.js';
import { predict, explainPrediction, findModelPath } from '../../ml/DegradationPredictor.js';
import {
  buildNormalizedFeatures,
  hasMinimalAnalysisData,
} from '../../ml/normalizeFeatures.js';
import { logger } from '../../utils/logger.js';

export class DegradationDetectorAgent implements Agent<DegradationResult> {
  readonly name = 'DegradationDetectorAgent';

  async run(context: RunContext): Promise<AgentResult<DegradationResult>> {
    const start = Date.now();
    const projectRoot = context.get('projectRoot');

    const normalizedFeatures = this.extractFeaturesFromContext(context);

    if (!normalizedFeatures) {
      const result: DegradationResult = {
        score: 0,
        prediction: 'unknown',
        confidence: 0,
        status: 'skipped',
        errorMessage: 'Недостаточно данных для прогноза деградации. Убедитесь, что запущена полная проверка.',
      };
      return makeResult(this.name, result, Date.now() - start);
    }

    const modelPath = findModelPath(projectRoot);
    if (!modelPath) {
      logger.verbose(
        'DegradationDetectorAgent: модель degradation_model.onnx не найдена. ' +
        'Поместите файл в корень проекта или в .pulsqual/',
      );
      const result: DegradationResult = {
        score: 0,
        prediction: 'unknown',
        confidence: 0,
        status: 'skipped',
        errorMessage:
          'Модель деградации не найдена. ' +
          'Поместите файл degradation_model.onnx в корень проекта или в .pulsqual/.',
      };
      return makeResult(this.name, result, Date.now() - start);
    }

    try {
      logger.verbose(`DegradationDetectorAgent: загружаю модель из ${modelPath}`);
      const prediction = await predict(normalizedFeatures, projectRoot);

      if (!prediction) {
        const result: DegradationResult = {
          score: 0,
          prediction: 'unknown',
          confidence: 0,
          status: 'skipped',
          modelPath,
          errorMessage:
            'Не удалось выполнить инференс модели. ' +
            'Убедитесь, что пакет onnxruntime-node установлен: npm install onnxruntime-node',
        };
        return makeResult(this.name, result, Date.now() - start);
      }

      const factors = explainPrediction(normalizedFeatures, prediction.isDegrading);
      const scoreForCalculator = (1 - prediction.rawScore) * 100;

      const result: DegradationResult = {
        score: parseFloat(scoreForCalculator.toFixed(2)),
        prediction: prediction.isDegrading ? 'degrading' : 'stable',
        confidence: parseFloat(prediction.confidence.toFixed(4)),
        status: 'ok',
        modelPath: prediction.modelPath,
        factors,
        rawScore: parseFloat(prediction.rawScore.toFixed(6)),
      };

      logger.verbose(
        `DegradationDetectorAgent: прогноз=${result.prediction}, ` +
        `rawScore=${result.rawScore}, confidence=${result.confidence}`,
      );

      return makeResult(this.name, result, Date.now() - start);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.warn(`DegradationDetectorAgent: ошибка инференса: ${errorMessage}`);

      const result: DegradationResult = {
        score: 0,
        prediction: 'unknown',
        confidence: 0,
        status: 'error',
        modelPath,
        errorMessage: `Ошибка выполнения модели: ${errorMessage}`,
      };
      return makeResult(this.name, result, Date.now() - start);
    }
  }

  private extractFeaturesFromContext(context: RunContext): NormalizedFeatures | null {
    const config = context.get('config');
    const lintData = (context.get('lintResults')?.data ?? []) as LintResult[];
    const complexity = context.get('complexityResult')?.data as ComplexityResult | null;
    const testRun = context.get('testRunResult')?.data as TestRunResult | null;
    const security = context.get('securityResult')?.data as SecurityResult | null;
    const diff = context.get('diffResult')?.data as DiffMetrics | null;

    if (!hasMinimalAnalysisData({ lintData, complexity, testRun, security, diff })) {
      return null;
    }

    return buildNormalizedFeatures({
      lintData,
      complexity,
      testRun,
      security,
      diff,
      thresholds: config.thresholds,
    });
  }
}
