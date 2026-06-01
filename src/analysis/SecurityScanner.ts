// gitleaksUnavailableReason: 'not_installed' когда gitleaks не найден
// gitleaksUnavailableReason: 'execution_error' при ошибке выполнения
// gitleaksUnavailableReason: 'config_error' при ошибке конфигурации

import { execFileSync, execSync, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import type { SecurityResult, AuditAdvisory, GitleaksLeak, SecurityUnavailableReason } from '../core/types.js';

// npm audit

interface NpmAuditJsonV2 {
  auditReportVersion?: number;
  vulnerabilities?: Record<string, {
    name: string;
    severity: string;
    via: unknown[];
  }>;
  metadata?: {
    vulnerabilities?: {
      critical?: number;
      high?: number;
      moderate?: number;
      low?: number;
      info?: number;
      total?: number;
    };
  };
}

interface NpmAuditJsonV1 {
  metadata?: {
    vulnerabilities?: {
      critical?: number;
      high?: number;
      moderate?: number;
      low?: number;
      info?: number;
    };
  };
  advisories?: Record<string, {
    id: number;
    title: string;
    severity: string;
    module_name: string;
    url: string;
  }>;
}

function runNpmAudit(projectRoot: string): {
  total: number;
  critical: number;
  high: number;
  moderate: number;
  low: number;
  advisories: AuditAdvisory[];
  error?: string;
} {
  const empty = { total: 0, critical: 0, high: 0, moderate: 0, low: 0, advisories: [] };

  const hasLock =
    fs.existsSync(path.join(projectRoot, 'package-lock.json')) ||
    fs.existsSync(path.join(projectRoot, 'npm-shrinkwrap.json'));

  if (!hasLock) {
    const hasOtherLock =
      fs.existsSync(path.join(projectRoot, 'yarn.lock')) ||
      fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml')) ||
      fs.existsSync(path.join(projectRoot, 'bun.lockb'));

    return {
      ...empty,
      error: hasOtherLock
        ? 'npm audit пропущен: используется не npm (нет package-lock.json). ' +
          'Для yarn/pnpm/bun используйте встроенный аудит.'
        : 'npm audit пропущен: package-lock.json не найден.',
    };
  }

  let stdout = '';
  try {
    stdout = execSync('npm audit --json --audit-level=none', {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err: any) {
    stdout = err.stdout ?? '';
    if (!stdout) {
      return {
        ...empty,
        error: `npm audit завершился с ошибкой: ${err.message ?? String(err)}`,
      };
    }
  }

  if (!stdout.trim()) return empty;

  try {
    const json = JSON.parse(stdout);

    if (json.auditReportVersion === 2) {
      const v2 = json as NpmAuditJsonV2;
      const meta = v2.metadata?.vulnerabilities ?? {};
      const critical = meta.critical ?? 0;
      const high     = meta.high     ?? 0;
      const moderate = meta.moderate ?? 0;
      const low      = meta.low      ?? 0;
      const total    = meta.total    ?? (critical + high + moderate + low);

      const advisories: AuditAdvisory[] = [];
      if (v2.vulnerabilities) {
        for (const [, vuln] of Object.entries(v2.vulnerabilities)) {
          const sev = vuln.severity as AuditAdvisory['severity'];
          if (['critical', 'high', 'moderate', 'low'].includes(sev)) {
            advisories.push({
              id: vuln.name,
              title: vuln.name,
              severity: sev,
              packageName: vuln.name,
            });
          }
        }
      }

      return { total, critical, high, moderate, low, advisories };
    } else {
      const v1 = json as NpmAuditJsonV1;
      const meta = v1.metadata?.vulnerabilities ?? {};
      const critical = meta.critical ?? 0;
      const high     = meta.high     ?? 0;
      const moderate = meta.moderate ?? 0;
      const low      = meta.low      ?? 0;
      const total    = critical + high + moderate + low;

      const advisories: AuditAdvisory[] = v1.advisories
        ? Object.values(v1.advisories).map(a => ({
            id: a.id,
            title: a.title,
            severity: a.severity as AuditAdvisory['severity'],
            packageName: a.module_name,
            url: a.url,
          }))
        : [];

      return { total, critical, high, moderate, low, advisories };
    }
  } catch {
    return { ...empty, error: 'Не удалось распарсить JSON npm audit' };
  }
}

//  gitleaks 
function checkGitleaksAvailability(): {
  available: boolean;
  unavailableReason?: SecurityUnavailableReason;
} {
  try {
    execSync('gitleaks version', { stdio: 'pipe', timeout: 5000 });
    return { available: true };
  } catch {
    return { available: false, unavailableReason: 'not_installed' };
  }
}

interface GitleaksJsonLeak {
  Description?: string;
  File?: string;
  StartLine?: number;
  RuleID?: string;
}


function runGitleaks(projectRoot: string): {
  found: number;
  leaks: GitleaksLeak[];
  error?: string;
  errorKind?: SecurityUnavailableReason;
} {
  const reportPath = path.join(projectRoot, '.pulsqual', 'gitleaks-report.json');
  const reportDir  = path.dirname(reportPath);

  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  try {
    execSync(
      `gitleaks detect --source "${projectRoot}" --report-format json ` +
      `--report-path "${reportPath}" --exit-code 1`,
      {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120_000,
      }
    );
    return { found: 0, leaks: [] };
  } catch (err: any) {
    if (err.status === 1 && fs.existsSync(reportPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        const items: GitleaksJsonLeak[] = Array.isArray(raw) ? raw : [];
        const leaks: GitleaksLeak[] = items.map(item => ({
          description: item.Description ?? 'Secret found',
          file: item.File ?? 'unknown',
          line: item.StartLine,
          ruleId: item.RuleID,
        }));
        return { found: leaks.length, leaks };
      } catch {
        // ошибка чтения отчета — это ошибка выполнения, не недоступность
        return {
          found: 0, leaks: [],
          error: 'Не удалось прочитать отчёт gitleaks',
          errorKind: 'execution_error',
        };
      }
    }

    if (err.status === 2) {
      // exit 2 = ошибка конфигурации gitleaks
      return {
        found: 0, leaks: [],
        error: `gitleaks: ошибка конфигурации — ${err.stderr ?? ''}`,
        errorKind: 'config_error',
      };
    }

    // Прочие ошибки = ошибка выполнения
    return {
      found: 0, leaks: [],
      error: `gitleaks завершился неожиданно: ${err.message ?? String(err)}`,
      errorKind: 'execution_error',
    };
  } finally {
    if (fs.existsSync(reportPath)) {
      try { fs.unlinkSync(reportPath); } catch { /* игнорируем */ }
    }
  }
}

function runGitleaksDiff(diff: string): {
  found: number;
  leaks: GitleaksLeak[];
  error?: string;
  errorKind?: SecurityUnavailableReason;
} {
  if (!diff.trim()) return { found: 0, leaks: [] };

  const result = spawnSync('gitleaks', [
    'detect',
    '--pipe',
    '--report-format', 'json',
    '--exit-code', '1',
  ], {
    input: diff,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 5 * 1024 * 1024,
  });

  if (result.error) {
    return {
      found: 0, leaks: [],
      errorKind: 'not_installed',
    };
  }

  if (result.status === 0) {
    return { found: 0, leaks: [] };
  }

  if (result.status === 1 && result.stdout) {
    try {
      const raw = JSON.parse(result.stdout);
      const items: GitleaksJsonLeak[] = Array.isArray(raw) ? raw : [];
      const leaks: GitleaksLeak[] = items.map(item => ({
        description: item.Description ?? 'Secret found',
        file: item.File ?? 'unknown',
        line: item.StartLine,
        ruleId: item.RuleID,
      }));
      return { found: leaks.length, leaks };
    } catch {
      return {
        found: 0, leaks: [],
        error: 'Не удалось распарсить вывод gitleaks',
        errorKind: 'execution_error',
      };
    }
  }

  return {
    found: 0, leaks: [],
    error: `gitleaks завершился с неожиданным кодом: ${result.status}`,
    errorKind: 'execution_error',
  };
}

//  Публичный API 

export function runSecurityScan(projectRoot: string): SecurityResult {
  const audit = runNpmAudit(projectRoot);
  const gitleaksCheck = checkGitleaksAvailability();

  let gitleaksFound    = 0;
  let gitleaksLeaks: GitleaksLeak[] = [];
  let gitleaksError: string | undefined;
  let gitleaksUnavailableReason: SecurityUnavailableReason | undefined;

  if (gitleaksCheck.available) {
    const gl = runGitleaks(projectRoot);
    gitleaksFound  = gl.found;
    gitleaksLeaks  = gl.leaks;
    // если gitleaks доступен, но упал — это execution_error, не not_installed
    if (gl.error) {
      gitleaksError = gl.error;
      gitleaksUnavailableReason = gl.errorKind;
    }
  } else {
    // req. 9: явно фиксируем причину недоступности
    gitleaksUnavailableReason = gitleaksCheck.unavailableReason;
  }

  return {
    auditVulnerabilities: audit.total,
    auditCritical:        audit.critical,
    auditHigh:            audit.high,
    auditModerate:        audit.moderate,
    auditLow:             audit.low,
    gitleaksFound,
    gitleaksAvailable:          gitleaksCheck.available,
    gitleaksUnavailableReason,
    gitleaksError,
    auditAdvisories:  audit.advisories,
    gitleaksLeaks,
    status: 'ok',
    errorMessage: audit.error,
  };
}

export function runDiffSecurityScan(diff: string): SecurityResult {
  const gitleaksCheck = checkGitleaksAvailability();

  let gitleaksFound    = 0;
  let gitleaksLeaks: GitleaksLeak[] = [];
  let gitleaksError: string | undefined;
  let gitleaksUnavailableReason: SecurityUnavailableReason | undefined;

  if (gitleaksCheck.available && diff.trim()) {
    const gl = runGitleaksDiff(diff);
    gitleaksFound = gl.found;
    gitleaksLeaks = gl.leaks;
    if (gl.error) {
      gitleaksError = gl.error;
      gitleaksUnavailableReason = gl.errorKind;
    }
  } else if (!gitleaksCheck.available) {
    gitleaksUnavailableReason = gitleaksCheck.unavailableReason;
  }

  return {
    auditVulnerabilities: 0,
    auditCritical:        0,
    auditHigh:            0,
    auditModerate:        0,
    auditLow:             0,
    gitleaksFound,
    gitleaksAvailable:          gitleaksCheck.available,
    gitleaksUnavailableReason,
    gitleaksError,
    auditAdvisories:  [],
    gitleaksLeaks,
    status: 'ok',
  };
}