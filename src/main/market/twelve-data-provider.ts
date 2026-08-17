import type {
  AssetClass,
  Candle,
  CandleInterval,
  Instrument,
  ProviderStatus,
  Quote,
} from '../../shared/types';
import { MarketDataError } from '../domain/errors';
import { HttpClient } from './http-client';
import type { CandleRequest, InstrumentSearch, MarketDataProvider } from './market-data-provider';

interface SearchResponse {
  data?: Array<{
    symbol: string;
    instrument_name: string;
    exchange: string;
    exchange_timezone: string;
    instrument_type: string;
    currency?: string;
  }>;
  status?: string;
  message?: string;
}

interface QuoteResponse {
  close?: string;
  timestamp?: number;
  currency?: string;
  is_market_open?: boolean;
  status?: string;
  message?: string;
}

interface TimeSeriesResponse {
  meta?: { currency?: string };
  values?: Array<{
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume?: string;
  }>;
  status?: string;
  message?: string;
}

function assetClass(type: string): AssetClass | null {
  const normalized = type.toLocaleLowerCase('en-US');
  if (normalized.includes('digital') || normalized.includes('crypto')) return 'CRYPTO';
  if (normalized.includes('physical') || normalized.includes('forex')) return 'FOREX';
  if (
    normalized.includes('stock') ||
    normalized.includes('equity') ||
    normalized.includes('depositary') ||
    normalized.includes('reit')
  ) {
    return 'EQUITY';
  }
  return null;
}

function intervalValue(interval: CandleInterval): string {
  return { '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1h', '1d': '1day' }[interval];
}

export class TwelveDataProvider implements MarketDataProvider {
  readonly id = 'twelve-data';
  private readonly baseUrl = 'https://api.twelvedata.com';

  constructor(
    private readonly http: HttpClient,
    private readonly apiKey: () => string | null,
  ) {}

  status(): ProviderStatus {
    return {
      id: this.id,
      name: 'Twelve Data',
      configured: Boolean(this.apiKey()),
      assetClasses: ['EQUITY', 'CRYPTO', 'FOREX'],
      markets: ['US', 'UK', 'CYPRUS', 'GLOBAL_FX', 'GLOBAL_CRYPTO'],
      timeliness: 'PROVIDER_DEPENDENT',
    };
  }

  async search(request: InstrumentSearch): Promise<Instrument[]> {
    const apiKey = this.requireApiKey();
    const url = new URL(`${this.baseUrl}/symbol_search`);
    url.searchParams.set('symbol', request.query);
    url.searchParams.set('outputsize', String(request.limit ?? 50));
    url.searchParams.set('apikey', apiKey);
    const response = await this.http.getJson<SearchResponse>(url);
    this.assertResponse(response);
    return (response.data ?? [])
      .map((value): Instrument | null => {
        const mappedClass = assetClass(value.instrument_type);
        if (!mappedClass || (request.assetClass && mappedClass !== request.assetClass)) return null;
        const pair = value.symbol.split('/');
        const quoteCurrency = value.currency || pair[1] || 'USD';
        return {
          id: `${this.id}:${value.symbol}:${value.exchange}`,
          provider: this.id,
          symbol: value.symbol,
          name: value.instrument_name || value.symbol,
          assetClass: mappedClass,
          exchange: value.exchange || 'GLOBAL',
          currency: quoteCurrency,
          baseCurrency: mappedClass === 'EQUITY' ? undefined : pair[0],
          quoteCurrency,
          timezone: value.exchange_timezone || 'UTC',
          tradable: true,
          dataTimeliness: 'PROVIDER_DEPENDENT',
        };
      })
      .filter((value): value is Instrument => value !== null);
  }

  async quote(instrument: Instrument, at?: Date): Promise<Quote> {
    if (at) {
      const candle = (await this.candles({ instrument, interval: '1m', limit: 1, at })).at(-1);
      if (!candle) throw new MarketDataError('Историческая котировка Twelve Data недоступна');
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
    const url = new URL(`${this.baseUrl}/quote`);
    url.searchParams.set('symbol', instrument.symbol);
    url.searchParams.set('exchange', instrument.exchange);
    url.searchParams.set('apikey', this.requireApiKey());
    const response = await this.http.getJson<QuoteResponse>(url);
    this.assertResponse(response);
    if (!response.close) throw new MarketDataError('Котировка Twelve Data недоступна');
    return {
      instrumentId: instrument.id,
      provider: this.id,
      price: response.close,
      currency: response.currency || instrument.quoteCurrency,
      timestamp: response.timestamp
        ? new Date(response.timestamp * 1000).toISOString()
        : new Date().toISOString(),
      tradable: true,
      dataTimeliness: 'PROVIDER_DEPENDENT',
    };
  }

  async candles(request: CandleRequest): Promise<Candle[]> {
    const url = new URL(`${this.baseUrl}/time_series`);
    url.searchParams.set('symbol', request.instrument.symbol);
    url.searchParams.set('exchange', request.instrument.exchange);
    url.searchParams.set('interval', intervalValue(request.interval));
    url.searchParams.set('outputsize', String(Math.min(request.limit, 5000)));
    url.searchParams.set('order', 'ASC');
    url.searchParams.set('timezone', 'UTC');
    url.searchParams.set('apikey', this.requireApiKey());
    if (request.at) url.searchParams.set('end_date', request.at.toISOString());
    const response = await this.http.getJson<TimeSeriesResponse>(url);
    this.assertResponse(response);
    const cutoff = request.at?.getTime() ?? Date.now();
    return (response.values ?? [])
      .map((value) => {
        const timestamp = new Date(value.datetime.replace(' ', 'T') + 'Z');
        return {
          instrumentId: request.instrument.id,
          provider: this.id,
          open: value.open,
          high: value.high,
          low: value.low,
          close: value.close,
          volume: value.volume ?? '0',
          timestamp: timestamp.toISOString(),
          endTimestamp: timestamp.toISOString(),
          dataTimeliness: request.at ? ('HISTORICAL' as const) : ('PROVIDER_DEPENDENT' as const),
        };
      })
      .filter((candle) => new Date(candle.timestamp).getTime() <= cutoff)
      .slice(-request.limit);
  }

  private requireApiKey(): string {
    const value = this.apiKey();
    if (!value)
      throw new MarketDataError('Twelve Data API key не настроен', 'PROVIDER_NOT_CONFIGURED');
    return value;
  }

  private assertResponse(response: { status?: string; message?: string }): void {
    if (response.status === 'error') {
      throw new MarketDataError(response.message || 'Ошибка Twelve Data');
    }
  }
}
