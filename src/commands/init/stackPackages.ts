import type { ProjectContext } from '../../core/types.js';
import { isPackageInstalledLocally } from './packageManager.js';

export function getEslintCorePackages(): string[] {
  return ['eslint', '@eslint/js', 'globals', 'eslint-plugin-sonarjs'];
}

export function getEslintPluginsForStack(project: ProjectContext, root: string): string[] {
  const pkgs: string[] = [];

  if (project.hasTypeScript) {
    if (!isPackageInstalledLocally('@typescript-eslint/parser', root)) {
      pkgs.push('@typescript-eslint/parser');
    }
    if (!isPackageInstalledLocally('@typescript-eslint/eslint-plugin', root)) {
      pkgs.push('@typescript-eslint/eslint-plugin');
    }
  }

  if (project.hasNext) {
    if (!isPackageInstalledLocally('@eslint/eslintrc', root)) {
      pkgs.push('@eslint/eslintrc');
    }
    if (!isPackageInstalledLocally('eslint-config-next', root)) {
      pkgs.push('eslint-config-next');
    }
  } else if (project.hasReact) {
    if (!isPackageInstalledLocally('eslint-plugin-react', root)) {
      pkgs.push('eslint-plugin-react');
    }
    if (!isPackageInstalledLocally('eslint-plugin-react-hooks', root)) {
      pkgs.push('eslint-plugin-react-hooks');
    }
  }

  if (project.hasVue) {
    if (!isPackageInstalledLocally('eslint-plugin-vue', root)) {
      pkgs.push('eslint-plugin-vue');
    }
    if (!isPackageInstalledLocally('vue-eslint-parser', root)) {
      pkgs.push('vue-eslint-parser');
    }
  }
  if (project.hasNuxt) {
    if (!isPackageInstalledLocally('@nuxt/eslint', root)) {
      pkgs.push('@nuxt/eslint');
    }
  }
  if (project.testRunner === 'vitest') {
    if (!isPackageInstalledLocally('@vitest/eslint-plugin', root)) {
      pkgs.push('@vitest/eslint-plugin');
    }
  }
  if (project.testRunner === 'jest') {
    if (!isPackageInstalledLocally('eslint-plugin-jest', root)) {
      pkgs.push('eslint-plugin-jest');
    }
  }

  return pkgs;
}

export function getVitestPackages(): string[] {
  return ['vitest', '@vitest/coverage-v8'];
}

export function getJestPackages(hasTs: boolean): string[] {
  const pkgs = ['jest'];
  if (hasTs) pkgs.push('ts-jest', '@types/jest');
  return pkgs;
}
