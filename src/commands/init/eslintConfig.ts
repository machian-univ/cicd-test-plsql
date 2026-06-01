import inquirer from 'inquirer';
import path from 'path';
import fs from 'fs';
import { logger } from '../../utils/logger.js';
import type { ProjectContext } from '../../core/types.js';
import { isPackageInstalledLocally } from './packageManager.js';

export function generateEslintConfigContent(
  project: ProjectContext,
  root: string,
): string {
  const hasTs = project.hasTypeScript;
  const hasReact = project.hasReact;
  const hasNext = project.hasNext;
  const hasVue = project.hasVue;
  const hasNuxt = project.hasNuxt;
  const runner = project.testRunner;

  const hasSonarjs = isPackageInstalledLocally('eslint-plugin-sonarjs', root);
  const hasTsPlugin = isPackageInstalledLocally('@typescript-eslint/eslint-plugin', root);
  const hasTsParser = isPackageInstalledLocally('@typescript-eslint/parser', root);
  const hasVuePlugin = isPackageInstalledLocally('eslint-plugin-vue', root);
  const hasVueParser = isPackageInstalledLocally('vue-eslint-parser', root);

  const hasNextEslintConfig = isPackageInstalledLocally('eslint-config-next', root);
  const hasReactPlugin = !hasNext && isPackageInstalledLocally('eslint-plugin-react', root);
  const hasReactHooks = !hasNext && isPackageInstalledLocally('eslint-plugin-react-hooks', root);
  const hasNuxtEslint = isPackageInstalledLocally('@nuxt/eslint', root);
  const hasVitestPlugin = runner === 'vitest' && isPackageInstalledLocally('@vitest/eslint-plugin', root);
  const hasJestPlugin = runner === 'jest' && isPackageInstalledLocally('eslint-plugin-jest', root);

  const lines: string[] = [
    '// eslint.config.mjs',
    '// Создан автоматически через pulsqual init',
    '// Проверьте конфигурацию и при необходимости дополните плагины',
    '',
    "import js from '@eslint/js';",
    "import globals from 'globals';",
  ];

  if (hasSonarjs) lines.push("import sonarjs from 'eslint-plugin-sonarjs';");
  if (hasTsPlugin && hasTsParser) {
    lines.push("import tsPlugin from '@typescript-eslint/eslint-plugin';");
    lines.push("import tsParser from '@typescript-eslint/parser';");
  }

  if (hasNext && hasNextEslintConfig) {
    lines.push("// eslint-config-next предоставляет конфигурацию для Next.js, React и React Hooks");
    lines.push("import { FlatCompat } from '@eslint/eslintrc';");
    lines.push("import path from 'path';");
    lines.push("import { fileURLToPath } from 'url';");
    lines.push("const __filename = fileURLToPath(import.meta.url);");
    lines.push("const __dirname = path.dirname(__filename);");
    lines.push("const compat = new FlatCompat({ baseDirectory: __dirname });");
  } else {
    if (hasReactPlugin) lines.push("import react from 'eslint-plugin-react';");
    if (hasReactHooks) lines.push("import reactHooks from 'eslint-plugin-react-hooks';");
  }

  if (hasVuePlugin && hasVueParser) {
    lines.push("import vuePlugin from 'eslint-plugin-vue';");
    lines.push("import vueParser from 'vue-eslint-parser';");
  }

  if (hasNuxtEslint) {
    lines.push('// @nuxt/eslint: добавьте вручную после генерации .nuxt директории');
    lines.push("// import { createConfigForNuxt } from '@nuxt/eslint';");
  }

  if (hasVitestPlugin) {
    lines.push("import vitestPlugin from '@vitest/eslint-plugin';");
  }
  if (hasJestPlugin) {
    lines.push("import jestPlugin from 'eslint-plugin-jest';");
  }

  lines.push('');
  lines.push("/** @type {import('eslint').Linter.Config[]} */");
  lines.push('export default [');
  lines.push('  js.configs.recommended,');

  if (hasSonarjs) lines.push('  sonarjs.configs.recommended,');

  if (hasNext && hasNextEslintConfig) {
    lines.push('  // Конфигурация Next.js (включает правила для React и React Hooks)');
    lines.push("  ...compat.extends('next/core-web-vitals'),");
  } else if (hasReactPlugin) {
    lines.push('  react.configs.flat.recommended,');
  }

  if (hasVuePlugin && hasVueParser) {
    lines.push("  ...vuePlugin.configs['flat/recommended'],");
    lines.push('  {');
    lines.push("    files: ['**/*.vue'],");
    lines.push('    languageOptions: {');
    lines.push('      parser: vueParser,');
    if (hasTsParser) {
      lines.push('      parserOptions: {');
      lines.push('        parser: tsParser,');
      lines.push("        extraFileExtensions: ['.vue'],");
      lines.push('      },');
    }
    lines.push('    },');
    lines.push('  },');
  }

  if (hasTsPlugin && hasTsParser) {
    lines.push('  {');
    lines.push("    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],");
    if (!hasVue) {
      lines.push('    languageOptions: {');
      lines.push('      parser: tsParser,');
      lines.push('      parserOptions: {');
      lines.push("        project: './tsconfig.json',");
      lines.push('      },');
      lines.push('    },');
    }
    lines.push('    plugins: {');
    lines.push("      '@typescript-eslint': tsPlugin,");
    lines.push('    },');
    lines.push('    rules: {');
    lines.push('      ...tsPlugin.configs.recommended.rules,');
    lines.push("      '@typescript-eslint/no-explicit-any': 'warn',");
    lines.push("      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],");
    lines.push('    },');
    lines.push('  },');
  }

  if (hasVitestPlugin) {
    lines.push('  {');
    lines.push("    files: ['**/*.test.ts', '**/*.spec.ts', '**/*.test.js', '**/*.spec.js'],");
    lines.push('    plugins: {');
    lines.push("      vitest: vitestPlugin,");
    lines.push('    },');
    lines.push('    rules: {');
    lines.push('      ...vitestPlugin.configs.recommended.rules,');
    lines.push('    },');
    lines.push('  },');
  }

  if (hasJestPlugin) {
    lines.push('  {');
    lines.push("    files: ['**/*.test.js', '**/*.spec.js', '**/*.test.ts', '**/*.spec.ts'],");
    lines.push('    plugins: {');
    lines.push('      jest: jestPlugin,');
    lines.push('    },');
    lines.push('    rules: {');
    lines.push('      ...jestPlugin.configs.recommended.rules,');
    lines.push('    },');
    lines.push('  },');
  } else if (runner === 'jest') {
    lines.push('  {');
    lines.push("    files: ['**/*.test.js', '**/*.spec.js', '**/*.test.ts', '**/*.spec.ts'],");
    lines.push('    languageOptions: {');
    lines.push('      globals: {');
    lines.push('        ...globals.jest,');
    lines.push('      },');
    lines.push('    },');
    lines.push('  },');
  } else if (runner === 'vitest' && !hasVitestPlugin) {
    lines.push('  {');
    lines.push("    files: ['**/*.test.js', '**/*.spec.js', '**/*.test.ts', '**/*.spec.ts'],");
    lines.push('    languageOptions: {');
    lines.push('      globals: {');
    lines.push('        ...globals.browser,');
    lines.push('      },');
    lines.push('    },');
    lines.push('  },');
  }

  lines.push('  {');
  lines.push('    languageOptions: {');
  lines.push('      globals: {');
  lines.push('        ...globals.node,');
  lines.push('        ...globals.browser,');
  lines.push('      },');
  lines.push('    },');
  lines.push('    rules: {');
  lines.push("      'no-console': 'warn',");
  lines.push("      'no-debugger': 'error',");
  lines.push("      'complexity': ['error', 15],");
  lines.push('    },');
  lines.push('  },');

  lines.push('];');
  lines.push('');

  return lines.join('\n');
}

