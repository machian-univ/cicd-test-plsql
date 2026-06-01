import path from 'path';
import fs from 'fs';
import type { NormalizedFeatures } from '../core/types.js';
import { logger } from '../utils/logger.js';
import { computeGitDerivedFeatures, type GitDerivedFeatures } from './gitDerivedFeatures.js';
import { runModelInference } from './onnxInference.js';

export const DEGRADATION_MODEL_FILENAME = 'degradation_model.onnx';

const FEATURE_NAMES: Array<keyof NormalizedFeatures | 'fix_ratio' | 'revert_ratio' | 'bus_factor'> = [
  'lintErrorsNorm',
  'lintWarningsNorm',
  'maxComplexityNorm',
  'avgComplexityNorm',
  'violationRateNorm',
  'totalLoc',
  'avgFileLoc',
  'coverageLinesNorm',
  'coverageBranchesNorm',
  'coverageFunctionsNorm',
  'testPassRateNorm',
  'testFailRateNorm',
  'criticalVulnCount',
  'highVulnCount',
  'gitleaksLeakCount',
  'locAdded',
  'locRemoved',
  'changeRatio',
  'hasTestsChanged',
  'hasConfigChanged',
  'authorExperience',
  'fileChurnAvg',
  'fix_ratio',
  'revert_ratio',
  'bus_factor',
];

const FEATURE_MAP: Record<string, keyof NormalizedFeatures> = {
  lintErrorsNorm: 'lintErrorsNorm',
  lintWarningsNorm: 'lintWarningsNorm',
  maxComplexityNorm: 'maxComplexityNorm',
  avgComplexityNorm: 'avgComplexityNorm',
  violationRateNorm: 'violationRateNorm',
  totalLoc: 'totalLoc',
  avgFileLoc: 'avgFileLoc',
  coverageLinesNorm: 'coverageLinesNorm',
  coverageBranchesNorm: 'coverageBranchesNorm',
  coverageFunctionsNorm: 'coverageFunctionsNorm',
  testPassRateNorm: 'testPassRateNorm',
  testFailRateNorm: 'testFailRateNorm',
  criticalVulnCount: 'criticalVulnCount',
  highVulnCount: 'highVulnCount',
  gitleaksLeakCount: 'gitleaksLeakCount',
  locAdded: 'locAdded',
  locRemoved: 'locRemoved',
  changeRatio: 'changeRatio',
  hasTestsChanged: 'hasTestsChanged',
  hasConfigChanged: 'hasConfigChanged',
  authorExperience: 'authorExperience',
  fileChurnAvg: 'fileChurnAvg',
};

const GIT_FEATURE_DEFAULTS: GitDerivedFeatures = {
  fix_ratio: 0,
  revert_ratio: 0,
  bus_factor: 1,
};

export interface PredictionResult {
  rawScore: number;
  isDegrading: boolean;
  confidence: number;
  modelPath: string;
}

export interface FeatureVector {
  values: Float32Array;
  names: string[];
}

export function buildFeatureVector(
  features: NormalizedFeatures,
  gitDerived?: GitDerivedFeatures,
): FeatureVector {
  const git = gitDerived ?? GIT_FEATURE_DEFAULTS;
  const values = new Float32Array(FEATURE_NAMES.length);

  for (let i = 0; i < FEATURE_NAMES.length; i++) {
    const name = FEATURE_NAMES[i];
    const mappedKey = FEATURE_MAP[name];

    if (mappedKey !== undefined) {
      values[i] = (features[mappedKey] as number) ?? 0;
    } else if (name === 'fix_ratio') {
      values[i] = git.fix_ratio;
    } else if (name === 'revert_ratio') {
      values[i] = git.revert_ratio;
    } else if (name === 'bus_factor') {
      values[i] = git.bus_factor;
    } else {
      values[i] = 0;
    }
  }

  return { values, names: FEATURE_NAMES as string[] };
}

export function findModelPath(projectRoot: string): string | null {
  const candidates: string[] = [
    path.join(projectRoot, '.pulsqual', DEGRADATION_MODEL_FILENAME),
    path.join(projectRoot, DEGRADATION_MODEL_FILENAME),
  ];

  try {
    const packageRoot = path.dirname(require.resolve('../../package.json'));
    candidates.push(path.join(packageRoot, DEGRADATION_MODEL_FILENAME));
    candidates.push(path.join(packageRoot, 'dist', DEGRADATION_MODEL_FILENAME));
  } catch {
    // пакет запущен вне npm-структуры
  }

  candidates.push(path.join(__dirname, '..', '..', DEGRADATION_MODEL_FILENAME));
  candidates.push(path.join(__dirname, '..', '..', 'dist', DEGRADATION_MODEL_FILENAME));

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        logger.verbose(`DegradationPredictor: модель найдена: ${candidate}`);
        return candidate;
      }
    } catch {
      // следующий кандидат
    }
  }

  return null;
}

