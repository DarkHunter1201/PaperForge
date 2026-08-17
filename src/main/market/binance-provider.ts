import type { Candle, CandleInterval, Instrument, ProviderStatus, Quote } from '../../shared/types';
import { MarketDataError } from '../domain/errors';
import type { CacheRepository } from '../storage/cache-repository';
import { HttpClient } from './http-client';
import type { CandleRequest, InstrumentSearch, MarketDataProvider } from './market-data-provider';

interface BinanceSymbol {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  isSpotTradingAllowed: boolean;
}

interface ExchangeInfo {
  symbols: BinanceSymbol[];
}

interface Ticker {
  lastPrice: string;
  closeTime: number;
}

function intervalValue(interval: CandleInterval): string {
  return { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '1d': '1d' }[interval];
}

export class BinanceProvider implements MarketDataProvider {
  readonly id = 'binance';
  private readonly baseUrl = 'https://data-api.binance.vision';

  constructor(
    private readonly http: HttpClient,
    private readonly cache: CacheRepository,
  ) {}

  status(): ProviderStatus {
    return {
      id: this.id,
      name: 'Binance Spot Public Data',
      configured: true,
      assetClasses: ['CRYPTO'],
      markets: ['BINANCE'],
      timeliness: 'REALTIME',
    };
  }

  async search(request: InstrumentSearch): Promise<Instrument[]> {
    if (request.assetClass && request.assetClass !== 'CRYPTO') return [];
    const query = request.query.trim().toUpperCase();
    return (await this.catalog())
      .filter((instrument) =>
        [instrument.symbol, instrument.name, instrument.baseCurrency, instrument.quoteCurrency]
          .filter(Boolean)
          .some((value) => value!.toUpperCase().includes(query)),
      )
      .slice(0, request.limit ?? 50);
  }

  async quote(instrument: Instrument, at?: Date): Promise<Quote> {
    if (at) {
      const candle = (await this.candles({ instrument, interval: '1m', limit: 1, at })).at(-1);
      if (!candle) throw new MarketDataError('Историческая котировка Binance недоступна');
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
    const url = new URL(`${this.baseUrl}/api/v3/ticker/24hr`);
    url.searchParams.set('symbol', instrument.symbol);
    const ticker = await this.http.getJson<Ticker>(url);
    if (!ticker.lastPrice) throw new MarketDataError('Котировка Binance недоступна');
    return {
      instrumentId: instrument.id,
      provider: this.id,
      price: ticker.lastPrice,
      currency: instrument.quoteCurrency,
      timestamp: new Date(ticker.closeTime).toISOString(),
      tradable: instrument.tradable,
      dataTimeliness: 'REALTIME',
    };
  }

  async candles(request: CandleRequest): Promise<Candle[]> {
    const url = new URL(`${this.baseUrl}/api/v3/klines`);
    url.searchParams.set('symbol', request.instrument.symbol);
    url.searchParams.set('interval', intervalValue(request.interval));
    url.searchParams.set('limit', String(Math.min(request.limit, 1000)));
    if (request.at) url.searchParams.set('endTime', String(request.at.getTime()));
    const response = await this.http.getJson<unknown[][]>(url);
    const cutoff = request.at?.getTime() ?? Date.now();
    return response
      .map((value) => ({
        instrumentId: request.instrument.id,
        provider: this.id,
        open: String(value[1]),
        high: String(value[2]),
        low: String(value[3]),
        close: String(value[4]),
        volume: String(value[5]),
        timestamp: new Date(Number(value[0])).toISOString(),
        endTimestamp: new Date(Number(value[6])).toISOString(),
        dataTimeliness: request.at ? ('HISTORICAL' as const) : ('REALTIME' as const),
      }))
      .filter((candle) => new Date(candle.endTimestamp).getTime() <= cutoff)
      .slice(-request.limit);
  }

  private async catalog(): Promise<Instrument[]> {
    const cached = this.cache.get<Instrument[]>('provider:binance:catalog');
    if (cached) return cached;
    const response = await this.http.getJson<ExchangeInfo>(
      new URL(`${this.baseUrl}/api/v3/exchangeInfo`),
      3,
      60000,
    );
    const values = response.symbols
      .filter((symbol) => symbol.isSpotTradingAllowed)
      .map((symbol) => ({
        id: `${this.id}:${symbol.symbol}`,
        provider: this.id,
        symbol: symbol.symbol,
        name: `${symbol.baseAsset}/${symbol.quoteAsset}`,
        assetClass: 'CRYPTO' as const,
        exchange: 'BINANCE',
        currency: symbol.quoteAsset,
        baseCurrency: symbol.baseAsset,
        quoteCurrency: symbol.quoteAsset,
        timezone: 'UTC',
        tradable: symbol.status === 'TRADING',
        dataTimeliness: 'REALTIME' as const,
      }));
    this.cache.set('provider:binance:catalog', this.id, values, 24 * 60 * 60 * 1000);
    return values;
  }
}
