import type {
  GameState,
  Instrument,
  PortfolioSnapshot,
  Quote,
  TradeSide,
} from '../../shared/types';
import { canonicalDecimal, decimal, positiveDecimal } from '../domain/decimal';
import { DomainError } from '../domain/errors';
import { PortfolioEngine } from '../domain/portfolio-engine';
import { TradingEngine } from '../domain/trading-engine';
import type { ExchangeRateProvider } from '../market/official-fx-service';
import type { GameService } from './game-service';
import type { MarketService } from './market-service';

export async function fundPurchase(
  state: GameState,
  instrument: Instrument,
  quote: Quote,
  quantityValue: string,
  rates: ExchangeRateProvider,
  at: Date,
): Promise<GameState> {
  const quantity = positiveDecimal(quantityValue, 'Количество');
  const cost = positiveDecimal(quote.price, 'Цена').mul(quantity);
  const transactionCurrency = instrument.quoteCurrency;
  const transactionCash = decimal(state.cash[transactionCurrency] ?? '0');
  if (transactionCash.gte(cost)) return state;
  const funded = structuredClone(state);
  let missing = cost.minus(transactionCash);
  let converted = transactionCash;
  let lastConversionError: unknown;
  const currencies = Object.keys(funded.cash)
    .filter((currency) => currency !== transactionCurrency)
    .sort((left, right) => {
      if (left === funded.reportingCurrency) return -1;
      if (right === funded.reportingCurrency) return 1;
      return left.localeCompare(right);
    });
  for (const currency of currencies) {
    const available = decimal(funded.cash[currency] ?? '0');
    if (available.lte(0)) continue;
    try {
      const exchange = await rates.rate(currency, transactionCurrency, at);
      const rate = positiveDecimal(exchange.rate, 'Официальный курс');
      const capacity = available.mul(rate);
      const targetAmount = capacity.gte(missing) ? missing : capacity;
      const sourceAmount = targetAmount.div(rate);
      funded.cash[currency] = canonicalDecimal(available.minus(sourceAmount));
      converted = converted.plus(targetAmount);
      missing = missing.minus(targetAmount);
      if (missing.isZero()) break;
    } catch (error) {
      lastConversionError = error;
    }
  }
  if (missing.gt(0)) {
    if (lastConversionError && converted.eq(transactionCash)) throw lastConversionError;
    throw new DomainError(
      'Недостаточно средств для покупки после конвертации валют',
      'INSUFFICIENT_BALANCE',
    );
  }
  funded.cash[transactionCurrency] = canonicalDecimal(converted);
  return funded;
}

export class TradingService {
  private readonly tradingEngine = new TradingEngine();
  private readonly portfolioEngine = new PortfolioEngine();

  constructor(
    private readonly games: GameService,
    private readonly market: MarketService,
    private readonly rates: ExchangeRateProvider,
  ) {}

  async execute(input: {
    gameId: string;
    instrument: Instrument;
    side: TradeSide;
    quantity: string;
  }): Promise<GameState> {
    const quote = await this.market.quote(input.gameId, input.instrument);
    let state = this.games.load(input.gameId);
    if (input.side === 'BUY') {
      const at = state.mode === 'HISTORICAL' ? new Date(state.simulationTimestamp) : new Date();
      state = await fundPurchase(state, input.instrument, quote, input.quantity, this.rates, at);
    }
    const next = this.tradingEngine.execute({
      state,
      instrument: input.instrument,
      quote,
      side: input.side,
      quantity: input.quantity,
    });
    return this.games.saveState(next, next.trades.at(-1));
  }

  async portfolio(gameId: string): Promise<PortfolioSnapshot> {
    const state = this.games.load(gameId);
    const quotes = new Map();
    await Promise.all(
      state.holdings.map(async (holding) => {
        try {
          quotes.set(holding.instrument.id, await this.market.quote(gameId, holding.instrument));
        } catch {
          return;
        }
      }),
    );
    const currencies = new Set([
      ...Object.keys(state.cash),
      ...state.holdings.map((holding) => holding.instrument.quoteCurrency),
    ]);
    currencies.delete(state.reportingCurrency);
    const fxRates = new Map<string, string>();
    await Promise.all(
      [...currencies].map(async (currency) => {
        try {
          const at = state.mode === 'HISTORICAL' ? new Date(state.simulationTimestamp) : new Date();
          const exchange = await this.rates.rate(currency, state.reportingCurrency, at);
          fxRates.set(`${currency}/${state.reportingCurrency}`, exchange.rate);
        } catch {
          return;
        }
      }),
    );
    const snapshot = this.portfolioEngine.calculate(state, quotes, fxRates);
    if (state.status === 'COMPLETED' && !state.finalPortfolio) {
      this.games.recordFinalPortfolio(gameId, snapshot);
    }
    return snapshot;
  }
}
