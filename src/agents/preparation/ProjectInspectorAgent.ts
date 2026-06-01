import fs from 'fs';
import path from 'path';
import type { RunContext } from '../../core/RunContext.js';
import type {
  AgentResult, ProjectContext, TestRunner,
  StackDriftResult, StackDriftItem,
  VersionWarning, DetectedVersions,
} from '../../core/types.js';
import { STACK_REGISTRY } from '../../core/types.js';
import { getPackageVersion, checkVersionAgainstSpec, isAtLeast } from '../../utils/version.js';
import { logger } from '../../utils/logger.js';

function nowMs(): number { return Date.now(); }

function safeReadJsonFile<T = any>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch { return null; }
}

function fileExists(root: string, rel: string): boolean {
  return fs.existsSync(path.join(root, rel));
}

// Детекторы стека 

function detectTestRunner(
  deps: Record<string, string>,
  devDeps: Record<string, string>,
  rootPath: string,
): TestRunner {
  const all = { ...deps, ...devDeps };
  const hasVitest = Boolean(
    all.vitest || all['@vitest/coverage-v8'] || all['@vitest/coverage-istanbul'],
  );
  const hasJest = Boolean(all.jest || all['ts-jest'] || all['@jest/globals']);

  const pkg = safeReadJsonFile<{ scripts?: Record<string, string> }>(
    path.join(rootPath, 'package.json'),
  );
  const testScript = pkg?.scripts?.test ?? '';

  if (/vitest/i.test(testScript)) return 'vitest';
  if (/\bjest\b/i.test(testScript)) return 'jest';

  const hasVitestConfig =
    fileExists(rootPath, 'vitest.config.ts') ||
    fileExists(rootPath, 'vitest.config.mts') ||
    fileExists(rootPath, 'vitest.config.js');
  const hasJestConfig =
    fileExists(rootPath, 'jest.config.js') ||
    fileExists(rootPath, 'jest.config.ts') ||
    fileExists(rootPath, 'jest.config.mjs');

  if (hasVitest && hasJest) {
    if (hasVitestConfig && !hasJestConfig) return 'vitest';
    if (hasJestConfig && !hasVitestConfig) return 'jest';
  }

  if (hasVitest) return 'vitest';
  if (hasJest) return 'jest';
  if (all.mocha) return 'mocha';
  return 'unknown';
}

function detectHasReact(deps: Record<string, string>, devDeps: Record<string, string>): boolean {
  const all = { ...deps, ...devDeps };
  return Boolean(all.react || all['react-dom']);
}

function detectHasVue(deps: Record<string, string>, devDeps: Record<string, string>): boolean {
  return Boolean(deps.vue || devDeps.vue);
}

function detectHasNuxt(deps: Record<string, string>, devDeps: Record<string, string>): boolean {
  return Boolean(deps.nuxt || devDeps.nuxt);
}


// hasReact при наличии Next.js тоже будет true.
function detectHasNext(deps: Record<string, string>, devDeps: Record<string, string>): boolean {
  return Boolean(deps.next || devDeps.next);
}

function detectHasTypeScript(
  deps: Record<string, string>,
  devDeps: Record<string, string>,
  rootPath: string
): boolean {
  const all = { ...deps, ...devDeps };
  // Первичная проверка: наличие пакета
  if (Boolean(all.typescript || all['ts-node'] || all['tsx'])) return true;
  // Вторичная проверка: наличие tsconfig.json (TypeScript мог быть установлен глобально)
  if (fs.existsSync(path.join(rootPath, 'tsconfig.json'))) return true;
  // Третичная проверка: наличие .ts файлов в src
  const srcPath = path.join(rootPath, 'src');
  if (fs.existsSync(srcPath)) {
    try {
      const files = fs.readdirSync(srcPath);
      if (files.some(f => f.endsWith('.ts') || f.endsWith('.tsx'))) return true;
    } catch { /* игнор ошибки чтения */ }
  }
  return false;
}

function detectHasEslint(deps: Record<string, string>, devDeps: Record<string, string>): boolean {
  const all = { ...deps, ...devDeps };
  return Boolean(all.eslint);
}

