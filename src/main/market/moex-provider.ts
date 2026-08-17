import type { Candle, CandleInterval, Instrument, ProviderStatus, Quote } from '../../shared/types';
import Decimal from 'decimal.js';
import { MarketDataError } from '../domain/errors';
import type { CacheRepository } from '../storage/cache-repository';
import { HttpClient } from './http-client';
import type { CandleRequest, InstrumentSearch, MarketDataProvider } from './market-data-provider';

interface IssBlock {
  columns: string[];
  data: unknown[][];
}

interface IssResponse {
  securities?: IssBlock;
  marketdata?: IssBlock;
  candles?: IssBlock;
}

function records(block?: IssBlock): Record<string, unknown>[] {
  if (!block) return [];
  return block.data.map((values) =>
    Object.fromEntries(block.columns.map((column, index) => [column, values[index]])),
  );
}

function intervalValue(interval: CandleInterval): number {
  return { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '1d': 24 }[interval];
}

function aggregateCandles(candles: Candle[], intervalMinutes: number): Candle[] {
  const bucketSize = intervalMinutes * 60 * 1000;
  const buckets = new Map<number, Candle[]>();
  for (const candle of candles) {
    const bucket = Math.floor(new Date(candle.timestamp).getTime() / bucketSize) * bucketSize;
    const values = buckets.get(bucket) ?? [];
    values.push(candle);
    buckets.set(bucket, values);
  }
  return [...buckets.entries()].map(([bucket, values]) => {
    const first = values[0]!;
    const last = values.at(-1)!;
    return {
      ...first,
      open: first.open,
      high: Decimal.max(...values.map((value) => value.high)).toString(),
      low: Decimal.min(...values.map((value) => value.low)).toString(),
      close: last.close,
      volume: Decimal.sum(...values.map((value) => value.volume)).toString(),
      timestamp: new Date(bucket).toISOString(),
      endTimestamp: last.endTimestamp,
    };
  });
}

export class MoexProvider implements MarketDataProvider {
  readonly id = 'moex';
  private readonly baseUrl = 'https://iss.moex.com/iss';

  constructor(
    private readonly http: HttpClient,
    private readonly cache: CacheRepository,
  ) {}

  status(): ProviderStatus {
    return {
      id: this.id,
      name: 'MOEX ISS',
      configured: true,
      assetClasses: ['EQUITY'],
      markets: ['MOEX'],
      timeliness: 'DELAYED',
    };
  }

  async search(request: InstrumentSearch): Promise<Instrument[]> {
    if (request.assetClass && request.assetClass !== 'EQUITY') return [];
    const query = request.query.trim();
    const limit = request.limit ?? 50;
    const cacheKey = `provider:moex:search:${query.toLocaleLowerCase('ru-RU')}:${limit}`;
    const cached = this.cache.get<Instrument[]>(cacheKey);
    if (cached) return cached;
    const url = new URL(`${this.baseUrl}/securities.json`);
    url.searchParams.set('q', query);
    url.searchParams.set('iss.meta', 'off');
    url.searchParams.set('iss.only', 'securities');
    url.searchParams.set('securities.columns', 'secid,shortname,name,primary_boardid,group,type');
    const response = await this.http.getJson<IssResponse>(url);
    const instruments = records(response.securities)
      .filter((value) => String(value.group) === 'stock_shares')
      .map((value) => {
        const symbol = String(value.secid || '');
        const board = String(value.primary_boardid || 'TQBR');
        return {
          id: `${this.id}:${symbol}:${board}`,
          provider: this.id,
          symbol,
          name: String(value.name || value.shortname || symbol),
          assetClass: 'EQUITY' as const,
          exchange: 'MOEX',
          currency: 'RUB',
          quoteCurrency: 'RUB',
          timezone: 'Europe/Moscow',
          tradable: true,
          dataTimeliness: 'DELAYED' as const,
        };
      })
      .filter((instrument) => instrument.symbol)
      .slice(0, limit);
    this.cache.set(cacheKey, this.id, instruments, 60 * 60 * 1000);
    return instruments;
  }

