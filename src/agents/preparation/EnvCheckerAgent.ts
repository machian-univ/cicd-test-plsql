import { execSync } from 'child_process';
import type { Agent } from '../base/Agent.js';
import { makeResult, makeError } from '../base/Agent.js';
import type { RunContext } from '../../core/RunContext.js';
import type {
  EnvCheckResult, ProjectContext, AgentResult, StackDriftResult,
  VersionWarning, DetectedVersions, VersionInfo,
} from '../../core/types.js';
import { STACK_REGISTRY } from '../../core/types.js';
import { logger } from '../../utils/logger.js';
import { parseVersion, isAtLeast, checkVersionAgainstSpec } from '../../utils/version.js';

interface ToolCheck {
  name: string;
  command: string;
  required: boolean;
}

const TOOLS: ToolCheck[] = [
  { name: 'node',     command: 'node --version',   required: true  },
  { name: 'npm',      command: 'npm --version',    required: true  },
  { name: 'git',      command: 'git --version',    required: true  },
  { name: 'gitleaks', command: 'gitleaks version', required: false },
];

function tryGetOutput(command: string): string | null {
  try {
    return execSync(command, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
      encoding: 'utf8',
    }).trim();
  } catch { return null; }
}

function isAvailable(command: string): boolean {
  try {
    execSync(command, { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch (err: any) {
    if (err?.code === 'ENOENT' || err?.message?.includes('not found')) return false;
    return err?.status !== undefined;
  }
}

function checkNodeVersion(
  warnings: VersionWarning[],
  detected: DetectedVersions
): { blocking: boolean; version: VersionInfo | undefined } {
  const raw = tryGetOutput('node --version');
  if (!raw) {
    warnings.push({
      tool: 'node',
      level: 'error',
      message: 'Node.js не найден в PATH. Установите Node.js 20 LTS: https://nodejs.org/',
      blocking: true,
    });
    return { blocking: true, version: undefined };
  }

  const version = parseVersion(raw);
  detected.node = version;

  if (!version.valid) {
    warnings.push({
      tool: 'node',
      level: 'warning',
      message: `Не удалось определить версию Node.js (получено: "${raw}"). Убедитесь, что установлен Node.js 18.18+.`,
      blocking: false,
    });
    return { blocking: false, version };
  }

  const spec = STACK_REGISTRY.node;
  const issue = checkVersionAgainstSpec(version, spec);

  if (issue) {
    warnings.push({
      tool: 'node',
      level: issue.blocking ? 'error' : 'warning',
      message: issue.message,
      blocking: issue.blocking,
    });
    if (issue.blocking) {
      logger.error(`EnvChecker: ${issue.message}`);
    } else {
      logger.warn(`EnvChecker: ${issue.message}`);
    }
    return { blocking: issue.blocking, version };
  }

  logger.verbose(`EnvChecker: Node.js ${version.raw} — OK`);
  return { blocking: false, version };
}

function checkNpmVersion(detected: DetectedVersions): void {
  const raw = tryGetOutput('npm --version');
  if (!raw) return;
  const version = parseVersion(raw);
  detected.npm = version;
  logger.verbose(`EnvChecker: npm ${version.raw}`);
}

function checkGitVersion(detected: DetectedVersions): void {
  const raw = tryGetOutput('git --version');
  if (!raw) return;
  
  const match = raw.match(/(\d+\.\d+(?:\.\d+)?)/);
  const versionStr = match ? match[1] : raw;
  const version = parseVersion(versionStr);
  detected.git = version;
  logger.verbose(`EnvChecker: git ${version.raw}`);
}

function checkGitleaksVersion(warnings: VersionWarning[], detected: DetectedVersions): void {
  const raw = tryGetOutput('gitleaks version');
  if (!raw) {
    logger.verbose('EnvChecker: gitleaks не установлен (опционально)');
    return;
  }

  const version = parseVersion(raw);
  detected.gitleaks = version;

  if (!version.valid) {
    warnings.push({
      tool: 'gitleaks',
      level: 'warning',
      message: `Не удалось определить версию gitleaks (получено: "${raw}"). Ожидается v8.x.`,
      blocking: false,
    });
    return;
  }

  const spec = STACK_REGISTRY.gitleaks;
  const issue = checkVersionAgainstSpec(version, spec);

  if (issue) {
    warnings.push({
      tool: 'gitleaks',
      level: issue.blocking ? 'error' : 'warning',
      message: issue.message,
      blocking: issue.blocking,
    });
    logger.warn(`EnvChecker: ${issue.message}`);
  } else {
    logger.verbose(`EnvChecker: gitleaks ${version.raw} — OK`);
  }
}

export class EnvCheckerAgent implements Agent<EnvCheckResult> {
  readonly name = 'EnvCheckerAgent';

  async run(context: RunContext): Promise<AgentResult<EnvCheckResult>> {
    const start = Date.now();

    try {
      const projectData  = context.get('projectContext');
      const project      = projectData?.data as ProjectContext | null;
      const gitAvailable = context.get('gitAvailable') ?? false;

      const present: string[]          = [];
      const missingRequired: string[]  = [];
      const missingOptional: string[]  = [];
      const warnings: string[]         = [];
      const versionWarnings: VersionWarning[] = [];
      const detectedVersions: DetectedVersions = {};

      // Проверка Node.js
      const nodeCheck = checkNodeVersion(versionWarnings, detectedVersions);
      if (nodeCheck.blocking) {
        missingRequired.push('node-version-too-old');
      }

      // Проверка npm и git версий (для отчёта)
      checkNpmVersion(detectedVersions);
      checkGitVersion(detectedVersions);

      // Проверка gitleaks
      checkGitleaksVersion(versionWarnings, detectedVersions);

      // Стандартная проверка наличия инструментов
      for (const tool of TOOLS) {
        const available = isAvailable(tool.command);
        if (available) {
          present.push(tool.name);
        } else if (tool.required) {
          if (tool.name !== 'node' || !nodeCheck.blocking) {
            if (!missingRequired.includes(tool.name)) {
              missingRequired.push(tool.name);
            }
          }
        } else {
          missingOptional.push(tool.name);
        }
      }

      // Копируем предупреждения о версиях из ProjectInspectorAgent
      if (project?.versionWarnings) {
        for (const w of project.versionWarnings) {
          const already = versionWarnings.some(
            x => x.tool === w.tool && x.message === w.message
          );
          if (!already) {
            versionWarnings.push(w);
            if (w.level === 'critical' || w.level === 'error') {
              warnings.push(`[${w.level.toUpperCase()}] ${w.tool}: ${w.message}`);
            } else if (w.level === 'warning') {
              warnings.push(`[WARN] ${w.tool}: ${w.message}`);
            }
          }
        }
      }

      // Предупреждения об окружении проекта
      if (project) {
        if (!project.hasGit) {
          warnings.push(
            'Git-репозиторий не инициализирован. Запустите: git init && git add . && git commit -m "init"'
          );
        }
        if (!project.hasEslint) {
          warnings.push('ESLint не установлен. Статический анализ будет пропущен. Запустите: pulsqual init');
        }
        if (project.hasTypeScript && !project.hasTsConfig) {
          warnings.push('TypeScript обнаружен, но tsconfig.json отсутствует');
        }
        if (project.testRunner === 'unknown') {
          warnings.push(
            'Тест-раннер не обнаружен (Jest или Vitest). Метрики покрытия недоступны. Запустите: pulsqual init'
          );
        }
      }

      // Stack drift
      const stackDrift: StackDriftResult | undefined = project?.stackDrift;
      if (stackDrift?.hasDrift) {
        const criticalDrift = stackDrift.drifts.some(
          d => d.field === 'testRunner' || d.field === 'hasTypeScript',
        );
        if (criticalDrift) {
          missingRequired.push('stack-snapshot-update-required');
        }
        const frameworkDrift = stackDrift.drifts.some(
          d => d.field === 'hasReact' || d.field === 'hasVue' ||
            d.field === 'hasNext' || d.field === 'hasNuxt' || d.field === 'hasEslint',
        );
        if (frameworkDrift) {
          warnings.push(
            'Стек проекта изменился относительно снимка init (фреймворк или ESLint). ' +
            'Запустите pulsqual init для обновления конфигурации.',
          );
        }
      }

      // Добавляем версии из projectCtx в detectedVersions (если не определены системно)
      if (project?.detectedVersions) {
        for (const [key, val] of Object.entries(project.detectedVersions)) {
          if (val && !(detectedVersions as any)[key]) {
            (detectedVersions as any)[key] = val;
          }
        }
      }

      const result: EnvCheckResult = {
        missingRequired,
        missingOptional,
        present,
        warnings,
        gitAvailable,
        stackDrift,
        versionWarnings,
        detectedVersions,
      };

      return makeResult(this.name, result, Date.now() - start);
    } catch (err) {
      logger.error(`EnvCheckerAgent: необработанное исключение: ${String(err)}`);
      return makeError(this.name, String(err), Date.now() - start);
    }
  }
}