function detectHasGit(root: string): boolean {
  const gitPath = path.join(root, '.git');
  if (!fs.existsSync(gitPath)) return false;
  try {
    const st = fs.statSync(gitPath);
    if (st.isDirectory()) return true;
    if (st.isFile()) {
      const content = fs.readFileSync(gitPath, 'utf8');
      return content.startsWith('gitdir:');
    }
    return false;
  } catch { return false; }
}

//  Поиск конфига ESLint

const ESLINT_CONFIG_FILES = [
  '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.mjs',
  '.eslintrc.json', '.eslintrc.yaml', '.eslintrc.yml',
  'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs',
  'eslint.config.ts', 'eslint.config.mts', 'eslint.config.cts',
];

function detectEslintConfig(root: string): { exists: boolean; configPath?: string } {
  for (const filename of ESLINT_CONFIG_FILES) {
    const fullPath = path.join(root, filename);
    if (fs.existsSync(fullPath)) return { exists: true, configPath: fullPath };
  }
  const pkg = safeReadJsonFile<{ eslintConfig?: unknown }>(path.join(root, 'package.json'));
  if (pkg?.eslintConfig) return { exists: true, configPath: path.join(root, 'package.json') };
  return { exists: false };
}

// Сбор обнаруженных версий

function collectDetectedVersions(
  deps: Record<string, string>,
  devDeps: Record<string, string>
): DetectedVersions {
  const get = (name: string) => getPackageVersion(name, deps, devDeps) ?? undefined;
  return {
    typescript:       get('typescript'),
    nuxt:             get('nuxt'),
    next:             get('next'),
    nestjs:           get('@nestjs/core'),
    eslint:           get('eslint'),
    vitest:           get('vitest'),
    jest:             get('jest'),
    react:            get('react'),
    vue:              get('vue'),
    sonarjs:          get('eslint-plugin-sonarjs'),
    vitestCoverageV8: get('@vitest/coverage-v8'),
  };
}


