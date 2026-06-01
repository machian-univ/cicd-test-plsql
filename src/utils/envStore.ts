import fs from 'fs';
import path from 'path';

export interface EnvPersistResult {
  processEnvSet: boolean;
  envFilePath: string | null;
  envFileUpdated: boolean;
}

/**
 * Устанавливает переменную в process.env и дописывает/обновляет .env в корне проекта.
 */
export function persistEnvVariable(
  name: string,
  value: string,
  projectRoot: string,
): EnvPersistResult {
  process.env[name] = value;

  const envFilePath = path.join(projectRoot, '.env');
  let envFileUpdated = false;

  try {
    let lines: string[] = [];
    if (fs.existsSync(envFilePath)) {
      lines = fs.readFileSync(envFilePath, 'utf8').split(/\r?\n/);
    }

    const prefix = `${name}=`;
    let replaced = false;
    const nextLines = lines.filter(line => {
      if (line.startsWith(prefix)) {
        replaced = true;
        return false;
      }
      return true;
    });

    nextLines.push(`${name}=${quoteEnvValue(value)}`);
    fs.writeFileSync(envFilePath, nextLines.join('\n') + '\n', 'utf8');
    envFileUpdated = true;
    if (!replaced && lines.length === 0) {
      // новый файл
    }
  } catch {
    envFileUpdated = false;
  }

  return {
    processEnvSet: true,
    envFilePath: envFileUpdated ? envFilePath : null,
    envFileUpdated,
  };
}

function quoteEnvValue(value: string): string {
  if (/[\s#"']/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}