function writeEslintConfig(root: string, project: ProjectContext): void {
  const content = generateEslintConfigContent(project, root);
  const configPath = path.join(root, 'eslint.config.mjs');
  fs.writeFileSync(configPath, content, 'utf8');
  logger.success('Создан eslint.config.mjs');
  logger.warn(
    'Автоматически созданный конфиг является базовым. ' +
    'Проверьте его и при необходимости установите дополнительные плагины.',
  );
}

export async function maybeCreateEslintConfig(
  root: string,
  project: ProjectContext,
  autoYes: boolean,
): Promise<void> {
  if (!project.hasEslint) return;

  if (project.eslintConfigExists) {
    logger.success(
      `Конфиг ESLint найден: ${path.basename(project.eslintConfigPath ?? 'package.json')}`,
    );
    return;
  }

  logger.warn('Конфигурация ESLint не найдена.');

  if (project.testRunner === 'unknown' && !autoYes) {
    logger.warn(
      'Тест-раннер не определён. Конфиг ESLint будет создан без настроек тест-раннера. ' +
      'Для более точной настройки запустите pulsqual init повторно после установки тест-раннера.',
    );
  }

  if (project.hasNuxt) {
    logger.warn(
      '@nuxt/eslint требует сгенерированную директорию .nuxt. ' +
      'После первого запуска nuxt dev дополните eslint.config.mjs вручную.',
    );
  }

  let create = autoYes;
  if (!autoYes) {
    const { createConfig } = await inquirer.prompt([{
      type: 'confirm',
      name: 'createConfig',
      message: 'Создать базовый eslint.config.mjs автоматически?',
      default: true,
    }]);
    create = createConfig;
  }

  if (create) {
    writeEslintConfig(root, project);
  } else {
    logger.info(
      'Создайте eslint.config.mjs вручную. Минимальный пример:\n\n' +
      "  import js from '@eslint/js';\n" +
      "  import globals from 'globals';\n" +
      '  export default [\n' +
      '    js.configs.recommended,\n' +
      "    { languageOptions: { globals: { ...globals.node } } },\n" +
      '  ];\n',
    );
  }
}
