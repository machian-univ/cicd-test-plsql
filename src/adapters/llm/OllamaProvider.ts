import type { LLMProvider, LLMOptions } from './LLMProvider.js';
import { LLMProviderRegistry } from './LLMProvider.js';

class OllamaProvider implements LLMProvider {
  name = 'ollama';

  async complete(prompt: string, options: LLMOptions): Promise<string> {
    const base = (options.endpoint ?? 'http://localhost:11434').replace(/\/$/, '');
    const model = options.model ?? 'qwen2.5-coder:7b';

    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { num_predict: options.maxTokens },
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Ollama HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json() as { message?: { content?: string } };
    const text = data.message?.content?.trim();
    if (!text) throw new Error('Ollama вернула пустой ответ');
    return text;
  }

  async testConnection(options?: LLMOptions): Promise<boolean> {
    const base = (options?.endpoint ?? 'http://localhost:11434').replace(/\/$/, '');
    try {
      const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch {
      return false;
    }
  }
}

LLMProviderRegistry.register(new OllamaProvider());
