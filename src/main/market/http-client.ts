import { MarketDataError } from '../domain/errors';

export class HttpClient {
  async getJson<T>(url: URL, attempts = 3, timeoutMilliseconds = 15000): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { Accept: 'application/json', 'User-Agent': 'PaperForge/1.0.0-alpha' },
          signal: AbortSignal.timeout(timeoutMilliseconds),
        });
        if (response.ok) return (await response.json()) as T;
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable) {
          throw new MarketDataError(
            `Provider вернул HTTP ${response.status}`,
            `PROVIDER_HTTP_${response.status}`,
          );
        }
        lastError = new Error(`HTTP ${response.status}`);
      } catch (error) {
        if (error instanceof MarketDataError) throw error;
        lastError = error;
      }
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
    const message = lastError instanceof Error ? lastError.message : 'Неизвестная сетевая ошибка';
    throw new MarketDataError(`Не удалось получить рыночные данные: ${message}`);
  }

  async getText(
    url: URL,
    encoding = 'utf-8',
    attempts = 3,
    timeoutMilliseconds = 15000,
  ): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Accept: 'application/xml,text/xml,text/plain',
            'User-Agent': 'PaperForge/1.0.0-alpha',
          },
          signal: AbortSignal.timeout(timeoutMilliseconds),
        });
        if (response.ok) {
          return new TextDecoder(encoding).decode(await response.arrayBuffer());
        }
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable) {
          throw new MarketDataError(
            `Provider вернул HTTP ${response.status}`,
            `PROVIDER_HTTP_${response.status}`,
          );
        }
        lastError = new Error(`HTTP ${response.status}`);
      } catch (error) {
        if (error instanceof MarketDataError) throw error;
        lastError = error;
      }
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
    const message = lastError instanceof Error ? lastError.message : 'Неизвестная сетевая ошибка';
    throw new MarketDataError(`Не удалось получить данные официального курса: ${message}`);
  }
}
