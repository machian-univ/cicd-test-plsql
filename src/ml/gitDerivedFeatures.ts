import { execFileSync } from 'child_process';

export interface GitDerivedFeatures {
  fix_ratio: number;
  revert_ratio: number;
  bus_factor: number;
}

const DEFAULTS: GitDerivedFeatures = {
  fix_ratio: 0,
  revert_ratio: 0,
  bus_factor: 1,
};

const FIX_MESSAGE_RE = /\b(fix|bug|hotfix|patch)\b/i;
const REVERT_MESSAGE_RE = /^revert\b/i;

export interface GitDerivedFeaturesOptions {
  sinceDays?: number;
  maxCommits?: number;
  maxBusFactor?: number;
}

export function computeGitDerivedFeatures(
  projectRoot: string,
  options: GitDerivedFeaturesOptions = {},
): GitDerivedFeatures {
  const sinceDays = options.sinceDays ?? 180;
  const maxCommits = options.maxCommits ?? 200;
  const maxBusFactor = options.maxBusFactor ?? 20;

  let output: string;
  try {
    output = execFileSync(
      'git',
      [
        'log',
        `--since=${sinceDays} days ago`,
        `--max-count=${maxCommits}`,
        '--format=%s%x1f%an',
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30_000,
        maxBuffer: 10 * 1024 * 1024,
      },
    ).trim();
  } catch {
    return { ...DEFAULTS };
  }

  if (!output) {
    return { ...DEFAULTS };
  }

  const lines = output.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) {
    return { ...DEFAULTS };
  }

  let fixCount = 0;
  let revertCount = 0;
  const authors = new Set<string>();

  for (const line of lines) {
    const sep = line.indexOf('\x1f');
    const subject = sep >= 0 ? line.slice(0, sep) : line;
    const author = sep >= 0 ? line.slice(sep + 1).trim() : '';

    if (FIX_MESSAGE_RE.test(subject)) fixCount++;
    if (REVERT_MESSAGE_RE.test(subject)) revertCount++;
    if (author) authors.add(author);
  }

  const total = lines.length;
  const busFactor = authors.size > 0
    ? Math.min(authors.size, maxBusFactor)
    : DEFAULTS.bus_factor;

  return {
    fix_ratio: fixCount / total,
    revert_ratio: revertCount / total,
    bus_factor: busFactor,
  };
}
