import { execFileSync } from 'child_process';
import { findLocalBin, useShellForLocalBin } from '../../utils/bin.js';

export interface ExecTestCommandOptions {
  projectRoot: string;
  binaryName: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  /** Код выхода 1 считается успешным запуском (упавшие тесты). */
  acceptExitCode1?: boolean;
  /** Вернуть stdout/stderr из исключения (Jest пишет JSON в stdout при падении тестов). */
  recoverOutputFromError?: boolean;
}

export type ExecTestCommandResult =
  | { ok: true; stdout: string; stderr: string }
  | { ok: false; errorMessage: string };

export function execTestCommand(options: ExecTestCommandOptions): ExecTestCommandResult {
  const bin = findLocalBin(options.projectRoot, options.binaryName);
  if (!bin) {
    return {
      ok: false,
      errorMessage: `${options.binaryName} не найден в node_modules. Запустите: pulsqual init`,
    };
  }

  try {
    const stdout = execFileSync(bin, options.args, {
      cwd: options.projectRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300_000,
      maxBuffer: 30 * 1024 * 1024,
      shell: useShellForLocalBin(),
      env: options.env ?? process.env,
    });
    return { ok: true, stdout, stderr: '' };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string; message?: string };
    if (
      options.recoverOutputFromError &&
      typeof e.stdout === 'string' &&
      e.stdout.trim().length > 0
    ) {
      return {
        ok: true,
        stdout: e.stdout,
        stderr: e.stderr ?? '',
      };
    }
    if (options.acceptExitCode1 && e.status === 1) {
      return {
        ok: true,
        stdout: e.stdout ?? '',
        stderr: e.stderr ?? '',
      };
    }
    const msg = e.stderr ?? e.message ?? String(err);
    return { ok: false, errorMessage: msg };
  }
}
