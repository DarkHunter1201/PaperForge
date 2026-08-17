import { describe, expect, it } from 'vitest';
import type { HttpClient } from '../src/main/market/http-client';
import { OfficialFxService } from '../src/main/market/official-fx-service';
import type { CacheRepository } from '../src/main/storage/cache-repository';

describe('OfficialFxService', () => {
  it('рассчитывает кросс-курс из официальных курсов Банка России', async () => {
    const values = new Map<string, unknown>();
    const cache = {
      get: <T>(key: string) => (values.get(key) as T | undefined) ?? null,
      set: (key: string, _provider: string, value: unknown) => values.set(key, value),
    } as unknown as CacheRepository;
    const http = {
      getText: async () => `<?xml version="1.0" encoding="windows-1251"?>
        <ValCurs Date="14.08.2026" name="Foreign Currency Market">
          <Valute ID="R01235"><CharCode>USD</CharCode><Nominal>1</Nominal><Value>80,0000</Value><VunitRate>80,0000</VunitRate></Valute>
          <Valute ID="R01239"><CharCode>EUR</CharCode><Nominal>1</Nominal><Value>100,0000</Value><VunitRate>100,0000</VunitRate></Valute>
        </ValCurs>`,
    } as unknown as HttpClient;
    const service = new OfficialFxService(http, cache);
    await expect(
      service.rate('USD', 'RUB', new Date('2026-08-17T10:00:00Z')),
    ).resolves.toMatchObject({ rate: '80', source: 'BANK_OF_RUSSIA' });
    await expect(
      service.rate('USD', 'EUR', new Date('2026-08-17T10:00:00Z')),
    ).resolves.toMatchObject({ rate: '0.8', effectiveTimestamp: '2026-08-13T21:00:00.000Z' });
    expect(values.size).toBe(1);
  });
});