//строит предупреждения о версиях используя STACK_REGISTRY.
function buildVersionWarnings(
  deps: Record<string, string>,
  devDeps: Record<string, string>,
  detectedVersions: DetectedVersions
): VersionWarning[] {
  const warnings: VersionWarning[] = [];

  const toolsToCheck: Array<[keyof DetectedVersions, string]> = [
    ['typescript',       'typescript'],
    ['eslint',           'eslint'],
    ['react',            'react'],
    ['vue',              'vue'],
    ['next',             'next'],
    ['vitest',           'vitest'],
    ['nuxt',             'nuxt'],
    ['sonarjs',          'sonarjs'],
    ['vitestCoverageV8', '@vitest/coverage-v8'],
  ];

  for (const [versionKey, registryKey] of toolsToCheck) {
    const version = detectedVersions[versionKey];
    const spec = STACK_REGISTRY[registryKey];
    if (!version || !spec) continue;

    const issue = checkVersionAgainstSpec(version, spec);
    if (issue) {
      warnings.push({
        tool: spec.displayName,
        level: issue.blocking ? 'error' : 'warning',
        message: issue.message,
        blocking: issue.blocking,
      });
    }
  }

  // eslint-plugin-sonarjs: если не установлен вообще — info
  if (!detectedVersions.sonarjs) {
    warnings.push({
      tool: 'eslint-plugin-sonarjs',
      level: 'info',
      message:
        'eslint-plugin-sonarjs не установлен. Анализ когнитивной сложности будет недоступен. ' +
        'Установите: npm install --save-dev eslint-plugin-sonarjs',
      blocking: false,
    });
  }

  // @vitest/coverage-v8: если vitest есть, а провайдера нет
  if (detectedVersions.vitest?.valid && !detectedVersions.vitestCoverageV8) {
    warnings.push({
      tool: '@vitest/coverage-v8',
      level: 'warning',
      message:
        '@vitest/coverage-v8 не установлен. Метрики покрытия Vitest недоступны. ' +
        'Установите: npm install --save-dev @vitest/coverage-v8',
      blocking: false,
    });
  }

  // Совместимость мажорных версий vitest и coverage-v8
  if (
    detectedVersions.vitest?.valid &&
    detectedVersions.vitestCoverageV8?.valid &&
    detectedVersions.vitest.major !== detectedVersions.vitestCoverageV8.major
  ) {
    warnings.push({
      tool: '@vitest/coverage-v8',
      level: 'warning',
      message:
        `Версия @vitest/coverage-v8 (${detectedVersions.vitestCoverageV8.raw}) не совпадает ` +
        `по основной версии с vitest (${detectedVersions.vitest.raw}). ` +
        'Обновите оба пакета до одной основной версии.',
      blocking: false,
    });
  }

  // Jest v29+: информация о coverageReporters
  if (detectedVersions.jest?.valid && detectedVersions.jest.major >= 29) {
    warnings.push({
      tool: 'jest',
      level: 'info',
      message:
        `Jest ${detectedVersions.jest.raw} (v29 и выше): убедитесь, что в jest.config указан ` +
        `coverageReporters: ['json-summary'] для корректной работы Pulsqual. ` +
        'Pulsqual передаёт этот флаг автоматически при запуске тестов.',
      blocking: false,
    });
  }

  // NestJS + ESLint v9: предупреждение о совместимости
  if (detectedVersions.nestjs?.valid && detectedVersions.eslint?.valid) {
    if (detectedVersions.eslint.major >= 9) {
      warnings.push({
        tool: 'NestJS + ESLint',
        level: 'warning',
        message:
          `NestJS + ESLint ${detectedVersions.eslint.raw}: в ESLint версии 9 flat config ` +
          'parserOptions.ecmaFeatures.legacyDecorators не поддерживается напрямую. ' +
          'Используйте @typescript-eslint/parser с experimentalDecorators: true в tsconfig.json.',
        blocking: false,
      });
    }
  }

  // Next.js конфликт версий с eslint-config-next
  if (detectedVersions.next?.valid) {
    const nextEslintConfigVersion = getPackageVersion('eslint-config-next', deps, devDeps);
    if (nextEslintConfigVersion?.valid && detectedVersions.next.valid) {
      if (nextEslintConfigVersion.major !== detectedVersions.next.major) {
        warnings.push({
          tool: 'eslint-config-next',
          level: 'warning',
          message:
            `eslint-config-next (${nextEslintConfigVersion.raw}) и next (${detectedVersions.next.raw}) ` +
            'имеют разные основные версии. Рекомендуется использовать одинаковые версии. ' +
            'Установите: npm install --save-dev eslint-config-next@' + detectedVersions.next.major,
          blocking: false,
        });
      }
    }
  }

  return warnings;
}

//  Stack Drift

function detectStackDrift(
  current: Pick<ProjectContext, 'testRunner' | 'hasTypeScript' | 'hasEslint' | 'hasReact' | 'hasVue' | 'hasNext' | 'hasNuxt'>,
  snapshot: NonNullable<import('../../core/types.js').PulsqualConfig['stackSnapshot']>
): StackDriftResult {
  const drifts: StackDriftItem[] = [];

  if (current.testRunner !== snapshot.testRunner)
    drifts.push({ field: 'testRunner', expected: snapshot.testRunner, actual: current.testRunner });
  if (current.hasTypeScript !== snapshot.hasTypeScript)
    drifts.push({ field: 'hasTypeScript', expected: String(snapshot.hasTypeScript), actual: String(current.hasTypeScript) });
  if (current.hasEslint !== snapshot.hasEslint)
    drifts.push({ field: 'hasEslint', expected: String(snapshot.hasEslint), actual: String(current.hasEslint) });
  if (current.hasReact !== snapshot.hasReact)
    drifts.push({ field: 'hasReact', expected: String(snapshot.hasReact), actual: String(current.hasReact) });
  if (current.hasVue !== snapshot.hasVue)
    drifts.push({ field: 'hasVue', expected: String(snapshot.hasVue), actual: String(current.hasVue) });
  // Требование 1: добавлены hasNext и hasNuxt в drift
  if (typeof snapshot.hasNext !== 'undefined' && current.hasNext !== snapshot.hasNext)
    drifts.push({ field: 'hasNext', expected: String(snapshot.hasNext), actual: String(current.hasNext) });
  if (typeof snapshot.hasNuxt !== 'undefined' && current.hasNuxt !== snapshot.hasNuxt)
    drifts.push({ field: 'hasNuxt', expected: String(snapshot.hasNuxt), actual: String(current.hasNuxt) });

  return { hasDrift: drifts.length > 0, drifts };
}

