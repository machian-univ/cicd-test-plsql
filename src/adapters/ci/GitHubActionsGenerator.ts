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
    const threshold = opts.qScoreThreshold ?? config.thresholds.q_score;
    const llmEnvSection = this.buildLlmEnvSection(opts);

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
#   Блокирует слияние при Q-Score ниже порога ${threshold}.
#
# ИСТОРИЯ Q-SCORE:
#   БД (.pulsqual/pulsqual.db) кэшируется между запусками через actions/cache.
#   Это позволяет строить график динамики Q-Score в отчёте.
#   Кэш привязан к ветке — каждая ветка имеет свою историю.

name: Code Quality Check (Pulsqual)

on:
${onBlock}

jobs:
  pulsqual-check:
    name: Quality Check (Q-Score threshold ${threshold})
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      # Шаг 1: клонирование с полной историей
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      # Шаг 2: Node.js
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      # Шаг 3: Восстановление БД истории Q-Score из кэша
      # Это позволяет графику в отчёте показывать историю предыдущих проверок
      - name: Restore Pulsqual database cache
        uses: actions/cache@v4
        with:
          path: .pulsqual/pulsqual.db
          key: pulsqual-db-\${{ github.ref_name }}
          restore-keys: |
            pulsqual-db-

      # Шаг 4: установка зависимостей
      - name: Install project dependencies
        run: npm ci

${pulsqualInstallComment}

      # Шаг 5: запуск проверки
      - name: Run Pulsqual quality check
        run: npx pulsqual check --ci
        env:
          CI: true
          # Текущий порог: ${threshold}
${llmEnvSection}

      # Шаг 6: загрузка отчёта как артефакта
      - name: Upload quality report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: quality-report
          path: .pulsqual/reports/*.html
          retention-days: 30

      # Шаг 7: итоговый вывод
      - name: Print quality summary
        if: always()
        run: |
          echo "=== Pulsqual Quality Check Summary ==="
          echo "Threshold: ${threshold}"
          echo "Report: .pulsqual/reports/"
          echo "For detailed results, download the quality-report artifact above."
`;
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
        '          # LLM-рецензент: API-ключ GigaChat из GitHub Secrets\n' +
        '          GIGACHAT_API_KEY: ${{ secrets.GIGACHAT_API_KEY }}'
      );
    }

    return (
      '          # LLM-рецензент: раскомментируйте после добавления ключа в Secrets\n' +
      '          # Инструкция: Settings -> Secrets and variables -> Actions -> New repository secret\n' +
      '          # Name: GIGACHAT_API_KEY, Value: ваш API-ключ GigaChat\n' +
      '          # GIGACHAT_API_KEY: ${{ secrets.GIGACHAT_API_KEY }}'
    );
  }
}

ciGeneratorRegistry.register(new GitHubActionsGenerator());
export { GitHubActionsGenerator };