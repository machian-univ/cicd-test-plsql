import fs from 'fs';
import path from 'path';
import type { CoverageResult } from '../core/types.js';

interface CoverageSummaryTotal {
  total: number;
  covered: number;
  skipped: number;
  pct: number | 'Unknown';
}

interface CoverageSummaryJson {
  total?: {
    lines?:      CoverageSummaryTotal;
    branches?:   CoverageSummaryTotal;
    functions?:  CoverageSummaryTotal;
    statements?: CoverageSummaryTotal;
  };
  [filePath: string]: any;
}

// Обычный string[] — не const, чтобы разрешить push() с произвольными строками
const COVERAGE_CANDIDATE_PATHS: string[] = [
  'coverage/coverage-summary.json',
  'test-coverage/coverage-summary.json',
  'coverage-report/coverage-summary.json',
  '.coverage/coverage-summary.json',
  '.nyc_output/coverage-summary.json',
  'coverage/lcov-report/coverage-summary.json',
];

function extractPct(field: CoverageSummaryTotal | undefined): number | null {
  if (field === undefined || field === null) return null;
  const pct = field.pct;
  if (typeof pct === 'number' && Number.isFinite(pct)) return pct;
  return null;
}

function parseSummaryJson(json: CoverageSummaryJson): CoverageResult | null {
  if (json.total && typeof json.total === 'object') {
    const total = json.total;
    const lines      = extractPct(total.lines);
    const branches   = extractPct(total.branches);
    const functions  = extractPct(total.functions);
    const statements = extractPct(total.statements);

    if (
      lines === null &&
      branches === null &&
      functions === null &&
      statements === null
    ) {
      return null;
    }

    return { lines, branches, functions, statements, status: 'ok' };
  }

  // Istanbul v1: нет ключа 'total' на верхнем уровне — ищем среди ключей
  const totalKey = Object.keys(json).find(
    k => k.toLowerCase() === 'total' || k === ''
  );

  if (totalKey) {
    const total = json[totalKey];
    if (total && typeof total === 'object') {
      const lines      = extractPct(total.lines);
      const branches   = extractPct(total.branches);
      const functions  = extractPct(total.functions);
      const statements = extractPct(total.statements);

      if (
        lines === null &&
        branches === null &&
        functions === null &&
        statements === null
      ) {
        return null;
      }

      return { lines, branches, functions, statements, status: 'ok' };
    }
  }

  return null;
}

export function readCoverageSummary(
  projectRoot: string,
  extraDirs?: string[]
): CoverageResult | null {
  const candidatePaths: string[] = [...COVERAGE_CANDIDATE_PATHS];

  if (extraDirs) {
    for (const dir of extraDirs) {
      candidatePaths.push(`${dir}/coverage-summary.json`);
    }
  }

  for (const rel of candidatePaths) {
    const fullPath = path.isAbsolute(rel)
      ? rel
      : path.join(projectRoot, rel);

    if (!fs.existsSync(fullPath)) continue;

    try {
      const raw = fs.readFileSync(fullPath, 'utf8');
      if (!raw.trim()) continue;

      const json = JSON.parse(raw) as CoverageSummaryJson;
      const result = parseSummaryJson(json);
      if (result) return result;
    } catch {
      continue;
    }
  }

  return null;
}

export function findCoverageSummaryPath(
  projectRoot: string,
  extraDirs?: string[]
): string | null {
  const candidatePaths: string[] = [...COVERAGE_CANDIDATE_PATHS];

  if (extraDirs) {
    for (const dir of extraDirs) {
      candidatePaths.push(`${dir}/coverage-summary.json`);
    }
  }

  for (const rel of candidatePaths) {
    const fullPath = path.isAbsolute(rel)
      ? rel
      : path.join(projectRoot, rel);

    if (fs.existsSync(fullPath)) return fullPath;
  }

  return null;
}

export function detectCoverageExtraDirs(projectRoot: string): string[] {
  const dirs: string[] = [];

  const jestJsonConfig = tryReadJson<{ coverageDirectory?: string }>(
    path.join(projectRoot, 'jest.config.json')
  );
  if (jestJsonConfig?.coverageDirectory) {
    dirs.push(jestJsonConfig.coverageDirectory);
  }

  const pkg = tryReadJson<{
    jest?: { coverageDirectory?: string };
  }>(path.join(projectRoot, 'package.json'));
  if (pkg?.jest?.coverageDirectory) {
    dirs.push(pkg.jest.coverageDirectory);
  }

  return dirs;
}

function tryReadJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}