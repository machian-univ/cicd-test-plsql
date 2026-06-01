import inquirer from 'inquirer';
import { STACK_REGISTRY } from '../../core/types.js';
import type { ProjectContext } from '../../core/types.js';
import { checkVersionAgainstSpec } from '../../utils/version.js';
import { logger } from '../../utils/logger.js';
import type { ManualStackSelection } from './types.js';

export async function askStackSequentially(detectedProject: ProjectContext): Promise<ManualStackSelection> {
  logger.blank();
  logger.section('Настройка стека проекта');
  logger.info('Ответьте на вопросы для корректной настройки инструментов анализа.');

  const { usesTypeScript } = await inquirer.prompt([{
    type: 'list',
    name: 'usesTypeScript',
    message: 'Какой язык используется в проекте?',
    choices: [
      { name: 'TypeScript', value: true },
      { name: 'JavaScript', value: false },
    ],
    default: detectedProject.hasTypeScript,
  }]);

  const { framework } = await inquirer.prompt([{
    type: 'list',
    name: 'framework',
    message: 'Какой фреймворк используется?',
    choices: [
      { name: 'React', value: 'react' },
      { name: 'Vue', value: 'vue' },
      { name: 'Другой или отсутствует (пропустить)', value: 'none' },
    ],
    default: detectedProject.hasReact ? 'react' : detectedProject.hasVue ? 'vue' : 'none',
  }]);

  let hasNext = false;
  let hasNuxt = false;

  if (framework === 'react') {
    const { usesNext } = await inquirer.prompt([{
      type: 'confirm',
      name: 'usesNext',
      message: 'Используется Next.js?',
      default: detectedProject.hasNext,
    }]);
    hasNext = usesNext;

    if (hasNext && detectedProject.detectedVersions.next) {
      const nextSpec = STACK_REGISTRY.next;
      const issue = checkVersionAgainstSpec(detectedProject.detectedVersions.next, nextSpec);
      if (issue?.blocking) {
        logger.error(`[Next.js] ${issue.message}`);
        logger.warn('Next.js будет исключён из конфигурации из-за несовместимой версии.');
        hasNext = false;
      } else if (issue && !issue.blocking) {
        logger.warn(`[Next.js] ${issue.message}`);
      }
    }
  }

  if (framework === 'vue') {
    const { usesNuxt } = await inquirer.prompt([{
      type: 'confirm',
      name: 'usesNuxt',
      message: 'Используется Nuxt.js?',
      default: detectedProject.hasNuxt,
    }]);
    hasNuxt = usesNuxt;
  }

  const { testRunner } = await inquirer.prompt([{
    type: 'list',
    name: 'testRunner',
    message: 'Какой тест-раннер используется?',
    choices: [
      { name: 'Vitest (рекомендуется для Vite/Next.js проектов)', value: 'vitest' },
      { name: 'Jest (классический вариант)', value: 'jest' },
      { name: 'Другой или отсутствует (пропустить)', value: 'skip' },
    ],
    default: detectedProject.testRunner === 'unknown' ? 'vitest' : detectedProject.testRunner,
  }]);

  return {
    hasTypeScript: usesTypeScript,
    hasReact: framework === 'react',
    hasVue: framework === 'vue',
    hasNext,
    hasNuxt,
    testRunner,
  };
}

export function applyManualStackToProject(
  project: ProjectContext,
  selection: ManualStackSelection,
): ProjectContext {
  return {
    ...project,
    hasTypeScript: selection.hasTypeScript,
    hasReact: selection.hasReact,
    hasVue: selection.hasVue,
    hasNext: selection.hasNext,
    hasNuxt: selection.hasNuxt,
    testRunner: selection.testRunner === 'skip' ? project.testRunner : selection.testRunner,
  };
}
