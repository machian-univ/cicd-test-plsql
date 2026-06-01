export interface LLMOptions {
  maxTokens: number;
  model?: string;
  endpoint?: string;
  apiKey?: string;
}

export interface LLMProvider {
  name: string;
  complete(prompt: string, options: LLMOptions): Promise<string>;
  testConnection(options?: LLMOptions): Promise<boolean>;
}

class ProviderRegistry {
  private providers = new Map<string, LLMProvider>();

  register(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }

  all(): LLMProvider[] {
    return Array.from(this.providers.values());
  }
}

export const LLMProviderRegistry = new ProviderRegistry();