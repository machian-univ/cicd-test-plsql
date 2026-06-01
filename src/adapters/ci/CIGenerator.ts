import type { PulsqualConfig, CIPlatform, CITrigger } from '../../core/types.js';

export interface CIGeneratorOptions {
  trigger: CITrigger;
  useLLM: boolean;
  llmSecretAdded: boolean;
  useGitleaks: boolean;
}

export interface CIGenerator {
  platform: CIPlatform;
  generate(config: PulsqualConfig, options: CIGeneratorOptions): string;
}

class GeneratorRegistry {
  private generators = new Map<CIPlatform, CIGenerator>();

  register(gen: CIGenerator): void {
    this.generators.set(gen.platform, gen);
  }

  get(platform: CIPlatform): CIGenerator | undefined {
    return this.generators.get(platform);
  }
}

export const ciGeneratorRegistry = new GeneratorRegistry();