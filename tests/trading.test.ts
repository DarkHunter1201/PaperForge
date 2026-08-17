import { describe, expect, it } from 'vitest';
import type { GameState, Instrument, Quote } from '../src/shared/types';
import { PortfolioEngine } from '../src/main/domain/portfolio-engine';
import { TradingEngine } from '../src/main/domain/trading-engine';
import { fundPurchase } from '../src/main/application/trading-service';
import type { ExchangeRateProvider } from '../src/main/market/official-fx-service';

const instrument: Instrument = {
  id: 'test:AAPL',
  provider: 'test',
  symbol: 'AAPL',
  name: 'Apple',
  assetClass: 'EQUITY',
  exchange: 'NASDAQ',
  currency: 'USD',
  quoteCurrency: 'USD',
  timezone: 'America/New_York',
  tradable: true,
  dataTimeliness: 'REALTIME',
};

function state(): GameState {
  const timestamp = '2026-01-02T15:00:00.000Z';
  const realTimestamp = new Date().toISOString();
  return {
    id: 'game',
    userId: 'user',
    name: 'Test',
    mode: 'HISTORICAL',
    reportingCurrency: 'USD',
    simulationStartTimestamp: timestamp,
    simulationTimestamp: timestamp,
    clockAnchorSimulationTimestamp: timestamp,
    clockAnchorRealTimestamp: realTimestamp,
    timeMultiplier: 1,
    status: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
    cash: { USD: '1000' },
    holdings: [],
    trades: [],
  };
}

function quote(price = '10.01'): Quote {
  return {
    instrumentId: instrument.id,
    provider: instrument.provider,
    price,
    currency: 'USD',
    timestamp: '2026-01-02T14:59:00.000Z',
    tradable: true,
    dataTimeliness: 'HISTORICAL',
  };
}

describe('TradingEngine', () => {
  it('покупает и продаёт с точной decimal arithmetic', () => {
    const engine = new TradingEngine();
    const bought = engine.execute({
      state: state(),
      instrument,
      quote: quote(),
      side: 'BUY',
      quantity: '3',
    });
    expect(bought.cash.USD).toBe('969.97');
    expect(bought.holdings[0]?.quantity).toBe('3');
    const sold = engine.execute({
      state: bought,
      instrument,
      quote: quote('12.02'),
      side: 'SELL',
      quantity: '1.25',
    });
    expect(sold.cash.USD).toBe('984.995');
    expect(sold.holdings[0]?.quantity).toBe('1.75');
    expect(sold.holdings[0]?.realizedPnl).toBe('2.5125');
    expect(sold.trades).toHaveLength(2);
  });

  it('отклоняет недостаточный баланс, holdings и future quote', () => {
    const engine = new TradingEngine();
    expect(() =>
      engine.execute({
        state: state(),
        instrument,
        quote: quote('2000'),
        side: 'BUY',
        quantity: '1',
      }),
    ).toThrow('Недостаточно средств');
    expect(() =>
      engine.execute({ state: state(), instrument, quote: quote(), side: 'SELL', quantity: '1' }),
    ).toThrow('Недостаточно активов');
    expect(() =>
      engine.execute({
        state: state(),
        instrument,
        quote: { ...quote(), timestamp: '2026-01-02T15:01:00.000Z' },
        side: 'BUY',
        quantity: '1',
      }),
    ).toThrow('будущем');
  });

  it('исполняет сделку по последней котировке вне торговой сессии', () => {
    const result = new TradingEngine().execute({
      state: state(),
      instrument,
      quote: { ...quote(), tradable: false },
      side: 'BUY',
      quantity: '1',
    });
    expect(result.holdings[0]?.instrument.symbol).toBe('AAPL');
    expect(result.trades[0]?.quoteTimestamp).toBe(quote().timestamp);
  });

  it('конвертирует валюту счёта по официальному курсу для покупки', async () => {
    const rubleInstrument: Instrument = {
      ...instrument,
      id: 'test:SBER',
      symbol: 'SBER',
      name: 'Сбер',
      exchange: 'MOEX',
      currency: 'RUB',
      quoteCurrency: 'RUB',
    };
    const game = state();
    game.cash = { USD: '100' };
    const rates: ExchangeRateProvider = {
      rate: async (fromCurrency, toCurrency) => ({
        fromCurrency,
        toCurrency,
        rate: '80',
        effectiveTimestamp: '2026-01-02T00:00:00.000Z',
        source: 'BANK_OF_RUSSIA',
      }),
    };
    const funded = await fundPurchase(
      game,
      rubleInstrument,
      { ...quote('8000'), instrumentId: rubleInstrument.id, currency: 'RUB' },
      '1',
      rates,
      new Date('2026-01-02T15:00:00.000Z'),
    );
    const result = new TradingEngine().execute({
      state: funded,
      instrument: rubleInstrument,
      quote: { ...quote('8000'), instrumentId: rubleInstrument.id, currency: 'RUB' },
      side: 'BUY',
      quantity: '1',
    });
    expect(result.cash).toEqual({ USD: '0', RUB: '0' });
    expect(result.holdings[0]?.quantity).toBe('1');
  });
});

describe('PortfolioEngine', () => {
  it('рассчитывает valuation, P&L и FX conversion', () => {
    const game = state();
    game.reportingCurrency = 'EUR';
    game.cash = { EUR: '100', USD: '110' };
    game.holdings = [{ instrument, quantity: '2', averageCost: '10', realizedPnl: '3' }];
    const snapshot = new PortfolioEngine().calculate(
      game,
      new Map([[instrument.id, quote('12')]]),
      new Map([['USD/EUR', '0.9']]),
    );
    expect(snapshot.cashValue).toBe('199');
    expect(snapshot.positionsValue).toBe('21.6');
    expect(snapshot.totalValue).toBe('220.6');
    expect(snapshot.unrealizedPnl).toBe('3.6');
    expect(snapshot.realizedPnl).toBe('2.7');
  });
});
