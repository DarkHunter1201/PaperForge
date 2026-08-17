import type { AssetClass, Candle, CandleInterval, Instrument, Quote } from '../../shared/types';
import { DomainError, ValidationError } from '../domain/errors';
import { SimulationClock } from '../domain/simulation-clock';
import type { AppLogger } from '../infrastructure/logger';
import type { CompositeProvider } from '../market/composite-provider';
import { MarketCalendar } from '../market/market-calendar';
import type { CacheRepository } from '../storage/cache-repository';
import type { GameService } from './game-service';

export class MarketService {
  constructor(
    private readonly providers: CompositeProvider,
    private readonly games: GameService,
    private readonly cache: CacheRepository,
    private readonly logger: AppLogger,
    private readonly calendar = new MarketCalendar(),
  ) {}

  search(query: string, assetClass?: AssetClass): Promise<Instrument[]> {
    const normalized = query.trim();
    if (!normalized) return Promise.resolve([]);
    return this.providers.search({ query: normalized, assetClass, limit: 100 });
  }

  async quote(gameId: string, instrument: Instrument): Promise<Quote> {
    const game = this.games.load(gameId);
    const boundary =
      game.mode === 'HISTORICAL' ? game.simulationTimestamp : new Date().toISOString();
    const clock = new SimulationClock(game, () => new Date(boundary));
    const currentTime = new Date(boundary);
    const at = game.mode === 'HISTORICAL' ? currentTime : undefined;
    const timeKey = at ? at.toISOString().slice(0, 16) : 'live';
    const cacheKey = `quote:${instrument.id}:${timeKey}`;
    const cached = this.cache.get<Quote>(cacheKey);
    if (cached && (game.mode === 'LIVE' || clock.allows(cached.timestamp, boundary))) {
      return {
        ...cached,
        tradable: cached.tradable && this.calendar.isOpen(instrument, currentTime),
      };
    }
    try {
      const quote = await this.providers.quote(instrument, at);
      if (game.mode === 'HISTORICAL' && !clock.allows(quote.timestamp, boundary)) {
        throw new DomainError('Provider вернул будущую котировку', 'FUTURE_DATA');
      }
      const safeQuote = {
        ...quote,
        tradable: quote.tradable && this.calendar.isOpen(instrument, currentTime),
      };
      this.cache.set(cacheKey, instrument.provider, safeQuote, at ? 24 * 60 * 60 * 1000 : 5000);
      return safeQuote;
    } catch (error) {
      this.logger.error('quote_failed', error, {
        provider: instrument.provider,
        instrument: instrument.id,
      });
      throw error;
    }
  }

  async candles(
    gameId: string,
    instrument: Instrument,
    interval: CandleInterval,
    limit: number,
  ): Promise<Candle[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 5000) {
      throw new ValidationError('Некорректное количество свечей');
    }
    const game = this.games.load(gameId);
    const boundary =
      game.mode === 'HISTORICAL' ? game.simulationTimestamp : new Date().toISOString();
    const clock = new SimulationClock(game, () => new Date(boundary));
    const at = game.mode === 'HISTORICAL' ? new Date(boundary) : undefined;
    const timeKey = at ? at.toISOString().slice(0, 16) : 'live';
    const cacheKey = `candles:${instrument.id}:${interval}:${limit}:${timeKey}`;
    const cached = this.cache.get<Candle[]>(cacheKey);
    if (cached && game.mode === 'LIVE') return cached;
    if (cached)
      return clock
        .filterAllowed(cached, boundary)
        .filter((value) => clock.allows(value.endTimestamp, boundary));
    try {
      const candles = await this.providers.candles({ instrument, interval, limit, at });
      const safe =
        game.mode === 'LIVE'
          ? candles
          : candles.filter(
              (value) =>
                clock.allows(value.timestamp, boundary) &&
                clock.allows(value.endTimestamp, boundary),
            );
      this.cache.set(cacheKey, instrument.provider, safe, at ? 24 * 60 * 60 * 1000 : 15000);
      return safe;
    } catch (error) {
      this.logger.error('candles_failed', error, {
        provider: instrument.provider,
        instrument: instrument.id,
      });
      throw error;
    }
  }
}
