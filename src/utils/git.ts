import { execSync, execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import type { CommitInfo } from '../core/types.js';

function tryGit(cmd: string, cwd: string, fallback: string): string {
  try {
    return execSync(cmd, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15_000,
    }).trim();
  } catch {
    return fallback;
  }
}

function tryGitFile(args: string[], cwd: string, fallback: string): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15_000,
    }).trim();
  } catch {
    return fallback;
  }
}

export const git = {
  isRepo(cwd: string): boolean {
    try {
      execSync('git rev-parse --git-dir', {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5_000,
      });
      return true;
    } catch {
      return false;
    }
  },

  getCommitHash(cwd: string): string {
    return tryGitFile(['rev-parse', 'HEAD'], cwd, 'unknown');
  },

  getCommitAuthor(cwd: string): string {
    return tryGitFile(['log', '-1', '--format=%an'], cwd, 'unknown');
  },

  getCommitDate(cwd: string): string {
    return tryGitFile(['log', '-1', '--format=%ci'], cwd, new Date().toISOString());
  },

  getCommitMessage(cwd: string): string {
    return tryGitFile(['log', '-1', '--format=%s'], cwd, '');
  },

  getCommitMessageFull(cwd: string): string {
    return tryGitFile(['log', '-1', '--format=%B'], cwd, '');
  },

  getBranch(cwd: string): string {
    // Сначала пробуем стандартный способ
    const branch = tryGitFile(['rev-parse', '--abbrev-ref', 'HEAD'], cwd, '');
    if (branch && branch !== 'HEAD') return branch;

    // В CI HEAD может быть detached — пробуем переменные окружения
    const envBranch =
      process.env['GITHUB_HEAD_REF'] ||
      process.env['GITHUB_REF_NAME'] ||
      process.env['CI_COMMIT_REF_NAME'];
    if (envBranch) return envBranch;

    return branch || 'unknown';
  },

  /**
   * Получить список коммитов между baseRef и HEAD (для CI/PR).
   * Возвращает информацию о каждом коммите.
   */
  getPrCommits(cwd: string, baseRef: string): CommitInfo[] {
    try {
      // Формат: hash|author|date|subject
      const output = execFileSync(
        'git',
        ['log', `${baseRef}..HEAD`, '--format=%H|%an|%ci|%s', '--no-merges'],
        {
          cwd,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 15_000,
        }
      ).trim();

      if (!output) return [];

      return output.split('\n')
        .filter(l => l.trim())
        .map(line => {
          const [hash, author, date, ...msgParts] = line.split('|');
          const message = msgParts.join('|').trim();
          return {
            hash: hash?.trim() ?? 'unknown',
            shortHash: (hash?.trim() ?? 'unknown').slice(0, 7),
            author: author?.trim() ?? 'unknown',
            date: date?.trim() ?? '',
            message: message || '(нет описания)',
          };
        });
    } catch {
      return [];
    }
  },

  /**
   * Получить сообщение HEAD-коммита с полной информацией.
   */
  getHeadCommitInfo(cwd: string): CommitInfo {
    const hash   = git.getCommitHash(cwd);
    const author = git.getCommitAuthor(cwd);
    const date   = git.getCommitDate(cwd);
    const message = git.getCommitMessage(cwd);

    return {
      hash,
      shortHash: hash.slice(0, 7),
      author,
      date,
      message: message || '(нет описания)',
    };
  },

  /**
   * Возвращает список staged-файлов (для локального/quick режима).
   */
  getStagedFiles(cwd: string): string[] {
    try {
      const output = execFileSync(
        'git',
        ['diff', '--cached', '--name-only', '--diff-filter=ACM'],
        {
          cwd,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 10_000,
        }
      ).trim();

      if (!output) return [];

      return output
        .split('\n')
        .map(f => f.trim())
        .filter(f => f.length > 0)
        .map(f => path.join(cwd, f))
        .filter(f => fs.existsSync(f));
    } catch {
      return [];
    }
  },

  /**
   * Возвращает diff staged-изменений.
   */
  getStagedDiff(cwd: string): string {
    return tryGitFile(['diff', '--cached'], cwd, '');
  },

  /**
   * Возвращает список всех tracked-файлов в репозитории.
   */
  getTrackedFiles(cwd: string): string[] {
    try {
      const output = execFileSync('git', ['ls-files'], {
        cwd,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10_000,
      }).trim();

      if (!output) return [];

      return output
        .split('\n')
        .map(f => f.trim())
        .filter(f => f.length > 0)
        .map(f => path.join(cwd, f))
        .filter(f => fs.existsSync(f));
    } catch {
      return [];
    }
  },
};