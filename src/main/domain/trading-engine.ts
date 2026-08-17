import { randomUUID } from 'node:crypto';
import type { GameState, Instrument, Quote, TradeSide } from '../../shared/types';
import { canonicalDecimal, decimal, positiveDecimal } from './decimal';
import { DomainError, ValidationError } from './errors';
import { SimulationClock } from './simulation-clock';

export interface TradeRequest {
  state: GameState;
  instrument: Instrument;
  quote: Quote;
  side: TradeSide;
  quantity: string;
  realTimestamp?: string;
}

export class TradingEngine {
  execute(request: TradeRequest): GameState {
    const quantity = positiveDecimal(request.quantity, 'Количество');
    const price = positiveDecimal(request.quote.price, 'Цена');
    const clock = new SimulationClock(request.state.mode, request.state.simulationTimestamp);
    if (!clock.allows(request.quote.timestamp)) {
      throw new DomainError('Котировка находится в будущем относительно симуляции', 'FUTURE_DATA');
    }
    if (!request.instrument.tradable) {
      throw new DomainError('Инструмент недоступен для торговли', 'MARKET_UNAVAILABLE');
    }
    const transactionCurrency = request.instrument.quoteCurrency;
    const cost = quantity.mul(price);
    const next = structuredClone(request.state);
    const existingIndex = next.holdings.findIndex(
      (holding) => holding.instrument.id === request.instrument.id,
    );
    const existing = existingIndex >= 0 ? next.holdings[existingIndex] : undefined;
    if (request.side === 'BUY') {
      const cash = decimal(next.cash[transactionCurrency] ?? '0');
      if (cash.lt(cost)) {
        throw new DomainError('Недостаточно средств для покупки', 'INSUFFICIENT_BALANCE');
      }
      next.cash[transactionCurrency] = canonicalDecimal(cash.minus(cost));
      if (existing) {
        const previousQuantity = decimal(existing.quantity);
        const totalQuantity = previousQuantity.plus(quantity);
        const totalCost = previousQuantity.mul(existing.averageCost).plus(cost);
        existing.quantity = canonicalDecimal(totalQuantity);
        existing.averageCost = canonicalDecimal(totalCost.div(totalQuantity));
      } else {
        next.holdings.push({
          instrument: request.instrument,
          quantity: canonicalDecimal(quantity),
          averageCost: canonicalDecimal(price),
          realizedPnl: '0',
        });
      }
    } else {
      if (!existing || decimal(existing.quantity).lt(quantity)) {
        throw new DomainError('Недостаточно активов для продажи', 'INSUFFICIENT_HOLDINGS');
      }
      const remaining = decimal(existing.quantity).minus(quantity);
      const realized = price.minus(existing.averageCost).mul(quantity);
      existing.quantity = canonicalDecimal(remaining);
      existing.realizedPnl = canonicalDecimal(decimal(existing.realizedPnl).plus(realized));
      next.cash[transactionCurrency] = canonicalDecimal(
        decimal(next.cash[transactionCurrency] ?? '0').plus(cost),
      );
      if (remaining.isZero()) {
        next.holdings.splice(existingIndex, 1);
      }
    }
    const realTimestamp = request.realTimestamp ?? new Date().toISOString();
    next.trades.push({
      id: randomUUID(),
      gameId: next.id,
      userId: next.userId,
      instrument: request.instrument,
      side: request.side,
      quantity: canonicalDecimal(quantity),
      executionPrice: canonicalDecimal(price),
      transactionCurrency,
      commission: '0',
      realTimestamp,
      simulationTimestamp: clock.nowIso(),
    });
    next.simulationTimestamp = clock.nowIso();
    next.updatedAt = realTimestamp;
    next.revision += 1;
    this.validate(next);
    return next;
  }

  validate(state: GameState): void {
    for (const [currency, balance] of Object.entries(state.cash)) {
      if (!currency || decimal(balance).isNegative()) {
        throw new ValidationError('Нарушен инвариант денежного баланса');
      }
    }
    for (const holding of state.holdings) {
      if (!decimal(holding.quantity).isPositive() || decimal(holding.averageCost).isNegative()) {
        throw new ValidationError('Нарушен инвариант позиции');
      }
    }
  }
}