// Агент 

export class ProjectInspectorAgent {
  readonly name = 'ProjectInspectorAgent';

  async run(ctx: RunContext): Promise<AgentResult<ProjectContext>> {
    const started = nowMs();

    try {
      const rootPath = ctx.get('projectRoot');
      const config   = ctx.get('config');

      const pkg = safeReadJsonFile<{
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      }>(path.join(rootPath, 'package.json'));

      const dependencies: Record<string, string>    = pkg?.dependencies    ?? {};
      const devDependencies: Record<string, string> = pkg?.devDependencies ?? {};

      const hasTsConfig     = fileExists(rootPath, 'tsconfig.json');
      const hasJestConfig   =
        fileExists(rootPath, 'jest.config.js')  || fileExists(rootPath, 'jest.config.cjs') ||
        fileExists(rootPath, 'jest.config.mjs') || fileExists(rootPath, 'jest.config.ts')  ||
        fileExists(rootPath, 'jest.config.json');
      const hasVitestConfig =
        fileExists(rootPath, 'vitest.config.ts')  || fileExists(rootPath, 'vitest.config.mts') ||
        fileExists(rootPath, 'vitest.config.cts') || fileExists(rootPath, 'vitest.config.js')  ||
        fileExists(rootPath, 'vitest.config.mjs') || fileExists(rootPath, 'vitest.config.cjs');

      const hasGit        = detectHasGit(rootPath);
      const hasTypeScript = detectHasTypeScript(dependencies, devDependencies, rootPath);
      const hasReact      = detectHasReact(dependencies, devDependencies);
      const hasVue        = detectHasVue(dependencies, devDependencies);
      const hasNuxt       = detectHasNuxt(dependencies, devDependencies);
      const hasNext       = detectHasNext(dependencies, devDependencies);
      const hasEslint     = detectHasEslint(dependencies, devDependencies);
      const testRunner    = detectTestRunner(dependencies, devDependencies, rootPath);

      const eslintConfigDetection = detectEslintConfig(rootPath);

      const nestjsVersion = getPackageVersion('@nestjs/core', dependencies, devDependencies);
      const requiresDecorators =
        nestjsVersion !== null && nestjsVersion.valid && isAtLeast(nestjsVersion, 10, 0);

      const detectedVersions = collectDetectedVersions(dependencies, devDependencies);
      const versionWarnings  = buildVersionWarnings(dependencies, devDependencies, detectedVersions);

      // Stack drift: сравниваем с сохраненным снимком
      let stackDrift: StackDriftResult | undefined;
      if (config.stackSnapshot) {
        stackDrift = detectStackDrift(
          { testRunner, hasTypeScript, hasEslint, hasReact, hasVue, hasNext, hasNuxt },
          config.stackSnapshot
        );
        if (stackDrift.hasDrift) {
          logger.verbose(
            `ProjectInspector: обнаружен дрейф стека: ` +
            stackDrift.drifts.map(d => `${d.field}: ${d.expected} -> ${d.actual}`).join(', ')
          );
        }
      }

      const data: ProjectContext = {
        rootPath,
        hasGit,
        hasTypeScript,
        hasReact,
        hasVue,
        hasNuxt,
        hasNext,
        testRunner,
        hasEslint,
        hasTsConfig,
        hasJestConfig,
        hasVitestConfig,
        dependencies,
        devDependencies,
        stackDrift,
        requiresDecorators,
        eslintConfigExists: eslintConfigDetection.exists,
        eslintConfigPath:   eslintConfigDetection.configPath,
        detectedVersions,
        versionWarnings,
      };

      return {
        agentName: this.name,
        success:   true,
        data,
        durationMs: nowMs() - started,
      };
    } catch (e) {
      return {
        agentName: this.name,
        success:   false,
        data:      null,
        error:     e instanceof Error ? e.message : String(e),
        durationMs: nowMs() - started,
      };
    }
  }
}