export async function predict(
  features: NormalizedFeatures,
  projectRoot: string,
): Promise<PredictionResult | null> {
  const modelPath = findModelPath(projectRoot);
  if (!modelPath) {
    return null;
  }

  const gitDerived = computeGitDerivedFeatures(projectRoot);
  const { values } = buildFeatureVector(features, gitDerived);

  const rawScore = await runModelInference(
    modelPath,
    values,
    [1, FEATURE_NAMES.length],
  );

  if (rawScore === null) {
    return null;
  }

  const isDegrading = rawScore < 0.5;
  const confidence = Math.abs(rawScore - 0.5) * 2;

  return {
    rawScore,
    isDegrading,
    confidence,
    modelPath,
  };
}

function testsWereRun(features: NormalizedFeatures): boolean {
  return features.testPassRateNorm !== 0.5 || features.testFailRateNorm !== 0.5;
}

export function explainPrediction(
  features: NormalizedFeatures,
  _isDegrading: boolean,
): Array<{ factor: string; value: string; impact: 'positive' | 'negative' | 'neutral'; description: string }> {
  const explanations: Array<{ factor: string; value: string; impact: 'positive' | 'negative' | 'neutral'; description: string }> = [];

  if (features.lintErrorsNorm > 0.3) {
    explanations.push({
      factor: 'Ошибки линтера',
      value: `${(features.lintErrorsNorm * 100).toFixed(0)}% от порога`,
      impact: 'negative',
      description: 'Высокий уровень ошибок статического анализа увеличивает риск деградации',
    });
  } else if (features.lintErrorsNorm === 0) {
    explanations.push({
      factor: 'Ошибки линтера',
      value: 'Нет',
      impact: 'positive',
      description: 'Отсутствие ошибок линтера — признак стабильного кода',
    });
  }

  if (testsWereRun(features)) {
    if (features.testFailRateNorm > 0) {
      explanations.push({
        factor: 'Провалившиеся тесты',
        value: `${(features.testFailRateNorm * 100).toFixed(1)}%`,
        impact: 'negative',
        description: 'Наличие упавших тестов — сильный сигнал деградации',
      });
    } else if (features.testPassRateNorm === 1) {
      explanations.push({
        factor: 'Тесты',
        value: '100% прошли',
        impact: 'positive',
        description: 'Все тесты проходят успешно',
      });
    }
  }

  if (features.maxComplexityNorm > 1.5) {
    explanations.push({
      factor: 'Сложность кода',
      value: `${features.maxComplexityNorm.toFixed(1)}× порога`,
      impact: 'negative',
      description: 'Экстремально высокая сложность кода повышает вероятность ошибок',
    });
  } else if (features.maxComplexityNorm <= 1.0) {
    explanations.push({
      factor: 'Сложность кода',
      value: 'В норме',
      impact: 'positive',
      description: 'Сложность кода в пределах допустимого порога',
    });
  }

  if (features.criticalVulnCount > 0) {
    explanations.push({
      factor: 'Критические уязвимости',
      value: String(features.criticalVulnCount),
      impact: 'negative',
      description: 'Критические уязвимости зависимостей требуют немедленного исправления',
    });
  }

  if (features.gitleaksLeakCount > 0) {
    explanations.push({
      factor: 'Утечки секретов',
      value: String(features.gitleaksLeakCount),
      impact: 'negative',
      description: 'Обнаружены возможные утечки секретов в коде',
    });
  }

  if (testsWereRun(features)) {
    if (features.coverageLinesNorm < 0.3 && features.testPassRateNorm > 0) {
      explanations.push({
        factor: 'Покрытие тестами',
        value: `${(features.coverageLinesNorm * 100).toFixed(0)}%`,
        impact: 'negative',
        description: 'Низкое покрытие тестами увеличивает риск незамеченных ошибок',
      });
    } else if (features.coverageLinesNorm >= 0.8) {
      explanations.push({
        factor: 'Покрытие тестами',
        value: `${(features.coverageLinesNorm * 100).toFixed(0)}%`,
        impact: 'positive',
        description: 'Высокое покрытие тестами снижает риск деградации',
      });
    }
  }

  if (features.hasTestsChanged === 1) {
    explanations.push({
      factor: 'Тесты обновлены',
      value: 'Да',
      impact: 'positive',
      description: 'Изменения сопровождаются обновлением тестов',
    });
  } else if (features.locAdded > 100 && features.hasTestsChanged === 0) {
    explanations.push({
      factor: 'Тесты не обновлены',
      value: 'Нет',
      impact: 'negative',
      description: 'Значительные изменения кода без обновления тестов',
    });
  }

  if (features.authorExperience > 50) {
    explanations.push({
      factor: 'Опыт автора',
      value: `${features.authorExperience} коммитов`,
      impact: 'positive',
      description: 'Опытный автор снижает риск деградации',
    });
  } else if (features.authorExperience < 5) {
    explanations.push({
      factor: 'Опыт автора',
      value: `${features.authorExperience} коммитов`,
      impact: 'negative',
      description: 'Недостаточный опыт автора в данном репозитории',
    });
  }

  return explanations.slice(0, 6);
}
