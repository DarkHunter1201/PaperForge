import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Candle, Instrument, ProviderStatus, Quote } from '../src/shared/types';
import { MarketService } from '../src/main/application/market-service';
import { DomainError } from '../src/main/domain/errors';
import { SimulationClock } from '../src/main/domain/simulation-clock';
import { CompositeProvider } from '../src/main/market/composite-provider';
import type { MarketDataProvider } from '../src/main/market/market-data-provider';
import { CacheRepository } from '../src/main/storage/cache-repository';
import type { TestHarness } from './helpers';
import { createHarness } from './helpers';

const instrument: Instrument = {
  id: 'future:TEST',
  provider: 'future',
  symbol: 'TEST',
  name: 'Future Test',
  assetClass: 'EQUITY',
  exchange: 'TEST',
  currency: 'USD',
  quoteCurrency: 'USD',
  timezone: 'UTC',
  tradable: true,
  dataTimeliness: 'HISTORICAL',
};

class FutureProvider implements MarketDataProvider {
  readonly id = 'future';
  status(): ProviderStatus {
    return {
      id: this.id,
      name: 'Future',
      configured: true,
      assetClasses: ['EQUITY'],
      markets: ['TEST'],
      timeliness: 'HISTORICAL',
    };
  }
  async search(): Promise<Instrument[]> {
    return [instrument];
  }
  async quote(): Promise<Quote> {
    return {
      instrumentId: instrument.id,
      provider: this.id,
      price: '999',
      currency: 'USD',
      timestamp: '2008-09-15T14:36:00.000Z',
      tradable: true,
      dataTimeliness: 'HISTORICAL',
    };
  }
  async candles(): Promise<Candle[]> {
    return [
      {
        instrumentId: instrument.id,
        provider: this.id,
        open: '10',
        high: '10',
        low: '10',
        close: '10',
        volume: '1',
        timestamp: '2008-09-15T14:34:00.000Z',
        endTimestamp: '2008-09-15T14:34:59.000Z',
        dataTimeliness: 'HISTORICAL',
      },
      {
        instrumentId: instrument.id,
        provider: this.id,
        open: '999',
        high: '999',
        low: '999',
        close: '999',
        volume: '1',
        timestamp: '2008-09-15T14:36:00.000Z',
        endTimestamp: '2008-09-15T14:36:59.000Z',
        dataTimeliness: 'HISTORICAL',
      },
    ];
  }
}

describe('Historical data boundary', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = createHarness(() => new Date('2026-01-02T16:00:00.000Z'));
  });
  afterEach(() => {
    harness.dispose();
  });

  it('SimulationClock фильтрует данные после simulation timestamp', () => {
    const clock = new SimulationClock(
      {
        mode: 'HISTORICAL',
        simulationStartTimestamp: '2008-09-15T14:35:00.000Z',
        simulationTimestamp: '2008-09-15T14:35:00.000Z',
        clockAnchorSimulationTimestamp: '2008-09-15T14:35:00.000Z',
        clockAnchorRealTimestamp: '2026-01-02T16:00:00.000Z',
        timeMultiplier: 1,
        status: 'ACTIVE',
      },
      () => new Date('2026-01-02T16:00:00.000Z'),
    );
    expect(clock.allows('2008-09-15T14:35:00.000Z')).toBe(true);
    expect(clock.allows('2008-09-15T14:35:00.001Z')).toBe(false);
  });

  it('публичный MarketService отбрасывает future candles и quote', async () => {
    await harness.auth.register('Historian', 'secret');
    const game = harness.games.create({
      name: '2008',
      mode: 'HISTORICAL',
      reportingCurrency: 'USD',
      initialBalance: '1000',
      historicalStart: '2008-09-15T14:35:00.000Z',
    });
    const cache = new CacheRepository(harness.database.connection);
    const logger = { info() {}, warn() {}, error() {} } as never;
    const market = new MarketService(
      new CompositeProvider([new FutureProvider()]),
      harness.games,
      cache,
      logger,
    );
    const candles = await market.candles(game.id, instrument, '1m', 100);
    expect(candles).toHaveLength(1);
    expect(candles[0]?.close).toBe('10');
    await expect(market.quote(game.id, instrument)).rejects.toBeInstanceOf(DomainError);
  });
});
