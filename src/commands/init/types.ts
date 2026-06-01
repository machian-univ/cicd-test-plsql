export interface InitOptions {
  skipDeps?: boolean;
  yes?: boolean;
}

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

export interface StackCheckResult {
  blocking: boolean;
  messages: Array<{ blocking: boolean; tool: string; message: string }>;
}

export interface ManualStackSelection {
  hasTypeScript: boolean;
  hasReact: boolean;
  hasVue: boolean;
  hasNext: boolean;
  hasNuxt: boolean;
  testRunner: 'jest' | 'vitest' | 'skip';
}
