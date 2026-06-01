import https from 'https';
import { randomUUID } from 'crypto';
import type { LLMProvider, LLMOptions } from './LLMProvider.js';
import { LLMProviderRegistry } from './LLMProvider.js';

const OAUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
const CHAT_URL = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

let cachedToken: { value: string; expiresAt: number } | null = null;

function postJson(
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        agent: httpsAgent,
        timeout: 60_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('GigaChat: timeout')); });
    req.write(body);
    req.end();
  });
}

async function fetchAccessToken(credentials: string): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }

  const body = 'scope=GIGACHAT_API_PERS';
  const result = await new Promise<{ status: number; text: string }>((resolve, reject) => {
    const u = new URL(OAUTH_URL);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
          RqUID: randomUUID(),
          Accept: 'application/json',
        },
        agent: httpsAgent,
        timeout: 30_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('GigaChat OAuth: timeout')); });
    req.write(body);
    req.end();
  });

  if (result.status !== 200) {
    throw new Error(`GigaChat OAuth ${result.status}: ${result.text.slice(0, 200)}`);
  }

  const parsed = JSON.parse(result.text) as { access_token?: string };
  if (!parsed.access_token) throw new Error('GigaChat OAuth: нет access_token');

  // Жёстко закладываем 25 минут жизни токена от текущего момента времени сервера.
  // Это страхует от рассинхронизации часов между вашим сервером и Сбером.
  const expiresAt = Date.now() + 25 * 60 * 1000; 

  cachedToken = { value: parsed.access_token, expiresAt };
  return parsed.access_token;
}

class GigaChatProvider implements LLMProvider {
  name = 'gigachat';

  async complete(prompt: string, options: LLMOptions): Promise<string> {
    const credentials = options.apiKey;
    if (!credentials) {
      throw new Error('GigaChat: не задан API-ключ (переменная GIGACHAT_API_KEY)');
    }

    const token = await fetchAccessToken(credentials);
    const model = options.model || 'GigaChat';

    const result = await postJson(
      CHAT_URL,
      { Authorization: `Bearer ${token}` },
      JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options.maxTokens,
        temperature: 0.4,
      }),
    );

    if (result.status !== 200) {
      throw new Error(`GigaChat chat ${result.status}: ${result.text.slice(0, 200)}`);
    }

    const data = JSON.parse(result.text) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('GigaChat вернула пустой ответ');
    return text;
  }

  async testConnection(options?: LLMOptions): Promise<boolean> {
    if (!options?.apiKey) return false;
    try {
      await fetchAccessToken(options.apiKey);
      return true;
    } catch {
      return false;
    }
  }
}

LLMProviderRegistry.register(new GigaChatProvider());
