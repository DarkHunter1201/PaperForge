import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Instrument, ProviderStatus } from '../src/shared/types';
import { CompositeProvider } from '../src/main/market/composite-provider';
import type { HttpClient } from '../src/main/market/http-client';
import type { MarketDataProvider } from '../src/main/market/market-data-provider';
import { YahooFinanceProvider } from '../src/main/market/yahoo-finance-provider';

describe('Global equities', () => {
  afterEach(() => vi.useRealTimers());

  it('находит Apple в публичном каталоге Yahoo Finance', async () => {
    const http = {
      getJson: async () => ({
        quotes: [
          {
            symbol: 'AAPL',
            shortname: 'Apple Inc.',
            quoteType: 'EQUITY',
            exchange: 'NMS',
            exchDisp: 'NASDAQ',
            currency: 'USD',
          },
        ],
      }),
    } as unknown as HttpClient;
    const result = await new YahooFinanceProvider(http).search({
      query: 'Apple',
      assetClass: 'EQUITY',
    });
    expect(result).toContainEqual(
      expect.objectContaining({ symbol: 'AAPL', exchange: 'NASDAQ', quoteCurrency: 'USD' }),
    );
  });

  it('объединяет результаты всех доступных providers', async () => {
    const provider = (id: string, symbol: string): MarketDataProvider => ({
      id,
      status: (): ProviderStatus => ({
        id,
        name: id,
        configured: true,
        assetClasses: ['EQUITY'],
        markets: [id],
        timeliness: 'DELAYED',
      }),
      search: async (): Promise<Instrument[]> => [
        {
          id: `${id}:${symbol}`,
          provider: id,
          symbol,
          name: symbol,
          assetClass: 'EQUITY',
          exchange: id,
          currency: 'USD',
          quoteCurrency: 'USD',
          timezone: 'UTC',
          tradable: true,
          dataTimeliness: 'DELAYED',
        },
      ],
      quote: async () => {
        throw new Error('unused');
      },
      candles: async () => [],
    });
    const result = await new CompositeProvider([
      provider('first', 'AAA'),
      provider('second', 'AAPL'),
    ]).search({ query: 'A' });
    expect(result.map((instrument) => instrument.symbol)).toEqual(['AAA', 'AAPL']);
  });

  it('не блокирует найденные акции из-за зависшего provider', async () => {
    vi.useFakeTimers();
    const apple: Instrument = {
      id: 'yahoo-finance:AAPL',
      provider: 'yahoo-finance',
      symbol: 'AAPL',
      name: 'Apple Inc.',
      assetClass: 'EQUITY',
      exchange: 'NASDAQ',
      currency: 'USD',
      quoteCurrency: 'USD',
      timezone: 'UTC',
      tradable: true,
      dataTimeliness: 'DELAYED',
    };
    const status = (id: string): ProviderStatus => ({
      id,
      name: id,
      configured: true,
      assetClasses: ['EQUITY'],
      markets: [id],
      timeliness: 'DELAYED',
    });
    const fast = {
      id: 'yahoo-finance',
      status: () => status('yahoo-finance'),
      search: async () => [apple],
      quote: async () => {
        throw new Error('unused');
      },
      candles: async () => [],
    } satisfies MarketDataProvider;
    const hanging = {
      id: 'hanging',
      status: () => status('hanging'),
      search: () => new Promise<Instrument[]>(() => undefined),
      quote: async () => {
        throw new Error('unused');
      },
      candles: async () => [],
    } satisfies MarketDataProvider;
    const pending = new CompositeProvider([fast, hanging]).search({ query: 'Apple' });
    await vi.advanceTimersByTimeAsync(4000);
    await expect(pending).resolves.toEqual([apple]);
  });
});
