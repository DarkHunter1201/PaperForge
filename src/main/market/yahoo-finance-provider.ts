import Decimal from 'decimal.js';
import type { Candle, CandleInterval, Instrument, ProviderStatus, Quote } from '../../shared/types';
import { MarketDataError } from '../domain/errors';
import type { HttpClient } from './http-client';
import type { CandleRequest, InstrumentSearch, MarketDataProvider } from './market-data-provider';

interface YahooSearchResponse {
  quotes?: Array<{
    symbol?: string;
    shortname?: string;
    longname?: string;
    quoteType?: string;
    exchange?: string;
    exchDisp?: string;
    currency?: string;
  }>;
}

interface YahooChartResult {
  meta?: {
    currency?: string;
    regularMarketPrice?: number;
    regularMarketTime?: number;
    exchangeTimezoneName?: string;
  };
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      open?: Array<number | null>;
      high?: Array<number | null>;
      low?: Array<number | null>;
      close?: Array<number | null>;
      volume?: Array<number | null>;
    }>;
  };
}

interface YahooChartResponse {
  chart?: {
    result?: YahooChartResult[];
    error?: { description?: string } | null;
  };
}

function currencyForExchange(exchange: string): string {
  const values: Record<string, string> = {
    LSE: 'GBP',
    TOR: 'CAD',
    VAN: 'CAD',
    GER: 'EUR',
    FRA: 'EUR',
    PAR: 'EUR',
    AMS: 'EUR',
    MIL: 'EUR',
    HKG: 'HKD',
    TYO: 'JPY',
    ASX: 'AUD',
  };
  return values[exchange] ?? 'USD';
}

function timezoneForExchange(exchange: string): string {
  const values: Record<string, string> = {
    NMS: 'America/New_York',
    NYQ: 'America/New_York',
    ASE: 'America/New_York',
    LSE: 'Europe/London',
    GER: 'Europe/Berlin',
    FRA: 'Europe/Berlin',
    PAR: 'Europe/Paris',
    AMS: 'Europe/Amsterdam',
    MIL: 'Europe/Rome',
    HKG: 'Asia/Hong_Kong',
    TYO: 'Asia/Tokyo',
    ASX: 'Australia/Sydney',
  };
  return values[exchange] ?? 'UTC';
}

function intervalValue(interval: CandleInterval): string {
  return { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '60m', '1d': '1d' }[interval];
}

function intervalMilliseconds(interval: CandleInterval): number {
  return { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '1d': 86_400_000 }[
    interval
  ];
}

function normalizePrice(value: number, currency: string | undefined): string {
  return new Decimal(value).div(currency === 'GBp' ? 100 : 1).toString();
}

function normalizeCurrency(currency: string | undefined, fallback: string): string {
  return currency === 'GBp' ? 'GBP' : currency || fallback;
}

export class YahooFinanceProvider implements MarketDataProvider {
  readonly id = 'yahoo-finance';
  private readonly baseUrl = 'https://query1.finance.yahoo.com';

  constructor(private readonly http: HttpClient) {}

  status(): ProviderStatus {
    return {
      id: this.id,
      name: 'Yahoo Finance',
      configured: true,
      assetClasses: ['EQUITY'],
      markets: ['NASDAQ', 'NYSE', 'LSE', 'GLOBAL_EQUITIES'],
      timeliness: 'DELAYED',
    };
  }

  async search(request: InstrumentSearch): Promise<Instrument[]> {
    if (request.assetClass && request.assetClass !== 'EQUITY') return [];
    const url = new URL(`${this.baseUrl}/v1/finance/search`);
    url.searchParams.set('q', request.query);
    url.searchParams.set('quotesCount', String(Math.min(request.limit ?? 50, 50)));
    url.searchParams.set('newsCount', '0');
    url.searchParams.set('enableFuzzyQuery', 'false');
    const response = await this.http.getJson<YahooSearchResponse>(url);
    return (response.quotes ?? [])
      .filter((value) => value.quoteType === 'EQUITY' && value.symbol)
      .map((value) => {
        const symbol = value.symbol!;
        const exchangeCode = value.exchange || 'GLOBAL';
        const currency = normalizeCurrency(value.currency, currencyForExchange(exchangeCode));
        return {
          id: `${this.id}:${symbol}`,
          provider: this.id,
          symbol,
          name: value.longname || value.shortname || symbol,
          assetClass: 'EQUITY' as const,
          exchange: value.exchDisp || exchangeCode,
          currency,
          quoteCurrency: currency,
          timezone: timezoneForExchange(exchangeCode),
          tradable: true,
          dataTimeliness: 'DELAYED' as const,
        };
      });
  }

