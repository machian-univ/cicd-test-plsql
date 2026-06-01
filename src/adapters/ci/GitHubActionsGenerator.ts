// Pulsqual клонирует репозиторий с полной историей (fetch-depth: 0)
// pulsqual check --ci запускает полный анализ относительно origin/main
// Анализируются: ESLint, TypeScript, тесты с покрытием, безопасность (npm audit)
// DiffAgent сравнивает HEAD PR-ветки с origin/main
//
// РЕЗУЛЬТАТ:
// Статус workflow (passed/failed) в интерфейсе GitHub
// HTML-отчёт загружается как артефакт (Actions -> выберите run -> Artifacts)
// При Q-Score ниже порога workflow завершается с кодом 1 (PR заблокирован)


import type { CIGenerator, CIGeneratorOptions } from './CIGenerator.js';
import type { PulsqualConfig, CITrigger } from '../../core/types.js';
import { ciGeneratorRegistry } from './CIGenerator.js';

class GitHubActionsGenerator implements CIGenerator {
  platform = 'github' as const;

  generate(config: PulsqualConfig, opts: CIGeneratorOptions): string {
    const onBlock = this.buildOnBlock(opts.trigger);
    const threshold = config.thresholds.q_score;
    const llmEnvSection = this.buildLlmEnvSection(opts);
    const gitleaksStep = this.buildGitleaksInstallStep(opts.useGitleaks);

    const pulsqualInstallComment =
      '      # Установка Pulsqual напрямую из публичного Git-репозитория:\n' +
      '      - name: Install Pulsqual\n' +
      '        run: npm install --save-dev github:machian-univ/cicd-test-plsql\n' +
      '        # Заменяется на "npm install --save-dev pulsqual" после официальной публикации в npmjs';

    return `# .github/workflows/pulsqual.yml
# Автоматически создан командой: pulsqual ci setup
#
# НАЗНАЧЕНИЕ:
#   Проверка качества кода при создании Pull Request.
#   Блокирует слияние при Q-Score ниже порога ${threshold} (из .pulsqual.yml).
#
# ИСТОРИЯ Q-SCORE:
#   БД (.pulsqual/pulsqual.db) кэшируется между запусками через actions/cache.
#   Сохраняется после каждой проверки (включая неуспешные по порогу).

name: Code Quality Check (Pulsqual)

on:
${onBlock}

jobs:
  pulsqual-check:
    name: Quality Check (Q-Score threshold ${threshold})
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Restore Pulsqual database cache
        uses: actions/cache@v4
        id: pulsqual-db-cache
        with:
          path: .pulsqual/pulsqual.db
          key: pulsqual-db-\${{ github.event.pull_request.number || github.ref_name }}
          restore-keys: |
            pulsqual-db-

      - name: Fetch base branch for diff
        run: |
          git fetch origin \${{ github.base_ref || 'main' }} --depth=1 || true
          git branch -a

      - name: Install project dependencies
        run: npm ci

${gitleaksStep}
${pulsqualInstallComment}

      - name: Run Pulsqual quality check
        run: npx pulsqual check --ci
        env:
          CI: true
${llmEnvSection}

      - name: Save Pulsqual database cache
        if: always()
        uses: actions/cache/save@v4
        with:
          path: .pulsqual/pulsqual.db
          key: \${{ steps.pulsqual-db-cache.outputs.cache-primary-key }}

      - name: Upload quality report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: quality-report
          path: .pulsqual/reports/*.html
          retention-days: 30

      - name: Print quality summary
        if: always()
        run: |
          echo "=== Pulsqual Quality Check Summary ==="
          echo "Threshold (from .pulsqual.yml): ${threshold}"
          echo "Report: .pulsqual/reports/"
          echo "For detailed results, download the quality-report artifact above."
`;
  }

  private buildGitleaksInstallStep(useGitleaks: boolean): string {
    if (!useGitleaks) {
      return (
        '      # gitleaks не используется (отключено при pulsqual ci setup)\n'
      );
    }

    return (
      '      - name: Install gitleaks\n' +
      '        run: |\n' +
      '          GITLEAKS_VERSION=8.21.2\n' +
      '          curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" -o gitleaks.tar.gz\n' +
      '          tar -xzf gitleaks.tar.gz gitleaks\n' +
      '          sudo mv gitleaks /usr/local/bin/\n' +
      '          gitleaks version\n'
    );
  }

  private buildOnBlock(trigger: CITrigger): string {
    switch (trigger) {
      case 'pr':
        return `  pull_request:
    branches:
      - main
      - develop
    types:
      - opened
      - synchronize
      - reopened`;

      case 'push':
        return `  push:
    branches:
      - main
      - develop`;

      case 'both':
        return `  pull_request:
    branches:
      - main
      - develop
    types:
      - opened
      - synchronize
      - reopened
  push:
    branches:
      - main
      - develop`;
    }
  }

  private buildLlmEnvSection(opts: CIGeneratorOptions): string {
    if (!opts.useLLM) return '';

    if (opts.llmSecretAdded) {
      return (
        '          GIGACHAT_API_KEY: ${{ secrets.GIGACHAT_API_KEY }}\n'
      );
    }

    return (
      '          # LLM: раскомментируйте после добавления GIGACHAT_API_KEY в Secrets\n' +
      '          # GIGACHAT_API_KEY: ${{ secrets.GIGACHAT_API_KEY }}\n'
    );
  }
}

ciGeneratorRegistry.register(new GitHubActionsGenerator());
export { GitHubActionsGenerator };