  async quote(instrument: Instrument, at?: Date): Promise<Quote> {
    if (at) {
      const candle = (await this.candles({ instrument, interval: '1m', limit: 1, at })).at(-1);
      if (!candle) throw new MarketDataError('Историческая котировка MOEX недоступна');
      return {
        instrumentId: instrument.id,
        provider: this.id,
        price: candle.close,
        currency: instrument.quoteCurrency,
        timestamp: candle.endTimestamp,
        tradable: true,
        dataTimeliness: 'HISTORICAL',
      };
    }
    const board = instrument.id.split(':')[2] || 'TQBR';
    const url = new URL(
      `${this.baseUrl}/engines/stock/markets/shares/boards/${encodeURIComponent(board)}/securities/${encodeURIComponent(instrument.symbol)}.json`,
    );
    url.searchParams.set('iss.meta', 'off');
    url.searchParams.set('iss.only', 'marketdata');
    url.searchParams.set(
      'marketdata.columns',
      'SECID,LAST,LCURRENTPRICE,MARKETPRICE,SYSTIME,UPDATETIME,TRADINGSTATUS',
    );
    const response = await this.http.getJson<IssResponse>(url);
    const data = records(response.marketdata)[0];
    if (!data) throw new MarketDataError('Текущая котировка MOEX недоступна');
    const price = data?.LAST ?? data?.LCURRENTPRICE ?? data?.MARKETPRICE;
    if (price === null || price === undefined) {
      throw new MarketDataError('Текущая котировка MOEX недоступна');
    }
    const timestamp = data.SYSTIME
      ? new Date(String(data.SYSTIME).replace(' ', 'T') + '+03:00').toISOString()
      : new Date().toISOString();
    return {
      instrumentId: instrument.id,
      provider: this.id,
      price: String(price),
      currency: instrument.quoteCurrency,
      timestamp,
      tradable: true,
      dataTimeliness: 'DELAYED',
    };
  }

  async candles(request: CandleRequest): Promise<Candle[]> {
    const board = request.instrument.id.split(':')[2] || 'TQBR';
    const end = request.at ?? new Date();
    const intervalMinutes =
      intervalValue(request.interval) === 24 ? 1440 : intervalValue(request.interval);
    const lookbackMinutes = Math.max(intervalMinutes * request.limit * 3, 7 * 24 * 60);
    const start = new Date(end.getTime() - lookbackMinutes * 60000);
    const providerInterval = ['5m', '15m'].includes(request.interval)
      ? 1
      : intervalValue(request.interval);
    const url = new URL(
      `${this.baseUrl}/engines/stock/markets/shares/boards/${encodeURIComponent(board)}/securities/${encodeURIComponent(request.instrument.symbol)}/candles.json`,
    );
    url.searchParams.set('iss.meta', 'off');
    url.searchParams.set('iss.only', 'candles');
    url.searchParams.set('from', start.toISOString().slice(0, 10));
    url.searchParams.set('till', end.toISOString().slice(0, 10));
    url.searchParams.set('interval', String(providerInterval));
    const rawRecords: Record<string, unknown>[] = [];
    for (let offset = 0; offset < 10_000;) {
      url.searchParams.set('start', String(offset));
      const response = await this.http.getJson<IssResponse>(url);
      const page = records(response.candles);
      rawRecords.push(...page);
      if (!page.length || page.length < 500) break;
      offset += page.length;
    }
    const candles = rawRecords
      .map((value) => ({
        instrumentId: request.instrument.id,
        provider: this.id,
        open: String(value.open),
        high: String(value.high),
        low: String(value.low),
        close: String(value.close),
        volume: String(value.volume ?? '0'),
        timestamp: new Date(String(value.begin).replace(' ', 'T') + '+03:00').toISOString(),
        endTimestamp: new Date(String(value.end).replace(' ', 'T') + '+03:00').toISOString(),
        dataTimeliness: request.at ? ('HISTORICAL' as const) : ('DELAYED' as const),
      }))
      .filter((candle) => new Date(candle.endTimestamp).getTime() <= end.getTime());
    const normalized =
      providerInterval === 1 && intervalMinutes > 1
        ? aggregateCandles(candles, intervalMinutes)
        : candles;
    return normalized.slice(-request.limit);
  }
}
