import type { VersionInfo, StackToolSpec } from '../core/types.js';

export function parseVersion(raw: string): VersionInfo {
  if (!raw || typeof raw !== 'string') {
    return { raw: '', major: 0, minor: 0, patch: 0, valid: false };
  }
  const match = raw.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) {
    return { raw: raw.trim(), major: 0, minor: 0, patch: 0, valid: false };
  }
  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);
  const patch = match[3] !== undefined ? parseInt(match[3], 10) : 0;
  return { raw: raw.trim(), major, minor, patch, valid: true };
}

export function compareVersions(
  version: VersionInfo,
  minMajor: number,
  minMinor = 0,
  minPatch = 0
): -1 | 0 | 1 {
  if (!version.valid) return -1;
  if (version.major !== minMajor) return version.major > minMajor ? 1 : -1;
  if (version.minor !== minMinor) return version.minor > minMinor ? 1 : -1;
  if (version.patch !== minPatch) return version.patch > minPatch ? 1 : -1;
  return 0;
}

export function isAtLeast(
  version: VersionInfo,
  minMajor: number,
  minMinor = 0,
  minPatch = 0
): boolean {
  return compareVersions(version, minMajor, minMinor, minPatch) >= 0;
}

export function isSameMajor(version: VersionInfo, major: number): boolean {
  return version.valid && version.major === major;
}

export function getPackageVersion(
  packageName: string,
  deps: Record<string, string>,
  devDeps: Record<string, string>
): VersionInfo | null {
  const versionStr = deps[packageName] ?? devDeps[packageName];
  if (!versionStr) return null;
  const cleaned = versionStr.replace(/^[\^~>=<]+/, '');
  return parseVersion(cleaned);
}

/**
 * req.19: Проверяет версию по спецификации из STACK_REGISTRY.
 * Возвращает { blocking: boolean; message?: string } если версия не соответствует.
 * null — версия подходит.
 */
export function checkVersionAgainstSpec(
  version: VersionInfo,
  spec: StackToolSpec
): { blocking: boolean; message: string } | null {
  if (!version.valid) return null;

  // Проверка минимальной версии (блокирующая)
  if (spec.minVersion) {
    const { major, minor, patch } = spec.minVersion;
    if (!isAtLeast(version, major, minor, patch)) {
      const msg = spec.belowMinMessage
        ? spec.belowMinMessage.replace(/\{version\}/g, version.raw)
        : `${spec.displayName} ${version.raw} ниже минимальной версии ${major}.${minor}.${patch}.`;
      return { blocking: true, message: msg };
    }
  }

  // Проверка рекомендуемой версии (предупреждение)
  if (spec.recommendedVersion) {
    const { major, minor = 0, patch = 0 } = spec.recommendedVersion;
    if (!isAtLeast(version, major, minor, patch) && spec.belowRecommendedMessage) {
      const msg = spec.belowRecommendedMessage.replace(/\{version\}/g, version.raw);
      return { blocking: false, message: msg };
    }
  }

  return null;
}