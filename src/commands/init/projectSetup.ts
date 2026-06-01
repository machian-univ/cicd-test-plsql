import inquirer from 'inquirer';
import path from 'path';
import fs from 'fs';
import { logger } from '../../utils/logger.js';
import {
  configExists,
  saveConfig,
  loadConfig,
  ensureDir,
  getPulsqualDir,
} from '../../utils/fs.js';
import { ProjectInspectorAgent } from '../../agents/preparation/ProjectInspectorAgent.js';
import { RunContext } from '../../core/RunContext.js';
import { DEFAULT_CONFIG } from '../../core/types.js';
import type { PulsqualConfig, ProjectContext } from '../../core/types.js';
import { git } from '../../utils/git.js';
import { ensureDegradationModelInProject } from '../../ml/ensureDegradationModel.js';

const PULSQUAL_GITIGNORE_ENTRIES = ['reports/', '*.db', 'degradation_model.onnx'];

function ensurePulsqualGitignore(gitignorePath: string): void {
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, PULSQUAL_GITIGNORE_ENTRIES.join('\n') + '\n', 'utf8');
    return;
  }

  const content = fs.readFileSync(gitignorePath, 'utf8');
  const existing = new Set(content.split('\n').map(line => line.trim()).filter(Boolean));
  const missing = PULSQUAL_GITIGNORE_ENTRIES.filter(entry => !existing.has(entry));
  if (missing.length === 0) {
    return;
  }

  const suffix = content.endsWith('\n') ? '' : '\n';
  fs.appendFileSync(gitignorePath, suffix + missing.join('\n') + '\n', 'utf8');
}

export function saveStackSnapshot(root: string, project: ProjectContext): void {
  let config: PulsqualConfig;
  try {
    config = configExists(root) ? loadConfig(root) : { ...DEFAULT_CONFIG };
  } catch {
    config = { ...DEFAULT_CONFIG };
  }

  config.stackSnapshot = {
    testRunner: project.testRunner,
    hasTypeScript: project.hasTypeScript,
    hasEslint: project.hasEslint,
    hasReact: project.hasReact,
    hasVue: project.hasVue,
    hasNext: project.hasNext,
    hasNuxt: project.hasNuxt,
    capturedAt: new Date().toISOString(),
  };

  saveConfig(root, config);
  logger.success('Создан или обновлён файл .pulsqual.yml');
}

export async function createConfigAndDir(root: string, project: ProjectContext): Promise<void> {
  saveStackSnapshot(root, project);

  const dir = getPulsqualDir(root);
  ensureDir(dir);
  ensureDir(path.join(dir, 'reports'));
  logger.success('Создана директория .pulsqual/');

  ensurePulsqualGitignore(path.join(dir, '.gitignore'));

  if (ensureDegradationModelInProject(dir, root)) {
    logger.verbose(`Модель деградации: ${path.join(dir, 'degradation_model.onnx')}`);
  }
}

export async function inspectProject(root: string): Promise<ProjectContext | null> {
  const ctx = new RunContext({
    config: { ...DEFAULT_CONFIG, stackSnapshot: undefined },
    projectRoot: root,
    startedAt: new Date(),
    mode: 'full',
    commitHash: git.getCommitHash(root),
    commitAuthor: git.getCommitAuthor(root),
    commitDate: git.getCommitDate(root),
    branch: git.getBranch(root),
  });

  try {
    const agent = new ProjectInspectorAgent();
    const result = await agent.run(ctx);
    return (result.data as ProjectContext) ?? null;
  } catch (err) {
    logger.warn(`Анализ проекта завершился с ошибкой: ${String(err)}`);
    return null;
  }
}

export async function maybeCreateTsConfig(root: string, project: ProjectContext): Promise<void> {
  if (!project.hasTypeScript || project.hasTsConfig) return;

  const { createTs } = await inquirer.prompt([{
    type: 'confirm',
    name: 'createTs',
    message: 'Файл tsconfig.json не найден. Создать базовый?',
    default: true,
  }]);

  if (!createTs) return;

  const tsconfig: Record<string, unknown> = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      outDir: './dist',
      rootDir: './src',
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist'],
  };

  if (project.requiresDecorators) {
    (tsconfig.compilerOptions as Record<string, unknown>)['experimentalDecorators'] = true;
    (tsconfig.compilerOptions as Record<string, unknown>)['emitDecoratorMetadata'] = true;
    logger.info('NestJS: добавлены experimentalDecorators и emitDecoratorMetadata в tsconfig.json');
  }

  fs.writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2) + '\n',
    'utf8',
  );
  logger.success('Создан tsconfig.json');
}