  async quote(instrument: Instrument, at?: Date): Promise<Quote> {
    if (at) {
      const candle = (await this.candles({ instrument, interval: '1d', limit: 1, at })).at(-1);
      if (!candle) throw new MarketDataError('Историческая котировка Yahoo Finance недоступна');
      return {
        instrumentId: instrument.id,
        provider: this.id,
        price: candle.close,
        currency: instrument.quoteCurrency,
        timestamp: candle.timestamp,
        tradable: true,
        dataTimeliness: 'HISTORICAL',
      };
    }
    const result = await this.chart(instrument, '1m', 1);
    const price = result.meta?.regularMarketPrice;
    if (price === undefined) throw new MarketDataError('Котировка Yahoo Finance недоступна');
    return {
      instrumentId: instrument.id,
      provider: this.id,
      price: normalizePrice(price, result.meta?.currency),
      currency: normalizeCurrency(result.meta?.currency, instrument.quoteCurrency),
      timestamp: result.meta?.regularMarketTime
        ? new Date(result.meta.regularMarketTime * 1000).toISOString()
        : new Date().toISOString(),
      tradable: true,
      dataTimeliness: 'DELAYED',
    };
  }

  async candles(request: CandleRequest): Promise<Candle[]> {
    const result = await this.chart(
      request.instrument,
      request.interval,
      request.limit,
      request.at,
    );
    const quote = result.indicators?.quote?.[0];
    const timestamps = result.timestamp ?? [];
    if (!quote) return [];
    const cutoff = request.at?.getTime() ?? Date.now();
    const currency = result.meta?.currency;
    return timestamps
      .map((timestamp, index): Candle | null => {
        const open = quote.open?.[index];
        const high = quote.high?.[index];
        const low = quote.low?.[index];
        const close = quote.close?.[index];
        if (open == null || high == null || low == null || close == null) return null;
        const time = new Date(timestamp * 1000).toISOString();
        return {
          instrumentId: request.instrument.id,
          provider: this.id,
          open: normalizePrice(open, currency),
          high: normalizePrice(high, currency),
          low: normalizePrice(low, currency),
          close: normalizePrice(close, currency),
          volume: String(quote.volume?.[index] ?? 0),
          timestamp: time,
          endTimestamp: time,
          dataTimeliness: request.at ? 'HISTORICAL' : 'DELAYED',
        };
      })
      .filter((value): value is Candle => value !== null)
      .filter((value) => new Date(value.timestamp).getTime() <= cutoff)
      .slice(-request.limit);
  }

  private async chart(
    instrument: Instrument,
    interval: CandleInterval,
    limit: number,
    at = new Date(),
  ): Promise<YahooChartResult> {
    const intervalMs = intervalMilliseconds(interval);
    const minimumLookback = interval === '1d' ? 365 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    const period2 = Math.floor(at.getTime() / 1000) + 60;
    const period1 = Math.floor(
      (at.getTime() - Math.max(intervalMs * limit * 4, minimumLookback)) / 1000,
    );
    const url = new URL(
      `${this.baseUrl}/v8/finance/chart/${encodeURIComponent(instrument.symbol)}`,
    );
    url.searchParams.set('interval', intervalValue(interval));
    url.searchParams.set('period1', String(period1));
    url.searchParams.set('period2', String(period2));
    url.searchParams.set('events', 'div,splits');
    const response = await this.http.getJson<YahooChartResponse>(url, 3, 20000);
    const result = response.chart?.result?.[0];
    if (!result) {
      throw new MarketDataError(
        response.chart?.error?.description || 'Данные Yahoo Finance недоступны',
      );
    }
    return result;
  }
}
