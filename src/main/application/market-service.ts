import type { AssetClass, Candle, CandleInterval, Instrument, Quote } from '../../shared/types';
import { DomainError, ValidationError } from '../domain/errors';
import { SimulationClock } from '../domain/simulation-clock';
import type { AppLogger } from '../infrastructure/logger';
import type { CompositeProvider } from '../market/composite-provider';
import type { CacheRepository } from '../storage/cache-repository';
import type { GameService } from './game-service';

export class MarketService {
  constructor(
    private readonly providers: CompositeProvider,
    private readonly games: GameService,
    private readonly cache: CacheRepository,
    private readonly logger: AppLogger,
  ) {}

  search(query: string, assetClass?: AssetClass): Promise<Instrument[]> {
    const normalized = query.trim();
    if (!normalized) return Promise.resolve([]);
    return this.providers.search({ query: normalized, assetClass, limit: 100 });
  }

  async quote(gameId: string, instrument: Instrument): Promise<Quote> {
    const game = this.games.load(gameId);
    const clock = new SimulationClock(game.mode, game.simulationTimestamp);
    const at = game.mode === 'HISTORICAL' ? clock.now() : undefined;
    const timeKey = at ? at.toISOString().slice(0, 16) : 'live';
    const cacheKey = `quote:${instrument.id}:${timeKey}`;
    const cached = this.cache.get<Quote>(cacheKey);
    if (cached && clock.allows(cached.timestamp)) return cached;
    try {
      const quote = await this.providers.quote(instrument, at);
      if (!clock.allows(quote.timestamp)) {
        throw new DomainError('Provider вернул будущую котировку', 'FUTURE_DATA');
      }
      this.cache.set(cacheKey, instrument.provider, quote, at ? 24 * 60 * 60 * 1000 : 5000);
      return quote;
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
    const clock = new SimulationClock(game.mode, game.simulationTimestamp);
    const at = game.mode === 'HISTORICAL' ? clock.now() : undefined;
    const timeKey = at ? at.toISOString().slice(0, 16) : 'live';
    const cacheKey = `candles:${instrument.id}:${interval}:${limit}:${timeKey}`;
    const cached = this.cache.get<Candle[]>(cacheKey);
    if (cached)
      return clock.filterAllowed(cached).filter((value) => clock.allows(value.endTimestamp));
    try {
      const candles = await this.providers.candles({ instrument, interval, limit, at });
      const safe = candles.filter(
        (value) => clock.allows(value.timestamp) && clock.allows(value.endTimestamp),
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
